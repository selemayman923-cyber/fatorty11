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
  const imported = await page.evaluate(() => {
    const item = db.products.find(product => product.sku === 'CSV-01');
    return {
      item: item && [item.name, item.price, item.cost, item.qty, item.cat, item.unit],
      customers: db.customers.map(customer => customer.id),
      movement: db.stockMoves.find(move => move.pid === item?.id)?.delta,
    };
  });
  expect(imported).toEqual({ item: ['صنف CSV', 125, 80, 17, 'أقمشة', 'متر'], customers: ['customer'], movement: 17 });
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
  await page.getByRole('button', { name: 'جملة', exact: true }).click();
  await expect(list).toContainText('مفيش عملاء مطابقين');
  await list.getByRole('button', { name: 'مسح البحث والتصفية' }).click();
  await expect(search).toHaveValue('');
  const row = list.getByRole('row', { name: /عميل جملة/ });
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
