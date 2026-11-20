const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { JSDOM, VirtualConsole } = require('jsdom');
const { ids, createAccountingDatabase, asActor, applyBatch } = require('./accounting-postgres-fixture');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function createShopApp(pg, actor, role) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  let businessDay = '2026-10-01';
  let lostReply = false;
  let cloudReadError = null;
  let lastBatch;
  const sentBatches = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => {},
    },
    from(table) {
      let filter;
      const select = {
        select: () => select,
        eq(column, value) { assert.equal(column, table === 'plan_limits' ? 'plan' : 'org_id'); filter = value; return select; },
        order() { return select; },
        async range(first, last) {
          assert.equal(table, 'v2_records');
          if (cloudReadError) return { error: cloudReadError };
          return asActor(pg, actor, async tx => ({ data: (await tx.query(
            'select id,kind,local_id,data from public.v2_records where org_id=$1 order by id limit $2 offset $3',
            [filter, last - first + 1, first],
          )).rows }));
        },
        async maybeSingle() {
          const query = {
            v2_settings: 'select data from public.v2_settings where org_id=$1',
            subscriptions: 'select plan,status,expires_at from public.subscriptions where org_id=$1',
            plan_limits: 'select max_users,max_products,max_branches from public.plan_limits where plan=$1',
          }[table];
          assert.ok(query, 'Unexpected table: ' + table);
          return asActor(pg, actor, async tx => ({ data: (await tx.query(query, [filter])).rows[0] }));
        },
      };
      return select;
    },
    async rpc(name, request) {
      assert.equal(name, 'sns_apply_changes_checked');
      try {
        lastBatch = JSON.parse(JSON.stringify(request));
        sentBatches.push(lastBatch.p_batch);
        const data = await applyBatch(pg, actor, request.p_org, request);
        if(lostReply){
          lostReply=false;
          return { error: Object.assign(new Error('reply lost after commit'), { code: 'PGRST000' }) };
        }
        return { data };
      } catch (error) {
        return { error };
      }
    },
  };
  const dom = new JSDOM(html, {
    url: 'https://accounting.sns.test',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.localStorage.setItem('fat_mode', 'online');
      window.supabase = { createClient: () => client };
      window.scrollTo = () => {};
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      window.Date = class FixedDate extends Date {
        constructor(...args) {
          super(...(args.length ? args : [businessDay + 'T12:00:00']));
        }
        static now() { return new FixedDate().getTime(); }
      };
    },
  });
  const { window } = dom;
  const evalJs = code => window.eval(code);
  const call = (fn, arg) => evalJs('(' + fn.toString() + ')(' + JSON.stringify(arg) + ')');
  call(({ actor, role, org }) => {
    CURRENT_UID = actor;
    CURRENT_ORG = org;
    CURRENT_ROLE = role;
    V2_READY = true;
    db.settings.role = role;
    db.settings.company = 'SNS close test';
    db.settings.vat = 0;
    db.settings.cashierMustShift = false;
    db.settings.autoPrintReceipt = false;
    db.settings.waAutoReceipt = false;
    db.branches = [{ id: 'main', name: 'الرئيسي' }];
    db.settings.activeBranch = 'main';
    confirmBox = async () => true;
    fatAskAccount = async () => 'cash';
  }, { actor, role, org: ids.mainShop });

  async function sync() {
    await evalJs('syncV2()');
    assert.equal(evalJs('snsReadOutbox()'), null, 'sync left unsent changes');
  }

  async function hydrateFromDatabase() {
    const rows = await asActor(pg, actor, async tx => (
      await tx.query('select kind,local_id,id,data from public.v2_records where org_id=$1', [ids.mainShop])
    ).rows);
    const settings = await asActor(pg, actor, async tx => (
      await tx.query('select data from public.v2_settings where org_id=$1', [ids.mainShop])
    ).rows[0]?.data);
    call(({ rows, settings }) => {
      V2_SNAP = {};
      V2_IDMAP = {};
      for (const kind of V2_KINDS) db[kind] = [];
      for (const record of rows) {
        if (!V2_KINDS.includes(record.kind)) continue;
        db[record.kind].push(record.data);
        (V2_SNAP[record.kind] ||= {})[record.local_id] = snapStr(record.data);
        (V2_IDMAP[record.kind] ||= {})[record.local_id] = record.id;
      }
      for (const key of V2_SETTINGS_KEYS) if (settings?.[key] !== undefined) db[key] = settings[key];
      if (settings) V2_SNAP.__settings = snapStr(settings);
      db.settings.role = CURRENT_ROLE;
      migrate();
      _rebuildProdIdx();
      _rebuildCustIdx();
    }, { rows, settings });
  }

  function setInput(id, value) {
    const input = window.document.getElementById(id);
    assert.ok(input, id);
    input.value = String(value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  return {
    window, evalJs, call, sync, hydrateFromDatabase, setInput, errors, sentBatches,
    batch() { return lastBatch; },
    loseReply() { lostReply = true; },
    cloudFailure(error) { cloudReadError = error; },
    online(value) { Object.defineProperty(window.navigator, 'onLine', { value }); },
    day(value) { businessDay = value; },
    async pay(action, arg, amount, account = 'cash') {
      call(({ amount, account }) => { promptBox = async () => amount; fatAskAccount = async () => account; }, { amount, account });
      await call(action, arg);
    },
    close() { window.close(); },
  };
}

async function assertMonthEnd(app, cutoff, expected) {
  const actual = app.call(({ cutoff }) => {
    const tb = fatTrialBalance('', cutoff);
    const balance = code => {
      const name = snsAccountLabel(code);
      const row = tb.rows.find(r => r.name === name);
      return r2((row?.balDebit || 0) - (row?.balCredit || 0));
    };
    const statements = fatFinStatements('', cutoff);
    return {
      cash: r2(cashBalance()), bank: r2(bankBalance(db.banks[0].id)),
      customers: r2(db.customers.reduce((total, party) => total + party.balance, 0)),
      suppliers: r2(db.suppliers.reduce((total, party) => total + party.balance, 0)),
      stock: r2(db.products.reduce((total, item) => total + item.qty * item.cost, 0)),
      stockAtBranch: fatBQOf(db.products[0], 'main'),
      ledgerCash: balance('1100'), ledgerBank: balance('bank:' + db.banks[0].id),
      ledgerCustomers: balance('1300'), ledgerSuppliers: -balance('2100'),
      ledgerStock: balance('1400'), income: r2(statements.netProfit),
      balanceSheet: statements.balanced, trialBalance: tb.balanced,
    };
  }, { cutoff });
  const values = JSON.parse(JSON.stringify(actual));
  assert.deepEqual(values, {
    ...expected,
    ledgerCash: expected.cash, ledgerBank: expected.bank,
    ledgerCustomers: expected.customers, ledgerSuppliers: expected.suppliers, ledgerStock: expected.stock,
    balanceSheet: true, trialBalance: true,
  });
  return values;
}

function assertStatements(app, cutoff, customer, supplier) {
  const balances = app.call(date => {
    const balance = (kind, party) => r2(snsPartyStatementRows(kind, party)
      .filter(row => row.date <= date).reduce((sum, row) => sum + row.debit - row.credit, 0));
    return [balance('customer', findCustomer('customer')), -balance('supplier', findSupplier('supplier'))];
  }, cutoff);
  assert.deepEqual(Array.from(balances), [customer, supplier]);
}

async function monthEnd(pg) {
  const app = createShopApp(pg, ids.owner, 'manager');
  try {
    app.call(() => {
      db.products = [{ id: 'cloth', name: 'قماش', itemType: 'simple', cost: 10, price: 25, qty: 0 }];
      db.suppliers = [{ id: 'supplier', name: 'مورد', balance: 0 }];
      db.customers = [{ id: 'customer', name: 'عميل', balance: 0 }];
      _rebuildProdIdx();
      _rebuildCustIdx();
      cashForm('in');
    });
    app.setInput('c_offset', '3100');
    app.setInput('c_amt', 500);
    app.evalJs("saveCash('in');bankForm()");
    app.setInput('bk_name', 'بنك المحل');
    app.setInput('bk_open', 100);
    app.evalJs('saveBank()');
    await app.sync();

    app.day('2026-10-04');
    app.call(() => { invoiceForm('purchase', null, 'supplier'); invLines = [{ pid: 'cloth', qty: 20, price: 10 }]; });
    app.setInput('inv_pm', 'credit');
    app.evalJs('saveInvoice()');
    await app.sync();

    app.day('2026-10-12');
    app.evalJs("go('pos');posTap('cloth')");
    app.call(() => { cart[0].qty = 8; renderCart(); });
    app.setInput('posCustomer', 'customer');
    app.setInput('posPay', 'partial');
    app.setInput('posPartialPaid', 50);
    await app.evalJs('posCheckout()');
    assert.equal(app.evalJs('db.sales.length'), 1, app.window.document.getElementById('toast').textContent);
    await app.sync();

    app.day('2026-10-17');
    await app.pay(() => posQuickCollect('customer'), null, 60);
    assert.equal(app.evalJs('current'),'pos');
    assert.equal(app.evalJs("db.cash.at(-1).invoicePayment.kind"),'sale');
    assert.equal(app.evalJs("db.sales[0].dueAmount"),90);
    await app.pay(() => payy('supplier'), null, 70);
    await app.sync();

    app.day('2026-10-23');
    app.evalJs("returnForm('sale',db.sales[0].id)");
    app.evalJs('retLines[0].ret=2;calcRet()');
    app.evalJs('saveReturn()');
    assert.equal(app.evalJs('db.returns.length'), 1);
    await app.sync();

    app.day('2026-10-28');
    app.evalJs('expenseForm()');
    app.setInput('e_amt', 30);
    await app.evalJs('saveExpense()');
    app.evalJs('transferForm()');
    app.setInput('tr_amt', 40);
    app.evalJs('saveTransfer()');
    await app.sync();

    app.day('2026-10-31');
    const expected = { cash: 470, bank: 140, customers: 40, suppliers: 130, stock: 140, stockAtBranch: 14, income: 60 };
    const balances = await assertMonthEnd(app, '2026-10-31', expected);
    assertStatements(app, '2026-10-31', 40, 130);
    assert.equal(app.evalJs("fatCashFlow('2026-10-01','2026-10-31').net"), 510);
    assert.equal(app.evalJs("fatCashFlow('2026-10-01','2026-10-31').transferIn"), 40);
    app.evalJs("fatSetLockDate('2026-10-31')");
    await app.sync();

    const afterReload = createShopApp(pg, ids.owner, 'manager');
    try {
      const readDocuments = () => JSON.stringify({
        sales: db.sales.map(({ id, no, total, dueAmount, items }) => ({ id, no, total, dueAmount, items })),
        returns: db.returns,
      });
      const savedDocuments = app.call(readDocuments);
      assert.notEqual(afterReload.call(readDocuments), savedDocuments, 'Fresh session already had the documents');
      await afterReload.evalJs('pullV2({replace:true,expectedOutbox:null})');
      assert.deepEqual(JSON.parse(afterReload.call(readDocuments)), JSON.parse(savedDocuments), 'Reload changed the invoice or return');
      await assertMonthEnd(afterReload, '2026-10-31', expected);
    } finally {
      afterReload.close();
    }

    const before = JSON.stringify(app.evalJs("fatTrialBalance('','2026-10-31')"));
    await verifyClosedPeriodAndBackup(pg, app);
    app.day('2026-11-02');
    await app.pay(() => collect('customer'), null, 10);
    const purchaseId = app.evalJs('db.purchases[0].id');
    await app.pay(id => collectInvoice('purchase', id), purchaseId, 15);
    app.evalJs("returnForm('sale',db.sales[0].id)");
    app.evalJs('retLines[0].ret=1;calcRet()');
    app.evalJs('saveReturn()');
    await app.sync();
    assert.equal(JSON.stringify(app.evalJs("fatTrialBalance('','2026-10-31')")), before);
    await assertMonthEnd(app, '2026-11-02', {
      cash: 465, bank: 140, customers: 5, suppliers: 115, stock: 150, stockAtBranch: 15, income: 45,
    });
    assertStatements(app, '2026-10-31', 40, 130);
    assertStatements(app, '2026-11-02', 5, 115);
    assert.deepEqual(app.errors, []);
    return { balances };
  } finally {
    app.close();
  }
}

function request(p_upserts, p_deletes = []) {
  return { p_upserts, p_deletes, p_settings: null, p_settings_base: null, p_batch: randomUUID() };
}

async function databaseRecord(pg, org, kind, localId) {
  return (await pg.query(
    'select id,data from public.v2_records where org_id=$1 and kind=$2 and local_id=$3',
    [org, kind, localId],
  )).rows[0];
}

function change(kind, id, base, data) {
  return { kind, local_id: id, base, data: { ...data, id } };
}

async function verifyClosedPeriodAndBackup(pg, app) {
  const saleId = app.evalJs('db.sales[0].id');
  const sale = await databaseRecord(pg, ids.mainShop, 'sales', saleId);
  const before = sale.data;
  const testExpense = change('expenses', 'rollback-expense', null, { date: '2026-11-02', amount: 10 });
  const expectRejected = (entries, reason, deletes = []) => assert.rejects(
    applyBatch(pg, ids.owner, ids.mainShop, request(entries, deletes)),
    reason,
  );
  await expectRejected([
    testExpense,
    change('sales', saleId, before, { ...before, dueAmount: before.dueAmount - 3 }),
  ], /SNS_ACCOUNTING_PERIOD_LOCKED/);
  assert.equal(await databaseRecord(pg, ids.mainShop, 'expenses', testExpense.local_id), undefined);

  await expectRejected([
    change('sales', saleId, before, {
      ...before, dueAmount: before.dueAmount - 3, paidAmount: before.paidAmount + 3,
      settlementRefs: [{ kind: 'cash', id: 'missing-receipt' }],
    }),
  ], /SNS_INVALID_SETTLEMENT/);
  await expectRejected([], /SNS_POSTED_INVOICE_IMMUTABLE/, [{ kind: 'sales', id: sale.id, base: before }]);
  await expectRejected([
    change('sales', saleId, before, { ...before, total: before.total + 1 }),
  ], /SNS_POSTED_INVOICE_IMMUTABLE/);
  await expectRejected([
    change('cash', 'unbalanced', null, {
      date: '2026-11-02', type: 'in', amount: 10,
      postingLines: [{ code: '1100', debit: 10, credit: 0 }, { code: '1300', debit: 0, credit: 9 }],
    }),
  ], /SNS_INVALID_POSTING/);
  assert.deepEqual((await databaseRecord(pg, ids.mainShop, 'sales', saleId)).data, before);

  // Exercise the actual cloud backup SQL under RLS and restore its JSON in a fresh app.
  const backup = await asActor(pg, ids.owner, async tx => {
    await tx.query('select public.sns_create_org_backup($1)', [ids.mainShop]);
    return (await tx.query('select data from public.sns_org_backups where org_id=$1', [ids.mainShop])).rows[0].data;
  });
  const otherView = await asActor(pg, ids.otherOwner, tx => tx.query(
    'select id from public.v2_records where org_id=$1', [ids.mainShop],
  ));
  const staffView = await asActor(pg, ids.cashier, tx => tx.query(
    'select day from public.sns_org_backups where org_id=$1', [ids.mainShop],
  ));
  assert.equal(otherView.rows.length, 0);
  assert.equal(staffView.rows.length, 0);
  await assert.rejects(asActor(pg, ids.cashier, tx => tx.query(
    'select public.sns_create_org_backup($1)', [ids.mainShop],
  )), /SNS_BACKUP_FORBIDDEN/);

  const restored = createShopApp(pg, ids.owner, 'manager');
  try {
    const payload = restored.call(({ backup, org }) => snsBackupPayload(backup, org), { backup, org: ids.mainShop });
    restored.call(data => {
      CURRENT_ORG = null;
      V2_READY = false;
      makeSnapshot = async () => true;
      go = () => {};
      db.sales = [];
      restoreFullBackup({ files: [new File([JSON.stringify(data)], 'SNS-test-backup.json')] });
    }, payload);
    for (let attempt = 0; attempt < 40 && !restored.evalJs('db.sales.length'); attempt++) await delay(25);
    assert.ok(restored.evalJs('db.sales.length'), 'Backup was not restored');
    await assertMonthEnd(restored, '2026-10-31', {
      cash: 470, bank: 140, customers: 40, suppliers: 130, stock: 140, stockAtBranch: 14, income: 60,
    });
  } finally {
    restored.close();
  }
}

async function verifyPurchaseCostAndOpenings(pg) {
  const app = createShopApp(pg, ids.owner, 'manager');
  try {
    await app.hydrateFromDatabase();
    app.day('2026-11-04');
    const readLedger = () => Array.from(app.call(() => {
      const tb = fatTrialBalance('', '2026-11-04');
      return ['1100', '1300', '1400', '1450', '2100', '3350', '5260', '5270'].map(code => {
        const row = tb.rows.find(item => item.name === snsAccountLabel(code));
        return r2((row?.balDebit || 0) - (row?.balCredit || 0));
      });
    }));
    const startingLedger = readLedger();
    const assertDelta = expected => assert.deepEqual(readLedger().map((value, index) => (
      Math.round((value - startingLedger[index]) * 100) / 100
    )), expected);

    await app.call(async () => {
      await csvDoImport('product', [['صنف افتتاحي', 'OPENING-SKU', '10', '7', '4']], { name: 0, sku: 1, price: 2, cost: 3, qty: 4 });
      await csvDoImport('customer', [['عميل برصيد افتتاحي', '19']], { name: 0, balance: 1 });
      partyForm('supplier');
    });
    app.setInput('p_name', 'مورد برصيد افتتاحي');
    app.setInput('p_bal', 13);
    app.evalJs("saveParty('supplier','')");
    await app.sync();
    assertDelta([0, 19, 28, 0, -13, -34, 0, 0]);
    const openedItem = app.evalJs("db.products.find(item=>item.sku==='OPENING-SKU')");
    const openingMove = app.evalJs("db.stockMoves.find(row=>row.kind==='opening'&&row.postingLines)");
    assert.equal(openingMove.pid, openedItem.id);
    assert.equal(app.call(id => fatBQOf(findProduct(id),'main'), openedItem.id), 4);
    assert.equal((await databaseRecord(pg, ids.mainShop, 'stockMoves', openingMove.id)).data.postingLines[0].debit, 28);
    const openingParty = app.evalJs("db.customers.find(row=>row.openingDate)");
    assert.equal(app.call(id => snsPartyStatementRows('customer',findCustomer(id))[0].debit, openingParty.id), 19);
    await assert.rejects(applyBatch(pg, ids.owner, ids.mainShop, request([
      change('customers', 'backdated-opening', null, { openingDate: '2026-10-02', openingBalance: 13, balance: 13 }),
    ])), /SNS_ACCOUNTING_PERIOD_LOCKED/);

    app.call(() => {
      db.products.push({ id: 'pack', name: 'عبوة', cost: 0, price: 19, qty: 0, unitFactor: 4 });
      _rebuildProdIdx();
      invoiceForm('purchase', null, 'supplier');
      invLines = [{ pid: 'pack', qty: 1, price: 40 }, { pid: '', name: 'رسوم خدمة', qty: 1, price: 10 }];
    });
    app.setInput('inv_disc', 5);
    app.setInput('inv_vat', 10);
    app.setInput('inv_pm', 'credit');
    app.evalJs('saveInvoice()');
    await app.sync();
    const first = app.evalJs('db.purchases.at(-1).id');
    assert.equal(app.evalJs("findProduct('pack').cost"), 9);
    assert.equal(app.evalJs("findProduct('pack').qty"), 4);
    assertDelta([0, 19, 64, 4.5, -62.5, -34, 0, 9]);

    app.call(() => {
      invoiceForm('purchase', null, 'supplier');
      invLines = [{ pid: 'pack', qty: 1, price: 48 }];
    });
    app.setInput('inv_pm', 'credit');
    app.setInput('inv_vat', 0);
    app.evalJs('saveInvoice()');
    await app.sync();
    assert.equal(app.evalJs("findProduct('pack').cost"), 10.5);
    assert.equal(app.evalJs("fatBQOf(findProduct('pack'),'main')"), 8);
    assertDelta([0, 19, 112, 4.5, -110.5, -34, 0, 9]);

    app.call(id => { findProduct('pack').unitFactor=2;returnForm('purchase',id); }, first);
    app.evalJs('retLines[0].ret=1;calcRet();saveReturn()');
    await app.sync();
    assert.equal(app.evalJs("fatBQOf(findProduct('pack'),'main')"), 4);
    assertDelta([0, 19, 70, 0.9, -70.9, -34, 6, 9]);

    app.call(id => returnForm('purchase',id), first);
    assert.equal(app.evalJs('retLines[0]._maxRet'), 0);
    app.evalJs('retLines[1].ret=1;calcRet();saveReturn()');
    await app.sync();
    assertDelta([0, 19, 70, 0, -61, -34, 6, 0]);
    assert.deepEqual(app.errors, []);
  } finally {
    app.close();
  }
}

async function verifyTwoRegisters(pg) {
  const product = { id: 'last-roll', name: 'آخر توب', itemType: 'simple', cost: 0, price: 10, qty: 1, bq: { main: 1 } };
  await applyBatch(pg, ids.owner, ids.mainShop, request([change('products', product.id, null, product)]));
  const recordBefore = await databaseRecord(pg, ids.mainShop, 'products', product.id);
  assert.equal(recordBefore.data.qty, 1);

  const first = createShopApp(pg, ids.cashier, 'cashier');
  const second = createShopApp(pg, ids.secondCashier, 'cashier');
  try {
    await Promise.all([first.hydrateFromDatabase(), second.hydrateFromDatabase()]);
    for (const device of [first, second]) {
      device.day('2026-11-03');
      device.call(() => { go('pos'); posTap('last-roll'); });
      await device.evalJs('posCheckout()');
      assert.equal(device.evalJs("db.sales.filter(s=>s.items.some(item=>item.pid==='last-roll')).length"), 1);
    }
    first.loseReply();
    await assert.rejects(first.evalJs('syncV2()'), /reply lost after commit/);
    const persisted = first.evalJs('JSON.stringify(snsReadOutbox())');
    const batchId = first.batch().p_batch;
    assert.equal((await databaseRecord(pg, ids.mainShop, 'products', product.id)).data.qty, 0);
    const rejectedSale = second.evalJs("db.sales.find(s=>s.items.some(item=>item.pid==='last-roll')).id");
    second.online(true);
    await second.evalJs('save()');
    assert.equal(second.evalJs('snsReadOutbox().conflict'), true);
    assert.equal(second.window.document.getElementById('snsSyncConflict').hidden, false);
    assert.equal(second.evalJs('snsCanPost(today())'), false);
    second.evalJs('snsSyncReview()');
    assert.match(second.window.document.getElementById('modal').textContent, /فواتير بيع محلية لم يؤكدها الخادم\s*1/);
    second.evalJs('snsDownloadSyncReview=raw=>window.snsReviewDownload=raw');
    const expectedArchive = second.evalJs('localStorage.getItem(snsOutboxKey())');
    second.cloudFailure(new Error('cloud connection unavailable'));
    await second.evalJs('snsRecoverSync()');
    assert.equal(second.evalJs('localStorage.getItem(snsOutboxKey())'), expectedArchive);
    assert.equal(second.call(id => db.sales.some(s=>s.id===id), rejectedSale), true);
    second.cloudFailure(null);
    await second.evalJs('snsRecoverSync()');
    assert.equal(second.evalJs('snsReadOutbox()'), null);
    assert.equal(second.evalJs('localStorage.getItem(snsOutboxKey()+"::review")'), expectedArchive);
    assert.equal(second.window.snsReviewDownload, expectedArchive);
    assert.equal(second.call(id => db.sales.some(s=>s.id===id), rejectedSale), false);
    assert.equal(second.window.document.getElementById('snsSyncConflict').hidden, true);
    assert.equal(second.evalJs('snsCanPost(today())'), true);

    const reopened = createShopApp(pg, ids.cashier, 'cashier');
    try {
      reopened.day('2026-11-03');
      reopened.call(raw => {
        localStorage.setItem(snsOutboxKey(), raw);
        if(!snsResumeOutbox())throw new Error('Missing outbox');
      }, persisted);
      await reopened.sync();
      assert.equal(reopened.sentBatches[0], batchId);
      assert.ok(reopened.evalJs("snsInvoiceSyncBadge(db.sales.at(-1)).includes('متزامنة')"));
      const printedId=reopened.evalJs('db.sales.at(-1).id');
      const beforePrint=reopened.evalJs('snapStr(db.sales.at(-1))');
      reopened.call(id => fatReprintLog('sale',id),printedId);
      await reopened.sync();
      assert.equal(reopened.evalJs('snapStr(db.sales.at(-1))'),beforePrint);
      const printed=(await databaseRecord(pg,ids.mainShop,'sales',printedId)).data;
      assert.equal(printed.printCount,undefined);
      const {rows:[{count}]}=await pg.query(`select count(*)::int as count from public.v2_records
        where org_id=$1 and kind='audit' and data->'print'->>'invoiceId'=$2`,[ids.mainShop,printedId]);
      assert.equal(count,1);
    } finally {
      reopened.close();
    }
    assert.equal((await databaseRecord(pg, ids.mainShop, 'products', product.id)).data.qty, 0);
    const committed = await pg.query(`select count(*)::int as count
      from public.v2_records where org_id=$1 and kind='sales'
      and data->'items' @> '[{"pid":"last-roll"}]'::jsonb`, [ids.mainShop]);
    assert.equal(committed.rows[0].count, 1);
    await assert.rejects(applyBatch(pg, ids.otherOwner, ids.mainShop, request([])), /SNS_SYNC_FORBIDDEN/);
  } finally {
    first.close();
    second.close();
  }
}

async function verifyStockkeeperPurchase(pg) {
  const stockkeeper=createShopApp(pg,ids.stockkeeper,'stockkeeper');
  try {
    stockkeeper.day('2026-11-05');
    await stockkeeper.hydrateFromDatabase();
    const before=stockkeeper.call(()=>({purchases:db.purchases.length,cash:db.cash.length,qty:findProduct('cloth').qty}));
    stockkeeper.call(()=>{
      invoiceForm('purchase',null,'supplier');
      invLines=[{pid:'cloth',qty:2,price:11}];
    });
    stockkeeper.setInput('inv_pm','cash');
    stockkeeper.evalJs('saveInvoice()');
    assert.match(stockkeeper.window.document.getElementById('toast').textContent,/سداد المورد من حساب الإدارة أو المحاسبة/);
    assert.equal(stockkeeper.evalJs('db.purchases.length'),before.purchases);
    stockkeeper.setInput('inv_pm','credit');
    stockkeeper.evalJs('saveInvoice()');
    assert.equal(stockkeeper.evalJs('db.purchases.length'),before.purchases+1);
    assert.equal(stockkeeper.evalJs('db.cash.length'),before.cash);
    await stockkeeper.sync();
    const invoice=stockkeeper.evalJs('db.purchases.at(-1)');
    assert.equal((await databaseRecord(pg,ids.mainShop,'purchases',invoice.id)).data.dueAmount,22);
    assert.equal((await databaseRecord(pg,ids.mainShop,'products','cloth')).data.qty,before.qty+2);
  } finally {
    stockkeeper.close();
  }
}

async function verifySyncMigration() {
  const pg = await createAccountingDatabase({ migrate: false });
  try {
    await pg.query(
      `insert into public.v2_records(user_id, org_id, kind, local_id, data)
       select $1, $2, 'customers', 'duplicate-customer', jsonb_build_object('balance', amount)
       from (values (0), (40)) as sample(amount)`,
      [ids.owner, ids.mainShop],
    );
    await pg.query(
      `insert into public.v2_settings(user_id, org_id, data)
       values ($1, $3, '{"seq":{"sale":1,"quote":1},"settings":{"company":"Owner shop"}}'),
              ($2, $3, '{"seq":{"sale":42,"quote":2,"shiftSession":4},"settings":{"company":"Staff copy"}}')`,
      [ids.owner, ids.cashier, ids.mainShop],
    );
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'org-sync-staging.sql'), 'utf8');
    await assert.rejects(pg.exec(sql), /SNS_SYNC_MIGRATION_REVIEW_REQUIRED/);
    await pg.exec('rollback');
    const { rows: [state] } = await pg.query(`
      select (select jsonb_agg(data->'balance' order by (data->>'balance')::int) from public.v2_records) as balances,
             (select jsonb_agg(data->'seq'->'sale' order by (data->'seq'->>'sale')::int) from public.v2_settings) as counters,
             has_function_privilege('authenticated','public.v2_apply_changes(uuid,jsonb,uuid[],jsonb)','execute') as legacy_sync_enabled,
             has_table_privilege('authenticated','public.v2_records','insert') as legacy_insert_enabled,
             to_regprocedure('public.sns_apply_changes_checked(uuid,jsonb,jsonb,jsonb,jsonb,uuid)') is not null as new_sync_installed
    `);
    assert.deepEqual(state, {
      balances: [0, 40], counters: [1, 42], legacy_sync_enabled: true,
      legacy_insert_enabled: true, new_sync_installed: false,
    });
    process.stdout.write('PASS sync migration rejected duplicates and preserved records, settings and legacy permissions\n');

    await pg.query(
      `insert into public.v2_records(user_id, org_id, kind, local_id, data)
       select $1, $2, 'audit', 'audit-' || sample, jsonb_build_object('id','audit-' || sample)
       from generate_series(1,425) as sample cross join generate_series(1,2)`,
      [ids.owner, ids.mainShop],
    );
    await pg.query(
      `insert into public.v2_records(user_id, org_id, kind, local_id, data)
       select $1::uuid, $2::uuid, 'sales', 'sale-' || fixture.no,
              jsonb_build_object('id','sale-' || fixture.no,'no',fixture.no,
                                 'customerId','duplicate-customer','dueAmount',fixture.due)
       from (values (43,200), (44,350)) as fixture(no,due) cross join generate_series(1,2)
       union all
       select $1, $2, fixture.kind, fixture.kind || '-test', jsonb_build_object('no',fixture.no)
       from (values ('quotes',3), ('shiftSessions',5)) as fixture(kind,no)`,
      [ids.owner, ids.mainShop],
    );

    const reconcile = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'org-sync-reconcile-staging.sql'), 'utf8');
    await assert.rejects(pg.exec(reconcile), /SNS_RECONCILE_APPROVED_BALANCE_REQUIRED/);
    await pg.exec('rollback');
    const approved = reconcile.replace('approved_balance numeric := null;', 'approved_balance numeric := 40;');
    assert.notEqual(approved, reconcile, 'Synthetic balance could not be selected');
    await pg.query(
      `update public.v2_settings set data = jsonb_set(data, '{settings,warranties}', '[{"id":"test-warranty"}]')
       where user_id=$1`, [ids.cashier],
    );
    await assert.rejects(pg.exec(approved), /SNS_RECONCILE_SHARED_SETTINGS_REVIEW_REQUIRED/);
    await pg.exec('rollback');
    const { rows: [staff] } = await pg.query(
      `select data #> '{settings,warranties}' as warranties from public.v2_settings where user_id=$1`, [ids.cashier],
    );
    assert.deepEqual(staff.warranties, [{ id: 'test-warranty' }]);
    await pg.query(
      `update public.v2_settings set data = jsonb_set(data, '{settings,warranties}', $2)
       where user_id=$1`, [ids.owner, JSON.stringify(staff.warranties)],
    );
    await pg.exec(approved);
    const { rows: [result] } = await pg.query(`
      select (select count(*)::int from public.v2_records) as remaining_records,
             (select data->'balance' from public.v2_records where kind='customers') as balance,
             (select data->'seq' from public.v2_settings) as counters,
             (select data #>> '{settings,company}' from public.v2_settings) as company,
             (select data #> '{settings,warranties}' from public.v2_settings) as warranties,
             (select count(*)::int from sns_recovery.sync_reconcile_rows) as archived_rows,
             (select jsonb_agg(original #> '{data,balance}' order by (original #>> '{data,balance}')::int)
              from sns_recovery.sync_reconcile_rows where original->>'kind'='customers') as archived_balances
    `);
    assert.deepEqual(result, {
      remaining_records: 430, balance: 40, counters: { sale: 45, quote: 4, shiftSession: 5 },
      company: 'Owner shop', warranties: [{ id: 'test-warranty' }],
      archived_rows: 858, archived_balances: [0, 40],
    });
    const preflight = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'org-sync-preflight.sql'), 'utf8');
    const [checks] = await pg.exec(preflight);
    assert.ok(checks.rows.every(({ affected }) => Number(affected) === 0));
    await pg.exec(sql);
    const { rows: [permissions] } = await pg.query(`
      select has_function_privilege('authenticated','public.v2_apply_changes(uuid,jsonb,uuid[],jsonb)','execute') as legacy,
             has_function_privilege('authenticated','public.sns_apply_changes_checked(uuid,jsonb,jsonb,jsonb,jsonb,uuid)','execute') as upgraded
    `);
    assert.deepEqual(permissions, { legacy: false, upgraded: true });
    process.stdout.write('PASS staging reconciliation archived all duplicate versions and preserved numbering before sync installation\n');

  } finally {
    await pg.close();
  }
}

