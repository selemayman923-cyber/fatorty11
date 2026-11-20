-- Read-only inventory of the actual environment. Contains no business rows or secrets.
BEGIN READ ONLY;

SELECT c.relname AS relation, c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select_grant,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select_grant,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert_grant,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update_grant,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete_grant
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('orgs','org_members','org_invites','v2_records','v2_settings',
                    'subscriptions','plan_limits','sns_org_backups','sns_transfer_reviews','sns_billing_history','sns_billing_reviewers')
ORDER BY relation;

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orgs','org_members','org_invites','v2_records','v2_settings',
                    'subscriptions','sns_org_backups')
ORDER BY tablename, policyname;

SELECT p.oid::regprocedure AS signature, p.prosecdef AS security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ensure_subscription','accept_my_invites','admin_list_orgs',
                    'activate_subscription','suspend_subscription','cancel_subscription',
                    'set_subscription_expiry','v2_apply_changes','sns_apply_changes_checked',
                    'sns_create_org_backup','sns_restore_org_backup','sns_review_transfer','sns_billing_start',
                    'sns_my_transfer_reviews','sns_billing_stop','sns_billing_shops','sns_can_review_billing')
ORDER BY p.proname, p.oid;

SELECT count(*) FILTER (WHERE s.org_id IS NULL) AS shops_without_subscription
FROM public.orgs o LEFT JOIN public.subscriptions s ON s.org_id=o.id;

SELECT plan::text,status::text,count(*) AS rows
FROM public.subscriptions GROUP BY plan,status ORDER BY plan,status;

COMMIT;
