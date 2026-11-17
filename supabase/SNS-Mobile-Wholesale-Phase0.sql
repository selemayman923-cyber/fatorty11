-- SNS mobile wholesale v1. Apply as the database owner on SNS Staging.
begin;
create schema if not exists sns_wholesale;
revoke all on schema sns_wholesale from public, anon, authenticated;

create table if not exists sns_wholesale.shops (
  org_id uuid primary key references public.orgs(id) on delete restrict,
  enabled boolean not null default true,
  activity text not null default 'mobile_wholesale' check (activity = 'mobile_wholesale'),
  return_days int not null default 14 check (return_days between 0 and 365),
  default_fx numeric(18,6) not null default 1 check (default_fx > 0),
  vat_rate numeric(7,4) not null default 0 check (vat_rate between 0 and 100),
  invoice_prefix text not null default 'MW' check (invoice_prefix ~ '^[A-Z0-9]{1,10}$'),
  profile jsonb not null default '{}' check (jsonb_typeof(profile) = 'object'),
  enabled_at timestamptz not null default now()
);
create table if not exists sns_wholesale.catalog_defaults (
  kind text not null check (kind in ('brand','region','expense')),
  code text not null,
  label text not null,
  primary key (kind,code)
);
insert into sns_wholesale.catalog_defaults(kind,code,label) values
  ('brand','apple','Apple'),('brand','samsung','Samsung'),('brand','xiaomi','Xiaomi'),
  ('brand','oppo','Oppo'),('brand','realme','Realme'),('brand','infinix','Infinix'),('brand','honor','Honor'),
  ('region','LL/A','LL/A'),('region','ZA/A','ZA/A'),('region','CH/A','CH/A'),
  ('region','J/A','J/A'),('region','AE/A','AE/A'),('region','HN/A','HN/A'),
  ('expense','transport','نقل وشحن'),('expense','rent','إيجار'),('expense','repairs','صيانة'),('expense','other','أخرى')
on conflict do nothing;
create table if not exists sns_wholesale.lookups (
  org_id uuid not null references sns_wholesale.shops(org_id),
  kind text not null check (kind in ('brand','region','expense')),
  code text not null check (length(code) between 1 and 40),
  label text not null check (length(label) between 1 and 120),
  active boolean not null default true,
  primary key(org_id,kind,code)
);
create table if not exists sns_wholesale.warehouses (
  org_id uuid not null references sns_wholesale.shops(org_id),
  id uuid not null default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  active boolean not null default true,
  primary key (org_id,id), unique (org_id,name)
);
create table if not exists sns_wholesale.accounts (
  org_id uuid not null references sns_wholesale.shops(org_id),
  id uuid not null default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('cash','bank','transfer','instapay','vodafone')),
  active boolean not null default true,
  primary key (org_id,id), unique (org_id,name)
);
create table if not exists sns_wholesale.parties (
  org_id uuid not null references sns_wholesale.shops(org_id),
  id uuid not null default gen_random_uuid(),
  kind text not null check (kind in ('customer','supplier')),
  name text not null check (length(trim(name)) between 1 and 180),
  phone text,
  address text,
  notes text,
  tax_number text,
  currency text not null default 'EGP' check (currency in ('EGP','USD') and (kind = 'supplier' or currency = 'EGP')),
  tier text not null default 'wholesale' check (tier in ('wholesale','volume','vip')),
  credit_limit numeric(14,2) check (credit_limit >= 0),
  blacklisted boolean not null default false,
  active boolean not null default true,
  primary key (org_id,id)
);
create table if not exists sns_wholesale.reps (
  org_id uuid not null references sns_wholesale.shops(org_id),
  id uuid not null default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  commission_kind text not null check (commission_kind in ('percent','per_device')),
  commission_rate numeric(14,2) not null check (commission_rate >= 0 and (commission_kind <> 'percent' or commission_rate <= 100)),
  active boolean not null default true,
  primary key (org_id,id)
);
create table if not exists sns_wholesale.skus (
  org_id uuid not null references sns_wholesale.shops(org_id),
  id uuid not null default gen_random_uuid(),
  code text not null check (length(trim(code)) between 1 and 80),
  kind text not null check (kind in ('device','accessory')),
  category text not null check (category in ('phone','tablet','watch','accessory','other')),
  brand text not null,
  model text not null check (length(trim(model)) between 1 and 160),
  capacity text not null default '',
  color text not null default '',
  barcode text,
  low_stock int not null default 0 check (low_stock >= 0),
  active boolean not null default true,
  primary key (org_id,id), unique(org_id,code), unique (org_id,barcode),
  check (kind = 'accessory' or category <> 'accessory')
);
create table if not exists sns_wholesale.prices (
  org_id uuid not null,
  sku_id uuid not null,
  tier text not null check (tier in ('wholesale','volume','vip')),
  amount numeric(14,2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key(org_id,sku_id,tier),
  foreign key(org_id,sku_id) references sns_wholesale.skus(org_id,id)
);
create table if not exists sns_wholesale.price_history (
  org_id uuid not null,
  id bigint generated always as identity primary key,
  sku_id uuid not null,
  tier text not null,
  old_amount numeric(14,2),
  amount numeric(14,2) not null,
  actor uuid not null,
  changed_at timestamptz not null default now(),
  foreign key(org_id,sku_id,tier) references sns_wholesale.prices(org_id,sku_id,tier)
);
create table if not exists sns_wholesale.periods (
  org_id uuid not null references sns_wholesale.shops(org_id),
  month date not null check (extract(day from month) = 1),
  closed boolean not null,
  reason text not null,
  actor uuid not null,
  changed_at timestamptz not null default now(),
  primary key(org_id,month)
);
create table if not exists sns_wholesale.counters (
  org_id uuid not null references sns_wholesale.shops(org_id),
  year int not null,
  last_no bigint not null check (last_no > 0),
  primary key (org_id,year)
);
create table if not exists sns_wholesale.quotes (
  org_id uuid not null,
  id uuid not null default gen_random_uuid(),
  party_id uuid not null,
  valid_until date not null,
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 500),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  actor uuid not null,
  note text,
  created_at timestamptz not null default now(),
  primary key(org_id,id),
  foreign key(org_id,party_id) references sns_wholesale.parties(org_id,id)
);
create table if not exists sns_wholesale.documents (
  org_id uuid not null references sns_wholesale.shops(org_id),
  id uuid not null default gen_random_uuid(),
  number text not null,
  kind text not null check (kind in (
    'purchase','sale','customer_return','supplier_return','receipt','payment','expense',
    'transfer','draw','opening','check_clear','check_bounce','check_reverse','warehouse_move',
    'reserve','release','maintenance','cost_adjustment','reversal'
  )),
  business_date date not null,
  created_at timestamptz not null default now(),
  actor uuid not null,
  party_id uuid,
  warehouse_id uuid,
  rep_id uuid,
  quote_id uuid,
  source_id uuid,
  voided_by uuid,
  currency text not null check (currency in ('EGP','USD')),
  fx numeric(18,6) not null check (fx > 0 and (currency <> 'EGP' or fx = 1)),
  due_date date,
  reference text,
  note text,
  gross numeric(14,2) not null default 0 check (gross >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  fees numeric(14,2) not null default 0 check (fees >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  primary key(org_id,id),
  unique (org_id,number),
  foreign key(org_id,party_id) references sns_wholesale.parties(org_id,id),
  foreign key(org_id,warehouse_id) references sns_wholesale.warehouses(org_id,id),
  foreign key(org_id,rep_id) references sns_wholesale.reps(org_id,id),
  foreign key(org_id,quote_id) references sns_wholesale.quotes(org_id,id),
  foreign key(org_id,source_id) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,voided_by) references sns_wholesale.documents(org_id,id)
);
create unique index if not exists sns_wholesale_quote_once
  on sns_wholesale.documents(org_id,quote_id) where quote_id is not null and voided_by is null;
create unique index if not exists sns_wholesale_supplier_invoice_once
  on sns_wholesale.documents(org_id,party_id,lower(reference))
  where kind='purchase' and reference is not null and voided_by is null;

create table if not exists sns_wholesale.devices (
  org_id uuid not null,
  id uuid not null default gen_random_uuid(),
  sku_id uuid not null,
  warehouse_id uuid not null,
  supplier_id uuid,
  intake_id uuid not null,
  last_sale_id uuid,
  imei text not null,
  imei2 text,
  serial_number text,
  status text not null check (status in ('available','reserved','sold','maintenance','damaged','supplier_return','voided')),
  condition text not null check (condition in ('sealed','open_box','used','refurbished')),
  grade text check (grade in ('A','B','C')),
  battery int check (battery between 0 and 100),
  region text,
  sim text check (sim in ('physical','esim','dual_physical','physical_esim')),
  package text not null default 'complete' check (package in ('complete','no_box','no_accessories','bare')),
  activation_lock text not null default 'unknown' check (activation_lock in ('clear','locked','unknown')),
  mdm text not null default 'unknown' check (mdm in ('clear','locked','unknown')),
  warranty_kind text not null default 'none' check (warranty_kind in ('none','agent','dealer')),
  warranty_until date,
  warranty_days int check (warranty_days between 0 and 3650),
  reserved_for uuid,
  reserved_until timestamptz,
  cost_egp numeric(14,2) not null check(cost_egp >= 0),
  acquired_on date not null,
  notes text,
  primary key(org_id,id),
  foreign key(org_id,sku_id) references sns_wholesale.skus(org_id,id),
  foreign key(org_id,warehouse_id) references sns_wholesale.warehouses(org_id,id),
  foreign key(org_id,supplier_id) references sns_wholesale.parties(org_id,id),
  foreign key(org_id,intake_id) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,last_sale_id) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,reserved_for) references sns_wholesale.parties(org_id,id),
  check ((status = 'reserved' and reserved_for is not null and reserved_until is not null)
    or (status <> 'reserved' and reserved_for is null and reserved_until is null)),
  check (condition <> 'used' or grade is not null),
  check ((warranty_kind <> 'agent' or warranty_until is not null)
    and (warranty_kind <> 'dealer' or warranty_days is not null))
);

create or replace function sns_wholesale.imei_valid(value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select value ~ '^[0-9]{15}$' and value <> repeat('0',15) and (
    select mod(sum(case when n%2=1 then digit else digit*2 - case when digit>4 then 9 else 0 end end),10)
    from (select n, case when substr(value,n,1) between '0' and '9' then substr(value,n,1)::int end digit
          from generate_series(1,15) n) digits
  ) = 0;
$$;
create table if not exists sns_wholesale.imei_registry (
  imei text primary key check (sns_wholesale.imei_valid(imei)),
  org_id uuid not null,
  device_id uuid not null,
  slot int not null check(slot in (1,2)),
  unique(org_id,device_id,slot),
  foreign key(org_id,device_id) references sns_wholesale.devices(org_id,id)
);
create table if not exists sns_wholesale.accessory_stock (
  org_id uuid not null,
  warehouse_id uuid not null,
  sku_id uuid not null,
  qty int not null check(qty >= 0),
  book_egp numeric(14,2) not null check(book_egp >= 0 and (qty <> 0 or book_egp = 0)),
  primary key(org_id,warehouse_id,sku_id),
  foreign key(org_id,warehouse_id) references sns_wholesale.warehouses(org_id,id),
  foreign key(org_id,sku_id) references sns_wholesale.skus(org_id,id)
);
create table if not exists sns_wholesale.doc_lines (
  org_id uuid not null,
  id uuid not null default gen_random_uuid(),
  document_id uuid not null,
  position int not null check (position > 0),
  sku_id uuid not null,
  device_id uuid,
  warehouse_id uuid not null,
  source_line_id uuid,
  qty int not null check(qty > 0 and (device_id is null or qty = 1)),
  unit_price numeric(14,2) not null check(unit_price >= 0),
  unit_net numeric(14,2) not null check(unit_net >= 0),
  line_net numeric(14,2) not null check(line_net >= 0),
  tax numeric(14,2) not null default 0 check(tax >= 0),
  landed numeric(14,2) not null default 0 check(landed >= 0),
  cost_egp numeric(14,2) not null check(cost_egp >= 0),
  commission_egp numeric(14,2) not null default 0 check(commission_egp >= 0),
  disposition text check(disposition in ('available','maintenance','damaged','supplier_return')),
  primary key(org_id,id), unique (org_id,document_id,position),
  foreign key(org_id,document_id) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,warehouse_id) references sns_wholesale.warehouses(org_id,id),
  foreign key(org_id,sku_id) references sns_wholesale.skus(org_id,id),
  foreign key(org_id,device_id) references sns_wholesale.devices(org_id,id),
  foreign key(org_id,source_line_id) references sns_wholesale.doc_lines(org_id,id)
);
create unique index if not exists sns_wholesale_doc_device_once
  on sns_wholesale.doc_lines(org_id,document_id,device_id) where device_id is not null;

create table if not exists sns_wholesale.journal (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  document_id uuid not null,
  bucket text not null check(bucket in (
    'cash','ar','ap','inventory','sales','sales_returns','cogs','expense','damage',
    'supplier_variance','fx','commission','commission_due','notes_receivable','notes_payable',
    'equity','vat_in','vat_out'
  )),
  egp numeric(14,2) not null,
  original numeric(14,2) not null,
  currency text not null check(currency in ('EGP','USD')),
  rate numeric(18,6) not null check(rate > 0 and (currency <> 'EGP' or rate = 1)),
  party_id uuid,
  account_id uuid,
  foreign key(org_id,document_id) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,party_id) references sns_wholesale.parties(org_id,id),
  foreign key(org_id,account_id) references sns_wholesale.accounts(org_id,id),
  check ((bucket='cash')=(account_id is not null)),
  check ((bucket in ('ar','ap'))=(party_id is not null)),
  check (egp <> 0 or original <> 0)
);
create table if not exists sns_wholesale.device_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  device_id uuid not null,
  document_id uuid not null,
  business_date date not null,
  from_status text,
  to_status text not null,
  from_warehouse uuid,
  to_warehouse uuid not null,
  last_sale_id uuid,
  reserved_for uuid,
  reserved_until timestamptz,
  cost_egp numeric(14,2) not null,
  reason text,
  foreign key(org_id,device_id) references sns_wholesale.devices(org_id,id),
  foreign key(org_id,document_id) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,from_warehouse) references sns_wholesale.warehouses(org_id,id),
  foreign key(org_id,to_warehouse) references sns_wholesale.warehouses(org_id,id),
  foreign key(org_id,last_sale_id) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,reserved_for) references sns_wholesale.parties(org_id,id)
);
create table if not exists sns_wholesale.accessory_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  sku_id uuid not null,
  warehouse_id uuid not null,
  document_id uuid not null,
  qty_delta int not null,
  cost_delta numeric(14,2) not null,
  foreign key(org_id,sku_id) references sns_wholesale.skus(org_id,id),
  foreign key(org_id,warehouse_id) references sns_wholesale.warehouses(org_id,id),
  foreign key(org_id,document_id) references sns_wholesale.documents(org_id,id)
);
create table if not exists sns_wholesale.payments (
  org_id uuid not null,
  document_id uuid not null,
  method text not null check(method in ('cash','transfer','instapay','vodafone','check','trade_in')),
  account_id uuid,
  reference text,
  primary key(org_id,document_id),
  foreign key(org_id,document_id) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,account_id) references sns_wholesale.accounts(org_id,id),
  check ((method not in ('check','trade_in')) = (account_id is not null))
);
create table if not exists sns_wholesale.checks (
  org_id uuid not null,
  payment_id uuid not null,
  direction text not null check(direction in ('in','out')),
  number text not null check (length(trim(number)) between 1 and 120),
  due date not null,
  bank text,
  status text not null default 'pending' check(status in ('pending','cleared','bounced','voided')),
  resolution_id uuid,
  primary key(org_id,payment_id),
  foreign key(org_id,payment_id) references sns_wholesale.payments(org_id,document_id),
  foreign key(org_id,resolution_id) references sns_wholesale.documents(org_id,id)
);
create table if not exists sns_wholesale.service_tickets (
  org_id uuid not null,
  id uuid not null default gen_random_uuid(),
  device_id uuid not null,
  return_id uuid,
  status text not null check(status in ('received','agent','returned','cancelled')),
  note text not null,
  actor uuid not null,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(org_id,id),
  foreign key(org_id,device_id) references sns_wholesale.devices(org_id,id),
  foreign key(org_id,return_id) references sns_wholesale.documents(org_id,id)
);
create unique index if not exists sns_wholesale_service_active
  on sns_wholesale.service_tickets(org_id,device_id) where status in ('received','agent');
create table if not exists sns_wholesale.service_events (
  org_id uuid not null,
  document_id uuid not null,
  ticket_id uuid not null,
  from_status text,
  to_status text not null,
  from_note text,
  to_note text not null,
  primary key(org_id,document_id,ticket_id),
  foreign key(org_id,document_id) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,ticket_id) references sns_wholesale.service_tickets(org_id,id)
);

create table if not exists sns_wholesale.stocktakes (
  org_id uuid not null,
  id uuid not null default gen_random_uuid(),
  warehouse_id uuid not null,
  scanned text[] not null,
  missing text[] not null,
  unexpected text[] not null,
  actor uuid not null,
  observed_at timestamptz not null default now(),
  primary key(org_id,id),
  foreign key(org_id,warehouse_id) references sns_wholesale.warehouses(org_id,id)
);
create table if not exists sns_wholesale.day_closes (
  org_id uuid not null,
  account_id uuid not null,
  business_date date not null,
  opening numeric(14,2) not null,
  book numeric(14,2) not null,
  actual numeric(14,2) not null,
  note text,
  actor uuid not null,
  closed_at timestamptz not null default now(),
  primary key(org_id,account_id,business_date),
  foreign key(org_id,account_id) references sns_wholesale.accounts(org_id,id)
);
create table if not exists sns_wholesale.audit (
  id bigint generated always as identity primary key,
  org_id uuid not null references sns_wholesale.shops(org_id),
  actor uuid not null,
  action text not null,
  subject uuid,
  details jsonb not null default '{}',
  happened_at timestamptz not null default now()
);
create table if not exists sns_wholesale.requests (
  org_id uuid not null references sns_wholesale.shops(org_id),
  id uuid not null,
  actor uuid not null,
  operation text not null,
  request_hash bytea not null,
  response jsonb not null,
  posted_at timestamptz not null default now(),
  primary key(org_id,id)
);

create index if not exists sns_wholesale_doc_period on sns_wholesale.documents(org_id,business_date desc,id);
create index if not exists sns_wholesale_doc_kind_date on sns_wholesale.documents(org_id,kind,business_date desc,id);
create index if not exists sns_wholesale_doc_party on sns_wholesale.documents(org_id,party_id,business_date desc,id);
create index if not exists sns_wholesale_doc_dependencies on sns_wholesale.documents(org_id,source_id) where source_id is not null;
create index if not exists sns_wholesale_line_returns on sns_wholesale.doc_lines(org_id,source_line_id) where source_line_id is not null;
create index if not exists sns_wholesale_line_device on sns_wholesale.doc_lines(org_id,device_id) where device_id is not null;
create index if not exists sns_wholesale_device_inventory on sns_wholesale.devices(org_id,warehouse_id,status,sku_id,id);
create index if not exists sns_wholesale_device_catalog on sns_wholesale.devices(org_id,sku_id,id);
create index if not exists sns_wholesale_device_warranty on sns_wholesale.devices(org_id,warranty_until) where warranty_until is not null;
create index if not exists sns_wholesale_device_supplier on sns_wholesale.devices(org_id,supplier_id) where supplier_id is not null;
create index if not exists sns_wholesale_party_name on sns_wholesale.parties(org_id,kind,lower(name) text_pattern_ops);
create index if not exists sns_wholesale_catalog_name on sns_wholesale.skus(org_id,lower(model) text_pattern_ops);
create index if not exists sns_wholesale_journal_document on sns_wholesale.journal(org_id,document_id,id);
create index if not exists sns_wholesale_journal_party on sns_wholesale.journal(org_id,party_id,document_id) where party_id is not null;
create index if not exists sns_wholesale_journal_account on sns_wholesale.journal(org_id,account_id,document_id) where account_id is not null;
create index if not exists sns_wholesale_journal_bucket on sns_wholesale.journal(org_id,bucket,document_id);
create index if not exists sns_wholesale_device_timeline on sns_wholesale.device_events(org_id,device_id,business_date desc,id desc);
create index if not exists sns_wholesale_device_event_doc on sns_wholesale.device_events(org_id,document_id,id);
create index if not exists sns_wholesale_accessory_event_doc on sns_wholesale.accessory_events(org_id,document_id,id);
create index if not exists sns_wholesale_checks_due on sns_wholesale.checks(org_id,status,due,payment_id);
create index if not exists sns_wholesale_audit_org on sns_wholesale.audit(org_id,id desc);

