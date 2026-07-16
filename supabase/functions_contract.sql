-- ═══════════════════════════════════════════════════════════════════════
-- فاتورتي — عقد (contract) توثيقي بس للـ RPC functions الموجودة فعليًا على مشروع Supabase
--
-- ‼️ DO NOT DEPLOY BLINDLY ‼️
-- الملف ده مفيهوش CREATE FUNCTION حقيقي، ومفيش منطق (logic) اتخمّن. ده توثيق للـ signature
-- والسلوك المتوقع بس، مبني على قراءة كل استدعاءات sb.rpc(...) في index.html وإزاي الكود
-- بيتعامل مع النتيجة/الأخطاء الراجعة. لو حد لصق CREATE OR REPLACE FUNCTION حقيقية هنا وشغّلها،
-- هيدهس النسخة الشغالة فعليًا في الإنتاج بمنطق متخيّل ممكن يكون غلط (خصوصًا v2_apply_changes
-- اللي بيطبّق التغييرات atomically وبيتحقق فعليًا من PRODUCT_LIMIT سيرفر-سايد).
--
-- لجلب الـ body الحقيقي: supabase db dump --schema public (أو Dashboard → Database → Functions).
-- ═══════════════════════════════════════════════════════════════════════

-- v2_apply_changes(p_org uuid, p_upserts jsonb[], p_delete_ids uuid[], p_settings jsonb)
--   → table(out_kind text, out_local_id text, out_id uuid)
--   بيطبّق كل التغييرات (upserts + deletes + settings) في transaction واحدة atomic.
--   مؤكد من الكود (index.html) إنها بترفع exception بالشكل 'PRODUCT_LIMIT:<used>/<max>'
--   لو الحساب تخطى plan_limits.max_products — يعني إنفاذ حقيقي سيرفر-سايد، مش كلاينت-ترست.
--   مش واضح من الكود لو فيه إنفاذ مماثل لـ max_users / max_branches أو انتهاء الاشتراك
--   (SUB_EXPIRED-style) — الكود مبيمسكش أي error pattern زي كده، يستاهل تأكيد يدوي.

-- ensure_subscription(p_org uuid) → void
--   بتنشئ/تتأكد من صف subscriptions للـ org (على الأرجح trial 14 يوم أول مرة).

-- accept_my_invites() → void
--   بتحوّل أي صفوف org_invites بمطابقة إيميل المستخدم الحالي لصفوف org_members.

-- admin_list_orgs() → table(id uuid, name text, owner_email text, ...)
--   قائمة كل المحلات لصاحب الصلاحية الإدارية بس (على الأرجح SECURITY DEFINER بيتحقق من
--   إيميل الأدمن سيرفر-سايد — الكود بيعمل client-side IS_ADMIN check منفصل ومقارنته
--   بإيميل واحد hardcoded، وده لازم يتأكد إنه مش الاعتماد الوحيد).

-- activate_subscription(p_org uuid, p_plan text, p_months int, p_note text, p_affiliate text) → void
-- suspend_subscription(p_org uuid) → void
-- cancel_subscription(p_org uuid) → void
-- set_subscription_expiry(p_org uuid, p_expires timestamptz) → void
--   عمليات إدارية على جدول subscriptions — أدمن بس.

-- admin_list_affiliates() → table(id uuid, name text, code text, percent numeric, phone text, shops int, commission numeric)
-- upsert_affiliate(p_id uuid, p_name text, p_code text, p_percent numeric, p_phone text) → void
--   (الكود بيتحقق من رسالة خطأ فيها 'duplicate' — يبدو إن fيه unique constraint على code)
-- delete_affiliate(p_id uuid) → void

-- fat_check_blocked(p_device text, p_key text) → boolean
--   RPC اختياري لنظام تفعيل التراخيص الأوفلاين (منفصل تمامًا عن نظام orgs/subscriptions).
--   الكود نفسه بيشير لملف SQL مرافق اسمه supabase-license-blocking.sql غير موجود في أي
--   نسخة من الـ repo وصلتنا — يعني حتى لو الدالة دي موجودة فعليًا، schema-ها غير موثّق خالص.
--   ملاحظة أوسع (خارج نطاق خطة الـ reliability دي): نظام التراخيص الأوفلاين (FATP-/FATM-/FATY-)
--   معتمد كليًا على سر client-side مُعتّم بـ XOR بسيط (الكود نفسه بيقول "ده مش تشفير قوي")،
--   يعني سهل الالتفاف حوله بإعادة هندسة الكود — قرار بزنس/anti-piracy، مش مُعالج هنا.
