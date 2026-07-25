/* اختبار وظيفي للميزات: حسابات الخطط + الأشعة/الملفات + أسنان الأطفال + الزيارة الجاية→ميعاد
   بيشغّل index.html في DOM حقيقي زي المتصفح، وبيجرّب المنطق فعليًا. */
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
  ['fatPlanPaid', 'fatPlanFin', 'fatPlanPrice', 'fatPlanPay', 'fatPlanPaySave', 'fatPlanPayDelete', 'fatPlanReceiptPrint', 'fatPlanBillHtml',
   'fatFilesOf', 'fatFileAdd', 'fatFileView', 'fatFileDelete', 'fatFilesHtml', 'fatFileHuman',
   'fatToothPrimaryOf', 'fatToothPrimarySummary', 'fatToothPrimaryHtml', 'fatToothPrimaryEdit', 'fatToothPrimarySet', 'fatToothPrimarySaveNote', 'fatToothPrimaryReset',
   'fatApptFromVisit', 'fatNextVisitHtml'
  ].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));

  // مريض تجريبي
  ev("db.customers=db.customers||[]; db.customers.push({id:'PT1',name:'مريض اختبار',phone:'01000000000',isPatient:true,bday:'1990-06-01'}); 'ok'");
  ev("db.cash=db.cash||[];");

  console.log('\n▶ حسابات الخطط (v10.7)');
  // خطة بسعر ٣٠٠٠
  ev("(function(){var c=findCustomer('PT1');fatPlansOf(c).push({id:'PL1',title:'علاج عصب',sessions:[{id:'s1',no:1,title:'جلسة',status:'pending'}],status:'active',price:3000,payments:[]});})()");
  ok('fatPlanFin: سعر ٣٠٠٠ ومتبقّي ٣٠٠٠ في البداية', ev("(function(){var p=fatPlansOf(findCustomer('PT1'))[0];var f=fatPlanFin(p);return f.price===3000&&f.paid===0&&f.balance===3000;})()") === true);
  const cashBefore = ev("db.cash.length");
  // ندفع ١٠٠٠ عن طريق الفورم الحقيقي
  w.fatPlanPay('PT1', 'PL1');
  ev("(function(){var a=document.getElementById('pp_amt');if(a)a.value='1000';var d=document.getElementById('pp_date');if(d)d.value=today();})()");
  w.fatPlanPaySave('PT1', 'PL1');
  ok('الدفعة اتسجّلت في الخطة', ev("fatPlanPaid(fatPlansOf(findCustomer('PT1'))[0])") === 1000);
  ok('المتبقّي بقى ٢٠٠٠', ev("fatPlanFin(fatPlansOf(findCustomer('PT1'))[0]).balance") === 2000);
  ok('الدفعة دخلت الخزنة الحقيقية (addCash in)', ev("db.cash.length>" + cashBefore + " && db.cash[db.cash.length-1].type==='in' && db.cash[db.cash.length-1].amount===1000") === true);
  ok('HTML الحسابات بيتكوّن وفيه fatPlanBillBox', typeof w.fatPlanBillHtml('PT1') === 'string' && w.fatPlanBillHtml('PT1').indexOf('fatPlanBillBox') > -1);
  ok('إيصال الخطة مبيكسرش', (function () { try { w.fatPlanReceiptPrint('PT1', 'PL1'); return true; } catch (e) { return false; } })());
  // إلغاء دفعة → cash out
  const payId = ev("fatPlansOf(findCustomer('PT1'))[0].payments[0].id");
  w.fatPlanPayDelete('PT1', 'PL1', payId);
  // نضغط "تأكيد" في صندوق التأكيد عشان الوعد يتنفّذ (زي ما المستخدم بيعمل)
  (function(){var y=w.document.getElementById('dlgYes');if(y)y.click();})();
  setTimeout(function () {
    ok('إلغاء الدفعة سجّل خصم في الخزنة (addCash out)', ev("db.cash.some(function(x){return x.type==='out'&&x.amount===1000;})") === true);

    console.log('\n▶ الأشعة والملفات (v10.8)');
    ok('fatFileHuman بيصيغ الحجم', w.fatFileHuman(2048) === '2 KB' || /KB/.test(w.fatFileHuman(2048)));
    ev("(function(){var c=findCustomer('PT1');fatFilesOf(c).push({id:'F1',name:'اشعة.jpg',type:'image',mime:'image/jpeg',size:120000,data:'data:image/jpeg;base64,AAAA',date:today(),by:'د'});})()");
    ok('الملف اتخزن جوه المريض', ev("fatFilesOf(findCustomer('PT1')).length") === 1);
    ok('HTML الملفات فيه fatFilesBox واسم الملف', w.fatFilesHtml('PT1').indexOf('fatFilesBox') > -1 && w.fatFilesHtml('PT1').indexOf('اشعة.jpg') > -1);
    ok('فتح صورة مبيكسرش', (function () { try { w.fatFileView('PT1', 'F1'); return true; } catch (e) { return false; } })());
    ev("fatPatientProfile('PT1');"); // نرجع للملف

    console.log('\n▶ أسنان الأطفال / اللبنية (v10.9)');
    ev("(function(){var c=findCustomer('PT1');var tc=fatToothPrimaryOf(c);tc['55']={s:'filling',note:''};tc['61']={s:'caries',note:'سطح'};})()");
    const psum = ev("JSON.stringify(fatToothPrimarySummary(findCustomer('PT1')))");
    ok('تلخيص الأسنان اللبنية بيعدّ صح', /"filling":1/.test(psum) && /"caries":1/.test(psum), psum);
    ok('HTML اللبنية فيه fatToothPrimaryBox وسن لبني ٥٥', w.fatToothPrimaryHtml('PT1').indexOf('fatToothPrimaryBox') > -1 && w.fatToothPrimaryHtml('PT1').indexOf('>55<') > -1);
    ok('اللبنية منفصلة عن الدائمة (toothChart الدائم فاضي)', ev("Object.keys(fatToothChartOf(findCustomer('PT1'))).length") === 0);

    console.log('\n▶ الزيارة الجاية → ميعاد (v10.10)');
    ok('مريض من غير زيارة جاية → HTML فاضي', w.fatNextVisitHtml('PT1') === '');
    ev("(function(){var c=findCustomer('PT1');fatVisitsOf(c).push({id:'V1',date:today(),complaint:'ألم',nextVisit:'بعد أسبوعين لمتابعة الحشو'});})()");
    const nvHtml = w.fatNextVisitHtml('PT1');
    ok('HTML الزيارات الجاية فيه fatNextVisitBox والنص وزرار احجز', nvHtml.indexOf('fatNextVisitBox') > -1 && nvHtml.indexOf('بعد أسبوعين') > -1 && nvHtml.indexOf('fatApptFromVisit') > -1);
    let fvErr = '';
    try { w.fatApptFromVisit('PT1', 'V1'); } catch (e) { fvErr = e.message; }
    ok('fatApptFromVisit بيفتح فورم الميعاد', fvErr === '' && !!w.document.getElementById('ap_patient'), fvErr);

    console.log('\n▶ ملف المريض بيعرض كل اللوحات القديمة + الجديدة مع بعض');
    let profErr = '';
    try { w.fatPatientProfile('PT1'); } catch (e) { profErr = e.message; }
    ok('فتح الملف من غير أخطاء', profErr === '', profErr);
    const body = (w.document.querySelector('#modal .modal-b') || {}).innerHTML || '';
    // جديدة
    ok('لوحة حسابات الخطط ظهرت', body.indexOf('fatPlanBillBox') > -1);
    ok('لوحة الأشعة/الملفات ظهرت', body.indexOf('fatFilesBox') > -1);
    ok('لوحة أسنان الأطفال ظهرت', body.indexOf('fatToothPrimaryBox') > -1);
    ok('لوحة الزيارات الجاية ظهرت', body.indexOf('fatNextVisitBox') > -1);
    // قديمة (ما اتكسرتش)
    ok('لوحة خطط العلاج (v10.2) لسه موجودة', body.indexOf('fatPlansBox') > -1);
    ok('لوحة مخطط الأسنان الدائمة (v10.3) لسه موجودة', body.indexOf('fatToothBox') > -1);
    ok('لوحة الروشتة (v10.4) لسه موجودة', body.indexOf('fatRxBox') > -1);
    ok('لوحة المتابعة (v10.5) لسه موجودة', body.indexOf('fatRecallBox') > -1);
    ok('لوحة المواعيد القادمة (v10.6) لسه موجودة', body.indexOf('fatApptProfBox') > -1);

    console.log('\n▶ بنية الملف لسه سليمة');
    const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
    ok('عدد بلوكات السكربت الداخلية = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

    console.log('\n' + '─'.repeat(50));
    console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
    dom.window.close();
    process.exit(fail ? 1 : 0);
  }, 60);
}, 2500);
