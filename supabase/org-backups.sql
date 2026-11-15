-- Apply on a staging copy of SNS after confirming the live table definitions.
begin;

create table if not exists public.sns_org_backups (
  org_id uuid not null references public.orgs(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  data jsonb not null,
  primary key (org_id, day)
);

alter table public.sns_org_backups enable row level security;
revoke all on public.sns_org_backups from public, anon, authenticated;
grant select on public.sns_org_backups to authenticated;
grant select, insert, update on public.sns_org_backups to service_role;

drop policy if exists sns_org_backups_owner_read on public.sns_org_backups;
create policy sns_org_backups_owner_read on public.sns_org_backups
  for select to authenticated using (
    exists (
      select 1 from public.orgs
      where orgs.id = sns_org_backups.org_id and orgs.owner_id = (select auth.uid())
    )
  );

-- Both the rows and the settings are read in one statement, so the backup
-- cannot mix pages from different points in time.
create or replace function public.sns_create_org_backup(p_org uuid)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  backup_day date := (statement_timestamp() at time zone 'UTC')::date;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not exists (
      select 1 from public.orgs where id = p_org and owner_id = auth.uid()
    ) then
    raise exception 'SNS_BACKUP_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.sns_org_backups (org_id, day, created_at, data)
  select o.id, backup_day, statement_timestamp(),
    jsonb_build_object(
      'format', 'sns-org-backup-v1',
      'orgId', o.id,
      'settings', coalesce(s.data->'settings', '{}'::jsonb),
      'seq', coalesce(s.data->'seq', '{}'::jsonb),
      'budgets', coalesce(s.data->'budgets', '{}'::jsonb),
      'bankRecon', coalesce(s.data->'bankRecon', '{}'::jsonb),
      'records', coalesce((
        select jsonb_object_agg(grouped.kind, grouped.items)
        from (
          select r.kind, jsonb_agg(r.data order by r.local_id) as items
          from public.v2_records r
          where r.org_id = o.id
          group by r.kind
        ) grouped
      ), '{}'::jsonb)
    )
  from public.orgs o
  left join public.v2_settings s on s.org_id = o.id
  where o.id = p_org
  on conflict (org_id, day) do update set
    data = excluded.data, created_at = excluded.created_at
  where public.sns_org_backups.created_at <= excluded.created_at;

  if not found and not exists (select 1 from public.orgs where id = p_org) then
    raise exception 'SNS_BACKUP_ORG_NOT_FOUND' using errcode = '22023';
  end if;
  return backup_day;
end;
$$;

revoke all on function public.sns_create_org_backup(uuid) from public, anon;
grant execute on function public.sns_create_org_backup(uuid) to authenticated, service_role;
commit;
