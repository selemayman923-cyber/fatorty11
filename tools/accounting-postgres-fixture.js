const fs = require('node:fs/promises');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const ids = {
  mainShop: '10000000-0000-4000-8000-000000000001',
  otherShop: '10000000-0000-4000-8000-000000000002',
  owner: '20000000-0000-4000-8000-000000000001',
  accountant: '20000000-0000-4000-8000-000000000002',
  cashier: '20000000-0000-4000-8000-000000000003',
  secondCashier: '20000000-0000-4000-8000-000000000004',
  otherOwner: '20000000-0000-4000-8000-000000000005',
  stockkeeper: '20000000-0000-4000-8000-000000000006',
};

async function createAccountingDatabase({ migrate = true } = {}) {
  const pg = new PGlite();
  try {
    // Reproduce the tables and auth contract that the migrations consume.
    await pg.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as
        $$ select current_setting('role',true) $$;
      create table public.orgs (id uuid primary key, owner_id uuid not null, name text not null default 'Test shop');
      create table public.org_members (
        org_id uuid not null references public.orgs(id), user_id uuid not null,
        role text not null, branch_id text, primary key (org_id,user_id)
      );
      create table public.v2_records (
        id uuid primary key default gen_random_uuid(), user_id uuid, org_id uuid references public.orgs(id),
        kind text not null, local_id text, data jsonb not null, updated_at timestamptz not null default now()
      );
      create table public.v2_settings (
        user_id uuid primary key, org_id uuid references public.orgs(id),
        data jsonb not null, updated_at timestamptz not null default now()
      );
      create table public.subscriptions (org_id uuid references public.orgs(id), plan text, status text, expires_at timestamptz);
      create table public.plan_limits (plan text primary key, max_branches int, max_users int, max_products int);
      insert into public.plan_limits values ('trial',10,20,5000);
      create function public.org_plan(uuid) returns text language sql as $$ select 'trial'::text $$;
      create function public.org_max_products(uuid) returns int language sql as $$ select 5000 $$;
      create function public.v2_apply_changes(uuid,jsonb,uuid[],jsonb) returns void language plpgsql as
        $$ begin return; end $$;
      alter table public.orgs enable row level security;
      alter table public.org_members enable row level security;
      alter table public.v2_records enable row level security;
      alter table public.v2_settings enable row level security;
      grant select, insert, update, delete on public.v2_records, public.v2_settings to authenticated;
      grant select on public.orgs, public.org_members, public.subscriptions, public.plan_limits to authenticated;
      alter table public.subscriptions enable row level security;
      create policy fixture_subscription_access on public.subscriptions for select to authenticated using (
        exists (select 1 from public.org_members m where m.org_id = subscriptions.org_id)
      );
      create policy fixture_self_membership on public.org_members for select to authenticated using (user_id = auth.uid());
      create policy fixture_org_access on public.orgs for select to authenticated using (
        owner_id = auth.uid() or exists (select 1 from public.org_members m where m.org_id = orgs.id)
      );
      create policy fixture_records_access on public.v2_records for select to authenticated using (
        exists (select 1 from public.org_members m where m.org_id = v2_records.org_id)
      );
      create policy fixture_settings_access on public.v2_settings for select to authenticated using (
        exists (select 1 from public.org_members m where m.org_id = v2_settings.org_id)
      );
    `);
    if (migrate) {
      for (const filename of ['org-sync-staging.sql', 'org-accounting-period-lock.sql', 'org-backups.sql']) {
        await pg.exec(await fs.readFile(path.join(__dirname, '..', 'supabase', filename), 'utf8'));
      }
    }
    await pg.query('insert into public.orgs (id,owner_id) values ($1,$2),($3,$4)', [
      ids.mainShop, ids.owner, ids.otherShop, ids.otherOwner,
    ]);
    await pg.query(`insert into public.org_members values
      ($1,$2,'manager',null),($1,$3,'accountant',null),($1,$4,'cashier','main'),
      ($1,$5,'cashier','main'),($6,$7,'manager',null),($1,$8,'stockkeeper','main')`, [
      ids.mainShop, ids.owner, ids.accountant, ids.cashier, ids.secondCashier, ids.otherShop, ids.otherOwner, ids.stockkeeper,
    ]);
    await pg.query(`insert into public.subscriptions (org_id, plan, status, expires_at)
      values ($1,'trial','active','2027-12-31T23:59:59Z'),($2,'trial','active','2027-12-31T23:59:59Z')`,
      [ids.mainShop, ids.otherShop]);
    return pg;
  } catch (error) {
    await pg.close();
    throw error;
  }
}

async function asActor(pg, actor, operation) {
  return pg.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
    return operation(tx);
  });
}

function applyBatch(pg, actor, where, request) {
  return asActor(pg, actor, async tx => {
    const result = await tx.query(`
      select * from public.sns_apply_changes_checked(
        $1::uuid,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::uuid
      )
    `, [
      where, JSON.stringify(request.p_upserts), JSON.stringify(request.p_deletes),
      request.p_settings ? JSON.stringify(request.p_settings) : null,
      request.p_settings_base ? JSON.stringify(request.p_settings_base) : null,
      request.p_batch,
    ]);
    return result.rows;
  });
}

module.exports = { ids, createAccountingDatabase, asActor, applyBatch };