create or replace function sns_wholesale.cairo_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Cairo')::date;
$$;

create or replace function sns_wholesale.actor_role(p_org uuid)
returns text language plpgsql stable set search_path = '' as $$
declare v_role text;
begin
  select case when o.owner_id = auth.uid() then 'owner'
    when m.role in ('accountant','stockkeeper','cashier') then m.role
    when m.role='manager' then 'cashier' end
  into v_role
  from public.orgs o left join public.org_members m on m.org_id=o.id and m.user_id=auth.uid()
  where o.id=p_org;
  if v_role is null then
    raise exception using errcode='42501', message='الحساب ده ما عندوش صلاحية على المنشأة.';
  end if;
  return v_role;
end;
$$;

create or replace function sns_wholesale.require_role(v_role text, allowed text[])
returns void language plpgsql immutable set search_path = '' as $$
begin
  if v_role is null or not(v_role=any(allowed)) then
    raise exception using errcode='42501', message='العملية دي تحتاج صلاحية مختلفة.';
  end if;
end;
$$;
create or replace function sns_wholesale.must_be_open(p_org uuid,p_day date)
returns void language plpgsql stable set search_path = '' as $$
begin
  if p_day is null or p_day > sns_wholesale.cairo_today() or p_day < date '1900-01-01' then
    raise exception 'تاريخ الحركة لازم يكون يوم صالح حتى تاريخ اليوم بتوقيت القاهرة.';
  end if;
  if exists(select 1 from sns_wholesale.periods
     where org_id=p_org and month=date_trunc('month',p_day::timestamp)::date and closed) then
    raise exception 'الشهر ده مقفول. المالك يقدر يعيد فتحه مع تسجيل السبب.';
  end if;
end;
$$;
create or replace function sns_wholesale.create_doc(
  p_org uuid,p_kind text,p_day date,p_party uuid default null,p_currency text default 'EGP',
  p_fx numeric default 1,p_warehouse uuid default null,p_source uuid default null,p_meta jsonb default '{}'
) returns uuid language plpgsql set search_path = '' as $$
declare v_year int:=extract(year from p_day); v_seq bigint; v_prefix text; v_doc uuid;
begin
  perform sns_wholesale.must_be_open(p_org,p_day);
  select invoice_prefix into strict v_prefix from sns_wholesale.shops where org_id=p_org;
  insert into sns_wholesale.counters(org_id,year,last_no) values(p_org,v_year,1)
    on conflict(org_id,year) do update set last_no=sns_wholesale.counters.last_no+1
    returning last_no into v_seq;
  insert into sns_wholesale.documents(org_id,number,kind,business_date,actor,party_id,
    currency,fx,warehouse_id,source_id,note,reference,due_date,rep_id,quote_id)
  values(p_org,concat(v_prefix,'-',v_year,'-',v_seq),p_kind,p_day,auth.uid(),p_party,
    p_currency,p_fx,p_warehouse,p_source,nullif(trim(p_meta->>'note'),''),
    nullif(trim(p_meta->>'reference'),''),(p_meta->>'due_date')::date,
    case when p_kind='sale' then (p_meta->>'rep_id')::uuid end,
    case when p_kind='sale' then (p_meta->>'quote_id')::uuid end)
  returning id into v_doc;
  return v_doc;
end;
$$;
create or replace function sns_wholesale.record_amount(
  p_org uuid,p_doc uuid,p_bucket text,p_egp numeric,
  p_party uuid default null,p_account uuid default null,p_original numeric default null,
  p_currency text default 'EGP',p_rate numeric default 1
) returns void language plpgsql set search_path = '' as $$
declare v_day date;
begin
  if p_egp is null then raise exception 'قيمة الحركة مطلوبة.'; end if;
  if p_egp = 0 and coalesce(p_original,0) = 0 then return; end if;
  if p_account is not null then
    select business_date into strict v_day from sns_wholesale.documents where org_id=p_org and id=p_doc;
    if exists(select 1 from sns_wholesale.day_closes where org_id=p_org and account_id=p_account and business_date>=v_day) then
      raise exception 'الحساب ده اتقفل يومياً. سجّل الحركة في يوم بعد الإقفال.';
    end if;
  end if;
  insert into sns_wholesale.journal(org_id,document_id,bucket,egp,original,currency,rate,party_id,account_id)
  values(p_org,p_doc,p_bucket,p_egp,coalesce(p_original,p_egp),p_currency,p_rate,p_party,p_account);
end;
$$;
create or replace function sns_wholesale.check_book()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select coalesce(sum(egp),0) from sns_wholesale.journal
      where org_id=new.org_id and document_id=new.id) <> 0 then
    raise exception 'القيد المالي غير متزن.';
  end if;
  return null;
end;
$$;
drop trigger if exists journal_balanced on sns_wholesale.documents;
create constraint trigger journal_balanced after insert on sns_wholesale.documents
  deferrable initially deferred for each row execute function sns_wholesale.check_book();

create or replace function sns_wholesale.reject_history_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'الحركة مسجلة في السجل. الإلغاء بقيد عكسي وسبب.';
end;
$$;
do $$
declare name text;
begin
  foreach name in array array['journal','doc_lines','device_events','accessory_events','audit','requests','price_history','service_events'] loop
    execute format('drop trigger if exists preserve_history on sns_wholesale.%I',name);
    execute format('create trigger preserve_history before update or delete on sns_wholesale.%I for each row execute function sns_wholesale.reject_history_change()',name);
  end loop;
  foreach name in array array['documents','devices','payments','checks','imei_registry','day_closes','service_tickets'] loop
    execute format('drop trigger if exists preserve_history on sns_wholesale.%I',name);
    execute format('create trigger preserve_history before delete on sns_wholesale.%I for each row execute function sns_wholesale.reject_history_change()',name);
  end loop;
