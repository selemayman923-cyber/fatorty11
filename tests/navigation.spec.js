const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

async function openWorkspace(page, { role = 'manager', activity = 'upholstery', plan = 'trial' } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\/(?!localhost[:/])/, route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('fat_mode', 'online');
    localStorage.setItem('fat_nav_nudged', '1');
  });
  await page.route('**/vendor/supabase.min.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: "window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};"
  }));
  await page.goto('/index.html');
  await expect(page.locator('#landing')).toBeVisible();
  await page.evaluate(({ role, activity, plan }) => {
    hideLanding();
    hideAuthScreen();
    migrate();
    Object.assign(db.settings, { company: 'محل الاختبار', role, termsAccepted: true, _guideShown: true });
    SUB = { plan, status: 'active' };
    snsSetActivity(activity);
    db.products = [{ id: 'cloth', sku: 'FAB-01', name: 'قماش كتان للعرض', price: 150, cost: 90, qty: 10 }];
    db.customers = [{ id: 'customer', name: 'عميل الاختبار', phone: '01000000000', balance: 0 }];
    _rebuildProdIdx();
    _rebuildCustIdx();
    applyBrand();
    applyLang();
    go(defaultView());
    window.visitedViews = [];
    fatOn('view:changed', ({ view }) => visitedViews.push(view));
  }, { role, activity, plan });
  return errors;
}

test('desktop navigation opens a section once and filters unavailable accounting shortcuts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await openWorkspace(page, { role: 'accountant', activity: 'other', plan: 'starter' });
  await page.locator('#fatNavSearch').fill('  Accounting   center  ');
  await page.locator('#nav [data-view="accounting"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('مركز المحاسبة');
  await expect(page.locator('#pageTitle')).toBeFocused();
  await expect(page.locator('#fatNavSearch')).toHaveValue('');
  await expect(page.locator('#nav [data-view="accounting"]')).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => visitedViews)).toEqual(['accounting']);
  await expect(page.locator('.sns-route-card[onclick*="taxReport"]')).toHaveCount(0);
  await expect(page.locator('.sns-route-card[onclick*="cashierperf"]')).toHaveCount(0);

  await page.evaluate(() => {
    const renderLedger = views.ledger;
    views.ledger = () => {
      views.ledger = renderLedger;
      throw new Error('Test rendering failure');
    };
  });
  await page.locator('.sns-route-card[onclick*="ledger"]').click();
  await expect(page.locator('#content .sns-view-error')).toContainText('تعذّر فتح القسم');
  await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
  await expect(page.locator('#content .sns-view-error')).toHaveCount(0);
  await expect(page.locator('#content')).toContainText('ميزان المراجعة');
  expect(await page.evaluate(() => go('products'))).toBe(false);
  expect(await page.evaluate(() => current)).toBe('ledger');
  expect(errors).toEqual([]);
});

test('mobile cashier can find sections and items, open and dismiss sign-out', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openWorkspace(page, { role: 'cashier' });
  const trigger = page.locator('#snsNavToggle');
  const sidebar = page.locator('#snsSidebar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#snsNavClose')).toBeFocused();
  const logout = sidebar.getByRole('button', { name: 'تسجيل الخروج' });
  await expect(logout).toBeInViewport();
  await logout.click();
  await expect(page.locator('#dlg')).toContainText('تسجيل الخروج من الحساب؟');
  await page.locator('#dlgNo').click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  const search = sidebar.locator('#fatNavSearch');
  await search.fill('owner@example.test');
  await expect(search).toHaveValue('');
  await expect(sidebar.locator('#snsNavEmpty')).toBeHidden();
  await search.fill('Products');
  await expect(sidebar.locator('#snsNavEmpty')).toBeVisible();
  await search.fill('  point    of  sale ');
  await search.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#pageTitle')).toHaveText('نقطة البيع');
  await expect(page.locator('#posSearch')).toBeFocused();
  expect(await page.evaluate(() => visitedViews)).toEqual(['pos']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: 'بحث شامل' }).click();
  await page.locator('#gsInput').fill('عميل الاختبار');
  await expect(page.locator('#gsResults')).toContainText('مفيش نتائج');
  await page.locator('#gsInput').fill('FAB-01');
  await page.locator('#gsResults').getByRole('button', { name: /قماش كتان للعرض/ }).click();
  await expect(page.locator('#posSearch')).toHaveValue('قماش كتان للعرض');
  await page.keyboard.press('Control+k');
  await page.locator('#fatCmdInput').fill('عميل الاختبار');
  await expect(page.locator('#fatCmdResults .fatcmd-item')).toHaveCount(0);
  await page.locator('#fatCmdInput').fill('FAB-01');
  await page.locator('#fatCmdResults').getByRole('button', { name: /قماش كتان للعرض/ }).click();
  await expect(page.locator('#posSearch')).toHaveValue('قماش كتان للعرض');
  expect(errors).toEqual([]);
});

test('inventory toolbar imports product rows into stock and keeps row actions usable', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(() => {
    CURRENT_ORG = 'inventory-test-shop';
    sb.from = table => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if(table==='subscriptions'){
              await new Promise(resolve=>{window.releaseCsvPlan=resolve;});
              return {data:{plan:'trial',status:'active',expires_at:'2099-01-01'}};
            }
            return {data:{max_products:100,max_users:10,max_branches:4}};
          },
        }),
      }),
    });
    db.branches.push({ id: 'branch', name: 'الفرع الثاني' });
    go('products');
  });
  const toolbar = page.locator('#topActions');
  const importItems = toolbar.getByRole('button', { name: 'استيراد الأصناف' });
  await expect(toolbar.getByRole('button', { name: 'تحويل بين الفروع' })).toHaveCount(1);
  await expect(importItems).toHaveCount(1);
  await importItems.click();
  const modal = page.locator('#modal');
  await modal.getByRole('button', { name: 'قراءة أعمدة CSV تلقائيًا' }).click();
  await page.locator('#csvFile').setInputFiles({
    name: 'items.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('الاسم,الكود,السعر,التكلفة,الكمية,التصنيف,الوحدة\nصنف CSV,CSV-01,125,80,17,أقمشة,متر\n'),
  });
  await expect(modal.getByRole('heading', { name: /استيراد أصناف/ })).toBeVisible();
  await modal.getByRole('button', { name: /استيراد 1 سجل/ }).click();
  await expect(modal.getByRole('button',{name:/جارٍ التحقق/})).toBeDisabled();
  await page.evaluate(async () => {
    await csvDoImport();
    window.releaseCsvPlan();
  });
  await expect(modal).not.toBeVisible();
  const imported = await page.evaluate(() => {
    const item = db.products.find(product => product.sku === 'CSV-01');
    return {
      item: item && [item.name, item.price, item.cost, item.qty, item.cat, item.unit],
      importedCount: db.products.filter(product=>product.sku==='CSV-01').length,
      customers: db.customers.map(customer => customer.id),
      movement: db.stockMoves.find(move => move.pid === item?.id)?.delta,
    };
  });
  expect(imported).toEqual({ item: ['صنف CSV', 125, 80, 17, 'أقمشة', 'متر'], customers: ['customer'], movement: 17, importedCount: 1 });
  const row = page.locator('#prodTable').getByRole('row', { name: /CSV-01/ });
  await row.getByRole('button', { name: 'تعديل' }).click();
  await expect(page.locator('#f_name')).toHaveValue('صنف CSV');
  await page.evaluate(() => closeModal());
  const more = row.getByRole('button', { name: 'المزيد' });
  await more.click();
  await expect(page.getByRole('dialog', { name: 'صنف CSV' })).toBeVisible();
  await expect(page.locator('#snsRecordClose')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await more.click();
  await modal.getByRole('button', { name: 'حركة المخزون' }).click();
  await expect(modal).toContainText('استيراد');
  expect(errors).toEqual([]);
});

