/* اختبار: ترتيب الأقسام حسب النشاط (v10.44) */
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
function navHas(view) { // link exists AND not display:none
  var a = w.document.querySelector('#nav a[data-view="' + view + '"]');
  return !!a && a.style.display !== 'none';
}
function ensureLink(view) { // نتأكد اللينك موجود في الـnav (نحقنه لو الحقن المتأخر ماجاش في الاختبار)
  var nav = w.document.getElementById('nav'); if (!nav) return;
  if (!nav.querySelector('a[data-view="' + view + '"]')) { var a = w.document.createElement('a'); a.setAttribute('data-view', view); a.textContent = view; nav.appendChild(a); }
}
function resetNav() { // يحاكي إعادة بناء renderNav (بيمسح display:none قبل كل حالة)
  var nav = w.document.getElementById('nav'); if (!nav) return;
  Array.prototype.forEach.call(nav.querySelectorAll('a[data-view]'), function (a) { a.style.display = ''; });
}

setTimeout(() => {
  console.log('\n▶ الإقلاع نضيف');
  ok('اشتغل من غير أخطاء', jsErrors.length === 0, jsErrors.slice(0, 3).join('\n       '));
  ok('fatActivityNav موجودة', typeof w.fatActivityNav === 'function');
  ok('موديول العيادة اتضاف للمميزات', ev("typeof FAT_FLAG_LABELS!=='undefined' && !!FAT_FLAG_LABELS.clinic") === true);

  // نحضّر روابط الشاشات في الـnav (بعضها بيتحقن متأخر)
  ['patients', 'appointments', 'clinic', 'clinicreports', 'apptcal', 'queue', 'recall', 'kds', 'production', 'supcompare', 'abc', 'labels', 'warranties', 'dashboard', 'pos', 'rfm'].forEach(ensureLink);

  console.log('\n▶ حالة: مفيش بروفايل = اعرض كله');
  ev("db.settings=db.settings||{}; delete db.settings.bizProfile;");
  w.fatActivityNav();
  ok('العيادة ظاهرة (مفيش بروفايل)', navHas('patients'));
  ok('KDS ظاهر (مفيش بروفايل)', navHas('kds'));

  console.log('\n▶ حالة: سوبر ماركت (مخزون+موردين، بدون عيادة/مطبخ)');
  ev("db.customers=[]; db.appointments=[]; db.settings.businessType='supermarket'; db.settings.bizProfile={type:'supermarket',flags:{barcode:1,inventory:1,suppliers:1,purchases:1,returns:1,variants:0,kitchen:0,tables:0,services:0}};");
  ['patients', 'appointments', 'clinic', 'clinicreports', 'apptcal', 'queue', 'recall', 'kds', 'production', 'supcompare', 'abc', 'labels'].forEach(ensureLink);
  resetNav();
  w.fatActivityNav();
  ok('شاشات العيادة اتخفت للسوبر ماركت', !navHas('patients') && !navHas('appointments') && !navHas('apptcal') && !navHas('queue'));
  ok('KDS/التصنيع اتخفوا (مفيش مطبخ)', !navHas('kds') && !navHas('production'));
  ok('مقارنة الموردين ظاهرة (فيه موردين)', navHas('supcompare'));
  ok('تحاليل المخزون ظاهرة (فيه مخزون)', navHas('abc') && navHas('labels'));
  ok('الأساسيات ظاهرة دايمًا', navHas('dashboard') && navHas('pos'));

  console.log('\n▶ حالة: عيادة');
  ['patients', 'appointments', 'clinic', 'apptcal', 'queue', 'kds', 'supcompare', 'abc'].forEach(ensureLink);
  ev("db.settings.businessType='clinic'; db.settings.bizProfile={type:'clinic',flags:{barcode:0,inventory:0,suppliers:0,purchases:0,returns:0,variants:0,kitchen:0,tables:0,services:1,clinic:1}};");
  resetNav();
  w.fatActivityNav();
  ok('شاشات العيادة ظاهرة للعيادة', navHas('patients') && navHas('appointments') && navHas('apptcal') && navHas('queue'));
  ok('مقارنة الموردين اتخفت (مفيش موردين)', !navHas('supcompare'));
  ok('تحاليل المخزون اتخفت (مفيش مخزون)', !navHas('abc'));

  console.log('\n▶ أمان: نشاط تجزئة بس عنده مرضى فعلًا → العيادة تفضل ظاهرة');
  ['patients', 'appointments'].forEach(ensureLink);
  ev("db.customers=[{id:'p',name:'مريض',isPatient:true}]; db.settings.businessType='grocery'; db.settings.bizProfile={type:'grocery',flags:{inventory:1,suppliers:1,purchases:1,kitchen:0,services:0}};");
  resetNav();
  w.fatActivityNav();
  ok('العيادة ماتخفتش لأن فيه مرضى فعلًا (أمان)', navHas('patients') && navHas('appointments'));

  console.log('\n▶ بنية الملف سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