async function verifySubscriptionWriteGate(pg) {
  const setState = (status, expiresAt) => pg.query(
    'update public.subscriptions set status=$1,expires_at=$2 where org_id=$3',
    [status, expiresAt, ids.otherShop],
  );
  const post = batch => applyBatch(pg, ids.otherOwner, ids.otherShop, batch);
  const accepted = request([change('customers', 'verified-before-renewal', null, { name: 'Test', balance: 0 })]);
  const pending = request([change('customers', 'pending-renewal', null, { name: 'Pending test', balance: 0 })]);
  const firstResult = await post(accepted);

  await setState('suspended', '2099-12-31T00:00:00Z');
  await assert.rejects(post(pending), /SUB_EXPIRED/);
  assert.deepEqual(await post(accepted), firstResult);
  assert.equal(await databaseRecord(pg, ids.otherShop, 'customers', 'pending-renewal'), undefined);
  await setState('active', new Date(Date.now()-60_000).toISOString());
  await assert.rejects(post(pending), /SUB_EXPIRED/);
  await setState('active', '2099-12-31T00:00:00Z');
  const result = await post(pending);
  assert.equal(result.length, 1);
  assert.deepEqual(await post(pending), result);
  process.stdout.write('PASS suspended or expired subscriptions block new writes and cannot duplicate accepted or retried batches\n');

  const originalPurchase = request([change('purchases', 'purchase-register-a', null, { no: 1 })]);
  await post(originalPurchase);
  await assert.rejects(post(request([change('purchases', 'purchase-register-b', null, { no: 1 })])), /SNS_SYNC_CONFLICT/);
  assert.equal(await databaseRecord(pg, ids.otherShop, 'purchases', 'purchase-register-b'), undefined);
  process.stdout.write('PASS simultaneous purchase documents cannot both claim the same invoice number\n');
}

async function main() {
  await verifySyncMigration();
  const pg = await createAccountingDatabase();
  try {
    const { balances } = await monthEnd(pg);
    await verifyTwoRegisters(pg);
    await verifyPurchaseCostAndOpenings(pg);
    await verifyStockkeeperPurchase(pg);
    await verifySubscriptionWriteGate(pg);
    process.stdout.write('PASS month close, invoice and return reload, cross-period settlements, backup restore, shop isolation, concurrent sale retry, print audit, opening balances, stockkeeper purchase and purchase costing using PostgreSQL\n');
    process.stdout.write(JSON.stringify(balances) + '\n');
  } finally {
    await pg.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  if(error.where)console.error(error.where);
  process.exitCode = 1;
});