test('invoice rows open the correct invoice and actions with confirmation', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(() => {
    const item = { pid: 'cloth', name: 'قماش كتان للعرض', price: 150, qty: 1 };
    const invoice = { date: today(), total: 150, sub: 150, dueAmount: 100, paidAmount: 50, profit: 60, items: [item] };
    db.sales = [{ ...invoice, id: 'sale-test', no: 7, customerId: 'customer', customerName: 'عميل الاختبار' }];
    db.purchases = [{ ...invoice, id: 'purchase-test', no: 8, supplierName: 'مورد الاختبار', dueAmount: 0 }];
    go('sales');
  });
  const modal = page.locator('#modal');
  await page.locator('#salesTbl').getByRole('button', { name: 'عرض', exact: true }).click();
  await expect(modal.locator('#printArea')).toContainText('عميل الاختبار');
  await modal.locator('.modal-h .x').click();
  await page.locator('#salesTbl').getByRole('button', { name: 'المزيد' }).click();
  await expect(modal.getByRole('button', { name: 'تحصيل', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'إلغاء الفاتورة' }).click();
  await expect(page.locator('#dlg')).toContainText('سيتم إلغاء الفاتورة');
  await page.locator('#dlgNo').click();
  expect(await page.evaluate(() => db.sales[0].voided)).toBeUndefined();
  await page.evaluate(() => go('purchases'));
  await page.locator('#content').getByRole('button', { name: 'عرض', exact: true }).click();
  await expect(modal.locator('#printArea')).toContainText('مورد الاختبار');
  await modal.locator('.modal-h .x').click();
  await page.locator('#content').getByRole('button', { name: 'المزيد' }).click();
  await expect(modal.getByRole('button', { name: 'سداد', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'إنشاء مرتجع' })).toBeVisible();
  await modal.locator('#snsRecordClose').click();
  await page.evaluate(() => {
    snsPostInvoice(db.sales[0], 'sale');
    go('ledger');
  });
  await page.getByRole('button', { name: /القيود اليومية/ }).click();
  await page.locator('button[data-source="sale-test"]').click();
  await expect(modal.locator('#printArea')).toContainText('عميل الاختبار');
  expect(errors).toEqual([]);
});

test('customers can be searched, filtered and opened from the action menu', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(() => {
    db.settings.priceTierNames = { wholesale: 'تجار & موزعون' };
    db.customers[0].phone2 = '01500123456';
    db.customers.push({ id: 'trade', name: 'عميل جملة', phone: '01100000000', tier: 'wholesale', balance: 60, openingBalance: 60 });
    _rebuildCustIdx();
    go('customers');
  });
  const list = page.locator('#snsCustomersList');
  const search = page.getByRole('searchbox', { name: 'بحث في العملاء' });
  await search.fill('01500123456');
  await expect(list.locator('tbody tr')).toHaveCount(1);
  await expect(list).toContainText('عميل الاختبار');
  await page.getByRole('button', { name: 'تجار & موزعون', exact: true }).click();
  await expect(list).toContainText('مفيش عملاء مطابقين');
  await list.getByRole('button', { name: 'مسح البحث والتصفية' }).click();
  await expect(search).toHaveValue('');
  const row = list.getByRole('row', { name: /عميل جملة/ });
  await expect(row).toContainText('تجار & موزعون');
  await row.getByRole('button', { name: 'عرض', exact: true }).click();
  await expect(page.locator('#modal')).toContainText('عميل جملة');
  await page.locator('#modal .modal-h .x').click();
  await row.getByRole('button', { name: 'المزيد', exact: true }).click();
  await page.getByRole('dialog', { name: 'عميل جملة' }).getByRole('button', { name: 'كشف حساب' }).click();
  await expect(page.locator('#printArea')).toContainText('عميل جملة');
  expect(errors).toEqual([]);
});

test('treasury filters by account and shows the new balances after a transfer', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(() => {
    db.banks = [{ id: 'wallet', name: 'المحفظة التجريبية', opening: 100 }];
    addCash('in', 500, 'إيداع أولي', null, 'cash');
    addCash('in', 30, 'تحصيل بالمحفظة', null, 'wallet');
    go('treasury');
  });
  const list = page.locator('#snsTreasuryMovements');
  const account = page.locator('#snsTreasuryAccount');
  await page.getByRole('button', { name: 'عرض الحركات' }).click();
  await expect(account).toHaveValue('wallet');
  await expect(list).toContainText('تحصيل بالمحفظة');
  await expect(list).not.toContainText('إيداع أولي');
  await page.locator('#snsTreasuryType').selectOption('out');
  await expect(list).toContainText('مفيش حركات مطابقة');
  await page.getByRole('button', { name: 'مسح التصفية' }).click();
  await expect(account).toHaveValue('');
  await expect(page.getByRole('button', { name: 'حذف الحساب' })).toHaveCount(0);
  await page.getByRole('button', { name: 'تحويل بين الحسابات', exact: true }).click();
  await page.locator('#tr_amt').fill('25');
  await page.locator('#tr_note').fill('نقل رصيد اختباري');
  await page.getByRole('button', { name: 'تنفيذ التحويل' }).click();
  await expect(list.getByText(/نقل رصيد اختباري/)).toHaveCount(2);
  expect(await page.evaluate(() => [cashBalance(), bankBalance('wallet')])).toEqual([475, 155]);
  expect(errors).toEqual([]);
});

