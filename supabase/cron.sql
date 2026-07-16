-- ═══════════════════════════════════════════════════════════════════════
-- فاتورتي — جدولة daily-backup Edge Function يوميًا عبر pg_cron + pg_net
--
-- المتطلبات (Dashboard → Database → Extensions):
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- استبدل <PROJECT_REF> و <SERVICE_ROLE_KEY> و <BACKUP_FUNCTION_SECRET> بالقيم الحقيقية
-- بتاعتك قبل التنفيذ. BACKUP_FUNCTION_SECRET لازم يبقى نفس القيمة المضبوطة كـ env var
-- على الـ Edge Function نفسها (supabase secrets set BACKUP_FUNCTION_SECRET=...).
-- ═══════════════════════════════════════════════════════════════════════

select cron.schedule(
  'fatorty-daily-backup',      -- job name
  '0 2 * * *',                 -- كل يوم الساعة 2 صباحًا UTC
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/daily-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'x-backup-secret', '<BACKUP_FUNCTION_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- لإلغاء الجدولة لاحقًا:
-- select cron.unschedule('fatorty-daily-backup');

-- لمراجعة آخر تشغيلات الـ job:
-- select * from cron.job_run_details where jobname = 'fatorty-daily-backup' order by start_time desc limit 20;
