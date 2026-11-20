-- Apply only after reviewing the live subscription contract and grants on staging.
begin;

do $$
begin
  if exists(select 1 from public.subscriptions group by org_id having count(*)>1) then
    raise exception 'SNS_BILLING_DUPLICATE_SHOPS';
  end if;
  perform pg_catalog.jsonb_populate_record(null::public.subscriptions,'{"plan":"trial","status":"trialing"}'::jsonb);
  perform pg_catalog.jsonb_populate_record(null::public.subscriptions,'{"plan":"starter","status":"active"}'::jsonb);
  perform pg_catalog.jsonb_populate_record(null::public.subscriptions,'{"plan":"growth","status":"suspended"}'::jsonb);
  perform pg_catalog.jsonb_populate_record(null::public.subscriptions,'{"plan":"pro","status":"cancelled"}'::jsonb);
end;
$$;

create table if not exists public.sns_billing_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.sns_billing_history (
  org_id uuid primary key references public.orgs(id) on delete cascade
);
insert into public.sns_billing_history select distinct org_id from public.subscriptions where org_id is not null
on conflict do nothing;

create table if not exists public.sns_transfer_reviews (
  org_id uuid not null references public.orgs(id),
  method text not null check (method in ('instapay','vodafone','bank')),
  reference text not null,
  plan text not null,
  months integer not null,
  amount numeric(14,2) not null check (amount>0),
  decision text not null check (decision in ('accepted','rejected')),
  resulting_expiry timestamptz,
  reviewed_at timestamptz not null default now(),
  reviewer uuid not null,
  primary key (org_id,method,reference),
  check ((decision='accepted')=(resulting_expiry is not null))
);
create unique index if not exists sns_transfer_accepted_once
  on public.sns_transfer_reviews(method,reference) where decision='accepted';

alter table public.sns_billing_reviewers enable row level security;
alter table public.sns_billing_history enable row level security;
alter table public.sns_transfer_reviews enable row level security;
revoke all on public.sns_billing_reviewers, public.sns_billing_history, public.sns_transfer_reviews
  from public, anon, authenticated;
revoke insert, update, delete, truncate on public.subscriptions from public, anon, authenticated;

-- Serialize trial creation, cancellation and application of a payment per shop.
create or replace function public.sns_billing_start(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare trial public.subscriptions%rowtype;
begin
  if not exists (select 1 from public.orgs where id=p_org and owner_id=auth.uid()) then
    if exists (select 1 from public.org_members where org_id=p_org and user_id=auth.uid()) then
      return;
    end if;
    raise exception 'SNS_BILLING_FORBIDDEN' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,0));
  if exists (select 1 from public.subscriptions where org_id=p_org)
    or exists (select 1 from public.sns_billing_history where org_id=p_org) then return; end if;
  trial := pg_catalog.jsonb_populate_record(null::public.subscriptions,'{"plan":"trial","status":"trialing"}'::jsonb);
  insert into public.subscriptions(org_id,plan,status,expires_at)
    values(p_org,trial.plan,trial.status,now()+interval '14 days');
  insert into public.sns_billing_history values(p_org);
end;
$$;