test('mobile settings switch panels, clear search and localize tab labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openWorkspace(page);
  await page.evaluate(() => go('settings'));
  const tabs = page.locator('#snsSettingsTabs');
  const search = page.getByRole('searchbox', { name: 'بحث في الإعدادات' });
  await expect(page.locator('#sns-settings-profile')).toBeVisible();
  await expect(page.locator('#sns-settings-print')).toBeHidden();
  await tabs.getByRole('button', { name: 'الفواتير والطباعة' }).click();
  await expect(page.locator('#sns-settings-print')).toBeVisible();
  await search.fill('  النسخ   الاحتياطي  ');
  await expect(page.locator('#sns-settings-backup')).toBeVisible();
  await search.fill('no-matching-settings');
  await expect(page.locator('#snsNoSettings')).toBeVisible();
  await tabs.getByRole('button', { name: 'الفروع والفريق' }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('#sns-settings-branches')).toBeVisible();
  await expect(page.locator('#snsNoSettings')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#langBtn').click();
  await expect(tabs.getByRole('button', { name: 'Branches & team' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expect(errors).toEqual([]);
});

test('dashboard invoice total follows the selected branch and each recent invoice opens', async ({ page }) => {
  const errors = await openWorkspace(page, { activity: 'other' });
  await page.evaluate(() => {
    db.branches = [{ id: 'main', name: 'الفرع الرئيسي' }, { id: 'other', name: 'فرع آخر' }];
    db.settings.activeBranch = 'main';
    const base = { date: today(), no: 1, profit: 60, total: 100, paidAmount: 100, customerName: 'عميل الفرع', items: [] };
    db.sales = [
      { ...base, id: 'invoice-main', branch: 'main' },
      { ...base, id: 'invoice-other', total: 900, branch: 'other', customerName: 'عميل الفرع الآخر' },
      { ...base, id: 'invoice-void', total: 700, branch: 'main', voided: true }
    ];
    go('dashboard');
  });
  const total = page.locator('.sns-metric').filter({ hasText: 'إجمالي المبيعات' });
  await expect(total).toContainText('100');
  await expect(page.locator('.sns-recent-sales tbody tr')).toHaveCount(1);
  await page.locator('.sns-recent-sales .sns-text-action').click();
  await expect(page.locator('#modal #printArea')).toContainText('عميل الفرع');
  expect(errors).toEqual([]);
});

test('mobile product cards are keyboard accessible and invoice review does not post a sale', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openWorkspace(page, { activity: 'other' });
  await page.evaluate(() => go('pos'));
  const item = page.locator('#posGrid button[data-pid="cloth"]');
  await expect(item).toBeVisible();
  await item.focus();
  await item.press('Enter');
  await expect(page.locator('#cartItems')).toContainText('قماش كتان للعرض');
  await expect(page.locator('#snsPosReview')).toContainText('150');
  await page.locator('#snsPosReview').click();
  await expect(page.locator('#snsPosCart')).toBeFocused();
  expect(await page.evaluate(() => db.sales.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('POS only adds an unambiguous exact code and lets the cashier choose partial matches', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(() => {
    db.products.push(
      { id: 'a', name: 'صنف ألف', sku: 'X101', qty: 4, price: 20 },
      { id: 'b', name: 'صنف باء', code: 'X102', qty: 4, price: 25 },
      { id: 'c', name: 'صنف جيم', barcode: 'SHARED', qty: 4, price: 30 },
      { id: 'd', name: 'صنف دال', sku: 'SHARED', qty: 4, price: 35 },
    );
    _rebuildProdIdx();
    go('pos');
  });
  const barcode = page.locator('#posBarcode');
  const search = page.locator('#posSearch');
  const cartItems = () => page.evaluate(() => cart.map(line => line.pid));

  await search.press('Enter');
  expect(await cartItems()).toEqual([]);
  await barcode.fill('X10');
  await barcode.press('Enter');
  await expect(search).toHaveValue('X10');
  await expect(page.locator('#posGrid .sns-pos-product')).toHaveCount(2);
  await search.press('Enter');
  expect(await cartItems()).toEqual([]);
  await page.locator('#posGrid [data-pid="a"]').click();

  await barcode.fill('SHARED');
  await barcode.press('Enter');
  await expect(page.locator('#posGrid .sns-pos-product')).toHaveCount(2);
  expect(await cartItems()).toEqual(['a']);

  await barcode.fill(' x102 ');
  await barcode.press('Enter');
  expect(await cartItems()).toEqual(['a', 'b']);
  await expect(search).toHaveValue('');
  expect(errors).toEqual([]);
});

test('a legacy partial return reduces the remaining quantity and refunds once', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(() => {
    db.sales = [{
      id: 'legacy', no: 52, date: today(), customerName: 'عميل تجريبي', paidAmount: 300,
      dueAmount: 0, total: 300, sub: 300, vat: 0, disc: 0, payMethod: 'cash', acct: 'cash',
      items: [{ pid: 'cloth', name: 'قماش كتان للعرض', price: 150, cost: 90, qty: 2 }],
    }];
    db.returns = [{
      id: 'prior', no: 20, date: today(), type: 'sale', refId: 'legacy', total: 150, vat: 0,
      items: [{ name: 'قماش كتان للعرض', qty: 1, price: 150 }],
    }];
    returnForm('sale', 'legacy');
  });
  const modal = page.locator('#modal');
  const quantity = modal.locator('input[type="number"]');
  await expect(quantity).toHaveAttribute('max', '1');
  await quantity.fill('1');
  await modal.getByRole('button', { name: /تأكيد/ }).click();
  expect(await page.evaluate(() => ({
    returned: db.returns.length,
    items: db.returns.at(-1).items,
    stock: findProduct('cloth').qty,
    refund: db.cash.filter(row => row.ref === db.returns.at(-1).id).map(row => row.amount),
  }))).toEqual({
    returned: 2, items: [{ pid: 'cloth', lineId: '0', name: 'قماش كتان للعرض', qty: 1, price: 150 }],
    stock: 11, refund: [150],
  });
  await page.evaluate(() => returnForm('sale', 'legacy'));
  await expect(modal.getByRole('button', { name: /تأكيد/ })).toBeDisabled();
  await expect(quantity).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an old purchase return is allocated once across duplicate lines and rechecked before save', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(() => {
    const item = { pid: 'cloth', name: 'قماش كتان للعرض', price: 50, qty: 1 };
    db.purchases = [{
      id: 'legacy-purchase', no: 52, date: today(), dueAmount: 0, total: 100, vat: 0,
      items: [item, { ...item }],
    }];
    db.returns = [{
      id: 'prior', purchaseId: 'legacy-purchase', items: [{ pid: 'cloth', qty: 1, price: 50 }],
    }];
    returnForm('purchase', 'legacy-purchase');
  });
  const modal = page.locator('#modal');
  const quantity = modal.locator('input[type="number"]');
  await expect(quantity).toHaveCount(1);
  await quantity.fill('1');
  await page.evaluate(() => db.returns.push({
    id: 'another', type: 'purchase', refId: 'legacy-purchase',
    items: [{ pid: 'cloth', lineId: '1', qty: 1, price: 50 }],
  }));
  await modal.getByRole('button', { name: /تأكيد/ }).click();
  await expect(page.locator('#toast')).toContainText('الكمية المتاحة للمرتجع اتغيّرت');
  expect(await page.evaluate(() => [db.returns.length, findProduct('cloth').qty])).toEqual([2, 10]);
  expect(errors).toEqual([]);
});

test('a long POS invoice scrolls on mobile and keeps both print buttons reachable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 720 });
  const errors = await openWorkspace(page, { activity: 'other' });
  let releaseQR;
  const qrGate = new Promise(resolve => { releaseQR = resolve; });
  await page.route('**/vendor/qrcode.min.js', async route => {
    await qrGate;
    await route.continue();
  });
  await page.evaluate(() => {
    window.a4PrintCalls = 0;
    window.print = () => { window.a4PrintCalls++; };
    Object.assign(db.settings, { autoPrintReceipt: false, waAutoReceipt: false, cashierMustShift: false });
    db.products = Array.from({ length: 26 }, (_, index) => ({
      id: 'item-' + index, name: 'صنف ' + index, price: 20, cost: 10, qty: 5,
    }));
    _rebuildProdIdx();
    go('pos');
    db.products.forEach(item => posTap(item.id));
  });
  await page.locator('#snsPosReview').click();
  await page.locator('#posCheckoutBtn').click();
  const preview = page.locator('#modal.sns-invoice-preview');
  const details = preview.locator('#printArea');
  await expect(details.locator('tbody tr')).toHaveCount(26);
  await expect(preview.getByRole('button', { name: /إيصال حراري/ })).toBeInViewport();
  await expect(preview.getByRole('button', { name: /طباعة A4/ })).toBeInViewport();
  expect(await details.evaluate(element => {
    const scrollable = element.scrollHeight > element.clientHeight;
    element.scrollTop = element.scrollHeight;
    return scrollable && element.scrollTop > 0;
  })).toBe(true);
  expect(await page.evaluate(() => db.sales.length)).toBe(1);
  const printA4 = preview.getByRole('button', { name: /طباعة A4/ });
  await printA4.click();
  await expect(printA4).toBeDisabled();
  expect(await page.evaluate(() => window.a4PrintCalls)).toBe(0);
  releaseQR();
  const qr = preview.locator('#invQR');
  await expect(qr).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.a4PrintCalls)).toBe(1);
  expect(await qr.locator('canvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    return pixels.some((channel,index) => index%4===0&&channel===0&&pixels[index+3]===255);
  })).toBe(true);
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.app')).toBeHidden();
  await expect(details.locator('tbody tr').last()).toBeVisible();
  await expect(preview.locator('.modal-f')).toBeHidden();
  const pdf=await page.pdf({preferCSSPageSize:true,path:testInfo.outputPath('SNS_Long_A4_Test.pdf')});
  expect(pdf.toString('ascii',0,5)).toBe('%PDF-');
  expect(errors).toEqual([]);
});

