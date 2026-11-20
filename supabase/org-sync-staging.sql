-- Apply on a staging copy, with the matching SNS client.
begin;
lock table public.v2_records, public.v2_settings in share row exclusive mode;

do $$
begin
  if exists (select 1 from public.v2_records where org_id is not null
    group by org_id, kind, local_id having count(*) > 1)
    or exists (select 1 from public.v2_settings where org_id is not null
    group by org_id having count(*) > 1)
    or exists (select 1 from public.v2_records
      where org_id is not null and (nullif(btrim(local_id), '') is null or kind = 'product')) then
    raise exception 'SNS_SYNC_MIGRATION_REVIEW_REQUIRED: run org-sync-preflight.sql';
  end if;
end;
$$;

drop index if exists public.v2_records_owner_kind_localid;
create unique index if not exists sns_records_legacy_key
  on public.v2_records(user_id, kind, local_id) where org_id is null;
create unique index if not exists sns_records_org_key
  on public.v2_records(org_id, kind, local_id) where org_id is not null;
alter table public.v2_settings drop constraint if exists v2_settings_pkey;
create unique index if not exists sns_settings_legacy_key
  on public.v2_settings(user_id) where org_id is null;
create unique index if not exists sns_settings_org_key
  on public.v2_settings(org_id) where org_id is not null;

-- Existing user-only write policies can otherwise bypass checked sync.
revoke insert, update, delete, truncate on public.v2_records, public.v2_settings
  from public, anon, authenticated;
drop policy if exists "read own" on public.v2_records;
create policy "read own" on public.v2_records for select to authenticated
  using (org_id is null and user_id = (select auth.uid()));
drop policy if exists "read settings" on public.v2_settings;
create policy "read settings" on public.v2_settings for select to authenticated
  using (org_id is null and user_id = (select auth.uid()));
revoke all on function public.v2_apply_changes(uuid,jsonb,uuid[],jsonb)
  from public, anon, authenticated;

-- Limits are checked against the canonical organization keys below.
drop trigger if exists trg_enforce_v2_limits on public.v2_records;

create table if not exists public.sns_sync_batches (
  org_id uuid not null references public.orgs(id) on delete cascade,
  id uuid not null,
  actor uuid not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  primary key (org_id,id)
);
alter table public.sns_sync_batches enable row level security;
revoke all on public.sns_sync_batches from public, anon, authenticated;

create or replace function public.sns_apply_changes_checked(
  p_org uuid, p_upserts jsonb, p_deletes jsonb, p_settings jsonb, p_settings_base jsonb, p_batch uuid
)
returns table(out_id uuid, out_kind text, out_local_id text)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  actor_branch text;
  entry jsonb;
  current_data jsonb;
  old_settings jsonb;
  next_settings jsonb;
  record_kind text;
  record_id text;
  next_data jsonb;
  max_count int;
  batch_hash text;
  batch_actor uuid;
  previous_hash text;