end;
$$;
create or replace function sns_wholesale.log_action(p_org uuid,p_action text,p_subject uuid,p_details jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into sns_wholesale.audit(org_id,actor,action,subject,details)
  values(p_org,auth.uid(),p_action,p_subject,p_details);
$$;

create or replace function sns_wholesale.warehouse(p_org uuid,p_id uuid)
returns uuid language plpgsql stable set search_path = '' as $$
declare result uuid;
begin
  select id into result from sns_wholesale.warehouses
  where org_id=p_org and active and (p_id is null or id=p_id) order by id limit 1;
  if result is null then raise exception 'اختار مخزن شغال من نفس المنشأة.'; end if;
  if p_id is null and (select count(*) from sns_wholesale.warehouses where org_id=p_org and active)>1 then
    raise exception 'فيه أكتر من مخزن. حدد المخزن المطلوب.';
  end if;
  return result;
end;
$$;
create or replace function sns_wholesale.account(p_org uuid,p_id uuid,p_method text default null)
returns uuid language plpgsql stable set search_path = '' as $$
declare result uuid;
begin
  select id into result from sns_wholesale.accounts where org_id=p_org and id=p_id and active
    and (p_method is null or (p_method='transfer' and kind in ('bank','transfer')) or kind=p_method);
  if result is null then raise exception 'اختار خزينة أو حساب شغال ومناسب لطريقة الدفع.'; end if;
  return result;
end;
$$;
create or replace function sns_wholesale.party(p_org uuid,p_id uuid,p_kind text default null)
returns sns_wholesale.parties language plpgsql stable set search_path = '' as $$
declare result sns_wholesale.parties;
begin
  select * into result from sns_wholesale.parties
  where org_id=p_org and id=p_id and active and (p_kind is null or kind=p_kind);
  if not found then raise exception 'اختار عميل أو مورد شغال من نفس المنشأة.'; end if;
  return result;
end;
$$;
create or replace function sns_wholesale.sku(p_org uuid,p_id uuid)
returns sns_wholesale.skus language plpgsql stable set search_path = '' as $$
declare result sns_wholesale.skus;
begin
  select * into result from sns_wholesale.skus where org_id=p_org and id=p_id and active;
  if not found then raise exception 'الصنف غير موجود أو متوقف.'; end if;
  return result;
end;
$$;
create or replace function sns_wholesale.stock_transition(
  p_org uuid,p_doc uuid,p_device uuid,p_target text,p_warehouse uuid default null,p_sale uuid default null,
  p_hold_for uuid default null,p_hold_until timestamptz default null,p_cost numeric default null
) returns sns_wholesale.devices language plpgsql set search_path = '' as $$
declare old sns_wholesale.devices; changed sns_wholesale.devices; doc sns_wholesale.documents; v_allowed boolean;
begin
  select * into strict doc from sns_wholesale.documents where org_id=p_org and id=p_doc;
  select * into old from sns_wholesale.devices where org_id=p_org and id=p_device for update;
  if not found then raise exception 'الجهاز مش موجود في المنشأة دي.'; end if;
  if exists(select 1 from sns_wholesale.device_events where org_id=p_org and device_id=p_device and business_date>doc.business_date) then
    raise exception 'تاريخ الحركة أقدم من آخر حركة على الجهاز.';
  end if;
  v_allowed := case
    when doc.kind='reversal' then true
    when doc.kind='sale' then p_target='sold' and (old.status='available' or
      (old.status='reserved' and (old.reserved_for=doc.party_id or old.reserved_until<=now())))
    when doc.kind='customer_return' then old.status='sold' and old.last_sale_id=doc.source_id
      and p_target in ('available','maintenance','damaged')
    when doc.kind='supplier_return' then old.status in ('available','maintenance') and p_target='supplier_return'
    when doc.kind='warehouse_move' then old.status in ('available','reserved','maintenance') and p_target=old.status
    when doc.kind='reserve' then p_target='reserved' and (old.status='available' or (old.status='reserved' and old.reserved_until<=now()))
    when doc.kind='release' then old.status='reserved' and p_target='available'
    when doc.kind='maintenance' then (old.status,p_target) in (('available','maintenance'),('maintenance','available'))
    when doc.kind='cost_adjustment' then p_target=old.status and old.status in ('available','reserved','maintenance','sold')
    else false end;
  if not v_allowed then
    if old.status='sold' then
      raise exception 'الجهاز اتباع في الفاتورة %.',(select number from sns_wholesale.documents where org_id=p_org and id=old.last_sale_id);
    end if;
    raise exception 'حالة الجهاز الحالية ما تسمحش بالحركة دي.';
  end if;
  update sns_wholesale.devices set status=p_target,warehouse_id=coalesce(p_warehouse,old.warehouse_id),
    last_sale_id=coalesce(p_sale,old.last_sale_id),cost_egp=coalesce(p_cost,old.cost_egp),
    reserved_for=case when p_target='reserved' then coalesce(p_hold_for,old.reserved_for) end,
    reserved_until=case when p_target='reserved' then coalesce(p_hold_until,old.reserved_until) end
  where org_id=p_org and id=p_device returning * into changed;
  insert into sns_wholesale.device_events(org_id,device_id,document_id,business_date,from_status,to_status,
    from_warehouse,to_warehouse,last_sale_id,reserved_for,reserved_until,cost_egp,reason)
  values(p_org,p_device,p_doc,doc.business_date,old.status,changed.status,old.warehouse_id,
    changed.warehouse_id,changed.last_sale_id,changed.reserved_for,changed.reserved_until,changed.cost_egp,doc.note);
  return changed;
end;
$$;

create or replace function sns_wholesale.add_device(
  p_org uuid,p_doc uuid,p_sku uuid,p_warehouse uuid,p_supplier uuid,p_cost numeric,p_item jsonb
) returns uuid language plpgsql set search_path = '' as $$
declare d uuid; v_day date; v_imei text:=trim(p_item->>'imei'); v_imei2 text:=nullif(trim(p_item->>'imei2'),'');
begin
  if sns_wholesale.imei_valid(v_imei) is distinct from true or
     (v_imei2 is not null and (sns_wholesale.imei_valid(v_imei2) is distinct from true or v_imei2=v_imei)) then
    raise exception 'اكتب IMEI صالح من ١٥ رقم. الرقم الإضافي لازم يكون مختلف.';
  end if;
  if p_item->>'region' is not null and not exists(select 1 from sns_wholesale.lookups
     where org_id=p_org and kind='region' and code=p_item->>'region' and active) then
    raise exception 'اختار نسخة جهاز مسجلة في الكتالوج.';
  end if;
  if (sns_wholesale.sku(p_org,p_sku)).kind <> 'device' then raise exception 'الصنف لا يقبل تسجيل IMEI.'; end if;
  select business_date into strict v_day from sns_wholesale.documents where org_id=p_org and id=p_doc;
  insert into sns_wholesale.devices(org_id,sku_id,warehouse_id,supplier_id,intake_id,imei,imei2,
    serial_number,status,condition,grade,battery,region,sim,package,activation_lock,mdm,
    warranty_kind,warranty_until,warranty_days,cost_egp,acquired_on,notes)
  values(p_org,p_sku,p_warehouse,p_supplier,p_doc,v_imei,v_imei2,p_item->>'serial_number',
    'available',coalesce(p_item->>'condition','sealed'),p_item->>'grade',(p_item->>'battery')::int,
    p_item->>'region',p_item->>'sim',coalesce(p_item->>'package','complete'),
    coalesce(p_item->>'activation_lock','unknown'),coalesce(p_item->>'mdm','unknown'),
    coalesce(p_item->>'warranty_kind','none'),(p_item->>'warranty_until')::date,
    (p_item->>'warranty_days')::int,p_cost,v_day,p_item->>'notes')
  returning id into d;
  begin
    insert into sns_wholesale.imei_registry(imei,org_id,device_id,slot) values(v_imei,p_org,d,1);
    if v_imei2 is not null then
      insert into sns_wholesale.imei_registry(imei,org_id,device_id,slot) values(v_imei2,p_org,d,2);
    end if;
  exception when unique_violation then raise exception 'رقم IMEI مسجل بالفعل.';
  end;
  insert into sns_wholesale.device_events(org_id,device_id,document_id,business_date,to_status,to_warehouse,cost_egp)
  values(p_org,d,p_doc,v_day,'available',p_warehouse,p_cost);
  return d;
end;
$$;

create or replace function sns_wholesale.move_accessory(
  p_org uuid,p_doc uuid,p_sku uuid,p_warehouse uuid,p_delta int,p_added_cost numeric default null
) returns numeric language plpgsql set search_path = '' as $$
declare s sns_wholesale.accessory_stock; v_cost numeric;
begin
  if p_delta is null or p_delta=0 then raise exception 'الكمية لازم تكون عدد صحيح غير صفر.'; end if;
  if exists(select 1 from sns_wholesale.accessory_events e join sns_wholesale.documents d
      on d.org_id=e.org_id and d.id=e.document_id
      where e.org_id=p_org and e.sku_id=p_sku and e.warehouse_id=p_warehouse
        and d.business_date>(select business_date from sns_wholesale.documents where org_id=p_org and id=p_doc)) then
    raise exception 'تاريخ الحركة أقدم من آخر حركة على الصنف في المخزن.';
  end if;
  insert into sns_wholesale.accessory_stock values(p_org,p_warehouse,p_sku,0,0) on conflict do nothing;
  select * into strict s from sns_wholesale.accessory_stock
    where org_id=p_org and warehouse_id=p_warehouse and sku_id=p_sku for update;
  if s.qty+p_delta<0 then raise exception 'كمية الإكسسوارات المتاحة أقل من المطلوبة.'; end if;
  if p_delta<0 then
    v_cost:=coalesce(p_added_cost,case when s.qty=-p_delta then s.book_egp else round(s.book_egp*(-p_delta)::numeric/s.qty,2) end);
    if v_cost>s.book_egp or (s.qty+p_delta=0 and v_cost<>s.book_egp) then
      raise exception 'تكلفة الحركة الأصلية تختلف عن تكلفة المخزون الحالية.';
    end if;
  else
    v_cost:=p_added_cost;
  end if;
  if v_cost is null or v_cost<0 then raise exception 'تكلفة الإضافة للمخزون مطلوبة.'; end if;
  update sns_wholesale.accessory_stock set qty=qty+p_delta,book_egp=book_egp+sign(p_delta)*v_cost
    where org_id=p_org and warehouse_id=p_warehouse and sku_id=p_sku;
  insert into sns_wholesale.accessory_events(org_id,sku_id,warehouse_id,document_id,qty_delta,cost_delta)
    values(p_org,p_sku,p_warehouse,p_doc,p_delta,sign(p_delta)*v_cost);
  return v_cost;
end;
$$;

create or replace view sns_wholesale.party_balances as
  select p.org_id,p.id,p.kind,p.currency,
    coalesce(sum(case when p.kind='customer' then j.original else -j.original end),0) as balance,
    coalesce(sum(case when p.kind='customer' then j.egp else -j.egp end),0) as balance_egp
  from sns_wholesale.parties p left join sns_wholesale.journal j
    on j.org_id=p.org_id and j.party_id=p.id
  group by p.org_id,p.id,p.kind,p.currency;
create or replace view sns_wholesale.cash_balances as
  select a.org_id,a.id,a.name,a.kind,coalesce(sum(j.egp),0) balance
  from sns_wholesale.accounts a left join sns_wholesale.journal j on j.org_id=a.org_id and j.account_id=a.id
  group by a.org_id,a.id,a.name,a.kind;
create or replace view sns_wholesale.device_inventory as
  select d.org_id,d.id,d.sku_id,d.warehouse_id,d.imei,d.imei2,d.status,
    case when d.status='reserved' and d.reserved_until<=now() then 'available' else d.status end effective_status,
    d.cost_egp,d.acquired_on,greatest(0,sns_wholesale.cairo_today()-d.acquired_on) days_held,
    case when d.warranty_kind='dealer' then s.business_date+d.warranty_days else d.warranty_until end warranty_ends
  from sns_wholesale.devices d left join sns_wholesale.documents s on s.org_id=d.org_id and s.id=d.last_sale_id;

-- Physical cash and bank accounts are kept in EGP. The document and the subledger retain USD.
create or replace function sns_wholesale.foreign_book(
  p_org uuid,p_party uuid,p_direction int,p_amount numeric,p_rate numeric
) returns numeric language plpgsql stable set search_path = '' as $$
declare exposure sns_wholesale.party_balances; portion numeric;
begin
  select * into strict exposure from sns_wholesale.party_balances where org_id=p_org and id=p_party;
  if exposure.currency='EGP' then return p_amount; end if;
  if exposure.balance*p_direction>=0 then return round(p_amount*p_rate,2); end if;
  portion:=least(p_amount,abs(exposure.balance));
  return round(abs(exposure.balance_egp)*portion/abs(exposure.balance)+(p_amount-portion)*p_rate,2);
end;
$$;
create or replace function sns_wholesale.normalize_foreign_balance(p_org uuid,p_doc uuid,p_party uuid)
returns void language plpgsql set search_path = '' as $$
declare exposure sns_wholesale.party_balances; difference numeric; document_rate numeric;
begin
  if p_party is null then return; end if;
  select * into exposure from sns_wholesale.party_balances where org_id=p_org and id=p_party;
  if exposure.currency is distinct from 'USD' then return; end if;
  select fx into document_rate from sns_wholesale.documents where org_id=p_org and id=p_doc;
  if exposure.balance=0 or exposure.balance*exposure.balance_egp<0 then
    difference:=exposure.balance_egp-round(exposure.balance*document_rate,2);
    perform sns_wholesale.record_amount(p_org,p_doc,'ap',difference,p_party,null,0,'USD',document_rate);
    perform sns_wholesale.record_amount(p_org,p_doc,'fx',-difference);
  end if;
end;
$$;

create or replace function sns_wholesale.settle(
  p_org uuid,p_day date,p_party uuid,p_direction int,p_payment jsonb,p_source uuid default null
) returns uuid language plpgsql set search_path = '' as $$
declare party sns_wholesale.parties; source sns_wholesale.documents; trade jsonb;
  method text:=p_payment->>'method'; amount numeric(14,2):=(p_payment->>'amount')::numeric;
  fx numeric(18,6); egp numeric(14,2); book numeric(14,2);
  account uuid; doc uuid; sku uuid; warehouse uuid;
  v_number text; v_due date; v_fee numeric(14,2);
begin
  if p_direction not in (-1,1) or method is null or method not in ('cash','transfer','instapay','vodafone','check','trade_in')
     or amount is null or amount<=0 then
    raise exception 'حدد طريقة الدفع والمبلغ بقيمة أكبر من صفر.';
  end if;
  party:=sns_wholesale.party(p_org,p_party);
  if p_source is not null then
    select * into strict source from sns_wholesale.documents where org_id=p_org and id=p_source;
  end if;
  if method='trade_in' and (p_direction<>1 or source.kind is distinct from 'sale') then
    raise exception 'الجهاز المستبدل بيتسجل مع فاتورة بيع.';
  end if;
  fx:=case when party.currency='EGP' then 1 else coalesce((p_payment->>'fx')::numeric,source.fx,
    (select default_fx from sns_wholesale.shops where org_id=p_org)) end;
  if fx<=0 then raise exception 'سعر الصرف لازم يكون أكبر من صفر.'; end if;
  egp:=round(amount*fx,2);
  if egp<=0 then raise exception 'المبلغ بعد التحويل للجنيه أقل من قرش.'; end if;
  book:=sns_wholesale.foreign_book(p_org,p_party,p_direction,amount,fx);
  if method='check' then
    v_number:=trim(p_payment->>'reference');
    v_due:=(p_payment->>'due_date')::date;
    if nullif(v_number,'') is null or v_due is null or v_due<p_day then
      raise exception 'اكتب رقم الشيك وتاريخ استحقاق من تاريخ الحركة أو بعده.';
    end if;
  elsif method<>'trade_in' then
    account:=sns_wholesale.account(p_org,(p_payment->>'account_id')::uuid,method);
  end if;
  doc:=sns_wholesale.create_doc(p_org,case when p_direction=1 then 'receipt' else 'payment' end,p_day,
    p_party,party.currency,fx,null,p_source,p_payment);
  update sns_wholesale.documents set gross=amount,total=amount where org_id=p_org and id=doc;
  insert into sns_wholesale.payments(org_id,document_id,method,account_id,reference)
    values(p_org,doc,method,account,nullif(trim(p_payment->>'reference'),''));
  perform sns_wholesale.record_amount(p_org,doc,case when party.kind='supplier' then 'ap' else 'ar' end,
    -p_direction*book,p_party,null,-p_direction*amount,party.currency,fx);
  if method='check' then
    insert into sns_wholesale.checks(org_id,payment_id,direction,number,due,bank)
      values(p_org,doc,case when p_direction=1 then 'in' else 'out' end,v_number,v_due,p_payment->>'bank');
    perform sns_wholesale.record_amount(p_org,doc,case when p_direction=1 then 'notes_receivable' else 'notes_payable' end,p_direction*egp);
  elsif method='trade_in' then
    trade:=p_payment->'device';
    sku:=(trade->>'sku_id')::uuid;
    warehouse:=sns_wholesale.warehouse(p_org,coalesce((trade->>'warehouse_id')::uuid,source.warehouse_id));
    perform sns_wholesale.add_device(p_org,doc,sku,warehouse,null,amount,trade);
    perform sns_wholesale.record_amount(p_org,doc,'inventory',amount);
  else
    perform sns_wholesale.record_amount(p_org,doc,'cash',p_direction*egp,null,account);
  end if;
  v_fee:=p_direction*(book-egp);
  perform sns_wholesale.record_amount(p_org,doc,'fx',v_fee);
  return doc;
end;
$$;

create or replace function sns_wholesale.invoice(
  p_org uuid,p_kind text,p_payload jsonb,p_role text,p_day date
) returns jsonb language plpgsql set search_path = '' as $$
declare shop sns_wholesale.shops; party sns_wholesale.parties; sku sns_wholesale.skus;
  device sns_wholesale.devices; rep sns_wholesale.reps; quote sns_wholesale.quotes;
  item jsonb; payment jsonb; prepared jsonb:='[]'; payments jsonb:='[]'; incoming boolean := p_kind='purchase';
  v_doc uuid; v_dev uuid; v_wh uuid; v_sku uuid; v_pay uuid; v_rep uuid; v_quote uuid; v_qty int;
  v_n int:=0; v_units bigint:=0; v_processed bigint:=0; v_devices int:=0;
  v_purchase_egp numeric(14,2); v_ap_book numeric(14,2);
  v_price numeric(14,2); v_gross numeric(14,2):=0; v_running numeric(14,2):=0;
  v_discount numeric(14,2):=coalesce((p_payload->>'discount')::numeric,0);
  v_fees numeric(14,2):=coalesce((p_payload->>'fees')::numeric,0);
  v_vat numeric(7,4); v_fx numeric(18,6); v_previous_disc numeric(14,2):=0; v_disc numeric(14,2);
  v_last_fee numeric(14,2):=0; v_fee numeric(14,2); v_gross_line numeric(14,2);
  v_base numeric(14,2); v_line_tax numeric(14,2);
  v_net numeric(14,2):=0; v_tax numeric(14,2):=0; v_cost numeric(14,2); v_cost_total numeric(14,2):=0;
  v_comm numeric(14,2); v_comm_total numeric(14,2):=0; v_total numeric(14,2);
  v_paid numeric(14,2):=0; v_below_cost int:=0; v_balance numeric; v_warnings jsonb:='[]'; v_result jsonb;
begin
  select * into strict shop from sns_wholesale.shops where org_id=p_org;
  party:=sns_wholesale.party(p_org,(p_payload->>'party_id')::uuid,case when incoming then 'supplier' else 'customer' end);
  v_wh:=sns_wholesale.warehouse(p_org,(p_payload->>'warehouse_id')::uuid);
  v_fx:=case when party.currency='EGP' then 1 else coalesce((p_payload->>'fx')::numeric,shop.default_fx) end;
  v_vat:=coalesce((p_payload->>'vat_rate')::numeric,shop.vat_rate);
  if p_role='cashier' and v_vat<>shop.vat_rate then raise exception 'الضريبة بتتحدد من إعدادات المنشأة.'; end if;
  if v_discount<0 or v_fees<0 or (not incoming and v_fees<>0) or v_vat not between 0 and 100 or v_fx<=0 then
    raise exception 'راجع الخصم ومصاريف الشراء والضريبة وسعر الصرف.';
  end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 1000 then
    raise exception 'الفاتورة لازم تحتوي على ١ إلى ١٠٠٠ بند.';
  end if;
  if p_payload->'payments' is not null and
     (jsonb_typeof(p_payload->'payments')<>'array' or jsonb_array_length(p_payload->'payments')>30) then
    raise exception 'اكتب طرق الدفع في قائمة بحد أقصى ٣٠ دفعة.';
  end if;
  v_rep:=(p_payload->>'rep_id')::uuid;
  v_quote:=(p_payload->>'quote_id')::uuid;
  if incoming and (v_rep is not null or v_quote is not null) then raise exception 'المندوب وعرض السعر لفاتورة البيع.'; end if;
  if v_rep is not null then
    select * into rep from sns_wholesale.reps where org_id=p_org and id=v_rep and active;
    if not found then raise exception 'المندوب ده مش شغال في المنشأة.'; end if;
  end if;
  if v_quote is not null then
    select * into quote from sns_wholesale.quotes where org_id=p_org and id=v_quote and party_id=party.id and valid_until>=p_day
      and (created_at at time zone 'Africa/Cairo')::date<=p_day;
    if not found or exists(select 1 from sns_wholesale.documents where org_id=p_org and quote_id=v_quote and voided_by is null) then
      raise exception 'عرض السعر منتهي أو مستخدم أو يخص عميل مختلف.';
    end if;
    v_discount:=coalesce((p_payload->>'discount')::numeric,quote.discount);
  end if;
  for item in select value from jsonb_array_elements(p_payload->'items') loop
    if jsonb_typeof(item)<>'object' then raise exception 'بيانات أحد بنود الفاتورة غير صالحة.'; end if;
    v_dev:=null;
    if not incoming and (item ? 'device_id' or item ? 'imei') then
      select d.* into device from sns_wholesale.devices d where d.org_id=p_org and d.id=coalesce(
        (item->>'device_id')::uuid,(select i.device_id from sns_wholesale.imei_registry i where i.org_id=p_org and i.imei=trim(item->>'imei')))
      for update;
      if not found then raise exception 'الجهاز المطلوب مش موجود في المنشأة.'; end if;
      if device.warehouse_id<>v_wh then raise exception 'الجهاز موجود في مخزن مختلف.'; end if;
      if device.status='sold' then
        raise exception 'الجهاز اتباع في الفاتورة %.',(select number from sns_wholesale.documents where org_id=p_org and id=device.last_sale_id);
      end if;
      v_dev:=device.id;
      v_sku:=device.sku_id;
    else
      v_sku:=(item->>'sku_id')::uuid;
    end if;
    sku:=sns_wholesale.sku(p_org,v_sku);
    v_qty:=coalesce((item->>'qty')::int,1);
    if sku.kind='device' and (v_qty<>1 or (not incoming and v_dev is null)) then
      raise exception 'سجّل كل جهاز في بند مستقل برقم IMEI.';
    end if;
    if v_qty<1 or v_qty>1000000 then raise exception 'الكمية خارج المدى المسموح.'; end if;
    v_price:=(item->>'unit_price')::numeric;
    if not incoming and v_price is null and v_quote is not null then
      select (q.value->>'unit_price')::numeric into v_price from jsonb_array_elements(quote.lines) q
        where (q.value->>'sku_id')::uuid=v_sku limit 1;
    end if;
    if not incoming and v_price is null then
      select amount into v_price from sns_wholesale.prices where org_id=p_org and sku_id=v_sku and tier=party.tier;
    end if;
    if v_price is null or v_price<0 then raise exception 'حدّد سعر كل بند أو سجّله في قائمة أسعار العميل.'; end if;
    v_gross:=v_gross+v_price*v_qty;
    v_units:=v_units+v_qty;
    if sku.kind='device' then v_devices:=v_devices+1; end if;
    prepared:=prepared||jsonb_build_array(item||jsonb_build_object(
      'sku_id',v_sku,'device_id',v_dev,'qty',v_qty,'unit_price',v_price,'sku_kind',sku.kind));
  end loop;
  if v_gross<=0 or v_discount<0 or v_discount>=v_gross then raise exception 'الخصم لازم يكون أقل من إجمالي قيمة الفاتورة.'; end if;
  if v_quote is not null and exists(
    (select (x.value->>'sku_id')::uuid sku_id,sum((x.value->>'qty')::int)::bigint qty from jsonb_array_elements(prepared) x group by 1
      except select (x.value->>'sku_id')::uuid,(x.value->>'qty')::bigint from jsonb_array_elements(quote.lines) x)
    union all
    (select (x.value->>'sku_id')::uuid,(x.value->>'qty')::bigint from jsonb_array_elements(quote.lines) x
      except select (x.value->>'sku_id')::uuid,sum((x.value->>'qty')::int)::bigint from jsonb_array_elements(prepared) x group by 1)
  ) then raise exception 'طابق أصناف وكميات عرض السعر قبل تحويله لفاتورة.'; end if;
  if v_devices>0 then v_units:=v_devices; end if;
  v_doc:=sns_wholesale.create_doc(p_org,p_kind,p_day,party.id,party.currency,v_fx,v_wh,null,p_payload);
  for item in select value from jsonb_array_elements(prepared) loop
    v_n:=v_n+1;
    v_sku:=(item->>'sku_id')::uuid;
    v_dev:=(item->>'device_id')::uuid;
    v_qty:=(item->>'qty')::int;
    v_price:=(item->>'unit_price')::numeric;
    v_gross_line:=v_price*v_qty;
    v_running:=v_running+v_gross_line;
    if v_devices=0 or item->>'sku_kind'='device' then v_processed:=v_processed+v_qty; end if;
    v_disc:=round(v_discount*v_running/v_gross,2)-v_previous_disc;
    v_fee:=round(v_fees*v_processed/v_units,2)-v_last_fee;
    v_previous_disc:=v_previous_disc+v_disc;
    v_last_fee:=v_last_fee+v_fee;
    v_base:=v_gross_line-v_disc;
    v_net:=v_net+v_base;
    v_line_tax:=round((v_net+v_last_fee)*v_vat/100,2)-v_tax;
    v_tax:=v_tax+v_line_tax;
    v_comm:=0;
    if incoming then
      v_cost:=round((v_net+v_last_fee)*v_fx,2)-v_cost_total;
      if item->>'sku_kind'='device' then
        v_dev:=sns_wholesale.add_device(p_org,v_doc,v_sku,v_wh,party.id,v_cost,item);
      else
        perform sns_wholesale.move_accessory(p_org,v_doc,v_sku,v_wh,v_qty,v_cost);
      end if;
    else
      if v_dev is not null then
        device:=sns_wholesale.stock_transition(p_org,v_doc,v_dev,'sold',null,v_doc);
        v_cost:=device.cost_egp;
      else
        v_cost:=sns_wholesale.move_accessory(p_org,v_doc,v_sku,v_wh,-v_qty);
      end if;
      if v_base<v_cost then v_below_cost:=v_below_cost+1; end if;
      v_comm:=case when rep.commission_kind='percent' then round(v_base*rep.commission_rate/100,2)
        when rep.commission_kind='per_device' and v_dev is not null then rep.commission_rate else 0 end;
    end if;
    v_cost_total:=v_cost_total+v_cost;
    v_comm_total:=v_comm_total+v_comm;
    insert into sns_wholesale.doc_lines(org_id,document_id,position,sku_id,device_id,warehouse_id,qty,
      unit_price,unit_net,line_net,tax,landed,cost_egp,commission_egp)
    values(p_org,v_doc,v_n,v_sku,v_dev,v_wh,v_qty,v_price,round(v_base/v_qty,2),v_base,v_line_tax,v_fee,v_cost,v_comm);
  end loop;
  v_total:=v_net+v_fees+v_tax;
  update sns_wholesale.documents set gross=v_gross,discount=v_discount,fees=v_fees,tax=v_tax,total=v_total where org_id=p_org and id=v_doc;
  if incoming then
    v_purchase_egp:=round(v_total*v_fx,2);
    v_ap_book:=sns_wholesale.foreign_book(p_org,party.id,1,v_total,v_fx);
    perform sns_wholesale.record_amount(p_org,v_doc,'inventory',v_cost_total);
    perform sns_wholesale.record_amount(p_org,v_doc,'vat_in',v_purchase_egp-v_cost_total);
    perform sns_wholesale.record_amount(p_org,v_doc,'ap',-v_ap_book,party.id,null,-v_total,party.currency,v_fx);
    perform sns_wholesale.record_amount(p_org,v_doc,'fx',v_ap_book-v_purchase_egp);
  else
    perform sns_wholesale.record_amount(p_org,v_doc,'ar',v_total,party.id);
    perform sns_wholesale.record_amount(p_org,v_doc,'sales',-v_net);
    perform sns_wholesale.record_amount(p_org,v_doc,'vat_out',-v_tax);
    perform sns_wholesale.record_amount(p_org,v_doc,'inventory',-v_cost_total);
    perform sns_wholesale.record_amount(p_org,v_doc,'cogs',v_cost_total);
    perform sns_wholesale.record_amount(p_org,v_doc,'commission',v_comm_total);
    perform sns_wholesale.record_amount(p_org,v_doc,'commission_due',-v_comm_total);
  end if;
  for payment in select value from jsonb_array_elements(coalesce(p_payload->'payments','[]')) loop
    v_paid:=v_paid+(payment->>'amount')::numeric(14,2);
    if v_paid>v_total then raise exception 'الدفعات أكتر من قيمة الفاتورة. سجّل الزيادة كدفعة مستقلة.'; end if;
    if p_role='cashier' and payment->>'method'='trade_in'
      and coalesce((payment->'device'->>'activation_lock')='locked',false) then
      raise exception 'الجهاز المستبدل عليه قفل تفعيل. راجع المسؤول.';
    end if;
    v_pay:=sns_wholesale.settle(p_org,p_day,party.id,case when incoming then -1 else 1 end,payment,v_doc);
    payments:=payments||jsonb_build_array(v_pay);
  end loop;
  select balance into v_balance from sns_wholesale.party_balances where org_id=p_org and id=party.id;
  if party.credit_limit is not null and v_balance>party.credit_limit then
    v_warnings:=v_warnings||jsonb_build_array('الرصيد تخطّى الحد الائتماني.');
  end if;
  if party.blacklisted then v_warnings:=v_warnings||jsonb_build_array('الحساب عليه تنبيه من الإدارة.'); end if;
  if v_below_cost>0 and p_role in ('owner','accountant') then
    v_warnings:=v_warnings||jsonb_build_array(concat(v_below_cost,' بند سعره أقل من التكلفة.'));
  end if;
  select jsonb_build_object('id',id,'number',number,'total',total,'currency',currency,'fx',fx,
    'payments',payments,'warnings',v_warnings) into v_result from sns_wholesale.documents where org_id=p_org and id=v_doc;
  return v_result;
end;
$$;

create or replace function sns_wholesale.set_service_ticket(
  p_org uuid,p_doc uuid,p_device uuid,p_status text,p_note text,p_return uuid default null,p_ticket uuid default null
) returns uuid language plpgsql set search_path = '' as $$
declare previous sns_wholesale.service_tickets; result uuid;
begin
  if p_ticket is null then
    insert into sns_wholesale.service_tickets(org_id,device_id,return_id,status,note,actor)
      values(p_org,p_device,p_return,p_status,p_note,auth.uid()) returning id into result;
  else
    select * into strict previous from sns_wholesale.service_tickets where org_id=p_org and id=p_ticket and device_id=p_device;
    update sns_wholesale.service_tickets set status=p_status,note=p_note,updated_at=now()
      where org_id=p_org and id=p_ticket returning id into result;
  end if;
  insert into sns_wholesale.service_events values(p_org,p_doc,result,previous.status,p_status,previous.note,p_note);
  return result;
end;
$$;

create or replace function sns_wholesale.return_invoice(
  p_org uuid,p_kind text,p_payload jsonb,p_role text,p_day date
) returns jsonb language plpgsql set search_path = '' as $$
declare orig sns_wholesale.documents; device sns_wholesale.devices; ln sns_wholesale.doc_lines;
  d uuid; v_line uuid; v_wh uuid; v_dev uuid; v_qty int; v_done int; item jsonb; v_nested jsonb;
  v_state text; v_when numeric(14,2); v_override boolean:=coalesce((p_payload->>'override')::boolean,false);
  v_supplier boolean:=p_kind='supplier_return'; v_window int;
  v_pos int:=0; v_total_net numeric(14,2):=0; v_total_tax numeric(14,2):=0; v_total_fee numeric(14,2):=0;
  v_inventory numeric(14,2):=0; v_cost numeric(14,2); v_costs numeric(14,2):=0;
  v_commission numeric(14,2); v_comms numeric(14,2):=0; v_already_cost numeric;
  v_net numeric(14,2); v_tax numeric(14,2); v_fee numeric(14,2); v_credit numeric(14,2);
  v_refund uuid; v_combined jsonb:='[]'; v_supplier_doc uuid; v_ap_book numeric(14,2); v_contract_egp numeric(14,2);
  v_active_ticket uuid;
begin
  if nullif(trim(p_payload->>'note'),'') is null then raise exception 'اكتب سبب المرتجع.'; end if;
  select * into orig from sns_wholesale.documents where org_id=p_org and id=(p_payload->>'source_id')::uuid
    and kind=case when v_supplier then 'purchase' else 'sale' end and voided_by is null;
  if not found or (p_payload ? 'party_id' and orig.party_id is distinct from (p_payload->>'party_id')::uuid) then
    raise exception 'اختار فاتورة أصلية مفتوحة للعميل أو المورد الصحيح.';
  end if;
  if p_day<orig.business_date then raise exception 'تاريخ المرتجع لازم يكون من يوم الفاتورة أو بعده.'; end if;
  if v_override then perform sns_wholesale.require_role(p_role,array['owner']); end if;
  select return_days into v_window from sns_wholesale.shops where org_id=p_org;
  if not v_supplier and p_day-orig.business_date>v_window and not v_override then
    raise exception 'مدة الاسترجاع انتهت. المالك يقدر يسجل استثناء بسبب.';
  end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 1000 then
    raise exception 'اختار بند واحد على الأقل من الفاتورة.';
  end if;
  v_wh:=sns_wholesale.warehouse(p_org,coalesce((p_payload->>'warehouse_id')::uuid,orig.warehouse_id));
  d:=sns_wholesale.create_doc(p_org,p_kind,p_day,orig.party_id,orig.currency,orig.fx,v_wh,orig.id,p_payload-'quote_id'-'rep_id');
  for item in select value from jsonb_array_elements(p_payload->'items') loop
    v_pos:=v_pos+1;
    v_line:=(item->>'line_id')::uuid;
    v_dev:=coalesce((item->>'device_id')::uuid,
      (select device_id from sns_wholesale.imei_registry where org_id=p_org and imei=trim(item->>'imei')));
    select * into ln from sns_wholesale.doc_lines where org_id=p_org and document_id=orig.id
      and (id=v_line or (v_line is null and device_id=v_dev));
    if not found or (v_dev is not null and ln.device_id is distinct from v_dev) then
      raise exception 'البند ده مش موجود في الفاتورة الأصلية.';
    end if;
    v_qty:=coalesce((item->>'qty')::int,1);
    select coalesce(sum(l.qty),0),coalesce(sum(l.cost_egp),0) into v_done,v_already_cost from sns_wholesale.doc_lines l
      join sns_wholesale.documents rd on rd.org_id=l.org_id and rd.id=l.document_id
      where l.org_id=p_org and l.source_line_id=ln.id and rd.kind=p_kind and rd.voided_by is null;
    if v_qty<1 or v_qty+v_done>ln.qty then raise exception 'البند مرتجع بالفعل أو الكمية أكبر من الباقي.'; end if;
    v_net:=round(ln.line_net*(v_done+v_qty)::numeric/ln.qty,2)-round(ln.line_net*v_done::numeric/ln.qty,2);
    v_tax:=round(ln.tax*(v_done+v_qty)::numeric/ln.qty,2)-round(ln.tax*v_done::numeric/ln.qty,2);
    v_commission:=round(ln.commission_egp*(v_done+v_qty)::numeric/ln.qty,2)-round(ln.commission_egp*v_done::numeric/ln.qty,2);
    v_fee:=round(ln.landed*(v_done+v_qty)::numeric/ln.qty,2)-round(ln.landed*v_done::numeric/ln.qty,2);
    v_state:=case when v_supplier then 'supplier_return' when item->>'disposition'='supplier_return' then 'maintenance'
      else coalesce(item->>'disposition','available') end;
    if v_state not in ('available','maintenance','damaged','supplier_return') then raise exception 'حدد حالة مرتجع سليمة.'; end if;
    if ln.device_id is not null then
      select * into strict device from sns_wholesale.devices where org_id=p_org and id=ln.device_id for update;
      if v_supplier and (device.intake_id<>orig.id or device.warehouse_id<>v_wh) then
        raise exception 'الجهاز مش في المخزن المحدد أو مش من فاتورة المورد.';
      end if;
      perform sns_wholesale.stock_transition(p_org,d,device.id,v_state,v_wh);
      v_cost:=device.cost_egp;
      if v_supplier and device.status='maintenance' then
        select id into v_active_ticket from sns_wholesale.service_tickets
          where org_id=p_org and device_id=device.id and status in ('received','agent');
        if v_active_ticket is not null then
          perform sns_wholesale.set_service_ticket(p_org,d,device.id,'returned',p_payload->>'note',null,v_active_ticket);
        end if;
      end if;
      if not v_supplier and item->>'disposition'<>'supplier_return' and v_state='maintenance' then
        perform sns_wholesale.set_service_ticket(p_org,d,device.id,'received',p_payload->>'note',d);
      end if;
      if not v_supplier and item->>'disposition'='supplier_return' then
        perform sns_wholesale.require_role(p_role,array['owner','accountant']);
        select id into v_line from sns_wholesale.doc_lines where org_id=p_org and document_id=device.intake_id and device_id=device.id;
        if device.supplier_id is null or v_line is null then raise exception 'الجهاز ده مالوش فاتورة شراء أصلية للإرجاع للمورد.'; end if;
        v_nested:=jsonb_build_object('source_id',device.intake_id,'warehouse_id',v_wh,'note',p_payload->>'note',
          'items',jsonb_build_array(jsonb_build_object('line_id',v_line,'credit',item->'supplier_credit')));
        v_combined:=v_combined||jsonb_build_array(v_nested);
      end if;
    elsif v_supplier then
      v_cost:=sns_wholesale.move_accessory(p_org,d,ln.sku_id,v_wh,-v_qty);
    else
      if v_state='maintenance' or item->>'disposition'='supplier_return' then raise exception 'صيانة الإكسسوار أو إرجاعه للمورد يتسجل مستقل.'; end if;
      v_cost:=case when v_done+v_qty=ln.qty then ln.cost_egp-v_already_cost
        else round(ln.cost_egp*(v_done+v_qty)::numeric/ln.qty,2)-round(ln.cost_egp*v_done::numeric/ln.qty,2) end;
      if v_state='available' then perform sns_wholesale.move_accessory(p_org,d,ln.sku_id,v_wh,v_qty,v_cost); end if;
    end if;
    if v_supplier then
      v_when:=(item->>'credit')::numeric;
      if v_when is not null then
        if v_when<0 then raise exception 'قيمة إشعار المورد ما ينفعش تبقى سالبة.'; end if;
        -- Comprised of net and returned landed costs, before any VAT reversal.
        v_fee:=0;
        v_net:=v_when;
      end if;
    end if;
    v_total_net:=v_total_net+v_net;
    v_total_tax:=v_total_tax+v_tax;
    v_total_fee:=v_total_fee+case when v_supplier then v_fee else 0 end;
    v_costs:=v_costs+v_cost;
    v_inventory:=v_inventory+case when v_state='damaged' then 0 else v_cost end;
    v_comms:=v_comms+v_commission;
    insert into sns_wholesale.doc_lines(org_id,document_id,position,sku_id,device_id,warehouse_id,source_line_id,qty,unit_price,
      unit_net,line_net,tax,landed,cost_egp,commission_egp,disposition)
    values(p_org,d,v_pos,ln.sku_id,ln.device_id,v_wh,ln.id,v_qty,ln.unit_price,round(v_net/v_qty,2),
      v_net,v_tax,v_fee,v_cost,v_commission,v_state);
  end loop;
  v_credit:=v_total_net+v_total_fee+v_total_tax;
  update sns_wholesale.documents set gross=v_total_net,fees=v_total_fee,tax=v_total_tax,total=v_credit where org_id=p_org and id=d;
  if v_supplier then
    v_contract_egp:=round(v_credit*orig.fx,2);
    v_ap_book:=sns_wholesale.foreign_book(p_org,orig.party_id,-1,v_credit,orig.fx);
    perform sns_wholesale.record_amount(p_org,d,'ap',v_ap_book,orig.party_id,null,v_credit,orig.currency,orig.fx);
    perform sns_wholesale.record_amount(p_org,d,'inventory',-v_costs);
    perform sns_wholesale.record_amount(p_org,d,'vat_in',-round(v_total_tax*orig.fx,2));
    perform sns_wholesale.record_amount(p_org,d,'supplier_variance',v_costs+round(v_total_tax*orig.fx,2)-v_contract_egp);
    perform sns_wholesale.record_amount(p_org,d,'fx',v_contract_egp-v_ap_book);
  else
    perform sns_wholesale.record_amount(p_org,d,'ar',-v_credit,orig.party_id);
    perform sns_wholesale.record_amount(p_org,d,'sales_returns',v_total_net);
    perform sns_wholesale.record_amount(p_org,d,'vat_out',v_total_tax);
    perform sns_wholesale.record_amount(p_org,d,'inventory',v_inventory);
    perform sns_wholesale.record_amount(p_org,d,'damage',v_costs-v_inventory);
    perform sns_wholesale.record_amount(p_org,d,'cogs',-v_costs);
    perform sns_wholesale.record_amount(p_org,d,'commission',-v_comms);
    perform sns_wholesale.record_amount(p_org,d,'commission_due',v_comms);
  end if;
  if p_payload ? 'refund' then
    if coalesce((p_payload->'refund'->>'amount')::numeric,0)>v_credit then
      raise exception 'مبلغ رد الفلوس أكبر من قيمة الإشعار الدائن.';
    end if;
    v_refund:=sns_wholesale.settle(p_org,p_day,orig.party_id,case when v_supplier then 1 else -1 end,p_payload->'refund',d);
  end if;
  -- The original sale credit and supplier return are committed together where requested.
  v_nested:='[]';
  for item in select value from jsonb_array_elements(v_combined) loop
    v_supplier_doc:=(sns_wholesale.return_invoice(p_org,'supplier_return',item,p_role,p_day)->>'id')::uuid;
    insert into sns_wholesale.return_links values(p_org,d,v_supplier_doc);
    v_nested:=v_nested||jsonb_build_array(v_supplier_doc);
  end loop;
  if v_override then perform sns_wholesale.log_action(p_org,'return_override',d,jsonb_build_object('reason',p_payload->>'note')); end if;
  return jsonb_build_object('id',d,'total',v_credit,'currency',orig.currency,'refund_id',v_refund,'supplier_returns',v_nested);
end;
$$;

create or replace function sns_wholesale.resolve_check(
  p_org uuid,p_payload jsonb,p_day date,p_operation text
) returns uuid language plpgsql set search_path = '' as $$
declare source sns_wholesale.documents; check_item sns_wholesale.checks; previous sns_wholesale.documents;
  source_line sns_wholesale.journal; d uuid; p_account uuid; v_amount numeric(14,2); v_bucket text; reason text;
begin
  select * into check_item from sns_wholesale.checks where org_id=p_org and payment_id=(p_payload->>'payment_id')::uuid for update;
  if not found then raise exception 'الشيك مش مسجل في المنشأة.'; end if;
  select * into strict source from sns_wholesale.documents where org_id=p_org and id=check_item.payment_id;
  if p_day<source.business_date then raise exception 'تاريخ حركة الشيك قبل تاريخ تسجيله.'; end if;
  reason:=nullif(trim(p_payload->>'note'),'');
  v_bucket:=case when check_item.direction='in' then 'notes_receivable' else 'notes_payable' end;
  select egp into strict v_amount from sns_wholesale.journal where org_id=p_org and document_id=source.id and bucket=v_bucket;
  if p_operation='check_reverse' then
    if reason is null or check_item.status not in ('cleared','bounced') then raise exception 'حدد سبب عكس شيك محصّل أو مرتد.'; end if;
    select * into strict previous from sns_wholesale.documents where org_id=p_org and id=check_item.resolution_id;
    perform sns_wholesale.must_be_open(p_org,previous.business_date);
    if p_day<previous.business_date then raise exception 'تاريخ العكس قبل تاريخ تسوية الشيك.'; end if;
    d:=sns_wholesale.create_doc(p_org,'check_reverse',p_day,source.party_id,source.currency,source.fx,null,previous.id,p_payload);
    for source_line in select * from sns_wholesale.journal where org_id=p_org and document_id=previous.id loop
      perform sns_wholesale.record_amount(p_org,d,source_line.bucket,-source_line.egp,source_line.party_id,source_line.account_id,
        -source_line.original,source_line.currency,source_line.rate);
    end loop;
    perform sns_wholesale.normalize_foreign_balance(p_org,d,source.party_id);
    update sns_wholesale.documents set voided_by=d where org_id=p_org and id=previous.id;
    update sns_wholesale.checks set status='pending',resolution_id=null where org_id=p_org and payment_id=source.id;
    return d;
  end if;
  if check_item.status<>'pending' or source.voided_by is not null then raise exception 'تم تسوية الشيك بالفعل.'; end if;
  if p_operation='check_clear' then
    p_account:=sns_wholesale.account(p_org,(p_payload->>'account_id')::uuid,'transfer');
  elsif reason is null then
    raise exception 'اكتب سبب ارتداد الشيك.';
  end if;
  d:=sns_wholesale.create_doc(p_org,p_operation,p_day,source.party_id,source.currency,source.fx,null,source.id,p_payload);
  perform sns_wholesale.record_amount(p_org,d,v_bucket,-v_amount);
  if p_operation='check_clear' then
    perform sns_wholesale.record_amount(p_org,d,'cash',v_amount,null,p_account);
  else
    for source_line in select * from sns_wholesale.journal where org_id=p_org and document_id=source.id and bucket<>v_bucket loop
      perform sns_wholesale.record_amount(p_org,d,source_line.bucket,-source_line.egp,source_line.party_id,source_line.account_id,
        -source_line.original,source_line.currency,source_line.rate);
    end loop;
  end if;
  perform sns_wholesale.normalize_foreign_balance(p_org,d,source.party_id);
  update sns_wholesale.checks set status=case when p_operation='check_clear' then 'cleared' else 'bounced' end,
    resolution_id=d where org_id=p_org and payment_id=source.id;
  return d;
end;
$$;

create table if not exists sns_wholesale.return_links (
  org_id uuid not null,
  customer_return uuid not null,
  supplier_return uuid not null,
  primary key(org_id,customer_return,supplier_return),
  unique(org_id,supplier_return),
  foreign key(org_id,customer_return) references sns_wholesale.documents(org_id,id),
  foreign key(org_id,supplier_return) references sns_wholesale.documents(org_id,id)
);

create or replace function sns_wholesale.void_doc(
  p_org uuid,p_id uuid,p_day date,p_reason text
) returns uuid language plpgsql set search_path = '' as $$
declare original sns_wholesale.documents; dependent sns_wholesale.documents;
  v_journal sns_wholesale.journal; evt sns_wholesale.device_events; previous sns_wholesale.device_events;
  acc sns_wholesale.accessory_events; device sns_wholesale.devices;
  service_evt sns_wholesale.service_events; service_ticket sns_wholesale.service_tickets; rev uuid;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'اكتب سبب الإلغاء.'; end if;
  select * into original from sns_wholesale.documents where org_id=p_org and id=p_id for update;
  if not found or original.voided_by is not null then raise exception 'الحركة مش موجودة أو اتلغت بالفعل.'; end if;
  if original.kind in ('reversal','check_clear','check_bounce','check_reverse') then
    raise exception 'تسويات الشيكات لها عكس مستقل، وقيد الإلغاء يفضل في التاريخ.';
  end if;
  perform sns_wholesale.must_be_open(p_org,original.business_date);
  if p_day<original.business_date then raise exception 'تاريخ الإلغاء قبل تاريخ الحركة الأصلية.'; end if;
  if exists(select 1 from sns_wholesale.return_links l join sns_wholesale.documents d
    on d.org_id=l.org_id and d.id=l.supplier_return
    where l.org_id=p_org and l.customer_return=p_id and d.voided_by is null) then
    raise exception 'الغِ مرتجع المورد المرتبط أولًا.';
  end if;
  if exists(select 1 from sns_wholesale.checks where org_id=p_org and payment_id=p_id and status in ('cleared','bounced')) then
    raise exception 'اعكس تسوية الشيك قبل إلغاء الدفعة.';
  end if;
  for dependent in select * from sns_wholesale.documents
    where org_id=p_org and source_id=p_id and voided_by is null and kind not in ('reversal','check_reverse')
  loop
    if dependent.kind not in ('receipt','payment') then raise exception 'الغِ الحركات أو المرتجعات المرتبطة أولًا.'; end if;
    perform sns_wholesale.void_doc(p_org,dependent.id,p_day,p_reason);
  end loop;

  rev:=sns_wholesale.create_doc(p_org,'reversal',p_day,original.party_id,original.currency,original.fx,
    original.warehouse_id,p_id,jsonb_build_object('note',p_reason));
  for evt in select * from sns_wholesale.device_events where org_id=p_org and document_id=p_id order by id desc loop
    select * into strict device from sns_wholesale.devices where org_id=p_org and id=evt.device_id for update;
    if device.status<>evt.to_status or device.warehouse_id<>evt.to_warehouse or device.cost_egp<>evt.cost_egp
       or (device.status='sold' and device.last_sale_id is distinct from evt.last_sale_id)
       or device.reserved_for is distinct from evt.reserved_for or device.reserved_until is distinct from evt.reserved_until then
      raise exception 'فيه حركة أحدث على الجهاز. الغِ الحركات المرتبطة قبل الإلغاء.';
    end if;
    if evt.from_status is null then
      perform sns_wholesale.stock_transition(p_org,rev,device.id,'voided');
    else
      select * into strict previous from sns_wholesale.device_events where org_id=p_org and device_id=device.id and id<evt.id
        order by id desc limit 1;
      perform sns_wholesale.stock_transition(p_org,rev,device.id,evt.from_status,evt.from_warehouse,
        previous.last_sale_id,previous.reserved_for,previous.reserved_until,previous.cost_egp);
    end if;
  end loop;
  for acc in select * from sns_wholesale.accessory_events where org_id=p_org and document_id=p_id order by id desc loop
    perform sns_wholesale.move_accessory(p_org,rev,acc.sku_id,acc.warehouse_id,-acc.qty_delta,abs(acc.cost_delta));
  end loop;
  for v_journal in select * from sns_wholesale.journal where org_id=p_org and document_id=p_id loop
    perform sns_wholesale.record_amount(p_org,rev,v_journal.bucket,-v_journal.egp,
      v_journal.party_id,v_journal.account_id,-v_journal.original,v_journal.currency,v_journal.rate);
  end loop;
  perform sns_wholesale.normalize_foreign_balance(p_org,rev,original.party_id);
  update sns_wholesale.documents set voided_by=rev where org_id=p_org and id=p_id;
  update sns_wholesale.checks set status='voided' where org_id=p_org and payment_id=p_id;
  for service_evt in select * from sns_wholesale.service_events where org_id=p_org and document_id=p_id loop
    select * into strict service_ticket from sns_wholesale.service_tickets where org_id=p_org and id=service_evt.ticket_id;
    if (service_ticket.status,service_ticket.note) is distinct from (service_evt.to_status,service_evt.to_note) then
      raise exception 'الغِ تحديث تذكرة الصيانة الأحدث أولًا.';
    end if;
    perform sns_wholesale.set_service_ticket(p_org,rev,service_ticket.device_id,coalesce(service_evt.from_status,'cancelled'),
       coalesce(service_evt.from_note,p_reason),null,service_ticket.id);
  end loop;
  perform sns_wholesale.log_action(p_org,'void',p_id,jsonb_build_object('reversal',rev,'reason',p_reason));
  return rev;
end;
$$;

create or replace function sns_wholesale.money_move(p_org uuid,p_op text,p_payload jsonb,p_day date)
returns uuid language plpgsql set search_path = '' as $$
declare d uuid; a uuid; b uuid; amount numeric(14,2):=(p_payload->>'amount')::numeric; other_bucket text;
begin
  if amount is null or amount<=0 then raise exception 'اكتب مبلغ أكبر من صفر.'; end if;
  a:=sns_wholesale.account(p_org,(p_payload->>'account_id')::uuid);
  if p_op='transfer' then
    b:=sns_wholesale.account(p_org,(p_payload->>'to_account_id')::uuid);
    if a=b then raise exception 'التحويل لازم يكون بين حسابين مختلفين.'; end if;
  else
    if nullif(trim(p_payload->>'note'),'') is null then raise exception 'اكتب سبب الصرف.'; end if;
    if p_op='expense' and not exists(select 1 from sns_wholesale.lookups where org_id=p_org and kind='expense'
      and code=p_payload->>'reference' and active) then raise exception 'اختار تصنيف مصروف شغال.'; end if;
  end if;
  d:=sns_wholesale.create_doc(p_org,p_op,p_day,null,'EGP',1,null,null,p_payload);
  update sns_wholesale.documents set gross=amount,total=amount where org_id=p_org and id=d;
  perform sns_wholesale.record_amount(p_org,d,'cash',-amount,null,a);
  if p_op='transfer' then
    perform sns_wholesale.record_amount(p_org,d,'cash',amount,null,b);
  else
    other_bucket:=case when p_op='expense' then 'expense' else 'equity' end;
    perform sns_wholesale.record_amount(p_org,d,other_bucket,amount);
  end if;
  return d;
end;
$$;

create or replace function sns_wholesale.opening(p_org uuid,p_payload jsonb,p_day date)
returns uuid language plpgsql set search_path = '' as $$
declare p sns_wholesale.parties; sku sns_wholesale.skus; d uuid; a uuid; w uuid;
  category text:=p_payload->>'type'; amount numeric(14,2):=(p_payload->>'amount')::numeric;
  fx numeric(18,6):=1; eq numeric(14,2); v_qty int; v_device uuid;
begin
  if amount is null then raise exception 'المبلغ الافتتاحي مطلوب.'; end if;
  if category='party' then
    p:=sns_wholesale.party(p_org,(p_payload->>'party_id')::uuid);
    if p.currency='USD' then fx:=coalesce((p_payload->>'fx')::numeric,(select default_fx from sns_wholesale.shops where org_id=p_org)); end if;
    eq:=round(amount*fx,2);
    d:=sns_wholesale.create_doc(p_org,'opening',p_day,p.id,p.currency,fx,null,null,p_payload);
    if p.kind='customer' then
      perform sns_wholesale.record_amount(p_org,d,'ar',eq,p.id,null,amount,p.currency,fx);
      perform sns_wholesale.record_amount(p_org,d,'equity',-eq);
    else
      perform sns_wholesale.record_amount(p_org,d,'ap',-eq,p.id,null,-amount,p.currency,fx);
      perform sns_wholesale.record_amount(p_org,d,'equity',eq);
    end if;
  elsif category='account' then
    a:=sns_wholesale.account(p_org,(p_payload->>'account_id')::uuid);
    d:=sns_wholesale.create_doc(p_org,'opening',p_day,null,'EGP',1,null,null,p_payload);
    perform sns_wholesale.record_amount(p_org,d,'cash',amount,null,a);
    perform sns_wholesale.record_amount(p_org,d,'equity',-amount);
  elsif category='stock' then
    if amount<0 then raise exception 'تكلفة الرصيد الافتتاحي لازم تكون صفر أو أكبر.'; end if;
    w:=sns_wholesale.warehouse(p_org,(p_payload->>'warehouse_id')::uuid);
    sku:=sns_wholesale.sku(p_org,(p_payload->>'sku_id')::uuid);
    v_qty:=coalesce((p_payload->>'qty')::int,1);
    d:=sns_wholesale.create_doc(p_org,'opening',p_day,null,'EGP',1,w,null,p_payload);
    if sku.kind='device' then
      if v_qty<>1 then raise exception 'رصيد الجهاز يتسجل برقم IMEI واحد.'; end if;
      v_device:=sns_wholesale.add_device(p_org,d,sku.id,w,null,amount,p_payload);
    else
      if v_qty<1 then raise exception 'كمية المخزون الافتتاحي لازم تكون أكبر من صفر.'; end if;
      perform sns_wholesale.move_accessory(p_org,d,sku.id,w,v_qty,amount);
    end if;
    insert into sns_wholesale.doc_lines(org_id,document_id,position,sku_id,device_id,warehouse_id,qty,unit_price,unit_net,line_net,cost_egp)
      values(p_org,d,1,sku.id,v_device,w,v_qty,round(amount/v_qty,2),round(amount/v_qty,2),amount,amount);
    perform sns_wholesale.record_amount(p_org,d,'inventory',amount);
    perform sns_wholesale.record_amount(p_org,d,'equity',-amount);
  else
    raise exception 'حدد نوع الرصيد الافتتاحي: حساب أو عميل/مورد أو مخزون.';
  end if;
  perform sns_wholesale.normalize_foreign_balance(p_org,d,p.id);
  update sns_wholesale.documents set gross=abs(amount),total=abs(amount) where org_id=p_org and id=d;
  return d;
end;
$$;

create or replace function sns_wholesale.device_action(p_org uuid,p_op text,p_payload jsonb,p_day date)
returns jsonb language plpgsql set search_path = '' as $$
declare device sns_wholesale.devices; doc uuid; destination uuid; v_cond text; held uuid; expiry timestamptz;
  sku sns_wholesale.skus; from_wh uuid; qty int; current_ticket uuid; v_ticket_status text;
  cost numeric(14,2); delta numeric(14,2); reason text:=nullif(trim(p_payload->>'note'),'');
begin
  if p_op='warehouse_move' and not(p_payload ? 'device_id' or p_payload ? 'imei') then
    from_wh:=sns_wholesale.warehouse(p_org,(p_payload->>'warehouse_id')::uuid);
    destination:=sns_wholesale.warehouse(p_org,(p_payload->>'to_warehouse_id')::uuid);
    sku:=sns_wholesale.sku(p_org,(p_payload->>'sku_id')::uuid);
    qty:=(p_payload->>'qty')::int;
    if from_wh=destination or sku.kind<>'accessory' or qty is null or qty<1 then raise exception 'راجع مخازن وكمية التحويل.'; end if;
    doc:=sns_wholesale.create_doc(p_org,p_op,p_day,null,'EGP',1,from_wh,null,p_payload);
    cost:=sns_wholesale.move_accessory(p_org,doc,sku.id,from_wh,-qty);
    perform sns_wholesale.move_accessory(p_org,doc,sku.id,destination,qty,cost);
    return jsonb_build_object('id',doc);
  end if;
  select * into device from sns_wholesale.devices where org_id=p_org and id=coalesce((p_payload->>'device_id')::uuid,
    (select device_id from sns_wholesale.imei_registry where org_id=p_org and imei=trim(p_payload->>'imei'))) for update;
  if not found then raise exception 'الجهاز المطلوب مش موجود في المنشأة.'; end if;
  case p_op
    when 'warehouse_move' then
      destination:=sns_wholesale.warehouse(p_org,(p_payload->>'to_warehouse_id')::uuid);
      if destination=device.warehouse_id then raise exception 'اختار مخزن مختلف للتحويل.'; end if;
      v_cond:=device.status;
    when 'reserve' then
      held:=(sns_wholesale.party(p_org,(p_payload->>'party_id')::uuid,'customer')).id;
      expiry:=(p_payload->>'until')::timestamptz;
      if expiry is null or expiry<=now() then raise exception 'انتهاء الحجز لازم يكون في وقت بعد دلوقتي.'; end if;
      v_cond:='reserved';
    when 'release' then v_cond:='available';
    when 'maintenance' then
      if reason is null then raise exception 'اكتب سبب أو ملاحظة الصيانة.'; end if;
      v_ticket_status:=p_payload->>'status';
      select id into current_ticket from sns_wholesale.service_tickets
        where org_id=p_org and device_id=device.id and status in ('received','agent');
      if v_ticket_status is null or v_ticket_status not in ('received','agent','returned') then raise exception 'حدد حالة تذكرة الصيانة.'; end if;
      if v_ticket_status='received' then
        if current_ticket is not null then raise exception 'فيه تذكرة صيانة مفتوحة للجهاز.'; end if;
        v_cond:='maintenance';
      else
        if current_ticket is null then raise exception 'لا توجد تذكرة صيانة مفتوحة للجهاز.'; end if;
        v_cond:='available';
      end if;
    when 'cost_adjustment' then
      cost:=(p_payload->>'cost_egp')::numeric;
      if reason is null or cost is null or cost<0 or cost=device.cost_egp then
        raise exception 'اكتب تكلفة جديدة صحيحة وسبب تعديلها.';
      end if;
      v_cond:=device.status;
    else raise exception 'حركة الجهاز غير معروفة.';
  end case;
  doc:=sns_wholesale.create_doc(p_org,p_op,p_day,held,'EGP',1,device.warehouse_id,
    case when p_op='cost_adjustment' and device.status='sold' then device.last_sale_id end,p_payload);
  if p_op<>'maintenance' or v_ticket_status<>'agent' then
    perform sns_wholesale.stock_transition(p_org,doc,device.id,v_cond,destination,null,held,expiry,cost);
  end if;
  if p_op='maintenance' then
    current_ticket:=sns_wholesale.set_service_ticket(p_org,doc,device.id,v_ticket_status,reason,null,current_ticket);
  end if;
  if p_op='cost_adjustment' then
    delta:=cost-device.cost_egp;
    perform sns_wholesale.record_amount(p_org,doc,case when device.status='sold' then 'cogs' else 'inventory' end,delta);
    perform sns_wholesale.record_amount(p_org,doc,'equity',-delta);
    perform sns_wholesale.log_action(p_org,'cost_change',device.id,
      jsonb_build_object('id',doc,'old_cost',device.cost_egp,'new_cost',cost,'reason',reason));
  end if;
  return jsonb_build_object('id',doc,'device_id',device.id,'ticket_id',current_ticket);
end;
$$;

create or replace function sns_wholesale.update_catalog(p_org uuid,p_op text,p_data jsonb,p_role text)
returns jsonb language plpgsql set search_path = '' as $$
declare ident uuid:=coalesce((p_data->>'id')::uuid,gen_random_uuid()); v_name text:=trim(p_data->>'name');
  v_type text:=p_data->>'kind'; active_flag boolean:=coalesce((p_data->>'active')::boolean,true);
  v_org uuid; v_id uuid; v_currency text; p jsonb; price_row sns_wholesale.prices;
  adjustment numeric; fixed_price numeric; new_amount numeric(14,2); v_sku uuid; v_tier text; v_count int:=0;
  v_before jsonb; v_after jsonb; v_code text; v_sku_row sns_wholesale.skus; v_customer uuid;
  v_quotes jsonb:='[]'; v_total numeric(14,2):=0; v_discount numeric(14,2); v_until date;
  v_qty int; v_price numeric(14,2);
begin
  if p_op in ('settings','warehouse','account','rep','lookup') then
    perform sns_wholesale.require_role(p_role,array['owner']);
  elsif p_op='quote' then
    perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
  elsif p_op='sku' then
    perform sns_wholesale.require_role(p_role,array['owner','accountant','stockkeeper']);
  else
    perform sns_wholesale.require_role(p_role,array['owner','accountant']);
  end if;
  case p_op
    when 'settings' then
      select to_jsonb(s) into v_before from sns_wholesale.shops s where org_id=p_org;
      update sns_wholesale.shops s set
        return_days=coalesce((p_data->>'return_days')::int,s.return_days),
        default_fx=coalesce((p_data->>'default_fx')::numeric,s.default_fx),
        vat_rate=coalesce((p_data->>'vat_rate')::numeric,s.vat_rate),
        invoice_prefix=coalesce(upper(trim(p_data->>'invoice_prefix')),s.invoice_prefix),
        profile=case when p_data ? 'profile' then p_data->'profile' else s.profile end
        where org_id=p_org returning to_jsonb(s) into v_after;
      perform sns_wholesale.log_action(p_org,p_op,p_org,jsonb_build_object('before',v_before,'after',v_after));
      return jsonb_build_object('id',p_org);
    when 'warehouse' then
      insert into sns_wholesale.warehouses(org_id,id,name,active) values(p_org,ident,v_name,active_flag)
      on conflict(org_id,id) do update set name=excluded.name,active=excluded.active;
    when 'account' then
      insert into sns_wholesale.accounts(org_id,id,name,kind,active) values(p_org,ident,v_name,v_type,active_flag)
      on conflict(org_id,id) do update set name=excluded.name,active=excluded.active
      where sns_wholesale.accounts.kind=excluded.kind;
      if not found then raise exception 'نوع الحساب ثابت. افتح حساب جديد لطريقة مختلفة.'; end if;
    when 'party' then
      v_currency:=coalesce(p_data->>'currency','EGP');
      insert into sns_wholesale.parties(org_id,id,kind,name,phone,address,notes,tax_number,currency,tier,credit_limit,blacklisted,active)
      values(p_org,ident,v_type,v_name,p_data->>'phone',p_data->>'address',p_data->>'notes',p_data->>'tax_number',
        v_currency,coalesce(p_data->>'tier','wholesale'),(p_data->>'credit_limit')::numeric,
        coalesce((p_data->>'blacklisted')::boolean,false),active_flag)
      on conflict(org_id,id) do update set name=excluded.name,phone=excluded.phone,address=excluded.address,
        notes=excluded.notes,tax_number=excluded.tax_number,tier=excluded.tier,credit_limit=excluded.credit_limit,
        blacklisted=excluded.blacklisted,active=excluded.active
      where sns_wholesale.parties.kind=excluded.kind and sns_wholesale.parties.currency=excluded.currency;
      if not found then raise exception 'نوع الحساب وعملته ثابتين. افتح حساب جديد لو احتجت عملة تانية.'; end if;
    when 'rep' then
      insert into sns_wholesale.reps(org_id,id,name,commission_kind,commission_rate,active)
        values(p_org,ident,v_name,p_data->>'commission_kind',(p_data->>'commission_rate')::numeric,active_flag)
      on conflict(org_id,id) do update set name=excluded.name,active=excluded.active,
        commission_kind=excluded.commission_kind,commission_rate=excluded.commission_rate;
    when 'lookup' then
      v_code:=trim(p_data->>'code');
      insert into sns_wholesale.lookups(org_id,kind,code,label,active) values(p_org,v_type,v_code,trim(p_data->>'label'),active_flag)
        on conflict(org_id,kind,code) do update set label=excluded.label,active=excluded.active;
      perform sns_wholesale.log_action(p_org,p_op,null,p_data);
      return jsonb_build_object('kind',v_type,'code',v_code);
    when 'sku' then
      if not exists(select 1 from sns_wholesale.lookups where org_id=p_org and kind='brand'
        and code=p_data->>'brand' and active) then raise exception 'اختار ماركة موجودة في الكتالوج.'; end if;
      insert into sns_wholesale.skus(org_id,id,kind,category,code,brand,model,capacity,color,barcode,low_stock,active)
      values(p_org,ident,v_type,p_data->>'category',trim(p_data->>'code'),p_data->>'brand',trim(p_data->>'model'),
        coalesce(p_data->>'capacity',''),coalesce(p_data->>'color',''),nullif(trim(p_data->>'barcode'),''),
        coalesce((p_data->>'low_stock')::int,0),active_flag)
      on conflict(org_id,id) do update set category=excluded.category,code=excluded.code,brand=excluded.brand,model=excluded.model,
        capacity=excluded.capacity,color=excluded.color,barcode=excluded.barcode,low_stock=excluded.low_stock,active=excluded.active
      where sns_wholesale.skus.kind=excluded.kind;
      if not found then raise exception 'نوع الصنف ثابت. أضف صنف جديد لتسجيل الإكسسوار أو الجهاز.'; end if;
    when 'price' then
      v_sku:=(p_data->>'sku_id')::uuid;
      v_tier:=p_data->>'tier';
      perform sns_wholesale.sku(p_org,v_sku);
      fixed_price:=(p_data->>'amount')::numeric;
      if fixed_price is null or fixed_price<0 then raise exception 'اكتب سعر جديد صحيح.'; end if;
      select * into price_row from sns_wholesale.prices where org_id=p_org and sku_id=v_sku and tier=v_tier;
      if price_row.amount is distinct from fixed_price then
        insert into sns_wholesale.prices(org_id,sku_id,tier,amount) values(p_org,v_sku,v_tier,fixed_price)
          on conflict(org_id,sku_id,tier) do update set amount=excluded.amount,updated_at=now();
        insert into sns_wholesale.price_history(org_id,sku_id,tier,old_amount,amount,actor)
          values(p_org,v_sku,v_tier,price_row.amount,fixed_price,auth.uid());
      end if;
      ident:=v_sku;
    when 'price_bulk' then
      v_tier:=p_data->>'tier';
      adjustment:=(p_data->>'adjustment')::numeric;
      if adjustment is null or p_data->>'mode' is null or p_data->>'mode' not in ('percent','amount') then
        raise exception 'حدد زيادة أو خصم بمبلغ أو نسبة.';
      end if;
      for price_row in select p.* from sns_wholesale.prices p join sns_wholesale.skus s
         on s.org_id=p.org_id and s.id=p.sku_id where p.org_id=p_org and s.active
         and (v_tier is null or p.tier=v_tier) and (p_data->>'brand' is null or s.brand=p_data->>'brand')
         order by p.sku_id,p.tier
      loop
        new_amount:=round(price_row.amount+case when p_data->>'mode'='percent' then price_row.amount*adjustment/100 else adjustment end,2);
        if new_amount<0 then raise exception 'التعديل الجماعي هيخلّي أحد الأسعار أقل من صفر.'; end if;
        if new_amount<>price_row.amount then
          update sns_wholesale.prices set amount=new_amount,updated_at=now()
            where org_id=p_org and sku_id=price_row.sku_id and tier=price_row.tier;
          insert into sns_wholesale.price_history(org_id,sku_id,tier,old_amount,amount,actor)
            values(p_org,price_row.sku_id,price_row.tier,price_row.amount,new_amount,auth.uid());
          v_count:=v_count+1;
        end if;
      end loop;
      perform sns_wholesale.log_action(p_org,p_op,null,p_data||jsonb_build_object('updated',v_count));
      return jsonb_build_object('updated',v_count);
    when 'quote' then
      v_customer:=(sns_wholesale.party(p_org,(p_data->>'party_id')::uuid,'customer')).id;
      v_until:=(p_data->>'valid_until')::date;
      v_discount:=coalesce((p_data->>'discount')::numeric,0);
      if v_until is null or v_until<sns_wholesale.cairo_today() then raise exception 'حدد تاريخ صلاحية للعرض.'; end if;
      if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 500 then
        raise exception 'عرض السعر لازم يحتوي على بنود.';
      end if;
      for p in select value from jsonb_array_elements(p_data->'items') loop
        v_sku_row:=sns_wholesale.sku(p_org,(p->>'sku_id')::uuid);
        v_qty:=(p->>'qty')::int;
        v_price:=(p->>'unit_price')::numeric;
        if v_qty is null or v_qty<1 or v_price is null or v_price<0 or exists(
          select 1 from jsonb_array_elements(v_quotes) a where (a.value->>'sku_id')::uuid=v_sku_row.id) then
          raise exception 'راجع كمية وسعر العرض. اكتب كل صنف مرة واحدة.';
        end if;
        v_total:=v_total+v_qty*v_price;
        v_quotes:=v_quotes||jsonb_build_array(jsonb_build_object('sku_id',v_sku_row.id,'qty',v_qty,'unit_price',v_price));
      end loop;
      if v_discount<0 or v_discount>=v_total then raise exception 'الخصم أكبر من أو يساوي إجمالي العرض.'; end if;
      insert into sns_wholesale.quotes(org_id,id,party_id,valid_until,lines,discount,actor,note)
        values(p_org,ident,v_customer,v_until,v_quotes,v_discount,auth.uid(),p_data->>'note')
      on conflict(org_id,id) do update set valid_until=excluded.valid_until,lines=excluded.lines,
        discount=excluded.discount,note=excluded.note
      where sns_wholesale.quotes.party_id=excluded.party_id and not exists(select 1 from sns_wholesale.documents d
          where d.org_id=p_org and d.quote_id=ident and d.voided_by is null);
      if not found then raise exception 'العرض مستخدم أو العميل مختلف.'; end if;
    else raise exception 'الإعداد المطلوب غير معروف.';
  end case;
  perform sns_wholesale.log_action(p_org,p_op,ident,jsonb_build_object('type',v_type));
  return jsonb_build_object('id',ident);
end;
$$;

create or replace function sns_wholesale.stocktake(p_org uuid,p_data jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare wh uuid; ids text[]; missing text[]; unexpected text[]; doc uuid;
begin
  wh:=sns_wholesale.warehouse(p_org,(p_data->>'warehouse_id')::uuid);
  if jsonb_typeof(p_data->'imeis') is distinct from 'array' or jsonb_array_length(p_data->'imeis')>50000 then
    raise exception 'ابعت قائمة أرقام IMEI بحد أقصى ٥٠ ألف إدخال.';
  end if;
  select coalesce(array_agg(distinct coalesce(d.imei,trim(s.value)) order by coalesce(d.imei,trim(s.value))),'{}')
  into ids from jsonb_array_elements_text(p_data->'imeis') s
    left join sns_wholesale.imei_registry i on i.org_id=p_org and i.imei=trim(s.value)
    left join sns_wholesale.devices d on d.org_id=p_org and d.id=i.device_id
    where nullif(trim(s.value),'') is not null;
  select coalesce(array_agg(x order by x),'{}') into missing from (
    select d.imei x from sns_wholesale.devices d where org_id=p_org and warehouse_id=wh and status in ('available','reserved','maintenance')
    except select unnest(ids)
  ) differences;
  select coalesce(array_agg(x order by x),'{}') into unexpected from (
    select unnest(ids) x except select d.imei from sns_wholesale.devices d
      where org_id=p_org and warehouse_id=wh and status in ('available','reserved','maintenance')
  ) differences;
  insert into sns_wholesale.stocktakes(org_id,warehouse_id,scanned,missing,unexpected,actor)
    values(p_org,wh,ids,missing,unexpected,auth.uid()) returning id into doc;
  return jsonb_build_object('id',doc,'scanned',cardinality(ids),'missing',missing,'unexpected',unexpected);
end;
$$;

create or replace function public.sns_wholesale_status(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_enabled boolean; v_shop sns_wholesale.shops;
begin
  v_role:=sns_wholesale.actor_role(p_org);
  select * into v_shop from sns_wholesale.shops where org_id=p_org;
  v_enabled:=coalesce(v_shop.enabled,false);
  return jsonb_build_object('enabled',v_enabled,'activity',case when v_enabled then v_shop.activity end,
    'role',v_role,'business_date',sns_wholesale.cairo_today(),'settings',case when v_enabled then
      jsonb_build_object('return_days',v_shop.return_days,'vat_rate',v_shop.vat_rate,'invoice_prefix',v_shop.invoice_prefix,
        'profile',case when v_role in ('owner','accountant') then v_shop.profile else jsonb_strip_nulls(jsonb_build_object(
          'name',v_shop.profile->'name','logo',v_shop.profile->'logo','address',v_shop.profile->'address',
          'phone',v_shop.profile->'phone','tax_number',v_shop.profile->'tax_number','invoice_text',v_shop.profile->'invoice_text',
          'warranty',v_shop.profile->'warranty','return_policy',v_shop.profile->'return_policy')) end,
        'default_fx',v_shop.default_fx) end);
end;
$$;
create or replace function public.sns_wholesale_enable(p_org uuid,p_enabled boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform sns_wholesale.require_role(sns_wholesale.actor_role(p_org),array['owner']);
  if p_enabled is null then raise exception 'حدد حالة تفعيل النشاط.'; end if;
  if p_enabled then
    insert into sns_wholesale.shops(org_id,enabled) values(p_org,true)
      on conflict(org_id) do update set enabled=true;
    insert into sns_wholesale.lookups(org_id,kind,code,label) select p_org,kind,code,label
      from sns_wholesale.catalog_defaults on conflict do nothing;
    if not exists(select 1 from sns_wholesale.warehouses where org_id=p_org) then
      insert into sns_wholesale.warehouses(org_id,name) values(p_org,'المخزن الرئيسي');
    end if;
    if not exists(select 1 from sns_wholesale.accounts where org_id=p_org) then
      insert into sns_wholesale.accounts(org_id,name,kind) values(p_org,'الخزينة الرئيسية','cash');
    end if;
  else
    update sns_wholesale.shops set enabled=false where org_id=p_org;
  end if;
  if found then perform sns_wholesale.log_action(p_org,case when p_enabled then 'enable' else 'disable' end,p_org); end if;
  return public.sns_wholesale_status(p_org);
end;
$$;

create or replace function public.sns_wholesale_command(
  p_org uuid,p_request_id uuid,p_operation text,p_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text; shop sns_wholesale.shops; request sns_wholesale.requests; v_hash bytea; result jsonb;
  v_day date; v_id uuid; v_date date; v_cash uuid; v_book numeric(14,2); v_opening numeric(14,2); v_actual numeric(14,2);
  v_customer uuid; v_return jsonb; v_sale jsonb; v_entry jsonb; v_ids jsonb; v_reason text;
  v_source uuid; v_receipt_party uuid;
begin
  if p_request_id is null or p_operation is null or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'رقم الطلب وبيانات العملية مطلوبين.';
  end if;
  v_role:=sns_wholesale.actor_role(p_org);
  -- Keep numbering, settlements, cost and period decisions consistent across simultaneous writers.
  select * into shop from sns_wholesale.shops where org_id=p_org for update;
  if not found or not shop.enabled then raise exception 'نشاط جملة الموبايلات مش مفعّل للمنشأة.'; end if;
  v_hash:=sha256(convert_to(p_data::text,'UTF8'));
  select * into request from sns_wholesale.requests where org_id=p_org and id=p_request_id;
  if found then
    if (request.actor,request.operation,request.request_hash) is distinct from (auth.uid(),p_operation,v_hash) then
      raise exception 'رقم الطلب مستخدم لعملية مختلفة.';
    end if;
    -- An actor who has lost a financial role cannot retrieve a previous financial response.
    if p_operation not in ('sale','customer_return','receipt','quote','sku','warehouse_move','reserve','release','maintenance','stocktake','exchange')
       and v_role not in ('owner','accountant') then raise exception using errcode='42501', message='العملية دي تحتاج صلاحية مختلفة.'; end if;
    if p_operation in ('purchase','supplier_return','payment','expense','transfer','draw','opening','opening_batch','check_clear','check_bounce','day_close','price','price_bulk')
       then perform sns_wholesale.require_role(v_role,array['owner','accountant']); end if;
    if p_operation in ('sale','exchange','receipt','quote','customer_return','reserve','release') then
      perform sns_wholesale.require_role(v_role,array['owner','accountant','cashier']);
    end if;
    return case
      when v_role='cashier' and p_operation='sale' then request.response||jsonb_build_object(
        'warnings',coalesce((select jsonb_agg(x) from jsonb_array_elements(request.response->'warnings') x
          where x::text not like '%أقل من التكلفة%'),'[]'::jsonb))
      when v_role='cashier' and p_operation='exchange' then jsonb_set(request.response,'{sale,warnings}',coalesce(
        (select jsonb_agg(x) from jsonb_array_elements(request.response->'sale'->'warnings') x
          where x::text not like '%أقل من التكلفة%'),'[]'::jsonb))
      else request.response end;
  end if;
  v_day:=coalesce((p_data->>'date')::date,sns_wholesale.cairo_today());
  case
    when p_operation in ('settings','warehouse','account','party','rep','lookup','sku','price','price_bulk','quote') then
      result:=sns_wholesale.update_catalog(p_org,p_operation,p_data,v_role);
    when p_operation in ('purchase','sale') then
      perform sns_wholesale.require_role(v_role,case when p_operation='purchase'
        then array['owner','accountant'] else array['owner','accountant','cashier'] end);
      result:=sns_wholesale.invoice(p_org,p_operation,p_data,v_role,v_day);
    when p_operation in ('customer_return','supplier_return') then
      perform sns_wholesale.require_role(v_role,case when p_operation='supplier_return'
        then array['owner','accountant'] else array['owner','accountant','cashier'] end);
      result:=sns_wholesale.return_invoice(p_org,p_operation,p_data,v_role,v_day);
    when p_operation='exchange' then
      perform sns_wholesale.require_role(v_role,array['owner','accountant','cashier']);
      select party_id into v_customer from sns_wholesale.documents
        where org_id=p_org and id=(p_data->'return'->>'source_id')::uuid and kind='sale' and voided_by is null;
      if v_customer is null or v_customer is distinct from (p_data->'sale'->>'party_id')::uuid then
        raise exception 'الاستبدال لازم يخص نفس العميل.';
      end if;
      if p_data->'return' ? 'refund' then raise exception 'الفرق في عملية الاستبدال بيتحسب على حساب العميل.'; end if;
      v_return:=sns_wholesale.return_invoice(p_org,'customer_return',p_data->'return',v_role,v_day);
      v_sale:=sns_wholesale.invoice(p_org,'sale',p_data->'sale',v_role,v_day);
      result:=jsonb_build_object('return',v_return,'sale',v_sale);
    when p_operation in ('receipt','payment') then
      if p_operation='payment' then
        perform sns_wholesale.require_role(v_role,array['owner','accountant']);
      else
        perform sns_wholesale.require_role(v_role,array['owner','accountant','cashier']);
        if v_role='cashier' then perform sns_wholesale.party(p_org,(p_data->>'party_id')::uuid,'customer'); end if;
      end if;
      v_source:=(p_data->>'source_id')::uuid;
      v_receipt_party:=(p_data->>'party_id')::uuid;
      if v_source is not null and not exists(
        select 1 from sns_wholesale.documents where org_id=p_org and id=v_source and party_id=v_receipt_party
          and kind=case when p_operation='receipt' then 'sale' else 'purchase' end and voided_by is null and business_date<=v_day
      ) then raise exception 'الفاتورة المرتبطة لازم تكون سارية لنفس الحساب وتاريخها من يوم الدفعة أو قبله.'; end if;
      v_id:=sns_wholesale.settle(p_org,v_day,v_receipt_party,case when p_operation='receipt' then 1 else -1 end,p_data,v_source);
      result:=jsonb_build_object('id',v_id);
    when p_operation in ('expense','transfer','draw') then
      perform sns_wholesale.require_role(v_role,case when p_operation='draw' then array['owner'] else array['owner','accountant'] end);
      result:=jsonb_build_object('id',sns_wholesale.money_move(p_org,p_operation,p_data,v_day));
    when p_operation in ('opening','opening_batch') then
      perform sns_wholesale.require_role(v_role,array['owner','accountant']);
      if p_operation='opening' then
        result:=jsonb_build_object('id',sns_wholesale.opening(p_org,p_data,v_day));
      else
        if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows') not between 1 and 1000 then
          raise exception 'الاستيراد بيقبل من ١ لحد ١٠٠٠ صف في الدفعة.';
        end if;
        v_ids:='[]';
        for v_entry in select value from jsonb_array_elements(p_data->'rows') loop
          v_ids:=v_ids||jsonb_build_array(sns_wholesale.opening(p_org,v_entry,v_day));
        end loop;
        result:=jsonb_build_object('ids',v_ids);
      end if;
    when p_operation in ('check_clear','check_bounce','check_reverse') then
      perform sns_wholesale.require_role(v_role,case when p_operation='check_reverse' then array['owner'] else array['owner','accountant'] end);
      result:=jsonb_build_object('id',sns_wholesale.resolve_check(p_org,p_data,v_day,p_operation));
    when p_operation='void' then
      perform sns_wholesale.require_role(v_role,array['owner']);
      result:=jsonb_build_object('id',sns_wholesale.void_doc(p_org,(p_data->>'id')::uuid,v_day,p_data->>'note'));
    when p_operation in ('reserve','release','warehouse_move','maintenance','cost_adjustment') then
      perform sns_wholesale.require_role(v_role,case when p_operation='cost_adjustment' then array['owner']
        when p_operation in ('reserve','release') then array['owner','accountant','cashier'] else array['owner','accountant','stockkeeper'] end);
      result:=sns_wholesale.device_action(p_org,p_operation,p_data,v_day);
    when p_operation='stocktake' then
      perform sns_wholesale.require_role(v_role,array['owner','accountant','stockkeeper']);
      result:=sns_wholesale.stocktake(p_org,p_data);
    when p_operation in ('close_month','reopen_month') then
      perform sns_wholesale.require_role(v_role,array['owner']);
      v_reason:=nullif(trim(p_data->>'note'),'');
      v_date:=date_trunc('month',(p_data->>'month')::date::timestamp)::date;
      if v_reason is null or v_date is null or v_date>sns_wholesale.cairo_today() then raise exception 'حدد الشهر وسبب فتحه أو إقفاله.'; end if;
      if p_operation='reopen_month' and not exists(select 1 from sns_wholesale.periods where org_id=p_org and month=v_date and closed) then
        raise exception 'الشهر مفتوح بالفعل.';
      end if;
      insert into sns_wholesale.periods values(p_org,v_date,p_operation='close_month',v_reason,auth.uid(),now())
      on conflict(org_id,month) do update set closed=excluded.closed,reason=excluded.reason,actor=excluded.actor,changed_at=excluded.changed_at;
      result:=jsonb_build_object('month',v_date,'closed',p_operation='close_month');
    when p_operation='day_close' then
      perform sns_wholesale.require_role(v_role,array['owner','accountant']);
      perform sns_wholesale.must_be_open(p_org,v_day);
      v_cash:=sns_wholesale.account(p_org,(p_data->>'account_id')::uuid);
      v_actual:=(p_data->>'actual')::numeric;
      if v_actual is null then raise exception 'اكتب الرصيد الفعلي للحساب.'; end if;
      if exists(select 1 from sns_wholesale.day_closes where org_id=p_org and account_id=v_cash and business_date>=v_day) then
        raise exception 'الحساب اتقفل في اليوم ده أو في يوم بعده.';
      end if;
      select coalesce(sum(j.egp) filter(where d.business_date<v_day),0),coalesce(sum(j.egp),0) into v_opening,v_book
      from sns_wholesale.journal j join sns_wholesale.documents d on d.org_id=j.org_id and d.id=j.document_id
      where j.org_id=p_org and j.account_id=v_cash and d.business_date<=v_day;
      insert into sns_wholesale.day_closes(org_id,account_id,business_date,opening,book,actual,note,actor)
        values(p_org,v_cash,v_day,v_opening,v_book,v_actual,p_data->>'note',auth.uid());
      result:=jsonb_build_object('opening',v_opening,'closing',v_book,'actual',v_actual,'difference',v_actual-v_book);
    else raise exception 'العملية المطلوبة غير متاحة.';
  end case;
  perform sns_wholesale.log_action(p_org,p_operation,(result->>'id')::uuid,
    jsonb_build_object('request_id',p_request_id,'date',v_day,'reason',p_data->>'note','month',result->'month'));
  insert into sns_wholesale.requests(org_id,id,actor,operation,request_hash,response)
    values(p_org,p_request_id,auth.uid(),p_operation,v_hash,result);
  return result;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception using errcode='22023', message='راجع صيغة الأرقام والتواريخ والمعرّفات.';
  when unique_violation then
    raise exception using errcode='23505', message='فيه كود أو رقم فاتورة مسجل بالفعل.';
  when not_null_violation or check_violation or foreign_key_violation then
    raise exception using errcode='22023', message='فيه قيمة ناقصة أو اختيار غير صالح للعملية.';
end;
$$;

create or replace view sns_wholesale.sale_line_movements as
  select d.org_id,d.id as entry_id,d.business_date,s.id as invoice_id,s.number,
    s.party_id,coalesce(s.rep_id,sale.rep_id) rep_id,s.kind,l.id as line_id,l.sku_id,l.device_id,
    l.qty*case when d.kind='reversal' then -1 else 1 end as quantity,
    l.line_net*case when d.kind='reversal' then -1 else 1 end as net,
    l.cost_egp*case when d.kind='reversal' then -1 else 1 end as cost,
    l.disposition
  from sns_wholesale.documents d
  join sns_wholesale.documents s on s.org_id=d.org_id and s.id=case when d.kind='reversal' then d.source_id else d.id end
  join sns_wholesale.doc_lines l on l.org_id=s.org_id and l.document_id=s.id
  left join sns_wholesale.documents sale on s.kind='customer_return' and sale.org_id=s.org_id and sale.id=s.source_id
  where s.kind in ('sale','customer_return','purchase','supplier_return') and d.kind in
    ('sale','customer_return','purchase','supplier_return','reversal');

create or replace view sns_wholesale.account_activity as
  select d.org_id,d.business_date,d.kind,d.number,d.source_id,j.document_id,j.id,
    j.party_id,j.account_id,j.bucket,j.egp,j.original,j.currency,j.rate
  from sns_wholesale.journal j join sns_wholesale.documents d on d.org_id=j.org_id and d.id=j.document_id;

create or replace function sns_wholesale.health(p_org uuid)
returns jsonb language sql stable set search_path = '' as $$
  with stock as (
    select
      (select coalesce(sum(cost_egp),0) from sns_wholesale.devices where org_id=p_org and status in ('available','reserved','maintenance'))
      +(select coalesce(sum(book_egp),0) from sns_wholesale.accessory_stock where org_id=p_org) as physical,
      (select coalesce(sum(egp),0) from sns_wholesale.journal where org_id=p_org and bucket='inventory') as book
  ), checks as (
    select
    (select count(*) from sns_wholesale.devices d left join sns_wholesale.documents s
      on s.org_id=d.org_id and s.id=d.last_sale_id
      where d.org_id=p_org and d.status='sold' and (s.kind is distinct from 'sale' or s.voided_by is not null
        or not exists(select 1 from sns_wholesale.doc_lines l where l.org_id=d.org_id and l.document_id=s.id and l.device_id=d.id))) as sold_without_invoice,
    (select count(*) from sns_wholesale.devices d
      left join lateral (select e.to_status,e.to_warehouse,e.cost_egp from sns_wholesale.device_events e
        where e.org_id=d.org_id and e.device_id=d.id order by e.business_date desc,e.id desc limit 1) last on true
      where d.org_id=p_org and (last.to_status,last.to_warehouse,last.cost_egp) is distinct from (d.status,d.warehouse_id,d.cost_egp)) as inconsistent_steps,
    (select count(*) from sns_wholesale.devices d where d.org_id=p_org and
      (not exists(select 1 from sns_wholesale.imei_registry i where i.org_id=d.org_id and i.device_id=d.id and slot=1 and i.imei=d.imei)
        or (d.imei2 is not null and not exists(select 1 from sns_wholesale.imei_registry i where i.org_id=d.org_id and i.device_id=d.id and slot=2 and i.imei=d.imei2)))) as bad_imeis,
    (select count(*) from (select document_id from sns_wholesale.journal where org_id=p_org group by document_id having sum(egp)<>0) d) as unbalanced,
    (select count(*) from sns_wholesale.payments p where p.org_id=p_org and p.method not in ('check','trade_in')
      and not exists(select 1 from sns_wholesale.journal j where j.org_id=p.org_id and j.document_id=p.document_id and j.account_id=p.account_id)) as unlinked_payments,
    (select count(*) from sns_wholesale.journal j join sns_wholesale.parties p on p.org_id=j.org_id and p.id=j.party_id
      where j.org_id=p_org and (j.currency<>p.currency or (j.bucket='ar')<>(p.kind='customer'))) as party_mismatches,
    (select count(*) from sns_wholesale.service_tickets t join sns_wholesale.devices d on d.org_id=t.org_id and d.id=t.device_id
      where t.org_id=p_org and t.status in ('received','agent') and d.status<>'maintenance') as invalid_tickets
  )
  select jsonb_build_object('ok',physical=book and sold_without_invoice=0 and inconsistent_steps=0 and
    bad_imeis=0 and unbalanced=0 and unlinked_payments=0 and party_mismatches=0 and invalid_tickets=0,
    'inventory_egp',physical,'ledger_inventory_egp',book,
    'inventory_difference',physical-book,'sold_without_invoice',sold_without_invoice,'invalid_timeline',inconsistent_steps,
    'bad_imeis',bad_imeis,'unbalanced',unbalanced,'unlinked_payments',unlinked_payments,
    'party_mismatches',party_mismatches,'invalid_tickets',invalid_tickets)
  from stock cross join checks;
$$;

create or replace function sns_wholesale.period_summary(p_org uuid,p_from date,p_to date)
returns jsonb language sql stable set search_path = '' as $$
  with all_sums as (
    select
      coalesce(-sum(egp) filter(where bucket='sales' and business_date>=p_from),0) sales,
      coalesce(sum(egp) filter(where bucket='sales_returns' and business_date>=p_from),0) returns,
      coalesce(sum(egp) filter(where bucket='cogs' and business_date>=p_from),0) cogs,
      coalesce(sum(egp) filter(where bucket='expense' and business_date>=p_from),0) expenses,
      coalesce(sum(egp) filter(where bucket='damage' and business_date>=p_from),0) damaged,
      coalesce(sum(egp) filter(where bucket='supplier_variance' and business_date>=p_from),0) supplier_variance,
      coalesce(sum(egp) filter(where bucket='commission' and business_date>=p_from),0) commission,
      coalesce(sum(egp) filter(where bucket='fx' and business_date>=p_from),0) fx_loss,
      coalesce(sum(egp) filter(where bucket='ar'),0) receivables,
      coalesce(-sum(egp) filter(where bucket='ap'),0) payables_egp,
      coalesce(sum(egp) filter(where bucket='cash'),0) cash,
      coalesce(sum(egp) filter(where bucket='inventory'),0) inventory_value,
      coalesce(sum(egp) filter(where bucket='notes_receivable'),0) notes_receivable,
      coalesce(-sum(egp) filter(where bucket='notes_payable'),0) notes_payable
    from sns_wholesale.account_activity where org_id=p_org and business_date<=p_to
  ), activity as (
    select coalesce(sum(quantity) filter(where kind='sale'),0) as sold,
      coalesce(sum(quantity) filter(where kind='customer_return'),0) as returned,
      coalesce(sum(quantity) filter(where kind='supplier_return'),0) as returned_to_suppliers
    from sns_wholesale.sale_line_movements where org_id=p_org and business_date between p_from and p_to and device_id is not null
  ), stock as (
    select count(*) filter(where to_status='available' or (to_status='reserved' and reserved_until<=
      least(now(),((p_to+1)::timestamp at time zone 'Africa/Cairo')))) as available,
      count(*) filter(where to_status in ('available','reserved','maintenance')) as on_hand
    from (select distinct on (device_id) to_status,reserved_until from sns_wholesale.device_events
      where org_id=p_org and business_date<=p_to order by device_id,business_date desc,id desc) closing_state
  ), totals as (
    select sales-returns net_sales,sales-returns-cogs gross_profit,
      sales-returns-cogs-expenses-damaged-supplier_variance-commission-fx_loss net_profit
    from all_sums
  )
  select to_jsonb(all_sums)||to_jsonb(activity)||to_jsonb(stock)||to_jsonb(totals)
    ||jsonb_build_object('from',p_from,'to',p_to,'net_devices_sold',sold-returned,'margin_percent',
      case when net_sales<>0 then round(net_profit*100/net_sales,2) end)
  from all_sums cross join activity cross join stock cross join totals;
$$;

create or replace function sns_wholesale.aging(p_org uuid,p_party uuid,p_to date)
returns jsonb language sql stable set search_path = '' as $$
  with recursive ar as (
    select j.id,j.original,j.business_date,d.id document_id,d.source_id,d.kind,coalesce(d.due_date,j.business_date) due
    from sns_wholesale.account_activity j join sns_wholesale.documents d on d.org_id=j.org_id and d.id=j.document_id
    where j.org_id=p_org and j.party_id=p_party and j.business_date<=p_to and j.bucket='ar'
  ), ancestry as (
    select ar.id,ar.document_id,ar.source_id,ar.kind,ar.due,ar.business_date,0 depth from ar
    union all
    select a.id,d.id,d.source_id,d.kind,coalesce(d.due_date,d.business_date),d.business_date,a.depth+1
    from ancestry a join sns_wholesale.documents d on d.org_id=p_org and d.id=a.source_id and d.party_id=p_party
    where a.kind not in ('sale','opening') and a.depth<6
  ), targets as (
    select distinct on (id) id,document_id,due,business_date from ancestry where kind in ('sale','opening') order by id,depth
  ), obligations as (
    select targets.document_id,targets.due,targets.business_date,sum(ar.original) amount
      from targets join ar using(id) group by targets.document_id,targets.due,targets.business_date
    union all
    select null,min(ar.due) filter(where ar.original>0),min(ar.business_date) filter(where ar.original>0),sum(ar.original)
      from ar left join targets using(id) where targets.id is null
  ), debit as (
    select *,sum(amount) over(order by business_date,document_id rows unbounded preceding) running
    from obligations where amount>0
  ), credit as (
    select coalesce(-sum(amount),0) amount from obligations where amount<0
  ), open as (
    select greatest(0,least(debit.amount,running-credit.amount)) remaining,greatest(0,p_to-due) age
    from debit cross join credit
  ), vals as (
    select coalesce(sum(remaining) filter(where age<=7),0) first,
      coalesce(sum(remaining) filter(where age between 8 and 30),0) midrange,
      coalesce(sum(remaining) filter(where age>30),0) third,
      coalesce(sum(remaining) filter(where age>0),0) overdue
    from open
  )
  select jsonb_build_object('0_7',first,'8_30',midrange,'31_plus',third,'overdue',overdue,
    'rating',case when (select blacklisted from sns_wholesale.parties where org_id=p_org and id=p_party) then 'blacklisted'
      when overdue>0 then 'late' else 'punctual' end,'date',p_to)
  from vals;
$$;

-- Read projections are explicit for selling and inventory staff. No direct table or view grants.
create or replace function public.sns_wholesale_read(
  p_org uuid,p_resource text,p_filter jsonb default '{}',p_limit int default 50,p_after uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p_role text; finance boolean; result jsonb; q text; lim int; v_kind text;
  v_party uuid; v_sku uuid; v_warehouse uuid; v_device uuid; v_document uuid; v_status text; v_ref bigint;
  v_from date; v_to date;
begin
  p_role:=sns_wholesale.actor_role(p_org);
  finance:=p_role in ('owner','accountant');
  if not exists(select 1 from sns_wholesale.shops where org_id=p_org and enabled) then
    raise exception 'نشاط جملة الموبايلات مش مفعّل للمنشأة.';
  end if;
  if jsonb_typeof(p_filter) is distinct from 'object' then raise exception 'بيانات البحث غير صالحة.'; end if;
  lim:=least(greatest(coalesce(p_limit,50),1),500);
  q:=nullif(trim(left(p_filter->>'q',128)),'');
  v_kind:=p_filter->>'kind'; v_status:=p_filter->>'status';
  v_party:=(p_filter->>'party_id')::uuid; v_sku:=(p_filter->>'sku_id')::uuid;
  v_warehouse:=(p_filter->>'warehouse_id')::uuid; v_device:=(p_filter->>'device_id')::uuid;
  v_document:=(p_filter->>'document_id')::uuid; v_ref:=(p_filter->>'after_id')::bigint;
  v_from:=(p_filter->>'from')::date; v_to:=(p_filter->>'to')::date;
  case p_resource
    when 'catalog' then
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select * from sns_wholesale.skus s where org_id=p_org and (p_after is null or id>p_after)
          and (v_kind is null or kind=v_kind) and (q is null or lower(model) like lower(q)||'%' or code ilike q||'%' or barcode=q)
          order by id limit lim
      ) x;
    when 'lookups' then
      select jsonb_agg(to_jsonb(x) order by x.kind,x.code) into result from (
        select kind,code,label,active from sns_wholesale.lookups where org_id=p_org and (v_kind is null or kind=v_kind)
          and (q is null or label ilike q||'%') order by kind,code offset greatest(0,coalesce(v_ref,0)) limit lim
      ) x;
    when 'warehouses' then
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select id,name,active from sns_wholesale.warehouses where org_id=p_org and (p_after is null or id>p_after) order by id limit lim
      ) x;
    when 'accounts' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select a.id,a.name,a.kind,a.active from sns_wholesale.accounts a where a.org_id=p_org and (p_after is null or a.id>p_after)
         and (finance or a.active) order by a.id limit lim
      ) x;
    when 'reps' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select id,name,active from sns_wholesale.reps where org_id=p_org and (p_after is null or id>p_after)
         and (finance or active) order by id limit lim
      ) x;
    when 'parties' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
      select jsonb_agg(x.item order by x.id) into result from (
        select p.id,case when finance then to_jsonb(p)||jsonb_build_object('balance',coalesce(b.balance,0),'balance_egp',coalesce(b.balance_egp,0))
          else jsonb_build_object('id',p.id,'kind',p.kind,'name',p.name,'phone',p.phone,'tier',p.tier,
            'active',p.active,'credit_limit',p.credit_limit,'balance',coalesce(b.balance,0),'blacklisted',p.blacklisted) end item
        from sns_wholesale.parties p left join lateral (
          select sum(case when p.kind='customer' then original else -original end) balance,
            sum(case when p.kind='customer' then egp else -egp end) balance_egp
          from sns_wholesale.journal j where j.org_id=p.org_id and j.party_id=p.id
        ) b on true
        where p.org_id=p_org and (finance or (p.kind='customer' and p.active))
          and (v_kind is null or p.kind=v_kind) and (p_after is null or p.id>p_after)
          and (v_party is null or p.id=v_party) and (q is null or lower(p.name) like lower(q)||'%' or p.phone like q||'%')
        order by p.id limit lim
      ) x;
    when 'devices' then
      select jsonb_agg(x.item order by x.id) into result from (
        select d.id, jsonb_build_object('id',d.id,'sku_id',d.sku_id,'model',s.model,'brand',s.brand,
          'capacity',s.capacity,'color',s.color,'warehouse_id',d.warehouse_id,'imei',d.imei,'imei2',d.imei2,
          'status',i.effective_status,'condition',d.condition,'grade',d.grade,'battery',d.battery,'region',d.region,
          'sim',d.sim,'package',d.package,'activation_lock',d.activation_lock,'mdm',d.mdm,'warranty_kind',d.warranty_kind,
          'warranty_until',i.warranty_ends,'warranty_days',d.warranty_days,'acquired_on',d.acquired_on,
          'days_held',i.days_held,'reserved_until',d.reserved_until,'reserved_for',d.reserved_for)
          ||case when finance then jsonb_build_object('cost_egp',d.cost_egp,'supplier_id',d.supplier_id,'intake_id',d.intake_id,'notes',d.notes)
            else '{}'::jsonb end item
        from sns_wholesale.devices d join sns_wholesale.skus s on s.org_id=d.org_id and s.id=d.sku_id
          join sns_wholesale.device_inventory i on i.org_id=d.org_id and i.id=d.id
        where d.org_id=p_org and (p_after is null or d.id>p_after) and (v_device is null or d.id=v_device)
          and (v_warehouse is null or d.warehouse_id=v_warehouse) and (v_sku is null or d.sku_id=v_sku)
          and (v_status is null or i.effective_status=v_status)
          and (p_filter->>'capacity' is null or s.capacity=p_filter->>'capacity')
          and (p_filter->>'color' is null or s.color=p_filter->>'color')
          and (v_party is null or (p_role<>'cashier' and d.supplier_id=v_party))
          and (q is null or lower(s.model) like lower(q)||'%' or exists(select 1 from sns_wholesale.imei_registry r
              where r.imei=q and r.org_id=d.org_id and r.device_id=d.id))
        order by d.id limit lim
      ) x;
    when 'accessories' then
      select jsonb_agg(x.item order by x.sku_id,x.warehouse_id) into result from (
        select s.sku_id,s.warehouse_id,jsonb_build_object('sku_id',s.sku_id,'warehouse_id',s.warehouse_id,'model',k.model,
          'qty',s.qty,'low_stock',k.low_stock)
          ||case when finance then jsonb_build_object('book_egp',s.book_egp,'average_egp',round(s.book_egp/nullif(s.qty,0),2))
            else '{}'::jsonb end item
        from sns_wholesale.accessory_stock s join sns_wholesale.skus k on k.org_id=s.org_id and k.id=s.sku_id
        where s.org_id=p_org and (v_warehouse is null or s.warehouse_id=v_warehouse) and (v_sku is null or s.sku_id=v_sku)
          and (q is null or k.model ilike q||'%') and (p_after is null or s.sku_id>p_after
            or (s.sku_id=p_after and s.warehouse_id>(p_filter->>'after_warehouse')::uuid))
        order by s.sku_id,s.warehouse_id limit lim
      ) x;
    when 'timeline' then
      if v_device is null then raise exception 'اختار جهاز لعرض سجل الحركة.'; end if;
      select jsonb_agg(x.item order by x.id desc) into result from (
        select e.id,jsonb_build_object('id',e.id,'business_date',e.business_date,'kind',d.kind,'number',d.number,
          'from_status',e.from_status,'to_status',e.to_status,'from_warehouse',e.from_warehouse,'to_warehouse',e.to_warehouse)
          ||case when finance then jsonb_build_object('cost_egp',e.cost_egp,'reason',e.reason) else '{}'::jsonb end item
        from sns_wholesale.device_events e join sns_wholesale.documents d on d.org_id=e.org_id and d.id=e.document_id
        where e.org_id=p_org and e.device_id=v_device and (v_ref is null or e.id<v_ref)
          and (finance or d.kind<>'cost_adjustment') order by e.id desc limit lim
      ) x;
    when 'last_prices' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
      perform sns_wholesale.party(p_org,v_party,'customer');
      select jsonb_agg(to_jsonb(x) order by x.sku_id) into result from (
        select distinct on (l.sku_id) l.sku_id,d.business_date,l.unit_net,d.id document_id,sku.model,sku.capacity,sku.color
        from sns_wholesale.documents d join sns_wholesale.doc_lines l on l.org_id=d.org_id and l.document_id=d.id
        join sns_wholesale.skus sku on sku.org_id=l.org_id and sku.id=l.sku_id
        where d.org_id=p_org and d.party_id=v_party and d.kind='sale' and d.voided_by is null
          and (v_sku is null or l.sku_id=v_sku) and (p_after is null or l.sku_id>p_after)
        order by l.sku_id,d.business_date desc,d.created_at desc,l.position desc limit lim
      ) x;
    when 'prices' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
      select jsonb_agg(to_jsonb(x) order by x.sku_id,x.tier) into result from (
        select p.sku_id,p.tier,p.amount,p.updated_at,s.model,s.capacity,s.color,s.brand
        from sns_wholesale.prices p join sns_wholesale.skus s on s.org_id=p.org_id and s.id=p.sku_id
        where p.org_id=p_org and s.active and (v_sku is null or p.sku_id=v_sku)
          and (p_filter->>'tier' is null or p.tier=p_filter->>'tier')
          and (p_after is null or p.sku_id>p_after or (p.sku_id=p_after and p.tier>p_filter->>'after_tier'))
        order by p.sku_id,p.tier limit lim
      ) x;
    when 'price_history' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant']);
      select jsonb_agg(to_jsonb(x) order by x.id desc) into result from (
        select * from sns_wholesale.price_history where org_id=p_org and (v_sku is null or sku_id=v_sku)
          and (v_ref is null or id<v_ref) order by id desc limit lim
      ) x;
    when 'documents' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
      select jsonb_agg(x.item order by x.business_date desc,x.id desc) into result from (
        select d.id,d.business_date,case when finance then to_jsonb(d) else jsonb_build_object(
          'id',d.id,'business_date',d.business_date,'number',d.number,'kind',d.kind,'party_id',d.party_id,
          'warehouse_id',d.warehouse_id,'source_id',d.source_id,'voided_by',d.voided_by,
          'currency',d.currency,'gross',d.gross,'discount',d.discount,'tax',d.tax,'total',d.total) end item
        from sns_wholesale.documents d where d.org_id=p_org
          and (finance or d.kind in ('sale','customer_return') or (d.kind='receipt' and exists(
            select 1 from sns_wholesale.parties p where p.org_id=d.org_id and p.id=d.party_id and p.kind='customer')))
          and (v_party is null or d.party_id=v_party) and (v_kind is null or d.kind=v_kind)
          and (v_from is null or d.business_date>=v_from) and (v_to is null or d.business_date<=v_to)
          and (v_document is null or d.id=v_document) and (q is null or d.number ilike '%'||q||'%')
          and (p_after is null or (d.business_date,d.id)<(select a.business_date,a.id from sns_wholesale.documents a where a.org_id=p_org and a.id=p_after))
        order by d.business_date desc,d.id desc limit lim
      ) x;
    when 'lines' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
      if v_document is null then raise exception 'اختار فاتورة لعرض بنودها.'; end if;
      select jsonb_agg(x.item order by x.position) into result from (
        select l.position, (case when finance then to_jsonb(l) else jsonb_build_object(
          'id',l.id,'position',l.position,'sku_id',l.sku_id,'device_id',l.device_id,'qty',l.qty,
          'unit_price',l.unit_price,'unit_net',l.unit_net,'line_net',l.line_net,'tax',l.tax,'disposition',l.disposition) end)
          ||jsonb_build_object('imei',dev.imei,'imei2',dev.imei2,'model',s.model,'capacity',s.capacity,'color',s.color,
            'warranty_kind',dev.warranty_kind,'warranty_days',dev.warranty_days,'warranty_until',dev.warranty_until) item
        from sns_wholesale.doc_lines l join sns_wholesale.documents d on d.org_id=l.org_id and d.id=l.document_id
          join sns_wholesale.skus s on s.org_id=l.org_id and s.id=l.sku_id
          left join sns_wholesale.devices dev on dev.org_id=l.org_id and dev.id=l.device_id
        where l.org_id=p_org and l.document_id=v_document and (finance or d.kind in ('sale','customer_return'))
          and l.position>coalesce(v_ref,0) order by l.position limit lim
      ) x;
    when 'quotes' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select o.*, d.id sale_id from sns_wholesale.quotes o left join sns_wholesale.documents d
          on d.org_id=o.org_id and d.quote_id=o.id and d.voided_by is null
        where o.org_id=p_org and (p_after is null or o.id>p_after) and (v_party is null or o.party_id=v_party)
        order by o.id limit lim
      ) x;
    when 'checks' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant']);
      select jsonb_agg(to_jsonb(x) order by x.due,x.payment_id) into result from (
        select c.*,d.total,d.currency,d.fx,d.party_id,d.number document_number from sns_wholesale.checks c
        join sns_wholesale.documents d on d.org_id=c.org_id and d.id=c.payment_id
        where c.org_id=p_org and (v_status is null or c.status=v_status)
          and (v_from is null or c.due>=v_from) and (v_to is null or c.due<=v_to)
          and (p_after is null or (c.due,c.payment_id)>(select z.due,z.payment_id from sns_wholesale.checks z where z.org_id=p_org and z.payment_id=p_after))
        order by c.due,c.payment_id limit lim
      ) x;
    when 'payments' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant']);
      select jsonb_agg(to_jsonb(x) order by x.document_id) into result from (
        select p.*,d.total,d.currency,d.fx,d.business_date,d.kind,d.party_id,d.source_id,d.voided_by
        from sns_wholesale.payments p join sns_wholesale.documents d on d.org_id=p.org_id and d.id=p.document_id
        where p.org_id=p_org and (p_after is null or p.document_id>p_after)
          and (v_document is null or d.id=v_document or d.source_id=v_document)
          and (v_party is null or d.party_id=v_party) order by p.document_id limit lim
      ) x;
    when 'service' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','stockkeeper']);
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select * from sns_wholesale.service_tickets where org_id=p_org and (p_after is null or id>p_after)
          and (v_device is null or device_id=v_device) and (v_status is null or status=v_status) order by id limit lim
      ) x;
    when 'statement' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant']);
      if v_party is null and p_filter->>'account_id' is null then raise exception 'اختار عميل أو مورد أو حساب للخزينة.'; end if;
      select jsonb_agg(to_jsonb(x) order by x.id desc) into result from (
        select id,business_date,number,kind,document_id,egp,original,currency,rate,bucket from sns_wholesale.account_activity
        where org_id=p_org and (case when v_party is not null then party_id=v_party else account_id=(p_filter->>'account_id')::uuid end)
          and (v_from is null or business_date>=v_from) and (v_to is null or business_date<=v_to)
          and (v_ref is null or id<v_ref) order by id desc limit lim
      ) x;
    when 'cash_balances' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant']);
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select * from sns_wholesale.cash_balances where org_id=p_org and (p_after is null or id>p_after) order by id limit lim
      ) x;
    when 'audit' then
      perform sns_wholesale.require_role(p_role,array['owner']);
      select jsonb_agg(to_jsonb(x) order by x.id desc) into result from (
        select * from sns_wholesale.audit where org_id=p_org and (v_ref is null or id<v_ref) order by id desc limit lim
      ) x;
    when 'aging' then
      perform sns_wholesale.require_role(p_role,array['owner','accountant','cashier']);
      perform sns_wholesale.party(p_org,v_party,'customer');
      return sns_wholesale.aging(p_org,v_party,coalesce(v_to,sns_wholesale.cairo_today()));
    else raise exception 'القائمة المطلوبة غير متاحة.';
  end case;
  return coalesce(result,'[]');
