-- ═══════════════════════════════════════════════════════════════════════
-- فاتورتي — RLS policies
--
-- تحذير: نفس تحذير schema.sql — الجداول الموجودة فعليًا (v2_records, v2_settings,
-- v2_backups, orgs, org_members, org_invites, subscriptions, plan_limits) الـ RLS
-- بتاعها هنا best-effort مبني على النمط اللي الكود نفسه بيوصفه (عزل بالـ org_id/user_id،
-- وتعليق "3. عزل البيانات ... Row Level Security" في شاشة الخصوصية داخل index.html).
-- الـ policy الحقيقية بتاعت الجداول دي شغالة بالفعل على مشروعك — الملف ده مرجع/توثيق
-- لمقارنته بيها، مش استبدال لها. جدول error_logs بس هو الجديد الكامل والمقصود ينفّذ فعليًا.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────── user_data (legacy, read-only من الكلاينت) ─────────
alter table public.user_data enable row level security;
drop policy if exists user_data_owner_select on public.user_data;
create policy user_data_owner_select on public.user_data
  for select using (auth.uid() = user_id);
-- مفيش insert/upsert policy عمدًا — الكود بيقرأ منه بس ("old shared supaSet removed").

-- ───────── v2_records / v2_settings ─────────
-- ملاحظة: الكود مش بيعمل insert/update/delete مباشر على v2_records — كل الكتابة عن طريق
-- RPC (v2_apply_changes) اللي المفروض تبقى SECURITY DEFINER وتتحقق من العضوية والحدود
-- (PRODUCT_LIMIT بالفعل ظاهر من رسائل الخطأ في الكود). الـ SELECT مباشر من الكلاينت.
alter table public.v2_records enable row level security;
drop policy if exists v2_records_org_member_select on public.v2_records;
create policy v2_records_org_member_select on public.v2_records
  for select using (
    exists (select 1 from public.org_members m where m.org_id = v2_records.org_id and m.user_id = auth.uid())
  );

alter table public.v2_settings enable row level security;
drop policy if exists v2_settings_org_member_select on public.v2_settings;
create policy v2_settings_org_member_select on public.v2_settings
  for select using (
    exists (select 1 from public.org_members m where m.org_id = v2_settings.org_id and m.user_id = auth.uid())
  );

-- ───────── v2_backups ─────────
alter table public.v2_backups enable row level security;
drop policy if exists v2_backups_owner_all on public.v2_backups;
create policy v2_backups_owner_all on public.v2_backups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────── orgs / org_members / org_invites ─────────
alter table public.orgs enable row level security;
drop policy if exists orgs_member_select on public.orgs;
create policy orgs_member_select on public.orgs
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from public.org_members m where m.org_id = orgs.id and m.user_id = auth.uid())
  );
drop policy if exists orgs_owner_insert on public.orgs;
create policy orgs_owner_insert on public.orgs
  for insert with check (owner_id = auth.uid());

alter table public.org_members enable row level security;
drop policy if exists org_members_org_select on public.org_members;
create policy org_members_org_select on public.org_members
  for select using (
    exists (select 1 from public.org_members m2 where m2.org_id = org_members.org_id and m2.user_id = auth.uid())
  );

alter table public.org_invites enable row level security;
drop policy if exists org_invites_manager_all on public.org_invites;
create policy org_invites_manager_all on public.org_invites
  for all using (
    exists (
      select 1 from public.org_members m
      where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role = 'manager'
    )
  );

-- ───────── subscriptions / plan_limits ─────────
-- ملاحظة مهمة (اتلاحظت أثناء الفحص): مفيش أي error pattern زي SUB_EXPIRED بيتمسك في الكود
-- (بعكس PRODUCT_LIMIT اللي فعليًا بيتحقق منه سيرفر-سايد) — يعني احتمال إن انتهاء الاشتراك
-- بيتفرض كلاينت-ترست بس (enforceSubLock/renderSubBanner هي UI overlay قابلة للتخطي من DevTools).
-- ده تحسين يستاهل مراجعة منفصلة على الـ RPC الحقيقية، مش جزء من الخطة دي — مجرد ملاحظة.
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_org_member_select on public.subscriptions;
create policy subscriptions_org_member_select on public.subscriptions
  for select using (
    exists (select 1 from public.org_members m where m.org_id = subscriptions.org_id and m.user_id = auth.uid())
  );

alter table public.plan_limits enable row level security;
drop policy if exists plan_limits_authenticated_select on public.plan_limits;
create policy plan_limits_authenticated_select on public.plan_limits
  for select using (auth.role() = 'authenticated');

-- ───────── error_logs (جديد بالكامل — append-only telemetry) ─────────
-- INSERT بس من مستخدم مسجّل على org بتاعه، مفيش SELECT من الكلاينت خالص (الأخطاء تتقرا من
-- Dashboard/SQL editor بس من صاحب المشروع) — عشان منمنعش المستخدمين من قراءة أخطاء بعض.
alter table public.error_logs enable row level security;
drop policy if exists error_logs_member_insert on public.error_logs;
create policy error_logs_member_insert on public.error_logs
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.org_members m where m.org_id = error_logs.org_id and m.user_id = auth.uid())
  );
