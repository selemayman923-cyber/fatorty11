/* اختبار وظيفي للميزات الجديدة: مخطط الأسنان + الروشتة + المتابعة الدورية + ربط المواعيد
   بيشغّل index.html في DOM حقيقي زي المتصفح، وبيجرّب المنطق فعليًا مش بس وجود الدوال. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = process.argv[2] || 'index.html';
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  c ? (pass++, console.log('  ✅ ' + n))
    : (fail++, console.log('  ❌ ' + n + (extra ? '\n       ' + extra : '')));
};

const html = fs.readFileSync(file, 'utf8');
const jsErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://fatorty11.vercel.app/', virtualConsole: vc,
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
const ev = expr => { try { return w.eval(expr); } catch (e) { return '__ERR__:' + e.message; } };

setTimeout(() => {
  console.log('\n▶ الإقلاع نضيف');
  ok('اشتغل من غير أخطاء تحميل', jsErrors.length === 0, jsErrors.slice(0, 3).join('\n       '));

  console.log('\n▶ الدوال الجديدة موجودة');
  ['fatToothChartOf', 'fatToothSummary', 'fatToothEdit', 'fatToothSet', 'fatToothChartHtml',
   'fatRxOf', 'fatRxSave', 'fatRxForm', 'fatRxPrint', 'fatAge',
   'fatRecallsOf', 'fatAddMonths', 'fatRecallDue', 'fatRecallAll', 'fatRecallDone', 'fatRecallHtml',
   'fatApptProfileHtml', 'fatApptFormForPatient'
  ].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));

  console.log('\n▶ شاشة المتابعة الدورية اتسجّلت');
  ok("views.recall موجودة", ev("typeof views!=='undefined' && typeof views.recall==='function'") === true);
  ok("PG.recall موجودة", ev("typeof PG!=='undefined' && !!PG.recall") === true);
  ok("canView('recall') شغّالة", ev("typeof canView==='function' && canView('recall')!==undefined") === true);

  console.log('\n▶ حساب التواريخ (fatAddMonths)');
  ok('نص عادي: 2025-08-15 +6 = 2026-02-15', w.fatAddMonths('2025-08-15', 6) === '2026-02-15', w.fatAddMonths('2025-08-15', 6));
  ok('نهاية شهر: 2025-01-31 +1 = 2025-02-28', w.fatAddMonths('2025-01-31', 1) === '2025-02-28', w.fatAddMonths('2025-01-31', 1));
  ok('سنة كبيسة: 2024-01-31 +1 = 2024-02-29', w.fatAddMonths('2024-01-31', 1) === '2024-02-29', w.fatAddMonths('2024-01-31', 1));

  console.log('\n▶ منطق حالة المتابعة (fatRecallDue)');
  const t = ev("today()");
  const past = w.fatAddMonths(t, -3), soon = w.eval("addDays(today(),7)"), far = w.fatAddMonths(t, 5);
  ok('متأخّر (تاريخ قديم) = overdue', w.fatRecallDue({ nextDue: past }) === 'overdue');
  ok('خلال ١٤ يوم = soon', w.fatRecallDue({ nextDue: soon }) === 'soon');
  ok('بعيد = ok', w.fatRecallDue({ nextDue: far }) === 'ok');

  // نجهّز مريض تجريبي
  ev("db.customers=db.customers||[]; db.customers.push({id:'PT1',name:'مريض اختبار',phone:'01000000000',isPatient:true,bday:'1990-06-01'}); 'ok'");

  console.log('\n▶ مخطط الأسنان — كتابة وقراءة');
  ev("(function(){var c=findCustomer('PT1');var tc=fatToothChartOf(c);tc['16']={s:'filling',note:'ميزيال'};tc['11']={s:'caries',note:''};tc['46']={s:'missing',note:''};})()");
  const sum = ev("JSON.stringify(fatToothSummary(findCustomer('PT1')))");
  ok('التلخيص بيعدّ الحالات صح', /"filling":1/.test(sum) && /"caries":1/.test(sum) && /"missing":1/.test(sum), sum);
  ok('HTML المخطط بيتكوّن', typeof w.fatToothChartHtml('PT1') === 'string' && w.fatToothChartHtml('PT1').indexOf('fatToothBox') > -1);

  console.log('\n▶ الروشتة — حفظ وقراءة وعمر');
  ok('حساب العمر من الميلاد', ev("typeof fatAge(findCustomer('PT1'))==='number' && fatAge(findCustomer('PT1'))>30") === true);
  ev("(function(){var c=findCustomer('PT1');fatRxOf(c).push({id:'RX1',date:today(),doctor:'د. أحمد',items:[{drug:'X',dose:'500mg',freq:'مرتين',dur:'٥ أيام',instr:'بعد الأكل'}],notes:''});})()");
  ok('الروشتة اتخزنت جوه المريض', ev("fatRxOf(findCustomer('PT1')).length") === 1);
  ok('HTML الروشتات بيتكوّن', w.fatRxHtml('PT1').indexOf('fatRxBox') > -1);
  ok('طباعة الروشتة مبتكسرش', (function () { try { w.fatRxPrint('PT1', 'RX1'); return true; } catch (e) { return false; } })());

  console.log('\n▶ المتابعة الدورية — إنشاء ومنطق «تمّت»');
  ev("(function(){var c=findCustomer('PT1');fatRecallsOf(c).push({id:'RC1',reason:'تنظيف',intervalMonths:6,lastDone:fatAddMonths(today(),-7),nextDue:fatAddMonths(today(),-1),active:true});})()");
  ok('المتابعة ظهرت كـ overdue', w.fatRecallDue(w.eval("fatRecallsOf(findCustomer('PT1'))[0]")) === 'overdue');
  ok('fatRecallAll بيجمّع من كل المرضى', w.fatRecallAll().length >= 1);
  ok('الجرس بيحسب المتأخّرين', (function () { var a = w.getAlerts() || []; return a.some(x => /متابعة متأخّرة|overdue recalls/.test(x.msg || '')); })());
  w.fatRecallDone('PT1', 'RC1');
  const rcAfter = w.eval("JSON.stringify(fatRecallsOf(findCustomer('PT1'))[0])");
  const expectNext = w.fatAddMonths(t, 6);
  ok('«تمّت» حرّكت الموعد الجاي +٦ شهور من النهاردة', rcAfter.indexOf(expectNext) > -1, expectNext + ' vs ' + rcAfter);
  ok('«تمّت» بقت مش متأخّرة', w.fatRecallDue(w.eval("fatRecallsOf(findCustomer('PT1'))[0]")) === 'ok');

  console.log('\n▶ ملف المريض بيعرض كل اللوحات الجديدة');
  let profileErr = '';
  try { w.fatPatientProfile('PT1'); } catch (e) { profileErr = e.message; }
  ok('فتح الملف من غير أخطاء', profileErr === '', profileErr);
  const body = (w.document.querySelector('#modal .modal-b') || {}).innerHTML || '';
  ok('لوحة مخطط الأسنان ظهرت', body.indexOf('fatToothBox') > -1);
  ok('لوحة الروشتات ظهرت', body.indexOf('fatRxBox') > -1);
  ok('لوحة المتابعة ظهرت', body.indexOf('fatRecallBox') > -1);
  ok('لوحة المواعيد القادمة ظهرت', body.indexOf('fatApptProfBox') > -1);

  console.log('\n▶ المزامنة السحابية');
  ok("العملاء (اللي جواهم الأسنان/الروشتة/المتابعة) في المزامنة", ev("V2_KINDS.indexOf('customers')>-1") === true);
  ok("المواعيد في المزامنة (من v10.1)", ev("V2_KINDS.indexOf('appointments')>-1") === true);

  console.log('\n▶ بنية الملف لسه سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت الداخلية = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
