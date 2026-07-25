/* اختبار: مقارنة الفترات + ملصقات الأسعار */
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
    let waLast = null; w._waLast = () => waLast;
    w.open = (u) => { waLast = u || ''; return { document: { write() {}, close() {} }, print() {}, close() {}, focus() {} }; };
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

  console.log('\n▶ الشاشات/الدوال موجودة');
  ['periodcompare', 'labels'].forEach(v => ok('views.' + v, ev("typeof views." + v + "==='function'") === true));
  ['fatLabelsPrint', 'fatLabelCats', 'fatPcMode'].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));

  ev("db.sales=db.sales||[]; db.products=db.products||[]; db.settings=db.settings||{};");
  // فواتير الشهر الحالي والسابق
  var cm = ev("(new Date()).toISOString().slice(0,7)");
  ev("(function(){var cm=(new Date()).toISOString().slice(0,7);var p=new Date();p.setMonth(p.getMonth()-1);var pm=p.toISOString().slice(0,7);" +
     "db.sales.push({id:'a',no:1,date:cm+'-05',total:1000,profit:400,customerId:'c1',items:[]});" +
     "db.sales.push({id:'b',no:2,date:cm+'-06',total:500,profit:200,customerId:'c2',items:[]});" +
     "db.sales.push({id:'c',no:3,date:pm+'-10',total:800,profit:300,customerId:'c1',items:[]});})()");

  console.log('\n▶ مقارنة الفترات (v10.37)');
  ev("window._pcMode='month';");
  let pcErr = ev("(function(){try{views.periodcompare();return '';}catch(e){return e.message;}})()");
  ok('views.periodcompare بترسم', pcErr === '', pcErr);
  var pcBody = (w.document.getElementById('content') || {}).innerHTML || '';
  ok('بيعرض الشهر الحالي والسابق', pcBody.indexOf('الشهر الحالي') > -1 && pcBody.indexOf('الشهر السابق') > -1);
  ok('بيحسب التغيّر (%)', /%/.test(pcBody));
  ev("window._pcMode='year';");
  let pcErr2 = ev("(function(){try{views.periodcompare();return '';}catch(e){return e.message;}})()");
  ok('وضع السنة بيرسم', pcErr2 === '');

  console.log('\n▶ ملصقات الأسعار (v10.38)');
  ev("db.products.push({id:'P1',name:'بن',cat:'قهوة',price:150,sku:'BN1'});db.products.push({id:'P2',name:'شاي',cat:'قهوة',price:80,sku:'TE1'});db.products.push({id:'P3',name:'سكر',cat:'بقالة',price:30,sku:'SG1'});");
  ok('التصنيفات بتتجمّع', ev("fatLabelCats().indexOf('قهوة')>-1") === true);
  ev("window._lblCat='قهوة';");
  let lErr = ev("(function(){try{views.labels();return '';}catch(e){return e.message;}})()");
  ok('views.labels بترسم', lErr === '');
  ok('المعاينة بتعرض أصناف التصنيف', (w.document.getElementById('content') || {}).innerHTML.indexOf('بن') > -1);
  ok('طباعة الملصقات مبتكسرش', (function () { try { w.fatLabelsPrint(); return true; } catch (e) { return false; } })());

  console.log('\n▶ بنية الملف سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
