/* اختبار: الإجازات + مقارنة الموردين + العملات + بناء الصلاحيات */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const file = process.argv[2] || 'index.html';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (extra ? '\n       ' + extra : ''))); };
const html = fs.readFileSync(file, 'utf8');
const jsErrors = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://fatorty11.vercel.app/', virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = () => {}; w.print = () => {}; w.alert = () => {}; w.confirm = () => true; w.prompt = () => '';
    w.open = () => ({ document: { write() {}, close() {} }, print() {}, close() {} });
    w.navigator.serviceWorker = { register: () => Promise.resolve({ addEventListener() {}, update() {} }), addEventListener() {}, controller: null, ready: Promise.resolve({}) };
    w.indexedDB = { open: () => ({ addEventListener() {} }) };
    w.AudioContext = function () { return { state: 'running', resume() {}, createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: {}, type: '' }), createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }), destination: {}, currentTime: 0 }; };
    w.supabase = { createClient: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signInWithPassword: () => Promise.resolve({ data: {}, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ range: () => Promise.resolve({ data: [], error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }), rpc: () => Promise.resolve({ data: [], error: null }) }) };
  }
});
const w = dom.window;
const ev = e => { try { return w.eval(e); } catch (x) { return '__ERR__:' + x.message; } };

setTimeout(() => {
  console.log('\n▶ الإقلاع نضيف');
  ok('اشتغل من غير أخطاء', jsErrors.length === 0, jsErrors.slice(0, 3).join('\n       '));

  console.log('\n▶ الدوال/الشاشات موجودة');
  ['fatLeavesAll', 'fatLeaveSave', 'fatLeaveStatus', 'fatSupplierStats', 'fatProductSupplierPrices',
   'fatCurrencies', 'fatConvert', 'fatRateOf', 'fatRoleOverrides', 'fatPermToggle'
  ].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));
  ['leaves', 'supcompare', 'currency', 'permbuilder'].forEach(v => ok('views.' + v, ev("typeof views." + v + "==='function'") === true));

  // بيانات تجريبية
  ev("db.employees=db.employees||[]; db.employees.push({id:'E1',name:'أحمد',payments:[]}); db.employees.push({id:'E2',name:'منى',payments:[]});");
  ev("db.suppliers=db.suppliers||[]; db.purchases=db.purchases||[]; db.products=db.products||[];");
  ev("db.products.push({id:'PR1',name:'بن',cat:'قهوة',qty:5,min:3,cost:100,price:150});");
  ev("db.purchases.push({no:1,date:fatAddMonths(today(),-1),supplierName:'مورد أ',total:1000,items:[{pid:'PR1',price:100,qty:10}]});");
  ev("db.purchases.push({no:2,date:today(),supplierName:'مورد ب',total:400,items:[{pid:'PR1',price:90,qty:4}]});");
  ev("db.purchases.push({no:3,date:today(),supplierName:'مورد أ',total:500,items:[{pid:'PR1',price:105,qty:5}]});");

  console.log('\n▶ الإجازات (v10.17)');
  ev("(function(){var e=db.employees[0];e.leaves=[{id:'L1',from:today(),to:today(),type:'اعتيادية',status:'pending'}];})()");
  ok('fatLeavesAll بيجمّع الطلبات', ev("fatLeavesAll().length") === 1);
  ok('fatLeaveStatus بيغيّر الحالة لمقبولة', (function(){ w.fatLeaveStatus('E1','L1','approved'); return ev("db.employees[0].leaves[0].status")==='approved'; })());
  let lvErr = ev("(function(){try{views.leaves();return '';}catch(e){return e.message;}})()");
  ok('views.leaves بترسم', lvErr === '', lvErr);

  console.log('\n▶ مقارنة الموردين (v10.18)');
  const stats = ev("JSON.stringify(fatSupplierStats().map(function(s){return {n:s.name,o:s.orders,sp:s.spend};}))");
  ok('fatSupplierStats بيحسب لكل مورد', /مورد أ/.test(stats) && /مورد ب/.test(stats), stats);
  ok('مورد أ عنده أمرين', ev("fatSupplierStats().filter(function(s){return s.name==='مورد أ';})[0].orders") === 2);
  const prices = ev("JSON.stringify(fatProductSupplierPrices('PR1'))");
  ok('مقارنة أسعار الصنف بترتّب الأرخص أول', ev("fatProductSupplierPrices('PR1')[0].price") === 90, prices);
  let scErr = ev("(function(){try{views.supcompare();return '';}catch(e){return e.message;}})()");
  ok('views.supcompare بترسم', scErr === '', scErr);

  console.log('\n▶ تعدد العملات (v10.19)');
  ev("db.settings=db.settings||{}; db.settings.currency='ج.م'; db.settings.currencies=[{code:'USD',name:'دولار',rate:50},{code:'EUR',name:'يورو',rate:55}];");
  ok('fatRateOf للأساسية = 1', ev("fatRateOf('__base')") === 1);
  ok('fatConvert: 100 USD = 5000 أساسي', ev("fatConvert(100,'USD','__base')") === 5000);
  ok('fatConvert: 5000 أساسي = 100 USD', ev("fatConvert(5000,'__base','USD')") === 100);
  ok('fatConvert بين عملتين (100 USD → EUR)', Math.round(ev("fatConvert(100,'USD','EUR')")) === Math.round(100 * 50 / 55));
  let cyErr = ev("(function(){try{views.currency();return '';}catch(e){return e.message;}})()");
  ok('views.currency بترسم', cyErr === '', cyErr);
  ok('الفواتير مااتغيّرتش (money لسه بالأساسي)', ev("typeof money==='function' && money(100).indexOf('ج.م')>-1"));

  console.log('\n▶ بناء الصلاحيات (v10.20)');
  let pbErr = ev("(function(){try{views.permbuilder();return '';}catch(e){return e.message;}})()");
  ok('views.permbuilder بترسم', pbErr === '', pbErr);
  // نمنع الكاشير من شاشة المبيعات
  ev("db.settings.role='cashier'; fatRoleOverrides()['cashier']=['pos','settings'];");
  ok('override بيمنع الكاشير من sales', ev("canView('sales')") === false);
  ok('لكن settings دايمًا متاحة', ev("canView('settings')") !== false);
  ok('pos مسموح للكاشير في الـoverride', ev("canView('pos')") === true);
  ev("fatPermReset('cashier'); db.settings.role='manager';");
  ok('بعد الـReset الكاشير يرجع طبيعي', ev("(function(){db.settings.role='cashier';var r=canView('sales');db.settings.role='manager';return r;})()") !== false ? true : ev("!db.settings.roleViewOverrides.cashier") === true);
  ok('المدير مايتأثرش بالـoverrides', ev("(function(){db.settings.role='manager';fatRoleOverrides()['manager']=['pos'];return canView('sales');})()") !== false);

  console.log('\n▶ بنية الملف سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
