-- Staging only. Set approved_balance after checking the customer's account.
-- Install org-sync-staging.sql only after this transaction succeeds.
begin;
lock table public.v2_records, public.v2_settings in share row exclusive mode;

create schema if not exists sns_recovery;
revoke all on schema sns_recovery from public, anon, authenticated;
create table if not exists sns_recovery.sync_reconcile_rows (
  batch_id uuid not null,
  source_table text not null,
  original jsonb not null,
  archived_at timestamptz not null default now()
);
revoke all on sns_recovery.sync_reconcile_rows from public, anon, authenticated;

do $$
declare
  approved_balance numeric := null; -- Replace NULL with the verified customer balance.
  batch uuid := gen_random_uuid();
  target record;
  cfg record;
  seller_settings jsonb;
  counter_values jsonb;
  counter_key text;
  record_kind text;
  minimum_counter numeric;
  actual_due numeric;
  record_groups integer;
begin
  select count(*) into record_groups from (
    select 1 from public.v2_records where org_id is not null
    group by org_id, kind, local_id having count(*) > 1
  ) g;
  if record_groups <> 428 then
    raise exception 'SNS_RECONCILE_COUNTS_CHANGED: % duplicate record keys', record_groups;
  end if;

  select org_id, local_id into strict target from public.v2_records
  where org_id is not null and kind = 'customers'
  group by org_id, local_id
  having count(*) = 2 and count(distinct (data - array['updatedAt','_dev'])) > 1
    and count(distinct (data - array['updatedAt','_dev','balance'])) = 1
    and array_agg((data->>'balance')::numeric order by (data->>'balance')::numeric) = array[0,40]::numeric[];
  if (select count(*) from (
    select 1 from public.v2_records where org_id is not null
    group by org_id, kind, local_id
    having count(distinct (data - array['updatedAt','_dev'])) > 1
  ) g) <> 1 then
    raise exception 'SNS_RECONCILE_RECORD_CONFLICTS_CHANGED';
  end if;

  select coalesce(sum((s.data->>'dueAmount')::numeric),0) into actual_due
  from (
    select distinct on (local_id) data from public.v2_records
    where org_id = target.org_id and kind = 'sales'
      and data->>'customerId' = target.local_id
    order by local_id, updated_at desc, id
  ) s;
  if actual_due <> 550 then raise exception 'SNS_RECONCILE_INVOICE_DUE_CHANGED'; end if;
  if approved_balance is null or approved_balance not between -999999999999 and 999999999999
    or approved_balance <> round(approved_balance,2) then
    raise exception 'SNS_RECONCILE_APPROVED_BALANCE_REQUIRED';
  end if;

  select s.org_id, s.user_id, s.data into strict cfg
  from public.v2_settings s join public.orgs o on o.id = s.org_id
  where s.user_id = o.owner_id and s.org_id in (
    select org_id from public.v2_settings where org_id is not null
    group by org_id having count(*) > 1
  );
  select s.data into strict seller_settings from public.v2_settings s
  where s.org_id = cfg.org_id and s.user_id <> cfg.user_id;
  if (select count(*) from (
    select 1 from public.v2_settings where org_id is not null
    group by org_id having count(*) > 1
  ) g) <> 1 then
    raise exception 'SNS_RECONCILE_SETTINGS_GROUPS_CHANGED';
  end if;

  if exists (
    select 1 from public.v2_settings s where s.org_id = cfg.org_id and (
      coalesce(s.data->'budgets','null'::jsonb) not in ('null'::jsonb,'{}'::jsonb)
      or coalesce(s.data->'bankRecon','null'::jsonb) not in ('null'::jsonb,'{}'::jsonb)
      or coalesce(s.data #> '{settings,_activeShift}','null'::jsonb) <> 'null'::jsonb
    )
  ) then
    raise exception 'SNS_RECONCILE_FINANCE_OR_SHIFT_REVIEW_REQUIRED';
  end if;
  -- These settings contain operational records, so keep conflicting versions for review.
  if exists (
    select 1
    from (values ('staffTasks'), ('warranties')) as shared(key)
    cross join lateral (
      select
        coalesce(nullif(cfg.data #> array['settings', shared.key], 'null'::jsonb), '[]'::jsonb) as owner_data,
        coalesce(nullif(seller_settings #> array['settings', shared.key], 'null'::jsonb), '[]'::jsonb) as staff_data
    ) as entries
    where jsonb_typeof(entries.owner_data) <> 'array'
       or jsonb_typeof(entries.staff_data) <> 'array'
       or entries.owner_data is distinct from entries.staff_data
  ) then
    raise exception 'SNS_RECONCILE_SHARED_SETTINGS_REVIEW_REQUIRED';
  end if;
  if coalesce(cfg.data #>> '{seq,sale}','') <> '1'
    or coalesce(cfg.data #>> '{seq,quote}','') <> '1'
    or cfg.data #>> '{seq,shiftSession}' is not null
    or coalesce(seller_settings #>> '{seq,sale}','') <> '42'
    or coalesce(seller_settings #>> '{seq,quote}','') <> '2'
    or coalesce(seller_settings #>> '{seq,shiftSession}','') <> '4' then
    raise exception 'SNS_RECONCILE_COUNTERS_CHANGED';
  end if;

  insert into sns_recovery.sync_reconcile_rows(batch_id,source_table,original)
  select batch,'v2_records',to_jsonb(r) from public.v2_records r
  join (
    select org_id, kind, local_id from public.v2_records where org_id is not null
    group by org_id, kind, local_id having count(*) > 1
  ) d using (org_id,kind,local_id);
  insert into sns_recovery.sync_reconcile_rows(batch_id,source_table,original)
  select batch,'v2_settings',to_jsonb(s) from public.v2_settings s where s.org_id = cfg.org_id;

  -- Preserve both versions above. Keep one row per shop and logical record here.
  with ranked as (
    select id, row_number() over (partition by org_id,kind,local_id
      order by updated_at desc nulls last,id) as row_number
    from public.v2_records where org_id is not null
  )
  delete from public.v2_records r using ranked d where r.id = d.id and d.row_number > 1;

  update public.v2_records r set
    data = jsonb_set(r.data,'{balance}',to_jsonb(approved_balance)),
    updated_at = now()
  where r.org_id = target.org_id and r.kind = 'customers' and r.local_id = target.local_id;

  counter_values := coalesce(cfg.data->'seq','{}'::jsonb);
  for counter_key, record_kind in
    select * from (values ('sale','sales'),('quote','quotes'),('shiftSession','shiftSessions')) v(k,r)
  loop
    select coalesce(max(case when data->>'no' ~ '^[0-9]+$' then (data->>'no')::numeric end),0)
      into minimum_counter from public.v2_records where org_id = cfg.org_id and kind = record_kind;
    if counter_key <> 'shiftSession' then minimum_counter := minimum_counter + 1; end if;
    counter_values := jsonb_set(counter_values, array[counter_key], to_jsonb(greatest(
      minimum_counter, (cfg.data->'seq'->>counter_key)::numeric,
      (seller_settings->'seq'->>counter_key)::numeric)));
  end loop;
  update public.v2_settings s set data = jsonb_set(cfg.data,'{seq}',counter_values), updated_at = now()
    where s.org_id = cfg.org_id and s.user_id = cfg.user_id;
  delete from public.v2_settings s where s.org_id = cfg.org_id and s.user_id <> cfg.user_id;
  raise notice 'SNS_RECONCILE_DONE archive_batch=%', batch;
end;
$$;
commit;