test('cash checkout can be retried immediately after correcting the payment', async ({ page }) => {
  const errors = await openWorkspace(page, { activity: 'other' });
  const result = await page.evaluate(() => {
    Object.assign(db.settings, { cashierMustShift: false, autoPrintReceipt: false, waAutoReceipt: false });
    go('pos');
    posTap('cloth');
    const method = document.getElementById('posPay');
    method.value = 'cash';
    method.dispatchEvent(new Event('change'));
    const total = posCalc().total;
    const received = document.getElementById('posReceived');
    received.value = 1;
    document.getElementById('posCheckoutBtn').click();
    const rejected = {
      sales: db.sales.length,
      notice: document.getElementById('toast').textContent,
    };
    received.value = total;
    document.getElementById('posCheckoutBtn').click();
    posCheckout();
    return { rejected, sales: db.sales.map(sale => sale.paidAmount), total, remaining: cart.length };
  });
  expect(result.rejected.sales).toBe(0);
  expect(result.rejected.notice).toContain('المبلغ المستلم أقل من الإجمالي');
  expect(result.sales).toEqual([result.total]);
  expect(result.remaining).toBe(0);
  await expect(page.locator('#modal.sns-invoice-preview')).toBeVisible();
  expect(errors).toEqual([]);
});

test('supplier CSV discloses excluded opening balances before importing details', async ({ page }) => {
  const errors = await openWorkspace(page, { activity: 'other' });
  await page.evaluate(() => go('suppliers'));
  await page.locator('#topActions').getByRole('button', {name: /استيراد/}).click();
  const modal = page.locator('#modal');
  await modal.getByRole('button', { name: 'قراءة أعمدة CSV تلقائيًا' }).click();
  await expect(modal).toContainText('أرصدة الموردين الافتتاحية تتسجل بشكل منفصل.');
  await page.locator('#csvFile').setInputFiles({
    name: 'suppliers.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,phone,address,balance\nمورد تجربة,01000000000,القاهرة,250\n'),
  });
  await expect(modal.getByRole('alert')).toContainText('الملف فيه عمود رصيد');
  await expect(modal.getByRole('cell', { name: 'مورد تجربة' })).toBeVisible();
  await modal.getByRole('button', {name: 'استيراد بيانات الموردين فقط'}).click();
  await expect(modal).not.toBeVisible();
  const imported = await page.evaluate(() => db.suppliers.find(supplier => supplier.name === 'مورد تجربة'));
  expect(imported).toMatchObject({phone:'01000000000',address:'القاهرة',balance:0});
  expect(errors).toEqual([]);
});

test('the open invoice preview follows cloud acknowledgement and offers conflict review', async ({ page }) => {
  const errors = await openWorkspace(page, { activity: 'other' });
  await page.evaluate(() => {
    CURRENT_UID = 'cloud-user';
    CURRENT_ORG = 'cloud-test-shop';
    CURRENT_ORG_OWNED = true;
    V2_READY = true;
    sb.rpc = (name) => {
      if (name !== 'sns_apply_changes_checked') throw new Error('Unexpected RPC: '+name);
      return new Promise(resolve => { window.finishTestSync = resolve; });
    };
    const invoice = {
      id: 'preview-invoice', no: 12, date: today(), items: [], sub: 150, total: 150,
      vat: 0, disc: 0, paidAmount: 150, dueAmount: 0,
    };
    db.sales = [invoice];
    db.purchases = [{...invoice,id:'purchase-preview'}];
    viewInvoice('sale',invoice.id);
    save();
  });
  const badge = page.locator('#snsInvoiceSyncStatus [role="status"]');
  await expect(badge).toHaveText('بانتظار المزامنة');
  await page.waitForFunction(() => typeof window.finishTestSync === 'function');
  await page.evaluate(() => window.finishTestSync({data:[],error:null}));
  await expect(badge).toHaveText('متزامنة');
  await page.evaluate(() => {
    db.sales[0].paidAmount = 100;
    V2_CONFLICT_ORG = CURRENT_ORG;
    setSyncStatus('err');
  });
  await expect(badge).toHaveText('تحتاج مراجعة المزامنة');
  await page.locator('#snsInvoiceSyncStatus').getByRole('button', {name:'مراجعة المزامنة'}).click();
  await expect(page.locator('#modal .modal-h')).toContainText('مراجعة المزامنة');
  await page.evaluate(() => viewInvoice('purchase','purchase-preview'));
  await expect(badge).toHaveText('متزامنة');
  expect(errors).toEqual([]);
});

