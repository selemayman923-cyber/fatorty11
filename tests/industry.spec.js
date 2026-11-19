const { test, expect } = require('@playwright/test');
const { createAccountingDatabase, asActor, applyBatch } = require('../tools/accounting-postgres-fixture');

const uid = '20000000-0000-4000-8000-000000000001';
const org = '10000000-0000-4000-8000-000000000001';
const branch = { id: 'main', name: 'الفرع الرئيسي' };
const product = { id: 'needle', name: 'إبر تنجيد', price: 10, cost: 4, qty: 5 };
const invoice = { id: 'previous-sale', no: 7, date: '2026-10-01', total: 10, items: [{ pid: 'needle', qty: 1, price: 10 }] };

async function loadShop(page, { activity, role = 'manager', owner = true, create = false, language = 'ar', terms = true, database } = {}) {
  const settings = {
    company: 'محل الاختبار',
    termsAccepted: terms,
    _guideShown: false,
    lang: language,
    activeBranch: branch.id,
    ...(activity ? { businessType: activity, activity: 'نشاط محفوظ' } : {}),
  };
  let state = create ? null : { settings, seq: { sale: 8 } };
  let members = create ? [] : [{ org_id: org, role }];
  const shopRecords = { branches: [branch], products: activity ? [product] : [], sales: activity ? [invoice] : [] };
  const getRows = () => Object.entries(shopRecords).flatMap(([kind, records]) => (
    records.map(data => ({ kind, local_id: data.id, id: 'row-' + data.id, data }))
  ));
  const batches = [];
  const errors = [];
  let rejectSave = false;
  async function connect(page){
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fat_mode', 'online'));
    await page.route(/^https?:\/\/(?!localhost[:/])/, route => route.abort());
    await page.route('**/vendor/supabase.min.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
        (() => {
          const read = (table, params) => fetch('/sns-industry-fixture/'+table, {
            method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(params)
          }).then(response=>response.json());
          const session = {user:{id:${JSON.stringify(uid)},email:'staging-test@example.test'}};
          window.supabase = {createClient:()=>({
            auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
            from(table){
              const params={};
              const query={
                select:()=>query,
                eq(column,value){params[column]=value;return query;},
                in:()=>query,is:()=>query,order:()=>query,limit:()=>query,
                insert(values){params.insert=values;return query;},
                range:()=>read(table,params),
                single:()=>read(table,params),
                maybeSingle:()=>read(table,params),
                then:(resolve,reject)=>read(table,params).then(resolve,reject)
              };
              return query;
            },
            rpc:(name,params)=>read('rpc/'+name,params||{})
          })};
        })();
      `,
    }));
    await page.route('**/sns-industry-fixture/**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/sns-industry-fixture/', '');
      const args = route.request().postDataJSON();
      let data;
      if (database && args.org_id && (path === 'v2_records' || path === 'v2_settings')) {
        data = await asActor(database, uid, async tx => {
          if (path === 'v2_records') return (await tx.query(
            'select id, kind, local_id, data from public.v2_records where org_id=$1 order by id',
            [args.org_id],
          )).rows;
          return (await tx.query('select data from public.v2_settings where org_id=$1', [args.org_id])).rows[0] ?? null;
        });
        return route.fulfill({ json: { data, error: null } });
      }
      if (path === 'org_members') {
        if (args.insert) members = [{ org_id: org, role }];
        data = args.org_id ? members[0] || null : members;
      } else if (path === 'orgs') data = args.insert ? { id: org } : create && members.length===0 ? null : owner ? [{ id: org }] : [];
      else if (path === 'v2_records') data = args.org_id ? getRows() : [];
      else if (path === 'v2_settings') data = state && { data: state };
      else if (path === 'subscriptions') data = { plan: 'trial', status: 'active', expires_at: '2099-01-01' };
      else if (path === 'rpc/sns_apply_changes_checked') {
        batches.push(args);
        if (rejectSave) return route.fulfill({ json: { data: null, error: { code: 'PGRST202', message: 'Sync unavailable' } } });
        if (database) {
          try {
            data = await applyBatch(database, uid, args.p_org, args);
            return route.fulfill({ json: { data, error: null } });
          } catch (failure) {
            return route.fulfill({ json: { data: null, error: { code: failure.code, message: failure.message } } });
          }
        }
        if (args.p_settings) state = args.p_settings;
        data = args.p_upserts.map(entry => ({
          out_kind: entry.kind, out_local_id: entry.local_id, out_id: 'row-' + entry.local_id,
        }));
      } else data = null;
      await route.fulfill({ json: { data, error: null } });
    });
    await page.goto('/index.html');
  }
  await connect(page);
  return { batches, errors, saved: () => state, connect, rejectWrites: value => { rejectSave = value; } };
}

test.use({ serviceWorkers: 'block' });

test('mobile Arabic owner: navigate sectors, search, return, select and persist an existing activity', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const shop = await loadShop(page, { create: true, terms: false });
  const chooser = page.locator('#snsIndustry');
  await expect(chooser.getByRole('heading', { name: 'اختيار مجال العمل' })).toBeVisible();
  await expect(chooser).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#snsSidebar')).toBeHidden();
  await expect(chooser.locator('[data-industry-sector]')).toHaveCount(11);
  expect(await chooser.evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(390);
  const signOut = chooser.getByRole('button', { name: 'تسجيل الخروج' });
  await expect(signOut).toBeInViewport();
  await expect(signOut).toHaveCSS('background-color', 'rgb(180, 35, 50)');
  await signOut.click();
  await expect(page.locator('#dlg')).toContainText('تسجيل الخروج من الحساب؟');
  await page.locator('#dlgNo').click();
  const search = chooser.getByRole('searchbox');
  await search.fill('  اسفنج   ');
  await expect(chooser.locator('[data-industry-field]')).toHaveCount(1);
  await expect(chooser.getByRole('button', { name: /أقمشة وإسفنج/ })).toBeVisible();
  await search.fill('  pharmaCy ');
  await expect(chooser.getByRole('button', { name: /الصيدليات/ })).toBeVisible();
  await search.fill('');
  await chooser.getByRole('button', { name: 'الرعاية الطبية' }).click();
  await expect(chooser.locator('[data-industry-field]')).toHaveCount(7);
  await chooser.getByRole('button', { name: 'عرض جميع المجالات' }).click();
  await expect(chooser.locator('[data-industry-field="pharmacy"]')).toHaveCount(1);
  await chooser.getByRole('button', { name: 'العودة' }).click();
  await expect(chooser.getByRole('heading', { name: 'الرعاية الطبية' })).toBeVisible();
  await chooser.getByRole('button', { name: /الصيدليات/ }).click();
  await expect(chooser.getByRole('heading', { name: 'الصيدليات' })).toBeVisible();
  await chooser.getByLabel('اسم المحل على الفاتورة').fill('صيدلية الاختبار');
  await chooser.getByRole('button', { name: 'العودة' }).click();
  await chooser.getByRole('button', { name: /الصيدليات/ }).click();
  await expect(chooser.getByLabel('اسم المحل على الفاتورة')).toHaveValue('صيدلية الاختبار');
  shop.rejectWrites(true);
  await chooser.getByRole('button', { name: 'احفظ وابدأ' }).click();
  await expect(chooser.locator('#snsIndustrySaveStatus')).toContainText('لسه ما قدرناش نحفظ');
  await expect(chooser).toBeVisible();
  expect(shop.saved()).toBeNull();
  shop.rejectWrites(false);
  await chooser.getByRole('button', { name: 'احفظ وابدأ' }).click();
  await expect(chooser).toBeHidden();
  await expect(page.locator('#pageTitle')).toContainText('لوحة التحكم');
  await expect.poll(() => shop.saved()?.settings.bizProfile?.industryKey).toBe('pharmacy');
  await expect(page.locator('#nav [data-view="purchases"]')).toHaveCount(1);
  expect(await page.evaluate(() => ({ activity: db.settings.businessType, products: db.products.length, sales: db.sales.length })))
    .toEqual({ activity: 'pharmacy', products: 0, sales: 0 });
  await page.getByRole('button', { name: 'أوافق وأكمل' }).click();
  const secondDevice = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  try {
    const secondPage = await secondDevice.newPage();
    await shop.connect(secondPage);
    await expect(secondPage.locator('#pageTitle')).toContainText('لوحة التحكم');
    await expect(secondPage.locator('#snsIndustry')).toBeHidden();
    await expect(secondPage.locator('#brandName')).toHaveText('صيدلية الاختبار');
    await expect(secondPage.locator('#nav [data-view="clinic"]')).toHaveCount(0);
  } finally {
    await secondDevice.close();
  }
  expect(shop.errors).toEqual([]);
});

test('desktop English owner: all fields are unique and searchable, new fields use existing presets', async ({ page }) => {
  const shop = await loadShop(page, { language: 'en' });
  const chooser = page.locator('#snsIndustry');
  await expect(chooser).toHaveAttribute('dir', 'ltr');
  await expect(chooser.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await chooser.getByRole('button', { name: 'View all industries' }).click();
  const catalog = await page.evaluate(() => {
    const { sectors, fields } = SNS_INDUSTRY_CATALOG;
    return { count: Object.keys(fields).length, keys: Object.keys(fields), valid: sectors.every(sector =>
      sector.fields.every(key => Object.hasOwn(fields,key) && Object.hasOwn(BIZ_TYPES,fields[key].activity||key))) };
  });
  expect(catalog.valid).toBe(true);
  await expect(chooser.locator('[data-industry-field]')).toHaveCount(catalog.count);
  for (const key of ['pharmacy','trade_supplies','transport_trips','car_parts','car_repair']) {
    await expect(chooser.locator(`[data-industry-field="${key}"]`)).toHaveCount(1);
  }
  await chooser.getByRole('searchbox').fill('  pediatric    CLINIC ');
  await chooser.getByRole('button', { name: /Pediatric clinic/ }).click();
  await expect(chooser.getByRole('heading', { name: 'Pediatric clinic' })).toBeVisible();
  await chooser.getByRole('button', { name: 'Save and get started' }).click();
  await expect.poll(() => shop.saved()?.settings.bizProfile?.type).toBe('clinic');
  expect(shop.saved().settings.bizProfile.industryKey).toBe('pediatrics');
  await expect(page.locator('#brandTag')).toContainText('Pediatric clinic');
  expect(shop.errors).toEqual([]);
});

test('first setup is mandatory and does not seed products or invoices', async ({ page }) => {
  const shop = await loadShop(page);
  const chooser = page.locator('#snsIndustry');
  await expect(chooser).toBeVisible();
  await expect(chooser.locator('[data-industry-action="skip"]')).toHaveCount(0);
  expect(await page.evaluate(() => ({ blocked: document.querySelector('.app').inert, products: db.products.length, sales: db.sales.length })))
    .toEqual({ blocked: true, products: 0, sales: 0 });
  expect(shop.batches).toEqual([]);
  expect(shop.errors).toEqual([]);
});

test('previously configured shop keeps its activity, products and invoices', async ({ page }) => {
  const shop = await loadShop(page, { activity: 'upholstery' });
  await expect(page.locator('#brandName')).toContainText('محل الاختبار');
  await expect(page.locator('#snsIndustry')).toBeHidden();
  await page.evaluate(() => maybeOnboard());
  await expect(page.locator('#snsIndustry')).toBeHidden();
  const data = await page.evaluate(() => [
    db.settings.businessType, db.products.map(item => [item.id,item.qty]), db.sales.map(item => [item.id,item.no,item.total]),
  ]);
  expect(data).toEqual(['upholstery', [[product.id,product.qty]], [[invoice.id,invoice.no,invoice.total]]]);
  expect(shop.errors).toEqual([]);
});

for (const role of ['cashier','manager']) {
  test(`invited ${role} cannot open owner industry setup`, async ({ page }) => {
    const shop = await loadShop(page, { role, owner: false });
    await expect(page.locator('#brandName')).toContainText('محل الاختبار');
    await expect(page.locator('#snsIndustry')).toBeHidden();
    await page.evaluate(() => startBizWizard(true));
    await expect(page.locator('#snsIndustry')).toBeHidden();
    expect(shop.errors).toEqual([]);
  });
}


test('owner settings, sale and return round trip from Chromium through PostgreSQL', async ({ page, browser }) => {
  test.setTimeout(30000);
  const database = await createAccountingDatabase();
  try {
    const shop = await loadShop(page, { database });
    const chooser = page.locator('#snsIndustry');
    await chooser.getByRole('searchbox').fill('pharmacy');
    await chooser.getByRole('button', { name: /الصيدليات/ }).click();
    await chooser.getByLabel('اسم المحل على الفاتورة').fill('صيدلية اختبار الحفظ');
    await chooser.getByRole('button', { name: 'احفظ وابدأ' }).click();
    await expect(chooser).toBeHidden();
    await page.getByRole('button', { name: 'أوافق وأكمل' }).click();

    await page.evaluate(async () => {
      db.settings.cashierMustShift = false;
      db.settings.autoPrintReceipt = false;
      db.settings.waAutoReceipt = false;
      db.settings.vat = 0;
      db.products.push({ id: 'qa-product', name: 'صنف اختبار الحفظ', price: 50, cost: 20, qty: 3, itemType: 'simple' });
      _rebuildProdIdx();
      await save();
      go('pos');
    });
    await page.locator('#posGrid [data-pid="qa-product"]').click();
    await page.evaluate(() => posCheckout());
    await expect.poll(() => page.evaluate(() => db.sales.length)).toBe(1);
    await expect.poll(async () => (await database.query(
      "select count(*)::int as total from public.v2_records where org_id=$1 and kind='sales'", [org],
    )).rows[0].total).toBe(1);

    await page.evaluate(() => {
      returnForm('sale', db.sales[0].id);
      retLines[0].ret = 1;
      calcRet();
      saveReturn();
    });
    await expect.poll(async () => (await database.query(
      "select count(*)::int as total from public.v2_records where org_id=$1 and kind='returns'", [org],
    )).rows[0].total).toBe(1);

    const device = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const freshPage = await device.newPage();
      await shop.connect(freshPage);
      await expect(freshPage.locator('#brandName')).toHaveText('صيدلية اختبار الحفظ');
      await expect(freshPage.locator('#snsIndustry')).toBeHidden();
      expect(await freshPage.evaluate(() => ({
        activity: db.settings.bizProfile.industryKey,
        invoice: db.sales.map(sale => [sale.total, sale.items[0].qty]),
        refund: db.returns.map(ret => [ret.total, ret.items[0].qty, ret.refId === db.sales[0].id]),
        stock: findProduct('qa-product').qty,
      }))).toEqual({ activity: 'pharmacy', invoice: [[50, 1]], refund: [[50, 1, true]], stock: 3 });
    } finally {
      await device.close();
    }
    expect(shop.errors).toEqual([]);
  } finally {
    await database.close();
  }
});
