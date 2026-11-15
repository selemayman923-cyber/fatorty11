-- Apply on SNS Staging after org-sync-staging.sql.
begin;

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

commit;
