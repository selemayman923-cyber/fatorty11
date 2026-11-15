const { test, expect } = require('@playwright/test');

const uid = '20000000-0000-4000-8000-000000000001';
const org = '10000000-0000-4000-8000-000000000001';
const branch = { id: 'main', name: 'الفرع الرئيسي' };
const product = { id: 'needle', name: 'إبر تنجيد', price: 10, cost: 4, qty: 5 };
const invoice = { id: 'previous-sale', no: 7, date: '2026-10-01', total: 10, items: [{ pid: 'needle', qty: 1, price: 10 }] };

async function loadShop(page, { activity, role = 'manager', owner = true, create = false, language = 'ar', terms = true } = {}) {
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
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('fat_mode', 'online'));
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
              in:()=>query,is:()=>query,order:()=>query,
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
    if (path === 'org_members') {
      if (args.insert) members = [{ org_id: org, role }];
      data = args.org_id ? members[0] || null : members;
    } else if (path === 'orgs') data = args.insert ? { id: org } : owner ? [{ id: org }] : [];
    else if (path === 'v2_records') data = args.org_id ? getRows() : [];
    else if (path === 'v2_settings') data = state && { data: state };
    else if (path === 'subscriptions') data = { plan: 'trial', status: 'active', expires_at: '2099-01-01' };
    else if (path === 'rpc/sns_apply_changes_checked') {
      batches.push(args);
      if (args.p_settings) state = args.p_settings;
      data = args.p_upserts.map(entry => ({
        out_kind: entry.kind, out_local_id: entry.local_id, out_id: 'row-' + entry.local_id,
      }));
    } else data = null;
    await route.fulfill({ json: { data, error: null } });
  });
  await page.goto('/index.html');
  return { batches, errors, saved: () => state };
}

test.use({ serviceWorkers: 'block' });

test('mobile Arabic owner: navigate sectors, search, return, select and persist an existing activity', async ({ page }) => {
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
  await chooser.getByRole('button', { name: 'حفظ المجال وفتح لوحة التحكم' }).click();
  await expect(chooser).toBeHidden();
  await expect(page.locator('#pageTitle')).toContainText('لوحة التحكم');
  await expect.poll(() => shop.saved()?.settings.bizProfile?.industryKey).toBe('pharmacy');
  await expect(page.locator('#nav [data-view="purchases"]')).toHaveCount(1);
  expect(await page.evaluate(() => ({ activity: db.settings.businessType, products: db.products.length, sales: db.sales.length })))
    .toEqual({ activity: 'pharmacy', products: 0, sales: 0 });
  await page.getByRole('button', { name: 'أوافق وأكمل' }).click();
  await page.reload();
  await expect(page.locator('#pageTitle')).toContainText('لوحة التحكم');
  await expect(chooser).toBeHidden();
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
  await chooser.getByRole('button', { name: 'Save industry and open dashboard' }).click();
  await expect.poll(() => shop.saved()?.settings.bizProfile?.type).toBe('clinic');
  expect(shop.saved().settings.bizProfile.industryKey).toBe('pediatrics');
  await expect(page.locator('#brandTag')).toContainText('Pediatric clinic');
  expect(shop.errors).toEqual([]);
});

test('skip uses the general preset without inserting products or sales', async ({ page }) => {
  const shop = await loadShop(page);
  await page.getByRole('button', { name: 'تخطي وإعداد النظام يدويًا' }).click();
  await expect(page.locator('#snsIndustry')).toBeHidden();
  await expect(page.locator('#pageTitle')).toContainText('لوحة التحكم');
  await expect.poll(() => shop.saved()?.settings.businessType).toBe('other');
  expect(shop.saved().settings.onboarded).toBe(true);
  expect(shop.batches.flatMap(batch => batch.p_upserts).filter(({ kind }) => ['products','sales'].includes(kind))).toEqual([]);
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
