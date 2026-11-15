-- Enable pg_cron, pg_net and Vault. Add these secrets in the Vault dashboard:
-- sns_project_url = https://<project-ref>.supabase.co
-- sns_backup_secret = the same value as BACKUP_FUNCTION_SECRET on daily-backup.
-- Apply org-backups.sql and deploy daily-backup with --no-verify-jwt first.
select cron.schedule(
  'fatorty-daily-backup',
  '0 2 * * *',
  $$
  select net.http_post(
    url := rtrim(project.decrypted_secret, '/') || '/functions/v1/daily-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-backup-secret', secret.decrypted_secret
    ),
    body := '{}'::jsonb
  )
  from vault.decrypted_secrets project
  cross join vault.decrypted_secrets secret
  where project.name = 'sns_project_url' and secret.name = 'sns_backup_secret';
  $$
);
