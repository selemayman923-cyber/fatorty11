-- ═══════════════════════════════════════════════════════════════════════
-- فاتورتي — إعادة بناء best-effort لجداول Supabase من استخدام index.html فقط
--
-- تحذير مهم: الملف ده اتبنى بقراءة كل sb.from(...) في الكود (select/eq/insert/upsert)،
-- من غير أي وصول فعلي لقاعدة البيانات الحقيقية (مفيش service-role key متاح).
-- يعني الأنواع (types)، القيم الافتراضية، الفهارس الدقيقة، والأعمدة اللي
-- مش بتتقرأ/تتكتب من الكلاينت (زي timestamps تلقائية) — كلها تخمين معقول، مش حقيقة مؤكدة.
--
-- قبل أي psql/Dashboard SQL editor run على مشروعك الحقيقي:
--   supabase db dump --schema public --file live_schema.sql
-- وقارنه بالملف ده. لو فيه فرق، الحقيقة هي live_schema.sql مش الملف ده.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────── Legacy v1 (لسه بيتقرأ منه read-only لهجرة الحسابات القديمة) ─────────
-- RECONSTRUCTED FROM CLIENT USAGE, NOT VERIFIED AGAINST LIVE DB
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);
-- ملاحظة: app_data (LEGACY_TABLE) مذكور كـ constant في الكود لكن مفيش استدعاء فعلي ليه —
-- tryMigrateLegacy() دايمًا بترجع null، فمعتبرينه dead code ومش هنعرّفه هنا.

-- ───────── v2 storage: سجل لكل record، بدل صف واحد ضخم للحساب كله ─────────
-- RECONSTRUCTED FROM CLIENT USAGE, NOT VERIFIED AGAINST LIVE DB
create table if not exists public.v2_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,        -- 'products' | 'sales' | ... (شوف V2_KINDS في index.html)
  local_id text not null,    -- الـ id المحلي اللي اتولد على الجهاز، قبل ما ياخد uuid من السيرفر
  data jsonb not null,
  updated_at timestamptz not null default now(),
  unique (org_id, kind, local_id)
);
create index if not exists v2_records_org_kind_idx on public.v2_records (org_id, kind);

create table if not exists public.v2_settings (
  org_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_backups (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ───────── Orgs / membership / invites ─────────
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'cashier',   -- 'manager' | 'cashier' | ... (شوف ROLE_VIEWS في index.html)
  email text,
  primary key (org_id, user_id)
);

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  email text not null,
  role text not null default 'cashier',
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- ───────── Subscriptions / plan limits ─────────
create table if not exists public.subscriptions (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  plan text not null default 'trial',
  status text not null default 'active',   -- 'active' | 'expired' | 'suspended' | 'cancelled' (تخمين)
  expires_at timestamptz,
  note text
);

create table if not exists public.plan_limits (
  plan text primary key,
  max_users int not null,
  max_products int not null,
  max_branches int not null
);

-- ───────── جديد بالكامل: error_logs — لبند "مراقبة أخطاء مركزية" ─────────
-- ده مصمّم من الصفر لسد فجوة رصدناها (مفيش أي إرسال أخطاء لسيرفر مركزي حاليًا)، فهو SQL كامل
-- وقابل للتنفيذ مباشرة (مش توثيق/عقد زي functions_contract.sql) — راجع policies.sql للـ RLS بتاعه.
create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  ts timestamptz not null default now(),
  source text not null,
  message text,
  context text,
  view text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists error_logs_org_ts_idx on public.error_logs (org_id, ts desc);