end;
$$;

create or replace view sns_wholesale.cost_corrections as
  select d.org_id,d.business_date,e.device_id,l.sku_id,s.party_id,s.rep_id,j.egp
  from sns_wholesale.documents d
  join sns_wholesale.documents c on c.org_id=d.org_id
    and c.id=case when d.kind='reversal' then d.source_id else d.id end and c.kind='cost_adjustment'
  join sns_wholesale.documents s on s.org_id=c.org_id and s.id=c.source_id and s.kind='sale'
  join sns_wholesale.device_events e on e.org_id=c.org_id and e.document_id=c.id
  join sns_wholesale.doc_lines l on l.org_id=s.org_id and l.document_id=s.id and l.device_id=e.device_id
  join sns_wholesale.journal j on j.org_id=d.org_id and j.document_id=d.id and j.bucket='cogs'
  where d.kind in ('cost_adjustment','reversal');

create or replace function public.sns_wholesale_report(
  p_org uuid,p_from date,p_to date,p_section text default 'summary',
  p_limit int default 100,p_after uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; result jsonb; lim int:=least(greatest(coalesce(p_limit,100),1),500);
  prev_day date:=date_trunc('month',p_from::timestamp)::date-1;
begin
  v_role:=sns_wholesale.actor_role(p_org);
  perform sns_wholesale.require_role(v_role,array['owner','accountant']);
  if not exists(select 1 from sns_wholesale.shops where org_id=p_org and enabled) then
    raise exception 'نشاط جملة الموبايلات مش مفعّل للمنشأة.';
  end if;
  if p_from is null or p_to is null or p_from>p_to or p_to>sns_wholesale.cairo_today() then
    raise exception 'راجع تاريخ بداية ونهاية التقرير.';
  end if;
  case p_section
    when 'summary' then
      return sns_wholesale.period_summary(p_org,p_from,p_to)
        ||jsonb_build_object('previous_month',sns_wholesale.period_summary(p_org,date_trunc('month',prev_day::timestamp)::date,prev_day));
    when 'by_model', 'by_customer', 'by_rep' then
      with movements as (
        select
          case p_section when 'by_model' then l.sku_id when 'by_customer' then l.party_id else l.rep_id end as id,
          case when l.kind='sale' then l.net else -l.net end net,
          case when l.kind='sale' then l.cost else -l.cost end cost,
          case when l.device_id is null then 0 when l.kind='sale' then l.quantity else -l.quantity end qty
        from sns_wholesale.sale_line_movements l where l.org_id=p_org and l.business_date between p_from and p_to
          and l.kind in ('sale','customer_return')
        union all
        select case p_section when 'by_model' then c.sku_id when 'by_customer' then c.party_id else c.rep_id end,
          0,c.egp,0 from sns_wholesale.cost_corrections c where c.org_id=p_org and c.business_date between p_from and p_to
      )
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select m.id,coalesce(p.name,r.name,k.model) as name,k.capacity,k.color,
          sum(net) net_sales,sum(cost) cogs,sum(qty) net_devices_sold,sum(net-cost) gross_profit
        from movements m left join sns_wholesale.skus k on p_section='by_model' and k.org_id=p_org and k.id=m.id
        left join sns_wholesale.parties p on p_section='by_customer' and p.org_id=p_org and p.id=m.id
        left join sns_wholesale.reps r on p_section='by_rep' and r.org_id=p_org and r.id=m.id
        where m.id is not null and (p_after is null or m.id>p_after)
        group by m.id,p.name,r.name,k.model,k.capacity,k.color order by m.id limit lim
      ) x;
    when 'sale_detail' then
      select jsonb_agg(to_jsonb(x) order by x.line_id,x.entry_id) into result from (
        select l.entry_id,l.line_id,l.number,l.kind,l.business_date,l.quantity,l.disposition,
          l.device_id,d.imei,d.imei2,k.model,k.capacity,k.color,p.name customer_name,r.name rep_name,l.net,l.cost,l.net-l.cost gross_profit,
          case when l.kind='sale' and d.last_sale_id=l.invoice_id then d.cost_egp end latest_device_cost,
          case when l.kind='sale' and d.last_sale_id=l.invoice_id then l.net-l.quantity*d.cost_egp end latest_gross_profit
        from sns_wholesale.sale_line_movements l
        join sns_wholesale.skus k on k.org_id=l.org_id and k.id=l.sku_id
        join sns_wholesale.parties p on p.org_id=l.org_id and p.id=l.party_id
        left join sns_wholesale.reps r on r.org_id=l.org_id and r.id=l.rep_id
        left join sns_wholesale.devices d on d.org_id=l.org_id and d.id=l.device_id
        where l.org_id=p_org and l.business_date between p_from and p_to and l.kind in ('sale','customer_return')
          and (p_after is null or l.line_id>p_after)
        order by l.line_id,l.entry_id limit lim+1
      ) x;
      -- A cursor is a line UUID. Keep its original and reversal in the same batch.
      if jsonb_array_length(result)>lim then
        if result->(lim-1)->>'line_id' is distinct from result->lim->>'line_id' then result:=result-lim; end if;
      end if;
    when 'suppliers' then
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select p.id,p.name,p.currency,coalesce(t.purchases,0) purchases,coalesce(t.credits,0) purchase_returns,
          coalesce(t.paid,0) payments,coalesce(t.balance,0) balance,coalesce(t.balance_egp,0) balance_egp,coalesce(f.fx,0) fx_loss
        from sns_wholesale.parties p
        left join lateral (
          select -sum(a.original) filter(where a.origin_kind='purchase' and a.business_date>=p_from) purchases,
            sum(a.original) filter(where a.origin_kind='supplier_return' and a.business_date>=p_from) credits,
            sum(a.original) filter(where a.origin_kind='payment' and a.business_date>=p_from) paid,
            -sum(a.original) balance,-sum(a.egp) balance_egp
          from (
            select a.*,coalesce(d.kind,a.kind) as origin_kind from sns_wholesale.account_activity a
            left join sns_wholesale.documents d on a.kind='reversal' and d.org_id=a.org_id and d.id=a.source_id
            where a.org_id=p.org_id and a.party_id=p.id and a.business_date<=p_to
          ) a
        ) t on true
        left join lateral (
          select sum(j.egp) fx from sns_wholesale.documents d join sns_wholesale.journal j
            on j.org_id=d.org_id and j.document_id=d.id and j.bucket='fx'
          where d.org_id=p.org_id and d.party_id=p.id and d.business_date between p_from and p_to
        ) f on true
        where p.org_id=p_org and p.kind='supplier' and (p_after is null or p.id>p_after)
        order by p.id limit lim
      ) x;
    when 'supplier_prices' then
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select k.id,k.model,k.capacity,k.color,
          (select jsonb_build_object('name',p.name,'cost_egp',round(l.cost_egp/l.qty,2),'date',d.business_date)
            from sns_wholesale.doc_lines l join sns_wholesale.documents d on d.org_id=l.org_id and d.id=l.document_id
            join sns_wholesale.parties p on p.org_id=d.org_id and p.id=d.party_id
            where l.org_id=k.org_id and l.sku_id=k.id and d.kind='purchase' and d.voided_by is null
              and d.business_date between p_from and p_to
            order by d.business_date desc,d.created_at desc,l.id desc limit 1) last_purchase,
          (select jsonb_build_object('name',p.name,'cost_egp',round(l.cost_egp/l.qty,2),'date',d.business_date)
            from sns_wholesale.doc_lines l join sns_wholesale.documents d on d.org_id=l.org_id and d.id=l.document_id
            join sns_wholesale.parties p on p.org_id=d.org_id and p.id=d.party_id
            where l.org_id=k.org_id and l.sku_id=k.id and d.kind='purchase' and d.voided_by is null
              and d.business_date between p_from and p_to
            order by l.cost_egp/l.qty,d.business_date desc,l.id limit 1) lowest_purchase
        from sns_wholesale.skus k where k.org_id=p_org and (p_after is null or k.id>p_after) order by k.id limit lim
      ) x;
    when 'inventory' then
      select jsonb_agg(to_jsonb(x) order by x.id) into result from (
        select k.id,k.model,k.capacity,k.color,k.kind,
          coalesce(d.available,0) available,coalesce(d.on_hand,0) device_on_hand,coalesce(a.qty,0) accessory_units,
          coalesce(d.stale_30,0) over_30_days,coalesce(d.stale_60,0) over_60_days,coalesce(d.stale_90,0) over_90_days,
          coalesce(d.book,0)+coalesce(a.book,0) value_egp
        from sns_wholesale.skus k
        left join lateral (
          select count(*) filter(where z.to_status='available' or (z.to_status='reserved' and z.reserved_until<=
            least(now(),((p_to+1)::timestamp at time zone 'Africa/Cairo')))) available,count(*) on_hand,
            count(*) filter(where p_to-z.acquired_on>30) stale_30,count(*) filter(where p_to-z.acquired_on>60) stale_60,
            count(*) filter(where p_to-z.acquired_on>90) stale_90,sum(z.cost_egp) book
          from (select distinct on (d.id) d.id,d.acquired_on,e.to_status,e.reserved_until,e.cost_egp
            from sns_wholesale.devices d join sns_wholesale.device_events e on e.org_id=d.org_id and e.device_id=d.id
            where d.org_id=k.org_id and d.sku_id=k.id and e.business_date<=p_to
            order by d.id,e.business_date desc,e.id desc) z where z.to_status in ('available','reserved','maintenance')
        ) d on k.kind='device'
        left join lateral (
          select sum(e.qty_delta) qty,sum(e.cost_delta) book from sns_wholesale.accessory_events e
          join sns_wholesale.documents doc on doc.org_id=e.org_id and doc.id=e.document_id
          where e.org_id=k.org_id and e.sku_id=k.id and doc.business_date<=p_to
        ) a on k.kind='accessory'
        where k.org_id=p_org and (p_after is null or k.id>p_after) order by k.id limit lim
      ) x;
    when 'health' then
      perform sns_wholesale.require_role(v_role,array['owner']);
      return sns_wholesale.health(p_org);
    else raise exception 'التقرير المطلوب غير متاح.';
  end case;
  return coalesce(result,'[]');
