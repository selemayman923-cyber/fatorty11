/* اختبار: استبيان الرضا NPS + الضمانات */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const file = process.argv[2] || 'index.html';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (extra ? '\n       ' + extra : ''))); };
const html = fs.readFileSync(file, 'utf8');
const jsErrors = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.vercel.app/', virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = () => {}; w.print = () => {}; w.alert = () => {}; w.confirm = () => true; w.prompt = () => '';
    w.open = () => ({ document: { write() {}, close() {} }, print() {}, close() {}, focus() {} });
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

  console.log('\n▶ الدوال/الشاشات موجودة');
  ['fatSurveys', 'fatSurveyNps', 'fatSurveySave', 'fatWarranties', 'fatWarrantyExpiry', 'fatWarrantySave'].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));
  ['satisfaction', 'warranties'].forEach(v => ok('views.' + v, ev("typeof views." + v + "==='function'") === true));

  ev("db.customers=db.customers||[]; db.products=db.products||[]; db.settings=db.settings||{};");
  ev("db.customers.push({id:'C1',name:'عميل',phone:'0100'});db.products.push({id:'P1',name:'تليفزيون'});");

  console.log('\n▶ استبيان الرضا NPS (v10.40)');
  // 3 مبسوطين (10,9,9)، 1 محايد (7)، 1 زعلان (4) → prom=3 det=1 n=5 → NPS=(0.6-0.2)*100=40
  ev("db.settings.surveys=[{id:'a',score:10,date:today()},{id:'b',score:9,date:today()},{id:'c',score:9,date:today()},{id:'d',score:7,date:today()},{id:'e',score:4,date:today()}];");
  ok('حساب NPS صح (40)', ev("fatSurveyNps().nps") === 40, 'got ' + ev("fatSurveyNps().nps"));
  ok('المتوسط صح', ev("fatSurveyNps().avg") === 7.8, 'got ' + ev("fatSurveyNps().avg"));
  ok('عدّ المبسوطين/الزعلانين', ev("fatSurveyNps().prom") === 3 && ev("fatSurveyNps().det") === 1);
  let svErr = ev("(function(){try{views.satisfaction();return '';}catch(e){return e.message;}})()");
  ok('views.satisfaction بترسم', svErr === '', svErr);

  console.log('\n▶ الضمانات (v10.41)');
  ev("db.settings.warranties=[];");
  // ضمان سنة من النهاردة، وضمان قرب ينتهي (شهر), وضمان منتهي
  ev("(function(){var W=fatWarranties();" +
     "W.push({id:'w1',productName:'تليفزيون',purchaseDate:today(),months:12});" +   // ساري
     "W.push({id:'w2',productName:'موبايل',purchaseDate:addDays(today(),-15),months:1});" + // ينتهي ~15 يوم
     "W.push({id:'w3',productName:'لابتوب',purchaseDate:fatAddMonths(today(),-24),months:12});})()"); // منتهي
  ok('حساب تاريخ الانتهاء صح', ev("fatWarrantyExpiry({purchaseDate:today(),months:12})") === ev("fatAddMonths(today(),12)"));
  let wErr = ev("(function(){try{views.warranties();return '';}catch(e){return e.message;}})()");
  ok('views.warranties بترسم', wErr === '', wErr);
  ok('الشاشة بتفرّق ساري/منتهي', (w.document.getElementById('content') || {}).innerHTML.indexOf('منتهي') > -1);
  var alerts = ev("(function(){var a=getAlerts()||[];return a.map(function(x){return x.msg;}).join(' || ');})()");
  ok('تنبيه الجرس للضمان اللي قرب ينتهي', /ضمان قرب ينتهي|warranties expiring/.test(alerts), alerts);

  console.log('\n▶ بنية الملف سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
