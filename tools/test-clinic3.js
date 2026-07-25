/* اختبار وظيفي: لوحة العيادة + تسعير الجلسات + التقارير + التذكيرات + الصلاحيات + تصدير PDF */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const file = process.argv[2] || 'index.html';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (extra ? '\n       ' + extra : ''))); };
const html = fs.readFileSync(file, 'utf8');
const jsErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));
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
const ev = expr => { try { return w.eval(expr); } catch (e) { return '__ERR__:' + e.message; } };

setTimeout(() => {
  console.log('\n▶ الإقلاع نضيف');
  ok('اشتغل من غير أخطاء تحميل', jsErrors.length === 0, jsErrors.slice(0, 3).join('\n       '));

  console.log('\n▶ الدوال/الشاشات الجديدة موجودة');
  ['fatPlanTotal', 'fatSessionPaid', 'fatSessionBalance', 'fatSessionPrice', 'fatSessionPaySave',
   'fatPlanDebtors', 'fatClinicStats', 'fatAllPlanPayments', 'fatRemindersDue', 'fatApptRemindSend', 'fatRecallRemindSend',
   'fatClinicCan', 'fatPatientPdf'
  ].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));
  ['clinic', 'clinicreports', 'reminders'].forEach(v => ok('views.' + v, ev("typeof views." + v + "==='function'") === true));
  ['clinic', 'clinicreports', 'reminders'].forEach(v => ok('PG.' + v, ev("!!PG." + v) === true));

  // مريض تجريبي بخطة وجلسات مسعّرة
  ev("db.customers=db.customers||[]; db.cash=db.cash||[]; db.appointments=db.appointments||[];");
  ev("db.customers.push({id:'PT9',name:'مريض لوحة',phone:'01055555555',isPatient:true,bday:'1985-03-03',medical:{allergies:'لا'},visits:[{id:'v9',date:today(),complaint:'ألم',nextVisit:'بعد شهر'}],treatmentPlans:[{id:'PLA',title:'تقويم',status:'active',sessions:[{id:'s1',no:1,title:'جلسة ١',status:'pending',price:1000},{id:'s2',no:2,title:'جلسة ٢',status:'pending',price:1500}],payments:[]}],toothChart:{'11':{s:'caries',note:''}},prescriptions:[{id:'rx9',date:today(),doctor:'د',items:[{drug:'X'}]}],recalls:[]});");

  console.log('\n▶ تسعير الجلسات (v10.12)');
  ok('fatPlanTotal = مجموع أسعار الجلسات (٢٥٠٠)', ev("fatPlanTotal(fatPlansOf(findCustomer('PT9'))[0])") === 2500);
  ok('fatPlanFin بيستخدم الإجمالي الجديد', ev("fatPlanFin(fatPlansOf(findCustomer('PT9'))[0]).price") === 2500);
  const cashB = ev("db.cash.length");
  w.fatSessionPay('PT9', 'PLA', 's1');
  ev("(function(){var a=document.getElementById('sp_amt');if(a)a.value='1000';var d=document.getElementById('sp_date');if(d)d.value=today();})()");
  w.fatSessionPaySave('PT9', 'PLA', 's1');
  ok('دفعة الجلسة اترّبطت بالجلسة', ev("fatSessionPaid(fatPlansOf(findCustomer('PT9'))[0],'s1')") === 1000);
  ok('باقي الخطة بقى ١٥٠٠', ev("fatPlanFin(fatPlansOf(findCustomer('PT9'))[0]).balance") === 1500);
  ok('الدفعة دخلت الخزنة (addCash in)', ev("db.cash.length>" + cashB + " && db.cash[db.cash.length-1].type==='in'") === true);
  ok('بانل الحسابات بيعرض تفاصيل الجلسات', w.fatPlanBillHtml('PT9').indexOf('جلسة ١') > -1);

  console.log('\n▶ لوحة تحكم العيادة (v10.11)');
  ok('fatPlanDebtors بيلاقي مريض عليه رصيد', ev("fatPlanDebtors().some(function(d){return d.c.id==='PT9';})") === true);
  ok('fatClinicStats.due > 0', ev("fatClinicStats().due>0") === true);
  const clErr = ev("(function(){try{views.clinic();return '';}catch(e){return e.message;}})()");
  ok('views.clinic بترسم من غير أخطاء', clErr === '', clErr);
  ok('محتوى اللوحة فيه كروت', (w.document.getElementById('content') || {}).innerHTML.indexOf('cards') > -1 || (w.document.getElementById('content') || {}).innerHTML.indexOf('مواعيد النهاردة') > -1);

  console.log('\n▶ تقارير العيادة (v10.13)');
  ok('fatAllPlanPayments بيجمّع الدفعات', ev("fatAllPlanPayments().length>=1") === true);
  const rpErr = ev("(function(){try{views.clinicreports();return '';}catch(e){return e.message;}})()");
  ok('views.clinicreports بترسم من غير أخطاء', rpErr === '', rpErr);
  ok('التقارير فيها رسم SVG', (w.document.getElementById('content') || {}).innerHTML.indexOf('<svg') > -1);

  console.log('\n▶ التذكيرات (v10.14)');
  ev("db.appointments.push({id:'AP9',patientId:'PT9',patientName:'مريض لوحة',patientPhone:'01055555555',date:addDays(today(),1),time:'10:00',reason:'كشف',status:'scheduled'});");
  ok('fatRemindersDue بيلاقي ميعاد بكرة', ev("fatRemindersDue().appts.some(function(a){return a.id==='AP9';})") === true);
  const rmErr = ev("(function(){try{views.reminders();return '';}catch(e){return e.message;}})()");
  ok('views.reminders بترسم من غير أخطاء', rmErr === '', rmErr);
  ok('الجرس بيحسب تذكيرات بكرة', (function(){var a=w.getAlerts()||[];return a.some(x=>/تذكير ميعاد بكرة|reminders for tomorrow/.test(x.msg||''));})());
  w.fatApptRemindSend('AP9');
  ok('«تذكير» بيعلّم الميعاد إنه اتبعت النهاردة', ev("fatAppts().filter(function(a){return a.id==='AP9';})[0].remindedOn") === ev("today()"));

  console.log('\n▶ الصلاحيات (v10.15)');
  ok('دور الطبيب اتسجّل', ev("!!ROLES.dentist && !!ROLE_VIEWS.dentist") === true);
  ok('دور الاستقبال اتسجّل', ev("!!ROLES.reception && !!ROLE_VIEWS.reception") === true);
  ok('مدير: يشوف كل الأقسام', ev("(function(){db.settings.role='manager';return fatClinicCan('billing')&&fatClinicCan('medical')&&fatClinicCan('clinical');})()") === true);
  ok('طبيب: مايشوفش الحسابات', ev("(function(){db.settings.role='dentist';return fatClinicCan('billing')===false && fatClinicCan('clinical')===true;})()") === true);
  ok('استقبال: مايشوفش الطبي', ev("(function(){db.settings.role='reception';return fatClinicCan('medical')===false && fatClinicCan('billing')===true;})()") === true);
  // استقبال: الملف يخفي الطبي ويسيب الحسابات
  ev("db.settings.role='reception';"); w.fatPatientProfile('PT9');
  let recBody = (w.document.querySelector('#modal .modal-b') || {}).innerHTML || '';
  ok('استقبال: بانل الحسابات ظاهر', recBody.indexOf('fatPlanBillBox') > -1);
  ok('استقبال: مخطط الأسنان متخفي', recBody.indexOf('fatToothBox') === -1);
  ok('استقبال: الروشتة متخفية', recBody.indexOf('fatRxBox') === -1);
  // طبيب: الحسابات تختفي، الطبي يظهر
  ev("db.settings.role='dentist';"); w.fatPatientProfile('PT9');
  let denBody = (w.document.querySelector('#modal .modal-b') || {}).innerHTML || '';
  ok('طبيب: مخطط الأسنان ظاهر', denBody.indexOf('fatToothBox') > -1);
  ok('طبيب: بانل الحسابات متخفي', denBody.indexOf('fatPlanBillBox') === -1);
  ev("db.settings.role='manager';"); // رجوع

  console.log('\n▶ تصدير ملف المريض PDF (v10.16)');
  ok('fatPatientPdf مبيكسرش', (function () { try { w.fatPatientPdf('PT9'); return true; } catch (e) { return false; } })());
  w.fatPatientProfile('PT9');
  let mgrBody = (w.document.querySelector('#modal .modal-b') || {}).innerHTML || '';
  ok('زرار تصدير PDF ظاهر للمدير', mgrBody.indexOf('fatPdfBar') > -1);

  console.log('\n▶ كل اللوحات مع بعض للمدير (ماتكسرش حاجة)');
  ['fatPlanBillBox', 'fatToothBox', 'fatToothPrimaryBox', 'fatRxBox', 'fatFilesBox', 'fatRecallBox', 'fatApptProfBox', 'fatPlansBox', 'fatNextVisitBox']
    .forEach(id => ok('لوحة ' + id + ' موجودة', mgrBody.indexOf(id) > -1));

  console.log('\n▶ بنية الملف لسه سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت الداخلية = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