end;
$$;

create index if not exists sns_wholesale_line_catalog
  on sns_wholesale.doc_lines(org_id,sku_id,document_id);
create index if not exists sns_wholesale_accessory_catalog
  on sns_wholesale.accessory_events(org_id,sku_id,document_id);

create or replace function sns_wholesale.snapshot_tables()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'shops','lookups','warehouses','accounts','parties','reps','skus','prices','price_history','periods','counters',
    'quotes','documents','devices','imei_registry','accessory_stock','doc_lines','journal','device_events',
    'accessory_events','payments','checks','service_tickets','service_events','stocktakes','day_closes','return_links','audit','requests'
  ]::text[];
$$;
create or replace function public.sns_wholesale_backup(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare table_name text; segment jsonb; result jsonb:='{}'; id_order boolean;
begin
  perform sns_wholesale.require_role(sns_wholesale.actor_role(p_org),array['owner']);
  if not exists(select 1 from sns_wholesale.shops where org_id=p_org) then raise exception 'النشاط غير مهيأ.'; end if;
  foreach table_name in array sns_wholesale.snapshot_tables() loop
    select exists(select 1 from pg_catalog.pg_attribute
      where attrelid=format('sns_wholesale.%I',table_name)::regclass and attname='id' and attidentity<>'') into id_order;
    execute format('select coalesce(jsonb_agg(to_jsonb(t)%s),''[]''::jsonb) from sns_wholesale.%I t where t.org_id=$1',
      case when id_order then ' order by t.id' else '' end,table_name) into segment using p_org;
    result:=result||jsonb_build_object(table_name,segment);
  end loop;
  return jsonb_build_object('version',1,'org_id',p_org,'exported_at',now(),'tables',result);
end;
$$;

-- Invoker-rights database-owner operation. Use a trusted export and an empty module for the same org.
create or replace function sns_wholesale.restore_snapshot(p_org uuid,p_snapshot jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare table_name text; segment jsonb; column_list text; has_identity boolean; contains_foreign boolean; result jsonb;
begin
  if p_snapshot->>'version' is distinct from '1' or (p_snapshot->>'org_id')::uuid is distinct from p_org then
    raise exception 'النسخة الاحتياطية لازم تكون من نفس المنشأة وبنفس الإصدار.';
  end if;
  perform 1 from public.orgs where id=p_org for update;
  if not found then raise exception 'سجّل المنشأة الأصلية قبل الاسترجاع.'; end if;
  if exists(select 1 from sns_wholesale.shops where org_id=p_org) then
    raise exception 'الاسترجاع يحتاج قاعدة اختبار فيها المنشأة ووحدة جملة فارغة.';
  end if;
  foreach table_name in array sns_wholesale.snapshot_tables() loop
    segment:=p_snapshot->'tables'->table_name;
    if jsonb_typeof(segment) is distinct from 'array' then raise exception 'ملف النسخة الاحتياطية ناقص.'; end if;
    select exists(select 1 from jsonb_array_elements(segment) x where (x.value->>'org_id')::uuid is distinct from p_org)
      into contains_foreign;
    if contains_foreign then raise exception 'النسخة فيها سجلات من منشأة مختلفة.'; end if;
    select string_agg(quote_ident(attname),',' order by attnum) filter(where attidentity='' and attgenerated=''),
      coalesce(bool_or(attidentity<>''),false)
      into column_list,has_identity from pg_catalog.pg_attribute
      where attrelid=format('sns_wholesale.%I',table_name)::regclass and attnum>0 and not attisdropped;
    execute format('insert into sns_wholesale.%I (%s) select %s from jsonb_populate_recordset(null::sns_wholesale.%I,$1) t%s',
      table_name,column_list,column_list,table_name,case when has_identity then ' order by t.id' else '' end) using segment;
  end loop;
  result:=sns_wholesale.health(p_org);
  if not (result->>'ok')::boolean or not exists(select 1 from sns_wholesale.shops where org_id=p_org) then
    raise exception 'النسخة الاحتياطية غير متسقة: %',result;
  end if;
  return result;
end;
$$;

do $$
declare name text;
begin
  for name in select tablename from pg_catalog.pg_tables where schemaname='sns_wholesale' loop
    execute format('alter table sns_wholesale.%I enable row level security',name);
  end loop;
end;
$$;
revoke all on all tables in schema sns_wholesale from public,anon,authenticated,service_role;
revoke all on all sequences in schema sns_wholesale from public,anon,authenticated,service_role;
revoke all on all functions in schema sns_wholesale from public,anon,authenticated,service_role;
revoke all on schema sns_wholesale from public,anon,authenticated,service_role;
revoke all on function
  public.sns_wholesale_status(uuid),
  public.sns_wholesale_enable(uuid,boolean),
  public.sns_wholesale_command(uuid,uuid,text,jsonb),
  public.sns_wholesale_read(uuid,text,jsonb,int,uuid),
  public.sns_wholesale_report(uuid,date,date,text,int,uuid),
  public.sns_wholesale_backup(uuid)
  from public,anon,authenticated,service_role;
grant execute on function
  public.sns_wholesale_status(uuid),
  public.sns_wholesale_enable(uuid,boolean),
  public.sns_wholesale_command(uuid,uuid,text,jsonb),
  public.sns_wholesale_read(uuid,text,jsonb,int,uuid),
  public.sns_wholesale_report(uuid,date,date,text,int,uuid),
  public.sns_wholesale_backup(uuid)
  to authenticated;
notify pgrst, 'reload schema';
commit;
