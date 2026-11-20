const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ids, createAccountingDatabase, asActor, applyBatch } = require('./accounting-postgres-fixture');

const {randomUUID}=require('node:crypto');

const reviewer = '20000000-0000-4000-8000-000000000099';
const freshShop = '10000000-0000-4000-8000-000000000003';
const reviewSql = 'select public.sns_review_transfer($1,$2,$3,$4,$5,$6,$7) as receipt';
const actorQuery = (db, actor, sql, params) => asActor(db, actor, tx => tx.query(sql,params));
const review = (db, org, reference, amount, decision='accepted', months=1) =>
  actorQuery(db, reviewer, reviewSql,[org,'vodafone',reference,'starter',months,amount,decision])
    .then(({rows}) => rows[0].receipt);
const subscription = (db, org) =>
  db.query('select plan,status,expires_at from public.subscriptions where org_id=$1',[org]).then(({rows}) => rows[0]);

async function main() {
  const db = await createAccountingDatabase();
  try {
    await db.exec(`
      create table auth.users (id uuid primary key);
      create function public.ensure_subscription(uuid) returns void language plpgsql as $$ begin return; end $$;
      create function public.activate_subscription(uuid,text,int,text,text) returns void language plpgsql as $$ begin return; end $$;
    `);
    await db.query('insert into auth.users values ($1)',[reviewer]);
    const migration = await fs.readFile(path.join(__dirname,'..','supabase','sns-manual-billing.sql'),'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.query('insert into public.sns_billing_reviewers values ($1)',[reviewer]);
    await db.query('insert into public.plan_limits values ($1,1,2,25)', ['starter']);
    await db.query('insert into public.orgs(id,owner_id) values ($1,$2)',[freshShop,ids.owner]);
    await db.query("insert into public.org_members values ($1,$2,'manager',null)",[freshShop,ids.owner]);
    const start = actor => actorQuery(db,actor,'select public.sns_billing_start($1)',[freshShop]);
    await assert.rejects(start(ids.otherOwner),/SNS_BILLING_FORBIDDEN/);
    await Promise.all([start(ids.owner),start(ids.owner)]);
    const initial = await subscription(db,freshShop);
    assert.equal(initial.status,'trialing');
    const days = (initial.expires_at.getTime()-Date.now())/86400000;
    assert.ok(days>13.99&&days<=14);
    await start(ids.owner);
    assert.deepEqual(await subscription(db,freshShop),initial);

    for(const role of [ids.owner,ids.cashier,ids.accountant,ids.stockkeeper,ids.otherOwner]){
      await assert.rejects(actorQuery(db,role,reviewSql,[freshShop,'vodafone','ABC-123','starter',1,299,'accepted']),/SNS_BILLING_FORBIDDEN/);
      await assert.rejects(actorQuery(db,role,'select * from public.sns_billing_shops()'),/SNS_BILLING_FORBIDDEN/);
      await assert.rejects(actorQuery(db,role,'select public.sns_billing_stop($1,$2)',[freshShop,'cancelled']),/SNS_BILLING_FORBIDDEN/);
    }
    await assert.rejects(actorQuery(db,ids.owner,'select public.ensure_subscription($1)',[freshShop]),/permission denied/);
    await assert.rejects(actorQuery(db,ids.owner,'select public.activate_subscription($1,$2,$3,$4,$5)',[freshShop,'starter',1,'test','test']),/permission denied/);
    await assert.rejects(actorQuery(db,ids.owner,'select * from public.sns_transfer_reviews'),/permission denied/);
    await assert.rejects(review(db,freshShop,'1234',299),/SNS_BILLING_INVALID/);
    await assert.rejects(review(db,freshShop,'REAL-001',298.99),/SNS_BILLING_AMOUNT_MISMATCH/);
    const rejected = await review(db,freshShop,'BAD-001',1,'rejected');
    assert.equal(rejected.decision,'rejected');
    assert.deepEqual(await subscription(db,freshShop),initial);

    const attempts = await Promise.all([
      review(db,freshShop,'Real-٠٠١',299),
      review(db,freshShop,' real-001 ',299),
    ]);
    assert.deepEqual(attempts.map(entry=>entry.replayed).sort(),[false,true]);
    assert.equal(attempts[0].expires_at,attempts[1].expires_at);
    const active = await subscription(db,freshShop);
    assert.equal(active.status,'active');
    assert.equal(active.expires_at.getTime(),Date.parse(attempts[0].expires_at));
    await assert.rejects(review(db,ids.otherShop,'REAL-001',299),/sns_transfer_accepted_once/);
    await assert.rejects(review(db,freshShop,'REAL-001',299,'rejected'),/SNS_BILLING_REVIEW_EXISTS/);

    const receipts = await actorQuery(db,ids.owner,'select * from public.sns_my_transfer_reviews($1)',[freshShop]);
    assert.deepEqual(receipts.rows.map(row=>row.decision).sort(),['accepted','rejected']);
    for(const role of [ids.otherOwner,ids.cashier,ids.accountant,ids.stockkeeper]){
      await assert.rejects(actorQuery(db,role,'select * from public.sns_my_transfer_reviews($1)',[freshShop]),/SNS_BILLING_FORBIDDEN/);
    }

    const renewed = await review(db,freshShop,'REAL-002',1614.60,'accepted',6);
    const expected = await db.query("select $1::timestamptz + interval '6 months' as expiry",[attempts[0].expires_at]);
    assert.equal(Date.parse(renewed.expires_at),expected.rows[0].expiry.getTime());
    await db.query("update public.subscriptions set expires_at=now()-interval '1 minute' where org_id=$1",[freshShop]);
    const expired = await subscription(db,freshShop);
    await start(ids.owner);
    assert.deepEqual(await subscription(db,freshShop),expired);
    await actorQuery(db,reviewer,'select public.sns_billing_stop($1,$2)',[freshShop,'cancelled']);
    await start(ids.owner);
    assert.equal((await subscription(db,freshShop)).status,'cancelled');
    const sync=()=>applyBatch(db,ids.owner,freshShop,{p_upserts:[],p_deletes:[],p_settings:null,p_settings_base:null,p_batch:randomUUID()});
    await assert.rejects(sync(),/SUB_EXPIRED/);
    const retry = await review(db,freshShop,'REAL-002',1614.60,'accepted',6);
    assert.equal(retry.replayed,true);
    assert.equal((await subscription(db,freshShop)).status,'cancelled');
    await db.query('delete from public.subscriptions where org_id=$1',[freshShop]);
    await start(ids.owner);
    assert.equal(await subscription(db,freshShop),undefined);
    await assert.rejects(sync(),/SUB_EXPIRED/);
    assert.equal((await actorQuery(db,ids.owner,'select * from public.sns_my_transfer_reviews($1)',[freshShop])).rows.length,3);
    await actorQuery(db,reviewer,'select * from public.sns_billing_shops()');
    console.log('PASS manual transfer approval, rejection, exact amount, owner receipt, duplicate references, renewal, cancellation, expiry and trial history');
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error(error); process.exitCode=1; });
