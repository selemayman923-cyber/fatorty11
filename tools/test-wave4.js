/* اختبار: الوضع المضغوط + التنبيهات الذكية + حملة الاستعادة */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const file = process.argv[2] || 'index.html';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (extra ? '\n       ' + extra : ''))); };
const html = fs.readFileSync(file, 'utf8');
const jsErrors = []; const store = {};
const vc = new VirtualConsole(); vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.vercel.app/', virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = () => {}; w.print = () => {}; w.alert = () => {}; w.confirm = () => true; w.prompt = () => '';
    let waLast = null; w._waLast = () => waLast;
    w.open = (u) => { waLast = u || ''; return { document: { write() {}, close() {} }, print() {}, close() {}, focus() {} }; };
    try { Object.defineProperty(w, 'localStorage', { value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, configurable: true }); } catch (e) {}
    w.navigator.serviceWorker = { register: () => Promise.resolve({ addEventListener() {}, update() {} }), addEventListener() {}, controller: null, ready: Promise.resolve({}) };
    w.indexedDB = { open: () => ({ addEventListener() {} }) };
    w.AudioContext = function () { return { state: 'running', resume() {}, createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: {}, type: '' }), createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }), destination: {}, currentTime: 0 }; };
    w.supabase = { createClient: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({ select: () => ({ eq: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }) }), rpc: () => Promise.resolve({ data: [], error: null }) }) };
  }
});
const w = dom.window;
const ev = e => { try { return w.eval(e); } catch (x) { return '__ERR__:' + x.message; } };

setTimeout(() => {
  console.log('\n▶ الإقلاع نضيف');
  ok('اشتغل من غير أخطاء', jsErrors.length === 0, jsErrors.slice(0, 3).join('\n       '));

  console.log('\n▶ الدوال موجودة');
  ['fatDensity', 'fatWinbackOpen', 'fatWinbackSend'].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));

  console.log('\n▶ الوضع المضغوط (v10.34)');
  w.fatDensity(true);
  ok('الوضع المضغوط اتفعّل (class على body)', w.document.body.classList.contains('fat-dense'));
  ok('اتحفظ في التخزين', store['fat_density'] === '1');
  ok('استايل الضغط اتحقن', !!w.document.getElementById('fatDenseStyle'));
  w.fatDensity(false);
  ok('التبديل بيطفّيه', !w.document.body.classList.contains('fat-dense'));

  console.log('\n▶ التنبيهات الذكية (v10.35)');
  ev("db.customers=db.customers||[]; db.sales=db.sales||[]; db.products=db.products||[]; db.expenses=db.expenses||[];");
  // عميل قيّم متوقّف
  ev("db.customers.push({id:'CL',name:'عميل قيّم'});db.sales.push({id:'x',no:1,date:fatAddMonths(today(),-8),customerId:'CL',total:5000,items:[{pid:'PA',qty:1,price:5000}]});");
  // صنف راكد (مخزون بدون بيع)
  ev("db.products.push({id:'PDEAD',name:'صنف راكد',qty:20});");
  // مصروف شاذّ
  ev("[100,120,90,110,3000].forEach(function(a,i){db.expenses.push({id:'e'+i,date:today(),amount:a,cat:'ت'});});");
  var alerts = ev("(function(){var a=getAlerts()||[];return a.map(function(x){return x.msg;}).join(' || ');})()");
  ok('تنبيه: عميل قيّم توقّف', /توقّف|quiet/.test(alerts), alerts);
  ok('تنبيه: صنف راكد', /راكد|idle/.test(alerts), alerts);
  ok('تنبيه: مصروف شاذّ', /شاذّ|unusual/.test(alerts), alerts);

  console.log('\n▶ حملة الاستعادة (v10.36)');
  ev("db.customers.push({id:'AR',name:'معرّض للفقد',phone:'01099998888'});db.sales.push({id:'y',no:2,date:fatAddMonths(today(),-3),customerId:'AR',total:800,items:[{pid:'PB',qty:1,price:800}]});");
  let wbErr = '';
  try { w.fatWinbackOpen(); } catch (e) { wbErr = e.message; }
  ok('فتح حملة الاستعادة من غير أخطاء', wbErr === '', wbErr);
  var body = (w.document.querySelector('#modal .modal-b') || {}).innerHTML || '';
  ok('الحملة بتعرض المعرّضين/المتوقّفين', body.indexOf('معرّض للفقد') > -1 || body.indexOf('عميل قيّم') > -1, body.slice(0, 100));
  ev("fatWaSend=undefined;");
  w.fatWinbackSend('AR');
  ok('إرسال العرض بيفتح واتساب', /wa\.me\//.test(w._waLast() || ''), w._waLast());
  ok('زر الحملة بيظهر في شاشة الشرائح', ev("(function(){try{views.rfm();var t=document.getElementById('topActions');return t&&t.innerHTML.indexOf('fatWinbackBtn')>-1;}catch(e){return false;}})()") === true);

  console.log('\n▶ الأداء: getAlerts متكرر مع الكاش');
  var t0 = Date.now(); for (var i = 0; i < 50; i++) ev("getAlerts()"); var ms = Date.now() - t0;
  ok('٥٠ نداء getAlerts سريع (كاش) — ' + ms + 'ms', ms < 2000, ms + 'ms');

  console.log('\n▶ بنية الملف سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
