/* اختبار: تذكير الجرعات + تاريخ الأسنان + الجرد الدوري */
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
    let waLast = null; w._waLast = () => waLast;
    w.open = (u) => { waLast = u || ''; return { document: { write() {}, close() {} }, print() {}, close() {}, focus() {} }; };
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
  ['fatRxDoseMsg', 'fatRxDoseRemind', 'fatToothLogOf', 'fatToothHistoryHtml',
   'fatCycleCats', 'fatCycleProducts', 'fatCycleApply', 'fatCycleSetCount'
  ].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));
  ok('views.cyclecount', ev("typeof views.cyclecount==='function'") === true);

  ev("db.customers=db.customers||[]; db.products=db.products||[]; db.settings=db.settings||{}; db.settings.company='عيادة';");
  ev("db.customers.push({id:'PX',name:'مريض جرعة',phone:'01011112222',isPatient:true,prescriptions:[{id:'RXX',date:today(),doctor:'د',items:[{drug:'مضاد حيوي',dose:'قرص',freq:'٣ مرات',dur:'٧ أيام',instr:'بعد الأكل'}],notes:'كمل الكورس'}]});");

  console.log('\n▶ تذكير الجرعات (v10.26)');
  const msg = ev("fatRxDoseMsg(findCustomer('PX'), findCustomer('PX').prescriptions[0])");
  ok('الرسالة فيها الدواء والجرعة والمدة', /مضاد حيوي/.test(msg) && /قرص/.test(msg) && /٧ أيام/.test(msg), msg);
  ev("fatWaSend=undefined;"); // نجبر fallback على window.open
  w.fatRxDoseRemind('PX', 'RXX');
  ok('التذكير فتح رابط واتساب', /wa\.me\//.test(w._waLast() || ''), w._waLast());
  ok('زرار التذكير ظاهر في بانل الروشتة', w.fatRxHtml('PX').indexOf('fatRxDoseRemind') > -1);

  console.log('\n▶ تاريخ الأسنان (v10.27)');
  ok('السجل فاضي في البداية', ev("fatToothLogOf(findCustomer('PX')).length") === 0);
  // نفتح فورم سن ونغيّر الحالة عشان الـwrap يسجّل
  ev("(function(){var el=document.createElement('input');el.id='tooth_note';el.value='ميزيال';document.body.appendChild(el);})()");
  w.fatToothSet('PX', '16', 'filling');
  ok('تغيير حالة السن اتسجّل في التاريخ', ev("fatToothLogOf(findCustomer('PX')).length") >= 1);
  ok('السجل حافظ رقم السن والحالة', ev("(function(){var l=fatToothLogOf(findCustomer('PX'));var e=l[l.length-1];return e.fdi==='16'&&e.s==='filling';})()") === true);
  ok('HTML التاريخ فيه fatToothHistBox والسن', w.fatToothHistoryHtml('PX').indexOf('fatToothHistBox') > -1 && w.fatToothHistoryHtml('PX').indexOf('16') > -1);
  ev("var e=document.getElementById('tooth_note'); if(e) e.remove();");

  console.log('\n▶ الجرد الدوري (v10.28)');
  ev("db.products.push({id:'PA',name:'بن',cat:'قهوة',qty:10,cost:100,price:150});");
  ev("db.products.push({id:'PB',name:'شاي',cat:'قهوة',qty:5,cost:50,price:80});");
  ev("db.products.push({id:'PC',name:'سكر',cat:'بقالة',qty:20,cost:20,price:30});");
  ok('التصنيفات بتتجمّع', ev("fatCycleCats().indexOf('قهوة')>-1 && fatCycleCats().indexOf('بقالة')>-1") === true);
  ev("window._cycleCat='قهوة';");
  ok('اختيار تصنيف بيفلتر الأصناف', ev("fatCycleProducts().length") === 2);
  // نعدّ: بن الفعلي 8 (عجز -2)، شاي الفعلي 5 (مفيش فرق)
  ev("window._cycleCounts={PA:'8',PB:'5'};");
  const stBefore = ev("(db.stockTakes||[]).length");
  const qtyBefore = ev("findProduct('PA').qty");
  ev("confirmBox=function(){return Promise.resolve(true);};"); // نأكّد التطبيق
  w.fatCycleApply();
  setTimeout(function () {
    ok('المخزون اتعدّل للعدد الفعلي (بن 10→8)', ev("findProduct('PA').qty") === 8, 'was ' + qtyBefore + ' now ' + ev("findProduct('PA').qty"));
    ok('اتسجّل قيد جرد (stockTakes) يغذّي المحاسبة', ev("(db.stockTakes||[]).length") > stBefore && ev("db.stockTakes[db.stockTakes.length-1].type") === 'cycle');
    ok('قيد الجرد فيه بنود الفرق', ev("db.stockTakes[db.stockTakes.length-1].items.some(function(i){return i.pid==='PA'&&i.diff===-2;})") === true);
    let cyErr = ev("(function(){try{views.cyclecount();return '';}catch(e){return e.message;}})()");
    ok('views.cyclecount بترسم', cyErr === '', cyErr);

    console.log('\n▶ بنية الملف سليمة');
    const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
    ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

    console.log('\n' + '─'.repeat(50));
    console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
    dom.window.close();
    process.exit(fail ? 1 : 0);
  }, 60);
}, 2500);