test('stock staff can still open inventory but not the finance reports inherited from settings', async ({ page }) => {
  const errors = await openWorkspace(page, { activity: 'other', role: 'stockkeeper' });
  const finance = ['costCenters', 'budget', 'fixedAssets'];
  for (const view of finance) {
    await expect(page.locator(`#nav [data-view="${view}"]`)).not.toBeVisible();
  }
  const destinations = await page.evaluate(finance => finance.map(view => [snsViewAccess(view),go(view)]), finance);
  expect(destinations).toEqual(finance.map(() => ['denied',false]));
  expect(await page.evaluate(() => go('products'))).toBe(true);

  await page.evaluate(() => {
    db.settings.role = 'accountant';
    renderNav();
  });
  expect(await page.evaluate(finance => finance.map(view => snsViewAccess(view)), finance))
    .toEqual(finance.map(() => 'open'));
  expect(errors).toEqual([]);
});

test('a cashier shift follows its drawer movements and requires an actual count', async ({ page }) => {
  const errors = await openWorkspace(page, { activity: 'other', role: 'cashier' });
  await page.evaluate(() => {
    CURRENT_UID = 'cashier-a';
    CURRENT_ORG = 'test-shop-a';
    CURRENT_ROLE = 'cashier';
    V2_READY = true;
    Object.defineProperty(navigator,'onLine',{value:false});
    Object.assign(db.settings, { autoPrintReceipt:false, waAutoReceipt:false, vat:0 });
    go('pos');
  });
  await page.locator('#shiftStatusBtn').click();
  await page.locator('#sh_ofloat').fill('100');
  await page.locator('#modal').getByRole('button',{name:'فتح الشيفت',exact:true}).click();

  const shift = await page.evaluate(async () => {
    const id = shiftSessionLoad().id;
    posTap('cloth');
    posCheckout();
    closeModal();
    const previous={id:'prior-sale',no:44,dueAmount:50,paidAmount:0,customerId:'customer',date:today()};
    db.sales.push(previous);
    db.customers[0].balance=50;
    promptBox=async()=>20;
    fatAskAccount=async()=>'cash';
    await collectInvoice('sale',previous.id);
    addCash('out',10,'Cash movement','test-refund','cash');
    addCash('in',50,'Card settlement','test-card','bank-card');
    db.cash.push({type:'in',amount:999,acct:'cash',shiftSessionId:'other-register'});
    const summary=fatShiftCashExpected();
    CURRENT_UID='cashier-b';
    const other=shiftSessionLoad();
    CURRENT_UID='cashier-a';
    _activeShift=null;
    return {id,other,restored:shiftSessionLoad().id,summary,customer:db.customers[0].balance};
  });
  expect(shift).toMatchObject({other:null,restored:shift.id,customer:30,summary:{expected:260,cashSales:170,cashExp:10}});
  await page.evaluate(() => go('pos'));
  await page.locator('#shiftStatusBtn').click();
  await expect(page.locator('#sh_counted')).toHaveValue('');
  await page.locator('#modal').getByRole('button',{name:/إغلاق الشيفت/}).click();
  await expect(page.locator('#toast')).toContainText('أدخل النقد الفعلي بالدرج');
  await page.locator('#sh_counted').fill('258');
  await page.locator('#modal').getByRole('button',{name:/إغلاق الشيفت/}).click();
  const closed = await page.evaluate(() => ({
    active:shiftSessionLoad(), records:db.shiftSessions.map(({expectedCash,countedCash,variance})=>({expectedCash,countedCash,variance})),
  }));
  expect(closed).toEqual({active:null,records:[{expectedCash:260,countedCash:258,variance:-2}]});
  expect(errors).toEqual([]);
});

test('58mm receipt renders its QR, and a blocked popup leaves the invoice untouched', async ({ page }, testInfo) => {
  const errors = await openWorkspace(page, { activity:'other' });
  await page.addScriptTag({url:'/vendor/qrcode.min.js'});
  const orig = await page.evaluate(() => {
    Object.assign(db.settings,{company:"Ahmed's shop",receiptWidth:'58',autoPrintReceipt:false,waAutoReceipt:false});
    go('pos');posTap('cloth');posCheckout();
    const invoice=db.sales[0];
    window.savedTestOpen=window.open;
    window.open=()=>null;
    printThermal('sale',invoice.id);
    const printLog=db.audit.filter(a=>a.print).length;
    window.open=window.savedTestOpen;
    return {printLog,invoice:snapStr(invoice)};
  });
  expect(orig.printLog).toBe(0);
  await page.evaluate(() => {
    window.open=(...args)=>{
      const popup=window.savedTestOpen(...args);
      popup.print=()=>{popup.document.body.dataset.printRequested='true';};
      popup.close=()=>{};
      return popup;
    };
  });
  const popupPromise=page.waitForEvent('popup');
  await page.locator('#modal').getByRole('button',{name:/إيصال حراري/}).click();
  const popup=await popupPromise;
  await expect(popup.locator('body')).toHaveAttribute('data-print-requested','true');
  await expect(popup.locator('#qrc canvas')).toHaveCount(1);
  await expect(popup.getByRole('heading',{name:"Ahmed's shop"})).toBeVisible();
  const sample=await popup.pdf({width:'58mm',height:'160mm',printBackground:true,path:testInfo.outputPath('SNS_Thermal_58mm_Test.pdf')});
  expect(sample.toString('ascii',0,5)).toBe('%PDF-');

  expect(await popup.locator('body').evaluate(body=>({width:Math.round(body.getBoundingClientRect().width),fits:body.querySelector('table').getBoundingClientRect().width<=body.getBoundingClientRect().width}))).toEqual({width:219,fits:true});
  expect(await page.evaluate(() => ({log:db.audit.filter(a=>a.print).length,invoice:snapStr(db.sales[0])})))
    .toEqual({log:1,invoice:orig.invoice});
  expect(errors).toEqual([]);
});

test('day closing reconciles cash movements independently of the sale method', async ({ page }) => {
  await openWorkspace(page,{activity:'other'});
  const expected = await page.evaluate(()=>{
    db.cash=[
      {date:today(),type:'in',acct:'cash',amount:130},
      {date:today(),type:'out',acct:'cash',amount:25},
      {date:today(),type:'in',acct:'bank',amount:90},
    ];
    shiftCloseModal();
    document.getElementById('sh_float').value=50;
    document.getElementById('sh_actual').value=155;
    shiftCalcDrawer();
    saveShift(today());
    return db.shifts[0]?.expectedCash;
  });
  expect(expected).toBe(155);
});

