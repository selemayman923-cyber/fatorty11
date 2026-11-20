const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const release = path.resolve(process.argv[2] || '.');
const { ids, createAccountingDatabase, asActor, applyBatch } = require(
  path.join(release, 'tools/accounting-postgres-fixture.js')
);

function record(kind, id, branch, fields = {}) {
  return {kind, local_id: id, base: null, data: { id, branch, ...fields }};
}

function write(db, actor, org, change) {
  return applyBatch(db, actor, org, {
    p_upserts: [change], p_deletes: [], p_settings: null,
    p_settings_base: null, p_batch: randomUUID()
  });
}

async function main() {
  const db = await createAccountingDatabase();
  try {
    const readOnlySql = fs.readFileSync(path.join(release, 'supabase/sns-release-preflight.sql'), 'utf8');
    const results = await db.exec(readOnlySql);
    assert.ok(results.some(result => result.rows.some(row => row.signature?.startsWith('sns_apply_changes_checked('))));
    console.log('PASS preflight, reference schema only');

    const seed = [
      [ids.owner, ids.mainShop, record('heldSales', 'qa-open-main', 'main')],
      [ids.owner, ids.mainShop, record('heldSales', 'qa-open-secondary', 'secondary')],
      [ids.owner, ids.mainShop, record('accounts', 'qa-finance-secondary', 'secondary', {name: 'QA ledger'})],
      [ids.otherOwner, ids.otherShop, record('heldSales', 'qa-other-shop', 'main')]
    ];
    for (const [actor, org, change] of seed) await write(db, actor, org, change);

    const roles = [
      ['owner', ids.owner, 'heldSales', 'secondary'],
      ['cashier', ids.cashier, 'heldSales', 'main'],
      ['inventory', ids.stockkeeper, 'stockTakes', 'main'],
      ['accountant', ids.accountant, 'accounts', 'secondary']
    ];
    for (const [label, actor, allowedKind, branch] of roles) {
      const rows = await asActor(db, actor, tx => tx.query(
        "select local_id from public.v2_records where local_id in ('qa-open-main', 'qa-open-secondary', 'qa-finance-secondary', 'qa-other-shop') order by local_id"
      ));
      const visible = rows.rows.map(row => row.local_id);
      assert.ok(visible.includes('qa-open-main'));
      assert.ok(!visible.includes('qa-other-shop'));
      const written = await write(db, actor, ids.mainShop, record(allowedKind, 'qa-write-' + label, branch));
      assert.equal(written.length, 1);
      await assert.rejects(write(db, actor, ids.otherShop, record(allowedKind, 'qa-foreign-' + label, branch)), err => err.code === '42501');
      console.log(JSON.stringify({role: label, visible, ownWrite: 'allowed', otherShopWrite: 'denied'}));
    }
    await assert.rejects(write(db, ids.cashier, ids.mainShop, record('heldSales', 'qa-register-secondary', 'secondary')), err => err.code === '42501');
    await assert.rejects(write(db, ids.stockkeeper, ids.mainShop, record('stockTakes', 'qa-stock-secondary', 'secondary')), err => err.code === '42501');
    await assert.rejects(write(db, ids.cashier, ids.mainShop, record('accounts', 'qa-register-ledger', 'main')), err => err.code === '42501');
    await assert.rejects(write(db, ids.stockkeeper, ids.mainShop, record('accounts', 'qa-stock-ledger', 'main')), err => err.code === '42501');
    console.log('PASS assigned branch and finance write restrictions for cashier and inventory');
    console.log('OBSERVATION fixture permits cross-branch and finance reads within the same shop; live grants and policies remain unverified.');
  } finally {
    await db.close();
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
