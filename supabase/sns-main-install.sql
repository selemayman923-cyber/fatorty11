-- SNS 2026.11.19-r4. Install only on the reset SNS database.
begin;
set local lock_timeout = '5s';
lock table public.v2_records, public.v2_settings in share row exclusive mode;

do $ready$
begin
  if exists (select 1 from public.v2_records)
     or exists (select 1 from public.v2_settings)
     or exists (select 1 from public.v2_backups)
     or exists (select 1 from public.app_data) then
    raise exception 'SNS_MAIN_INSTALL_REQUIRES_EMPTY_TEST_DATA';
  end if;
end;
$ready$;

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
  if exists (select 1 from public.subscriptions
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

create or replace function public.sns_guard_locked_accounting_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  org uuid;
  prior_date text;
  next_date text;
  lock_date text;
  posting_lines jsonb;
  debit_total numeric;
  credit_total numeric;
begin
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then
    return new;
  end if;
  if tg_op <> 'INSERT' and old.org_id is not null and old.kind in ('cash','returns','stockMoves')
    and (old.data ? 'invoiceSettlement' or old.data ? 'postingLines') then
    if tg_op = 'DELETE' then
      raise exception 'SNS_POSTED_INVOICE_IMMUTABLE';
    end if;
    if (old.data - array['updatedAt','_dev']) is distinct from (new.data - array['updatedAt','_dev']) then
      raise exception 'SNS_POSTED_INVOICE_IMMUTABLE';
    end if;
  end if;
  if tg_op <> 'INSERT' and old.org_id is not null and old.kind in ('banks','customers','suppliers')
    and (old.data ? 'openingDate' or (tg_op = 'UPDATE' and new.data ? 'openingDate')) then
    if tg_op = 'DELETE' then
      raise exception 'SNS_POSTED_INVOICE_IMMUTABLE';
    end if;
    if old.data->'openingDate' is distinct from new.data->'openingDate'
      or old.data->'opening' is distinct from new.data->'opening'
      or old.data->'openingBalance' is distinct from new.data->'openingBalance' then
      raise exception 'SNS_POSTED_INVOICE_IMMUTABLE';
    end if;
  end if;
  if tg_op <> 'INSERT' and old.org_id is not null and old.kind in ('sales','purchases','returns') and old.data ? 'posting' then
    if tg_op = 'DELETE' then
      raise exception 'SNS_POSTED_INVOICE_IMMUTABLE';
    end if;
    if old.data->'posting' is distinct from new.data->'posting'
      or (old.data ? 'voided' and old.data->'voided' is distinct from new.data->'voided')
      or exists (
        select 1
        from unnest(array['id','no','date','branch','customerId','supplierId','purchaseOrderId',
          'items','sub','disc','vat','vatP','total','cost','profit','payMethod','acct','payAcct',
          'splitCash','splitCard','splitAcct','type','refId','refNo']) as field(key)
        where old.data->field.key is distinct from new.data->field.key
      ) then
      raise exception 'SNS_POSTED_INVOICE_IMMUTABLE';
    end if;
  end if;
  if tg_op <> 'INSERT' and old.kind in ('sales','purchases','returns','expenses','journal','cash','stockMoves','stockTakes') then
    org := old.org_id;
    prior_date := left(coalesce(old.data->>'date', old.data->>'ts'), 10);
  end if;
  if tg_op <> 'DELETE' and new.kind in ('sales','purchases','returns','expenses','journal','cash','stockMoves','stockTakes') then
    org := coalesce(new.org_id, org);
    next_date := left(coalesce(new.data->>'date', new.data->>'ts'), 10);
  end if;
  if tg_op = 'INSERT' and new.org_id is not null and new.kind in ('banks','customers','suppliers')
    and new.data ? 'openingDate' then
    org := new.org_id;
    next_date := new.data->>'openingDate';
    if coalesce(next_date,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(new.data->(case new.kind when 'banks' then 'opening' else 'openingBalance' end))
        is distinct from 'number' then
      raise exception 'SNS_INVALID_POSTING';
    end if;
  end if;

  if tg_op <> 'DELETE' and new.org_id is not null and (
    (new.kind in ('sales','purchases','returns') and new.data ? 'posting')
    or (new.kind in ('cash','stockMoves') and new.data ? 'postingLines')
  ) then
    posting_lines := case when new.kind in ('cash','stockMoves') then new.data->'postingLines'
      else new.data#>'{posting,lines}' end;
    if jsonb_typeof(posting_lines) is distinct from 'array'
      or coalesce(new.data->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (new.kind in ('sales','purchases','returns')
        and new.data#>>'{posting,date}' is distinct from new.data->>'date') then
      raise exception 'SNS_INVALID_POSTING';
    end if;
    if jsonb_array_length(posting_lines) < 2 then
      raise exception 'SNS_INVALID_POSTING';
    end if;
    if exists (
      select 1 from jsonb_array_elements(posting_lines) line
      where nullif(line->>'code','') is null
        or jsonb_typeof(line->'debit') is distinct from 'number'
        or jsonb_typeof(line->'credit') is distinct from 'number'
    ) then
      raise exception 'SNS_INVALID_POSTING';
    end if;
    if exists (
      select 1 from jsonb_array_elements(posting_lines) line
      where (line->>'debit')::numeric < 0 or (line->>'credit')::numeric < 0
        or ((line->>'debit')::numeric > 0) = ((line->>'credit')::numeric > 0)
    ) then
      raise exception 'SNS_INVALID_POSTING';
    end if;
    select coalesce(sum((line->>'debit')::numeric),0),coalesce(sum((line->>'credit')::numeric),0)
      into debit_total,credit_total from jsonb_array_elements(posting_lines) line;
    if debit_total <> credit_total then
      raise exception 'SNS_INVALID_POSTING';
    end if;
  end if;

  if org is not null then
    select settings.data#>>'{settings,lockBefore}' into lock_date
    from public.v2_settings settings where settings.org_id = org;
    if lock_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and
      (prior_date <= lock_date or next_date <= lock_date) then
      if tg_op <> 'UPDATE' then
        raise exception 'SNS_ACCOUNTING_PERIOD_LOCKED';
      end if;
      if old.kind not in ('sales','purchases') or not (old.data ? 'posting') or old.data ? 'voided'
        or old.data->'settlementRefs' is not distinct from new.data->'settlementRefs'
        or (old.data - array['settlementRefs','paidAmount','dueAmount','updatedAt','_dev'])
          is distinct from (new.data - array['settlementRefs','paidAmount','dueAmount','updatedAt','_dev']) then
        raise exception 'SNS_ACCOUNTING_PERIOD_LOCKED';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.sns_guard_locked_accounting_record() from public, anon, authenticated;
drop trigger if exists sns_guard_locked_accounting_record on public.v2_records;
create trigger sns_guard_locked_accounting_record
before insert or update or delete on public.v2_records
for each row execute function public.sns_guard_locked_accounting_record();

-- A closed invoice may change only its balance summary, backed by separate
-- payment or return records in an open period. Check after all batch writes.
create or replace function public.sns_check_invoice_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  lock_date text;
  old_refs jsonb := coalesce(old.data->'settlementRefs','[]'::jsonb);
  new_refs jsonb := coalesce(new.data->'settlementRefs','[]'::jsonb);
  ref jsonb;
  doc jsonb;
  invoice_kind text := case old.kind when 'sales' then 'sale' else 'purchase' end;
  amount numeric;
  due_delta numeric := 0;
  paid_delta numeric := 0;
  ref_index integer;
begin
  if old.org_id is null or old.kind not in ('sales','purchases') or old_refs is not distinct from new_refs then
    return null;
  end if;
  select settings.data#>>'{settings,lockBefore}' into lock_date
  from public.v2_settings settings where settings.org_id = old.org_id;
  if not (old.data ? 'posting') or old.data ? 'voided'
    or (old.data - array['settlementRefs','paidAmount','dueAmount','updatedAt','_dev'])
      is distinct from (new.data - array['settlementRefs','paidAmount','dueAmount','updatedAt','_dev'])
    or jsonb_typeof(old_refs) is distinct from 'array' or jsonb_typeof(new_refs) is distinct from 'array'
    or jsonb_typeof(new.data->'dueAmount') is distinct from 'number'
    or jsonb_typeof(new.data->'paidAmount') is distinct from 'number'
    or jsonb_array_length(new_refs) <= jsonb_array_length(old_refs)
    or (new.data->>'dueAmount')::numeric < 0 then
    raise exception 'SNS_INVALID_SETTLEMENT';
  end if;

  for ref_index in 0..jsonb_array_length(new_refs)-1 loop
    ref := new_refs->ref_index;
    if ref_index < jsonb_array_length(old_refs) then
      if ref is distinct from old_refs->ref_index then raise exception 'SNS_INVALID_SETTLEMENT'; end if;
      continue;
    end if;

    if coalesce(ref->>'kind','') not in ('cash','returns') or nullif(ref->>'id','') is null
      or exists (select 1 from jsonb_array_elements(new_refs) with ordinality as item(value,n)
        where item.n <= ref_index and item.value->>'kind' = ref->>'kind' and item.value->>'id' = ref->>'id') then
      raise exception 'SNS_INVALID_SETTLEMENT';
    end if;
    select record.data into doc from public.v2_records record
    where record.org_id = old.org_id and record.kind = ref->>'kind' and record.local_id = ref->>'id';
    if doc is null or coalesce(doc->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (lock_date is not null and (doc->>'date') <= lock_date)
      or doc#>>'{invoiceSettlement,invoiceId}' is distinct from old.local_id
      or nullif(doc->>'branch','') is distinct from nullif(old.data->>'branch','')
      or jsonb_typeof(doc#>'{invoiceSettlement,amount}') is distinct from 'number' then
      raise exception 'SNS_INVALID_SETTLEMENT';
    end if;
    amount := (doc#>>'{invoiceSettlement,amount}')::numeric;
    if amount <= 0 then raise exception 'SNS_INVALID_SETTLEMENT'; end if;

    if ref->>'kind' = 'cash' then
      if doc->>'ref' is distinct from old.local_id or doc#>>'{invoicePayment,kind}' is distinct from invoice_kind
        or doc->>'type' is distinct from (case invoice_kind when 'sale' then 'in' else 'out' end)
        or (doc->>'amount')::numeric is distinct from amount
        or jsonb_typeof(doc->'postingLines') is distinct from 'array' then
        raise exception 'SNS_INVALID_SETTLEMENT';
      end if;
      if (select count(*) from jsonb_array_elements(doc->'postingLines')) <> 2
        or not exists (select 1 from jsonb_array_elements(doc->'postingLines') line
          where line->>'code' = (case invoice_kind when 'sale' then '1300' else '2100' end)
            and (line->>'credit')::numeric = (case invoice_kind when 'sale' then amount else 0 end)
            and (line->>'debit')::numeric = (case invoice_kind when 'purchase' then amount else 0 end))
        or not exists (select 1 from jsonb_array_elements(doc->'postingLines') line
          where line->>'code' = (case when coalesce(doc->>'acct','cash') = 'cash' then '1100' else 'bank:'||(doc->>'acct') end)
            and (line->>'debit')::numeric = (case invoice_kind when 'sale' then amount else 0 end)
            and (line->>'credit')::numeric = (case invoice_kind when 'purchase' then amount else 0 end)) then
        raise exception 'SNS_INVALID_SETTLEMENT';
      end if;
      paid_delta := paid_delta + amount;
    elsif doc->>'refId' is distinct from old.local_id or doc->>'type' is distinct from invoice_kind
      or not (doc ? 'posting')
      or amount > coalesce((doc->>'total')::numeric,0)+coalesce((doc->>'vat')::numeric,0)
      or amount is distinct from (select sum(
          case invoice_kind when 'sale' then (line->>'credit')::numeric-(line->>'debit')::numeric
          else (line->>'debit')::numeric-(line->>'credit')::numeric end)
        from jsonb_array_elements(doc#>'{posting,lines}') line
        where line->>'code' = (case invoice_kind when 'sale' then '1300' else '2100' end)) then
      raise exception 'SNS_INVALID_SETTLEMENT';
    end if;
    due_delta := due_delta + amount;
  end loop;

  if coalesce((old.data->>'dueAmount')::numeric,0)-(new.data->>'dueAmount')::numeric <> due_delta
    or (new.data->>'paidAmount')::numeric-coalesce((old.data->>'paidAmount')::numeric,0) <> paid_delta then
    raise exception 'SNS_INVALID_SETTLEMENT';
  end if;
  return null;
end;
$function$;

revoke all on function public.sns_check_invoice_settlement() from public, anon, authenticated;
drop trigger if exists sns_check_invoice_settlement on public.v2_records;
create constraint trigger sns_check_invoice_settlement
after update on public.v2_records deferrable initially deferred
for each row execute function public.sns_check_invoice_settlement();

create table if not exists public.sns_org_backups (
  org_id uuid not null references public.orgs(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  data jsonb not null,
  primary key (org_id, day)
);

alter table public.sns_org_backups enable row level security;
revoke all on public.sns_org_backups from public, anon, authenticated;
grant select on public.sns_org_backups to authenticated;
grant select, insert, update on public.sns_org_backups to service_role;

drop policy if exists sns_org_backups_owner_read on public.sns_org_backups;
create policy sns_org_backups_owner_read on public.sns_org_backups
  for select to authenticated using (
    exists (
      select 1 from public.orgs
      where orgs.id = sns_org_backups.org_id and orgs.owner_id = (select auth.uid())
    )
  );

-- Both the rows and the settings are read in one statement, so the backup
-- cannot mix pages from different points in time.
create or replace function public.sns_create_org_backup(p_org uuid)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  backup_day date := (statement_timestamp() at time zone 'UTC')::date;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not exists (
      select 1 from public.orgs where id = p_org and owner_id = auth.uid()
    ) then
    raise exception 'SNS_BACKUP_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.sns_org_backups (org_id, day, created_at, data)
  select o.id, backup_day, statement_timestamp(),
    jsonb_build_object(
      'format', 'sns-org-backup-v1',
      'orgId', o.id,
      'settings', coalesce(s.data->'settings', '{}'::jsonb),
      'seq', coalesce(s.data->'seq', '{}'::jsonb),
      'budgets', coalesce(s.data->'budgets', '{}'::jsonb),
      'bankRecon', coalesce(s.data->'bankRecon', '{}'::jsonb),
      'records', coalesce((
        select jsonb_object_agg(grouped.kind, grouped.items)
        from (
          select r.kind, jsonb_agg(r.data order by r.local_id) as items
          from public.v2_records r
          where r.org_id = o.id
          group by r.kind
        ) grouped
      ), '{}'::jsonb)
    )
  from public.orgs o
  left join public.v2_settings s on s.org_id = o.id
  where o.id = p_org
  on conflict (org_id, day) do update set
    data = excluded.data, created_at = excluded.created_at
  where public.sns_org_backups.created_at <= excluded.created_at;

  if not found and not exists (select 1 from public.orgs where id = p_org) then
    raise exception 'SNS_BACKUP_ORG_NOT_FOUND' using errcode = '22023';
  end if;
  return backup_day;
end;
$$;

revoke all on function public.sns_create_org_backup(uuid) from public, anon;
grant execute on function public.sns_create_org_backup(uuid) to authenticated, service_role;

commit;
