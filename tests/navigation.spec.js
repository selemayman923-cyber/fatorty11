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
          maybeSingle: async () => ({
            data: table === 'subscriptions'
              ? { plan: 'trial', status: 'active', expires_at: '2099-01-01' }
              : { max_products: 100, max_users: 10, max_branches: 4 },
          }),
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
  await expect(modal).not.toBeVisible();
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

test('a long POS invoice scrolls on mobile and keeps both print buttons reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  const errors = await openWorkspace(page, { activity: 'other' });
  await page.evaluate(() => {
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
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.app')).toBeHidden();
  await expect(details.locator('tbody tr').last()).toBeVisible();
  await expect(preview.locator('.modal-f')).toBeHidden();
  const pdf=await page.pdf({preferCSSPageSize:true});
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

test('58mm receipt renders its QR, and a blocked popup leaves the invoice untouched', async ({ page }) => {
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