create or replace function public.sns_review_transfer(
  p_org uuid,p_method text,p_reference text,p_plan text,p_months integer,p_amount numeric,p_decision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  transaction_ref text;
  monthly numeric;
  multiplier numeric;
  prior public.sns_transfer_reviews%rowtype;
  sub public.subscriptions%rowtype;
  next_sub public.subscriptions%rowtype;
  expiry timestamptz;
begin
  if not exists (select 1 from public.sns_billing_reviewers where user_id=actor) then
    raise exception 'SNS_BILLING_FORBIDDEN' using errcode='42501';
  end if;
  transaction_ref := upper(regexp_replace(translate(coalesce(p_reference,''),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[[:space:]]+','','g'));
  monthly := case p_plan when 'starter' then 299 when 'growth' then 699 when 'pro' then 1499 end;
  multiplier := case p_months when 1 then 1 when 6 then 0.90 when 12 then 0.80 when 24 then 0.70 end;
  if p_org is null or p_method is null or p_method not in ('instapay','vodafone','bank')
    or transaction_ref !~ '^[A-Z0-9][A-Z0-9-]{4,79}$'
    or monthly is null or multiplier is null or p_decision is null or p_decision not in ('accepted','rejected')
    or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount>=1e12
    or p_amount<>round(p_amount,2) or not exists(select 1 from public.plan_limits where plan::text=p_plan)
    or not exists(select 1 from public.orgs where id=p_org) then
    raise exception 'SNS_BILLING_INVALID' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,0));
  select * into prior from public.sns_transfer_reviews where org_id=p_org and method=p_method and reference=transaction_ref;
  if found then
    if (prior.plan,prior.months,prior.amount,prior.decision) is distinct from (p_plan,p_months,p_amount,p_decision) then
      raise exception 'SNS_BILLING_REVIEW_EXISTS' using errcode='23505';
    end if;
    return jsonb_build_object('decision',prior.decision,'expires_at',prior.resulting_expiry,'replayed',true);
  end if;
  if p_decision='accepted' then
    if p_amount<>round(monthly*p_months*multiplier,2) then
      raise exception 'SNS_BILLING_AMOUNT_MISMATCH' using errcode='22023';
    end if;
    select * into sub from public.subscriptions where org_id=p_org for update;
    expiry := (case when sub.plan::text=p_plan and sub.status::text='active'
      and sub.expires_at>now() then sub.expires_at else now() end) + pg_catalog.make_interval(months=>p_months);
  end if;

  -- The unique accepted reference also handles submissions from different shops.
  insert into public.sns_transfer_reviews(org_id,method,reference,plan,months,amount,decision,resulting_expiry,reviewer)
  values(p_org,p_method,transaction_ref,p_plan,p_months,p_amount,p_decision,expiry,actor);

  if p_decision='accepted' then
    next_sub := pg_catalog.jsonb_populate_record(null::public.subscriptions,
      jsonb_build_object('plan',p_plan,'status','active'));
    update public.subscriptions set plan=next_sub.plan,status=next_sub.status,expires_at=expiry where org_id=p_org;
    if not found then
      insert into public.subscriptions(org_id,plan,status,expires_at) values(p_org,next_sub.plan,next_sub.status,expiry);
    end if;
    insert into public.sns_billing_history values(p_org) on conflict do nothing;
  end if;
  return jsonb_build_object('decision',p_decision,'expires_at',expiry,'replayed',false);
end;
$$;

create or replace function public.sns_my_transfer_reviews(p_org uuid)
returns table(method text,reference text,plan text,months integer,amount numeric,decision text,expires_at timestamptz,reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.orgs where id=p_org and owner_id=auth.uid()) then
    raise exception 'SNS_BILLING_FORBIDDEN' using errcode='42501';
  end if;
  return query select r.method,r.reference,r.plan,r.months,r.amount,r.decision,r.resulting_expiry,r.reviewed_at
    from public.sns_transfer_reviews r where r.org_id=p_org order by r.reviewed_at desc limit 20;
end;
$$;

create or replace function public.sns_can_review_billing()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.sns_billing_reviewers where user_id=auth.uid());
$$;

create or replace function public.sns_billing_shops()
returns table(org_id uuid,name text,plan text,status text,expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sns_billing_reviewers where user_id=auth.uid()) then
    raise exception 'SNS_BILLING_FORBIDDEN' using errcode='42501';
  end if;
  return query select o.id,o.name,s.plan::text,s.status::text,s.expires_at from public.orgs o
    left join public.subscriptions s on s.org_id=o.id order by o.name,o.id;
end;
$$;

create or replace function public.sns_billing_stop(p_org uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare next_sub public.subscriptions%rowtype;
begin
  if not exists (select 1 from public.sns_billing_reviewers where user_id=auth.uid()) then
    raise exception 'SNS_BILLING_FORBIDDEN' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('suspended','cancelled') then
    raise exception 'SNS_BILLING_INVALID' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,0));
  next_sub := pg_catalog.jsonb_populate_record(null::public.subscriptions,
    jsonb_build_object('status',p_status));
  update public.subscriptions set status=next_sub.status where org_id=p_org;
  if not found then raise exception 'SNS_BILLING_MISSING' using errcode='22023'; end if;
  insert into public.sns_billing_history values(p_org) on conflict do nothing;
end;
$$;

revoke all on function public.sns_billing_start(uuid),
  public.sns_review_transfer(uuid,text,text,text,integer,numeric,text),
  public.sns_my_transfer_reviews(uuid),public.sns_can_review_billing(),public.sns_billing_shops(),public.sns_billing_stop(uuid,text)
  from public, anon, authenticated;
grant execute on function public.sns_billing_start(uuid),
  public.sns_review_transfer(uuid,text,text,text,integer,numeric,text),
  public.sns_my_transfer_reviews(uuid),public.sns_can_review_billing(),public.sns_billing_shops(),public.sns_billing_stop(uuid,text)
  to authenticated;

-- The old browser procedures could bypass reference review or delete cancellation state.
do $$
declare routine record;
begin
  for routine in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.prokind='f'
      and p.proname in ('ensure_subscription','activate_subscription',
        'suspend_subscription','cancel_subscription','set_subscription_expiry')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated',routine.signature);
  end loop;
end;
$$;
commit;
