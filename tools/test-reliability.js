const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

async function main() {
  const calls = [];
  let rpcError = null;
  const records = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => {},
    },
    from(table) {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: async (first, last) => ({ data: records.slice(first, last + 1) }),
        maybeSingle: async () => ({ data: { data: { settings: { company: 'SNS' }, seq: { sale: 5 } } } }),
      };
      assert.ok(['v2_records', 'v2_settings'].includes(table));
      return query;
    },
    async rpc(name, params) {
      calls.push({ name, params });
      return { error: rpcError, data: [] };
    },
  };
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), {
    url: 'https://sns.test',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.localStorage.setItem('fat_mode', 'online');
      window.supabase = { createClient: () => client };
    },
  });
  const evaluate = code => dom.window.eval(code);
  try {
    evaluate(`
      CURRENT_ORG='org-a';
      CURRENT_ROLE='manager';
      db.products=[{id:'raw',name:'Raw',qty:3},{id:'kit',name:'Kit',qty:0,components:[{pid:'raw',qty:2}]}];
    `);
    assert.equal(evaluate("posStockAvailable([{pid:'raw',qty:2},{pid:'kit',qty:1}])"), false);
    assert.equal(evaluate("posStockAvailable([{pid:'raw',qty:1},{pid:'kit',qty:1}])"), true);
    assert.equal(evaluate("posStockAvailable([{pid:'raw',qty:-1}])"), false);

    evaluate(`
      V2_SNAP={products:{gone:'{"id":"gone"}'}};
      V2_IDMAP={products:{gone:'cloud-gone'}};
    `);
    rpcError = Object.assign(new Error('temporary write failure'),{code:'PGRST000'});
    await assert.rejects(evaluate('syncV2()'), /temporary write failure/);
    assert.equal(evaluate('V2_IDMAP.products.gone'), 'cloud-gone');
    rpcError = null;
    await evaluate('syncV2()');
    assert.deepEqual(Array.from(calls.at(-1).params.p_deletes.map(entry=>entry.id)), ['cloud-gone']);
    assert.equal(evaluate('V2_IDMAP.products.gone'), undefined);

    records.push({ id: 'cloud-raw', kind: 'products', local_id: 'raw', data: { id: 'raw', name: 'Raw', qty: 2 } });
    evaluate(`
      db.products=[{id:'raw',name:'Raw',qty:3}];
      _rebuildProdIdx();
      db.settings={company:'SNS'};
      db.seq={sale:8};
      V2_SNAP={products:{raw:snapStr(db.products[0])},__settings:snapStr({settings:db.settings,seq:{sale:4}})};
      V2_IDMAP={products:{raw:'cloud-raw'}};
    `);
    const beforePull = calls.length;
    await evaluate('pullV2()');
    assert.equal(calls.length, beforePull);
    assert.equal(evaluate("findProduct('raw').qty"), 2);
    assert.equal(evaluate('V2_IDMAP.products.raw'), 'cloud-raw');
    assert.equal(evaluate('db.seq.sale'), 8);
    evaluate('db.products=[]');
    await evaluate('pullV2()');
    assert.equal(evaluate('db.products.length'), 0);
    await evaluate('syncV2()');
    assert.deepEqual(Array.from(calls.at(-1).params.p_deletes.map(entry=>entry.id)), ['cloud-raw']);

    evaluate(`
      CURRENT_UID='account-one';V2_READY=true;
      db.sales=[{id:'offline-invoice',no:6,date:'2026-11-01',total:55,items:[]}];
    `);
    rpcError = Object.assign(new Error('lost reply'),{code:'PGRST000'});
    await assert.rejects(evaluate('syncV2()'), /lost reply/);
    const firstBatch=calls.at(-1).params.p_batch;
    const firstPayload=JSON.stringify(calls.at(-1).params);
    evaluate("CURRENT_ORG='org-b'");
    assert.equal(evaluate('snsReadOutbox()'),null);
    evaluate("CURRENT_ORG='org-a';CURRENT_UID='another-account'");
    assert.equal(evaluate('snsReadOutbox()'),null);
    evaluate(`
      CURRENT_UID='account-one';V2_PENDING_BATCH=null;V2_SNAP={};V2_IDMAP={};db.sales=[];
    `);
    assert.equal(evaluate('snsResumeOutbox()'),true);
    assert.equal(evaluate('db.sales[0].id'),'offline-invoice');
    assert.equal(evaluate("snsInvoiceSyncBadge(db.sales[0]).includes('بانتظار المزامنة')"),true);
    rpcError=null;
    await evaluate('syncV2()');
    assert.equal(calls.at(-1).params.p_batch,firstBatch);
    assert.equal(JSON.stringify(calls.at(-1).params),firstPayload);
    for(let attempt=0;attempt<3&&evaluate('snsReadOutbox()');attempt++){
      evaluate('window._syncPending=false');
      await evaluate('syncV2()');
    }
    assert.equal(evaluate('snsReadOutbox()'),null);
    assert.equal(evaluate("snsInvoiceSyncBadge(db.sales[0]).includes('متزامنة')"),true);
    evaluate("V2_READY=false");

    const backup = evaluate(`snsBackupPayload({
      format:'sns-org-backup-v1',orgId:'org-a',settings:{company:'SNS'},seq:{sale:8},
      records:{transfers:[{id:'T1'}],promos:[{id:'P1'}],futureKind:[{id:'F1'}]}
    },'org-a')`);
    assert.equal(backup.transfers[0].id, 'T1');
    assert.equal(backup.promos[0].id, 'P1');
    assert.equal(backup.futureKind[0].id, 'F1');
    assert.equal(backup.products.length, 0);
    assert.equal(evaluate("snsBackupPayload({format:'sns-org-backup-v1',orgId:'org-b'},'org-a')"), null);
    evaluate('CURRENT_ORG=null; confirmBox=async()=>true; makeSnapshot=async()=>true; go=()=>{}');
    const file = new dom.window.File([JSON.stringify(backup)], 'sns-backup.json', { type: 'application/json' });
    dom.window.restoreFullBackup({ files: [file] });
    await new Promise((resolve, reject) => {
      const timeout = Date.now() + 1000;
      const timer = setInterval(() => {
        if (evaluate("db.transfers?.[0]?.id==='T1'")) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() > timeout) {
          clearInterval(timer);
          reject(new Error('Downloaded backup was not restored'));
        }
      }, 10);
    });
    assert.equal(evaluate('db.promos[0].id'), 'P1');
    assert.deepEqual(errors, []);
    process.stdout.write('PASS aggregate stock, failed deletion retry, outbox replay and isolation, pull merge, backup isolation and coverage\n');
  } finally {
    dom.window.close();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