test('four customer categories and an optional fifth survive saving and keep price levels', async ({ page }) => {
  const errors=await openWorkspace(page,{activity:'other'});
  await page.evaluate(() => { db.settings.priceTierNames={wholesale:'تجار وموزعون'}; go('customers'); });
  for (const label of ['قطاعي','زبون','نص جملة','تجار وموزعون']) {
    await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
  }
  await expect(page.locator('#content [data-tier="custom"]')).toHaveCount(0);
  await page.evaluate(() => { views.settings(); document.getElementById('s_tier_custom').value='شركات'; saveSettings(); go('customers'); });
  await expect(page.getByRole('button',{name:'شركات',exact:true})).toBeVisible();
  await page.evaluate(() => partyForm('customer','customer'));
  await expect(page.locator('#p_tier option')).toHaveCount(5);
  await page.locator('#p_tier').selectOption('shopper');
  await page.locator('#modal').getByRole('button',{name:'حفظ',exact:true}).click();
  await page.getByRole('button',{name:'زبون',exact:true}).click();
  await expect(page.locator('#snsCustomersList tbody tr')).toHaveCount(1);
  await expect(page.locator('#snsCustomersList tbody')).toContainText('زبون');
  await page.evaluate(() => go('pos'));
  await page.locator('#posCustomer').selectOption('customer');
  expect(await page.evaluate(() => ({tier:db.customers[0].tier,level:posPriceTier,price:effPrice(db.products[0])})))
    .toEqual({tier:'shopper',level:'default',price:150});
  expect(errors).toEqual([]);
});

test('a cashier can find an item and the owner can search and open large invoice histories on mobile', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  const errors=await openWorkspace(page,{activity:'other'});
  await page.evaluate(() => {
    const branch=activeBranch();
    db.branches.push({id:'remote-branch',name:'الفرع الآخر'});
    db.sales=Array.from({length:30000},(_,i)=>({
      id:'sale-'+(i+1),no:i+1,date:'2026-10-12',branch,customerName:'عميل '+(i+1),
      items:[],sub:200,total:200,profit:50,paidAmount:200,dueAmount:0,vat:0,disc:0
    }));
    db.sales.push({...db.sales[0],id:'remote-sale',customerName:'خارج الفرع',branch:'remote-branch'});
    db.purchases=[{...db.sales[0],id:'target-purchase',no:30123,supplierName:'مورد حرير',dueAmount:120}];
    db.products=Array.from({length:10000},(_,i)=>({id:'item-'+i,name:'صنف '+i,sku:'CODE-'+i,qty:4,price:20,cost:10}));
    _rebuildProdIdx();go('sales');
  });
  await expect(page.locator('#salesTbl tbody tr')).toHaveCount(300);
  const metrics=await page.evaluate(() => {
    const input=document.getElementById('salesSearch');
    input.value='عميل ٣٠٠٠٠';
    const searchStart=performance.now();
    input.dispatchEvent(new Event('input'));
    const searchMs=performance.now()-searchStart;
    const openStart=performance.now();
    document.querySelector('#salesTbl tbody button').click();
    return {searchMs,openMs:performance.now()-openStart};
  });
  await expect(page.locator('#modal #printArea')).toContainText('عميل 30000');
  expect(metrics.searchMs).toBeLessThan(1200);
  expect(metrics.openMs).toBeLessThan(500);
  await page.locator('#modal .x').click();
  await page.locator('#salesSearch').fill('خارج الفرع');
  await expect(page.locator('#salesTbl tbody tr')).toHaveCount(0);
  await page.evaluate(() => go('purchases'));
  await page.locator('#purchasesSearch').fill('٣٠١٢٣');
  await expect(page.locator('#purchasesTbl tbody tr')).toHaveCount(1);
  await page.locator('#purchasesTbl').getByRole('button',{name:'عرض',exact:true}).click();
  await expect(page.locator('#modal').getByRole('button',{name:'سداد',exact:true})).toBeVisible();
  await page.locator('#modal .x').click();
  await page.evaluate(() => go('pos'));
  const posMs=await page.evaluate(() => {
    const start=performance.now();
    renderPosGrid('CODE-9999');
    return performance.now()-start;
  });
  await expect(page.locator('#posGrid [data-pid="item-9999"]')).toBeVisible();
  expect(await page.locator('#posGrid .sns-pos-product').count()).toBe(1);
  expect(posMs).toBeLessThan(1200);
  console.log('SNS timing ms on synthetic data',JSON.stringify({...metrics,posMs}));
  expect(errors).toEqual([]);
});

test('branch transfer preserves total stock and is blocked in a locked period', async ({ page }) => {
  const errors=await openWorkspace(page,{activity:'other'});
  const result=await page.evaluate(() => {
    const from=activeBranch();
    db.branches.push({id:'destination',name:'الفرع الثاني'});
    db.products[0].bq={[from]:10,destination:0};
    go('products');
    stockTransferForm();
    window._tfRows=[{pid:'cloth',qty:2},{pid:'cloth',qty:3}];
    fatTfConfirm();
    const movements=db.stockMoves.slice(-2).map(({branch,delta})=>[branch,delta]);
    stockTransferForm();
    window._tfRows=[{pid:'cloth',qty:1}];
    db.settings.lockBefore=today();
    fatTfConfirm();
    const product=findProduct('cloth');
    return {from,movements,source:product.bq[from],destination:product.bq.destination,total:product.qty,drift:fatBQDrift(product),transfers:db.transfers.length};
  });
  expect(result).toMatchObject({movements:[[result.from,-5],['destination',5]],source:5,destination:5,total:10,drift:0,transfers:1});
  expect(errors).toEqual([]);
});

test('cloud restore leaves an existing cash-only shop intact', async ({ page }) => {
  const errors=await openWorkspace(page,{activity:'other'});
  await page.evaluate(() => {
    CURRENT_ORG='restore-shop'; CURRENT_UID='restore-owner'; CURRENT_ROLE='manager';
    db.customers=[];db.products=[];db.sales=[];db.purchases=[];
    db.cash=[{id:'existing-cash',type:'in',amount:70}];
    const data={sales:[],customers:[],products:[],cash:[{id:'backup-cash',type:'in',amount:2}]};
    restoreFullBackup({files:[new File([JSON.stringify(data)],'restore.json')]});
  });
  await expect(page.locator('#toast')).toContainText('جرّب استرجاع الملف في محل تجريبي فاضي');
  expect(await page.evaluate(() => db.cash.map(movement=>movement.id))).toEqual(['existing-cash']);
  expect(errors).toEqual([]);
});