begin
  select m.role, m.branch_id into actor_role, actor_branch
  from public.org_members m where m.org_id = p_org and m.user_id = actor;
  if actor_role is null or actor_role not in ('manager','cashier','accountant','stockkeeper') then
    raise exception 'SNS_SYNC_FORBIDDEN' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 0));
  batch_hash := encode(sha256(convert_to(
    jsonb_build_array(p_upserts,p_deletes,p_settings,p_settings_base)::text,'UTF8')), 'hex');
  select b.actor, b.request_hash into batch_actor, previous_hash from public.sns_sync_batches b
  where b.org_id = p_org and b.id = p_batch;
  if found then
    if batch_actor is distinct from actor or previous_hash is distinct from batch_hash then
      raise exception 'SNS_SYNC_INVALID_BATCH' using errcode = '22023';
    end if;
    return query select v.id, v.kind, v.local_id from public.v2_records v
    join jsonb_array_elements(p_upserts) e on v.kind = e->>'kind' and v.local_id = e->>'local_id'
    where v.org_id = p_org;
    return;
  end if;
  if not exists (select 1 from public.subscriptions where org_id=p_org)
    or exists (select 1 from public.subscriptions
    where org_id = p_org and (expires_at <= now()
      or status::text in ('suspended', 'expired', 'cancelled', 'canceled'))) then
    raise exception 'SUB_EXPIRED';
  end if;

  for entry in select value from jsonb_array_elements(p_deletes) loop
    if actor_role <> 'manager' and entry->>'kind' <> 'heldSales' then
      raise exception 'SNS_SYNC_FORBIDDEN' using errcode = '42501';
    end if;
    select v.data into current_data from public.v2_records v
    where v.org_id = p_org and v.id = (entry->>'id')::uuid and v.kind = entry->>'kind';
    if not found then continue; end if;
    if actor_role <> 'manager' and actor_branch is not null
      and coalesce(current_data->>'branch', '') <> actor_branch then
      raise exception 'SNS_SYNC_FORBIDDEN' using errcode = '42501';
    end if;
    if current_data is distinct from nullif(entry->'base', 'null'::jsonb) then
      raise exception 'SNS_SYNC_CONFLICT' using errcode = '40001';
    end if;
    delete from public.v2_records v where v.org_id = p_org and v.id = (entry->>'id')::uuid;
  end loop;

  for entry in select value from jsonb_array_elements(p_upserts) loop
    record_kind := entry->>'kind';
    record_id := entry->>'local_id';
    next_data := entry->'data';
    if nullif(btrim(record_kind), '') is null or nullif(btrim(record_id), '') is null
      or record_kind = 'product' or jsonb_typeof(next_data) is distinct from 'object'
      or next_data->>'id' is distinct from record_id then
      raise exception 'SNS_SYNC_INVALID_RECORD' using errcode = '22023';
    end if;
    select v.data into current_data from public.v2_records v
    where v.org_id = p_org and v.kind = record_kind and v.local_id = record_id;
    if actor_role <> 'manager' then
      if actor_branch is not null and (
        (current_data ? 'branch' and current_data->>'branch' is distinct from actor_branch)
        or (next_data ? 'branch' and next_data->>'branch' is distinct from actor_branch)
      ) then
        raise exception 'SNS_SYNC_FORBIDDEN' using errcode = '42501';
      end if;
      if actor_role = 'cashier' and record_kind = 'products' then
        if current_data is null
          or (next_data - array['qty','bq','batches','updatedAt','_dev'])
            is distinct from (current_data - array['qty','bq','batches','updatedAt','_dev'])
          or jsonb_typeof(next_data->'qty') is distinct from 'number'
          or (next_data->>'qty')::numeric < 0
          or (next_data->>'qty')::numeric > (current_data->>'qty')::numeric then
          raise exception 'SNS_SYNC_FORBIDDEN' using errcode = '42501';
        end if;
        if actor_branch is not null and current_data ? 'bq'
          and (coalesce(next_data->'bq','{}'::jsonb) - actor_branch::text)
            is distinct from ((current_data->'bq') - actor_branch::text) then
          raise exception 'SNS_SYNC_FORBIDDEN' using errcode = '42501';
        end if;
      elsif not (
        record_kind = any(array['audit','shiftSessions','heldSales','stockMoves'])
        or (actor_role = 'cashier' and record_kind = any(array['sales','customers','cash','quotes','memberships','serviceOrders','payClaims','journal','serials','tables']))
        or (actor_role = 'accountant' and record_kind = any(array['sales','purchases','returns','expenses','cash','customers','suppliers','products','quotes','journal','accounts','trash','editLog','stockTakes','recurringExpenses','banks','shifts']))
        or (actor_role = 'stockkeeper' and record_kind = any(array['products','categories','purchases','purchaseOrders','suppliers','waste','stockTakes','transfers','shifts','serials']))
      ) then
        raise exception 'SNS_SYNC_FORBIDDEN' using errcode = '42501';
      end if;
    end if;
    if current_data is distinct from nullif(entry->'base', 'null'::jsonb) then
      raise exception 'SNS_SYNC_CONFLICT' using errcode = '40001';
    end if;
    if actor_role = 'cashier' and record_kind = 'sales' and current_data is not null
      and (current_data - array['updatedAt','_dev','paidAmount','dueAmount','settlementRefs','installments','salesEmp','salesEmpName','commRate','commAmt','promoApplied','promoVal','tierBonusPts','loyTier','tip'])
        is distinct from (next_data - array['updatedAt','_dev','paidAmount','dueAmount','settlementRefs','installments','salesEmp','salesEmpName','commRate','commAmt','promoApplied','promoVal','tierBonusPts','loyTier','tip']) then
      raise exception 'SNS_SYNC_FORBIDDEN' using errcode = '42501';
    end if;
    if current_data is null and record_kind in ('sales','purchases') and next_data ? 'no'
      and exists (select 1 from public.v2_records v where v.org_id = p_org
        and v.kind = record_kind and v.data->>'no' = next_data->>'no') then
      raise exception 'SNS_SYNC_CONFLICT' using errcode = '40001';
    end if;
    if current_data is null and record_kind in ('products','branches') then
      if record_kind = 'products' then
        max_count := public.org_max_products(p_org);
      else
        select coalesce((select l.max_branches from public.plan_limits l
          where l.plan = public.org_plan(p_org)), 1) into max_count;
      end if;
      if max_count >= 0 and (select count(*) from public.v2_records v
        where v.org_id = p_org and v.kind = record_kind) >= max_count then
        raise exception 'SNS_SYNC_LIMIT:%:%', record_kind, max_count;
      end if;
    end if;
    -- PostgreSQL runs BEFORE INSERT before resolving ON CONFLICT. Use the
    -- correct trigger event for existing invoices in a closed period.
    if current_data is null then
      insert into public.v2_records(user_id, org_id, kind, local_id, data, updated_at)
      values (actor, p_org, record_kind, record_id, next_data, now());
    else
      update public.v2_records v set data = next_data, updated_at = now()
      where v.org_id = p_org and v.kind = record_kind and v.local_id = record_id;
    end if;
  end loop;

  if p_settings is not null then
    select s.data into old_settings from public.v2_settings s where s.org_id = p_org;
    if actor_role = 'manager' then
      next_settings := p_settings;
    else
      next_settings := coalesce(old_settings, '{}'::jsonb) || jsonb_build_object('seq', p_settings->'seq');
    end if;
    if old_settings is distinct from next_settings then
      if (case when actor_role = 'manager' then old_settings else old_settings->'seq' end)
        is distinct from (case when actor_role = 'manager' then p_settings_base else p_settings_base->'seq' end) then
        raise exception 'SNS_SYNC_CONFLICT' using errcode = '40001';
      end if;
      insert into public.v2_settings(user_id,org_id,data,updated_at)
      values (actor,p_org,next_settings,now())
      on conflict (org_id) where org_id is not null
      do update set data = excluded.data, updated_at = excluded.updated_at;
    end if;
  end if;

  insert into public.sns_sync_batches(org_id,id,actor,request_hash) values (p_org,p_batch,actor,batch_hash);
  return query select v.id, v.kind, v.local_id from public.v2_records v
  join jsonb_array_elements(p_upserts) e on v.kind = e->>'kind' and v.local_id = e->>'local_id'
  where v.org_id = p_org;
end;
$$;

revoke all on function public.sns_apply_changes_checked(uuid,jsonb,jsonb,jsonb,jsonb,uuid)
  from public, anon;
grant execute on function public.sns_apply_changes_checked(uuid,jsonb,jsonb,jsonb,jsonb,uuid)
  to authenticated;
commit;
