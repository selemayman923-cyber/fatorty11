/* اختبار: البحث السريع الشامل (Command palette) */
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

  console.log('\n▶ الدوال موجودة');
  ['fatCmdOpen', 'fatCmdClose', 'fatCmdSearch', 'fatCmdGo'].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));

  ev("db.customers=db.customers||[]; db.products=db.products||[];");
  ev("db.customers.push({id:'CU',name:'محمد التجريبي',phone:'01234567890',isPatient:true});");
  ev("db.products.push({id:'PRD',name:'بن تركي',sku:'BN1',price:100,qty:5});");

  console.log('\n▶ فتح/غلق اللوحة');
  w.fatCmdOpen();
  ok('اللوحة اتفتحت (fatCmdWrap)', !!w.document.getElementById('fatCmdWrap'));
  ok('فيه خانة بحث', !!w.document.getElementById('fatCmdInput'));
  ok('الزرار العائم موجود', !!w.document.getElementById('fatCmdFab'));

  console.log('\n▶ البحث');
  w.fatCmdSearch('');
  ok('من غير كلمة: بيعرض شاشات للتنقل', (w.document.getElementById('fatCmdResults') || {}).innerHTML.indexOf('fatcmd-item') > -1);
  w.fatCmdSearch('محمد');
  var r1 = (w.document.getElementById('fatCmdResults') || {}).innerHTML || '';
  ok('البحث عن عميل بالاسم بيلاقيه', r1.indexOf('محمد التجريبي') > -1);
  w.fatCmdSearch('بن');
  var r2 = (w.document.getElementById('fatCmdResults') || {}).innerHTML || '';
  ok('البحث عن منتج بيلاقيه', r2.indexOf('بن تركي') > -1);
  w.fatCmdSearch('0123456');
  var r3 = (w.document.getElementById('fatCmdResults') || {}).innerHTML || '';
  ok('البحث بالتليفون بيلاقي العميل', r3.indexOf('محمد التجريبي') > -1);
  w.fatCmdSearch('zzznotfound');
  ok('كلمة مش موجودة: بيقول مفيش نتايج', ((w.document.getElementById('fatCmdResults') || {}).innerHTML || '').indexOf('مفيش نتايج') > -1);

  console.log('\n▶ التنقل والأمان');
  var went = '';
  ev("go=function(v){window.__lastGo=v;};");
  w.fatCmdSearch('المبيعات');
  ev("(function(){var el=document.querySelector('#fatCmdResults .fatcmd-item');if(el)el.click();})()");
  ok('الضغط على شاشة بينقل ويقفل اللوحة', ev("window.__lastGo") === 'sales' && !w.document.getElementById('fatCmdWrap'));
  // XSS: عميل باسم خبيث
  ev("db.customers.push({id:'X',name:'<img src=x onerror=alert(1)>',phone:'',isPatient:false});");
  w.fatCmdOpen(); w.fatCmdSearch('<img');
  var rx = (w.document.getElementById('fatCmdResults') || {}).innerHTML || '';
  ok('اسم خبيث بيتـescape في النتايج', rx.indexOf('<img src=x onerror') === -1);
  w.fatCmdClose();
  ok('fatCmdClose بيقفل اللوحة', !w.document.getElementById('fatCmdWrap'));

  console.log('\n▶ بنية الملف سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