test('supplier search and both statements expose the balance direction and next action', async ({ page }) => {
  const errors=await openWorkspace(page,{activity:'other'});
  await page.evaluate(() => {
    db.customers[0].balance=80;
    db.suppliers=[
      {id:'supplier-due',name:'مورد مستحق',phone:'01000000023',balance:120},
      {id:'supplier-advance',name:'مورد مقدم',phone:'01000000024',balance:-40},
    ];
    go('suppliers');
  });
  const search=page.getByRole('searchbox',{name:'بحث في الموردين'});
  await search.fill('01000000023');
  await expect(page.locator('#snsSupplierList tbody tr')).toHaveCount(1);
  await page.locator('#snsSupplierList').getByRole('button',{name:'كشف حساب'}).click();
  await expect(page.locator('#printArea')).toContainText('مستحق للمورد');
  await expect(page.locator('#modal').getByRole('button',{name:'سداد',exact:true})).toBeVisible();
  await page.locator('#modal .x').click();
  await search.fill('مقدم');
  await page.locator('#snsSupplierList').getByRole('button',{name:'كشف حساب'}).click();
  await expect(page.locator('#printArea')).toContainText('رصيد مقدّم للمورد');
  await expect(page.locator('#modal').getByRole('button',{name:'سداد',exact:true})).toHaveCount(0);
  await page.locator('#modal .x').click();
  await page.evaluate(() => go('customers'));
  await page.locator('#snsCustomersList').getByRole('button',{name:'كشف حساب'}).click();
  await expect(page.locator('#printArea')).toContainText('مستحق لك من العميل');
  await expect(page.locator('#modal').getByRole('button',{name:'تحصيل',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('manual invoice rejects duplicate quantities against the active branch and saves the valid sale once', async ({ page }) => {
  const errors = await openWorkspace(page, { activity: 'other' });
  await page.evaluate(() => {
    const branch=activeBranch();
    db.branches.push({id:'reserve',name:'فرع احتياطي'});
    Object.assign(findProduct('cloth'), {qty:10,bq:{[branch]:3,reserve:7}});
    invoiceForm('sale');
    invLines=[{pid:'cloth',qty:2,price:150},{pid:'cloth',qty:2,price:150}];
    saveInvoice();
  });
  await expect(page.locator('#toast')).toContainText('الكمية أكبر من المتاح في الفرع');
  expect(await page.evaluate(() => [db.sales.length,db.cash.length,findProduct('cloth').qty])).toEqual([0,0,10]);

  await page.evaluate(() => {
    invLines[1].qty=1;
    saveInvoice();
    saveInvoice();
  });
  expect(await page.evaluate(() => ({
    sales:db.sales.map(row=>row.total),cash:db.cash.map(row=>row.amount),
    stock:findProduct('cloth').qty,branch:fatBQOf(findProduct('cloth'),activeBranch()),
    reserve:fatBQOf(findProduct('cloth'),'reserve')
  }))).toEqual({sales:[513],cash:[513],stock:7,branch:0,reserve:7});
  expect(errors).toEqual([]);
});

test('mobile renewal can open above the subscription lock and an unsent draft creates no payment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openWorkspace(page, { activity: 'other' });
  await page.evaluate(() => {
    CURRENT_ORG='test-renewal';
    SUB={plan:'starter',status:'active',expires_at:new Date(Date.now()-60_000).toISOString()};
    enforceSubLock();
    window.fatPayMethods=()=>[{key:'demo',icon:'✓',label:'تجريبي',labelEn:'Demo',value:'0000'}];
    window.open=()=>null;
  });
  expect(await page.evaluate(() => [subDaysLeft(),snsCanPost(today())])).toEqual([-1,false]);
  await page.getByRole('button', { name:'الباقات والتجديد' }).click();
  const modal=page.locator('#modalBg.open');
  await expect(modal.getByRole('heading', { name:'تجديد الاشتراك' })).toBeVisible();
  await modal.locator('#rn_ref').fill('TEST-1');
  const send=modal.getByRole('button', { name:'افتح رسالة التحويل على واتساب' });
  await send.click();
  await expect(page.locator('#toast')).toContainText('المتصفح منع فتح واتساب');
  await page.evaluate(() => {
    window.testDrafts=[];
    window.open=()=>({
      opener:window,
      location:{set href(value){testDrafts.push(value);}}
    });
  });
  await send.click();
  await send.click();
  await expect(page.locator('#toast')).toContainText('اضغط إرسال داخل واتساب');
  expect(await page.evaluate(() => ({
    validDrafts:testDrafts.every(link=>link.startsWith('https://wa.me/')&&decodeURIComponent(link).includes('TEST-1')),
    count:testDrafts.length,claims:(db.payClaims||[]).length
  }))).toEqual({validDrafts:true,count:2,claims:0});

  await page.evaluate(() => {
    closeModal();
    let verified=false;
    Object.assign(sb,{from(table){
      return {select(){return this;},eq(){return this;},async maybeSingle(){
        if(table==='plan_limits')return {data:{max_users:5,max_products:500,max_branches:1}};
        if(!verified){verified=true;return {error:new Error('Test disconnect')};}
        return {data:{plan:'starter',status:'active',expires_at:new Date(Date.now()+86_400_000).toISOString()}};
      }};
    }});
  });
  const verify=page.getByRole('button', { name:'تحقّق من التفعيل' });
  await verify.click();
  await expect(page.locator('#toast')).toContainText('تعذّر التحقق من الاشتراك');
  await expect(page.locator('#subLock')).toBeVisible();
  await verify.click();
  await expect(page.locator('#subLock')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a purchase order receives partial quantities only at its originating branch', async ({ page }) => {
  const errors=await openWorkspace(page,{activity:'other'});
  await page.evaluate(() => {
    window.orderBranch=activeBranch();
    db.branches.push({id:'reserve',name:'فرع احتياطي'});
    db.suppliers=[{id:'supplier-test',name:'مورد الاختبار',balance:0}];
    poForm([{pid:'cloth',name:'قماش كتان للعرض',qty:4,estCost:20}]);
    document.getElementById('po_sup').value='supplier-test';
    savePO();
    db.settings.activeBranch='reserve';
    receivePO(db.purchaseOrders[0].id);
  });
  await expect(page.locator('#toast')).toContainText('اختار فرع أمر الشراء قبل الاستلام');
  expect(await page.evaluate(() => db.purchases.length)).toBe(0);
  await page.evaluate(() => {
    db.settings.activeBranch=orderBranch;
    receivePO(db.purchaseOrders[0].id);
    db.settings.activeBranch='reserve';
    saveInvoice();
  });
  await expect(page.locator('#toast')).toContainText('اختار فرع أمر الشراء قبل حفظ الاستلام');
  expect(await page.evaluate(() => db.purchases.length)).toBe(0);
  await page.evaluate(() => {
    db.settings.activeBranch=orderBranch;
    invLines[0].qty=2;
    document.getElementById('inv_vat').value='0';
    document.getElementById('inv_pm').value='credit';
    saveInvoice();
    viewPO(db.purchaseOrders[0].id);
  });
  await expect(page.locator('#modal')).toContainText('المتبقي للمورد في الفواتير المرتبطة');
  expect(await page.evaluate(() => ({
    status:db.purchaseOrders[0].status,remainder:purchaseOrderRemaining(db.purchaseOrders[0])[0].qty,
    receivable:db.purchases[0].dueAmount,supplier:findSupplier('supplier-test').balance,
    qty:fatBQOf(findProduct('cloth'),orderBranch),reserve:fatBQOf(findProduct('cloth'),'reserve')
  }))).toEqual({status:'partial',remainder:2,receivable:40,supplier:40,qty:12,reserve:0});
  expect(errors).toEqual([]);
});

test('billing reviewer records a verified transfer and the shop owner can read its confirmation', async ({ page }) => {
  const errors=await openWorkspace(page,{activity:'other'});
  await page.evaluate(() => {
    CURRENT_ORG='demo-shop';
    CURRENT_ORG_OWNED=true;
    SNS_BILLING_REVIEWER=true;
    window.billingRequests=[];
    Object.assign(sb,{rpc:async (name,args)=>{
      switch(name){
        case 'sns_billing_shops':
          return {data:[{org_id:'demo-shop',name:'محل تجريبي',plan:'trial',status:'trialing'}]};
        case 'sns_review_transfer':
          billingRequests.push(args);
          return {data:{decision:args.p_decision,replayed:billingRequests.length>1}};
        case 'sns_my_transfer_reviews':
          return {data:[{reference:'DEMO-9001',amount:299,decision:'accepted',expires_at:'2027-02-03T00:00:00Z'}]};
        default:
          return {data:null};
      }
    }});
    go('admin');
  });
  await expect(page.locator('#affBody')).toHaveCount(0);
  await page.getByRole('button',{name:'مراجعة تحويل'}).click();
  const form=page.locator('#snsTransferReview');
  await form.locator('[name="reference"]').fill('DEMO-9001');
  await form.locator('[name="amount"]').fill('299');
  const accept=form.getByRole('button',{name:'قبول وتفعيل'});
  await accept.click();
  await expect(form.locator('#snsTransferResult')).toContainText('أكد إنك راجعت التحويل');
  expect(await page.evaluate(()=>billingRequests.length)).toBe(0);
  await form.locator('[name="verified"]').check();
  await accept.click();
  await expect(form.locator('#snsTransferResult')).toContainText('اتفعّل الاشتراك');
  await accept.click();
  await expect(form.locator('#snsTransferResult')).toContainText('متسجل بالفعل');
  expect(await page.evaluate(()=>billingRequests[0])).toMatchObject({p_reference:'DEMO-9001',p_amount:299,p_decision:'accepted'});
  await page.evaluate(()=>{closeModal();fatRenewModal();});
  await expect(page.locator('#rnModalBody [data-transfer-reviews]')).toContainText('DEMO-9001');
  await expect(page.locator('#rnModalBody [data-transfer-reviews]')).toContainText('تم التفعيل');
  expect(errors).toEqual([]);
});

test('warehouse rent and cheque reminders follow dates without posting cash or ledgers', async ({ page }) => {
  const errors = await openWorkspace(page);
  await page.evaluate(() => {
    db.branches = [{id:'main',name:'المخزن الأساسي'},{id:'home',name:'مخزن البيت'}];
    db.banks = [{id:'bank',name:'بنك الاختبار'}];
    db.settings.activeBranch = 'main';
    go('expenses');
  });
  const panel = page.locator('#snsCommitmentPanel');
  await panel.getByRole('button', { name: '+ إضافة' }).click();
  const form = page.locator('#modal form');
  await form.locator('[name="kind"]').selectOption('incoming');
  await form.locator('[name="bank"]').selectOption('bank');
  await form.locator('[name="description"]').fill('شيك المورد التجريبي');
  await form.locator('[name="amount"]').fill('25000');
  await form.locator('[name="due"]').fill('2026-01-15');
  await form.getByRole('button', { name: 'حفظ الموعد' }).click();
  await expect(panel).toContainText('بنك الاختبار');
  expect(await page.evaluate(() => ['2026-01-09','2026-01-10','2026-01-15','2026-01-16'].map(date=>snsCommitmentAlerts(date).length))).toEqual([0,1,1,1]);
  const checkRow = panel.getByRole('row').filter({ hasText: 'شيك المورد التجريبي' });
  await checkRow.getByRole('button', { name: 'تم الإيداع' }).click();
  await form.getByRole('button', { name: 'تأكيد',exact:true }).click();
  await expect(checkRow).toContainText('مقدّم للبنك');
  await checkRow.getByRole('button', { name: 'شيك مرتجع' }).click();
  await form.getByRole('button', { name: 'تأكيد',exact:true }).click();
  await expect(checkRow).toContainText('مرتجع — يحتاج متابعة');
  expect(await page.evaluate(() => snsCommitmentAlerts().length)).toBe(1);
  await checkRow.getByRole('button', { name: 'تأكيد التسوية' }).click();
  await form.getByRole('button', { name: 'تأكيد',exact:true }).click();
  expect(await page.evaluate(() => snsCommitmentAlerts().length)).toBe(0);

  await panel.getByRole('button', { name: '+ إضافة' }).click();
  await form.locator('[name="description"]').fill('إيجار المخزن الأساسي');
  await form.locator('[name="amount"]').fill('8000');
  await form.locator('[name="due"]').fill('2026-01-31');
  await form.locator('[name="monthly"]').check();
  await form.getByRole('button', { name: 'حفظ الموعد' }).click();
  const rentRow = panel.getByRole('row').filter({ hasText: 'إيجار المخزن الأساسي' });
  for (const due of ['2026-02-28','2026-03-31']) {
    await rentRow.getByRole('button', { name: 'تأكيد السداد' }).click();
    await form.getByRole('button', { name: 'تأكيد',exact:true }).click();
    await expect(rentRow).toContainText(due);
  }
  expect(await page.evaluate(() => ({
    cash:db.cash.length, expenses:db.expenses.length,journal:db.journal.length,
    autoPosted:recExpProcess(),active:snsCommitments().map(row=>row.active),
  }))).toEqual({cash:0,expenses:0,journal:0,autoPosted:0,active:[false,false]});
  await page.evaluate(() => { window._fatMyBranch='home'; views.expenses(); });
  await expect(panel).not.toContainText('إيجار المخزن الأساسي');
  await page.evaluate(() => { db.settings.role='cashier'; views.expenses(); });
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});
