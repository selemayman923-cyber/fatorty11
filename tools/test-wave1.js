/* اختبار: تقويم المواعيد + الطابور + الإقرار + ربط الأشعة بالسن + قوالب الخطط */
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
  ['fatApptReschedule', 'fatApptCalDay', 'fatQueue', 'fatQueueToday', 'fatQueueSave', 'fatQueueNext', 'fatQueueStatus',
   'fatConsentsOf', 'fatConsentSave', 'fatConsentsHtml', 'fatFileSetTooth', 'fatTxTemplates', 'fatTxTemplateSaveFrom', 'fatPlanFromTemplateApply'
  ].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));
  ['apptcal', 'queue'].forEach(v => ok('views.' + v, ev("typeof views." + v + "==='function'") === true));

  ev("db.customers=db.customers||[]; db.appointments=db.appointments||[]; db.settings=db.settings||{};");
  ev("db.customers.push({id:'PW',name:'مريض موجة',phone:'01011112222',isPatient:true,treatmentPlans:[{id:'PLW',title:'حشو',sessions:[{id:'s1',no:1,title:'جلسة',status:'pending',price:500}],payments:[]}],files:[{id:'FW',name:'اشعة.jpg',type:'image',data:'data:image/png;base64,AAA',size:1000,date:today()}]});");

  console.log('\n▶ تقويم المواعيد (v10.21)');
  ev("db.appointments.push({id:'AW',patientId:'PW',patientName:'مريض موجة',date:today(),time:'10:00',reason:'كشف',status:'scheduled'});");
  let calErr = ev("(function(){try{views.apptcal();return '';}catch(e){return e.message;}})()");
  ok('views.apptcal بترسم', calErr === '', calErr);
  ok('التقويم فيه شبكة أيام', (w.document.getElementById('content') || {}).innerHTML.indexOf('grid-template-columns:repeat(7') > -1);
  ev("promptBox=function(m,o){return Promise.resolve(addDays(today(),3));};"); // نجبر تاريخ جديد
  w.fatApptReschedule('AW');
  setTimeout(function () {
    ok('إعادة الجدولة غيّرت التاريخ', ev("fatAppts().filter(function(a){return a.id==='AW';})[0].date") === ev("addDays(today(),3)"));

    console.log('\n▶ طابور المرضى (v10.22)');
    ev("db.settings.walkInQueue=[];");
    ev("(function(){var q=fatQueue();q.push({id:'Q1',date:today(),num:1,name:'أحمد',status:'waiting'});q.push({id:'Q2',date:today(),num:2,name:'منى',status:'waiting'});})()");
    ok('fatQueueToday بيرجع طابور النهاردة', ev("fatQueueToday().length") === 2);
    w.fatQueueNext();
    ok('«نادِ التالي» حوّل الأول لـ in', ev("fatQueue().filter(function(x){return x.id==='Q1';})[0].status") === 'in');
    w.fatQueueStatus('Q2', 'in');
    ok('نداء التاني خلّى الأول done', ev("fatQueue().filter(function(x){return x.id==='Q1';})[0].status") === 'done');
    let qErr = ev("(function(){try{views.queue();return '';}catch(e){return e.message;}})()");
    ok('views.queue بترسم', qErr === '', qErr);

    console.log('\n▶ إقرار الموافقة (v10.23)');
    ev("(function(){var c=findCustomer('PW');fatConsentsOf(c).push({id:'CS1',date:today(),title:'موافقة',body:'نص',signature:'',by:'د'});})()");
    ok('الإقرار اتخزن جوه المريض', ev("fatConsentsOf(findCustomer('PW')).length") === 1);
    ok('HTML الإقرارات فيه fatConsentBox', w.fatConsentsHtml('PW').indexOf('fatConsentBox') > -1);
    ok('طباعة الإقرار مبتكسرش', (function () { try { w.fatConsentPrint('PW', 'CS1'); return true; } catch (e) { return false; } })());

    console.log('\n▶ ربط الأشعة بالسن (v10.24)');
    ev("promptBox=function(m,o){return Promise.resolve('16');};");
    w.fatFileSetTooth('PW', 'FW');
    setTimeout(function () {
      ok('الملف اترّبط بالسن 16', ev("findCustomer('PW').files.filter(function(f){return f.id==='FW';})[0].toothFdi") === '16');
      ok('HTML الملفات بيعرض السن المرتبط', w.fatFilesHtml('PW').indexOf('16') > -1 && w.fatFilesHtml('PW').indexOf('fatFileSetTooth') > -1);

      console.log('\n▶ قوالب خطط العلاج (v10.25)');
      w.fatTxTemplateSaveFrom('PW', 'PLW');
      ok('اتحفظت خطة كقالب', ev("fatTxTemplates().length") === 1);
      ok('القالب فيه الجلسات والأسعار', ev("fatTxTemplates()[0].sessions[0].price") === 500);
      var tid = ev("fatTxTemplates()[0].id");
      var before = ev("fatPlansOf(findCustomer('PW')).length");
      // نطبّق القالب
      ev("db.settings._tplPick='" + tid + "';");
      w.fatPlanFromTemplate('PW');
      ev("(function(){var s=document.getElementById('tpl_sel');if(s)s.value='" + tid + "';})()");
      w.fatPlanFromTemplateApply('PW');
      ok('اتعملت خطة جديدة من القالب', ev("fatPlansOf(findCustomer('PW')).length") === before + 1);
      ok('الخطة الجديدة جابت الجلسات', ev("var ps=fatPlansOf(findCustomer('PW'));ps[ps.length-1].sessions.length") === 1);

      console.log('\n▶ الملف بيفتح بكل اللوحات (ماتكسرش)');
      ev("db.settings.role='manager';"); w.fatPatientProfile('PW');
      var body = (w.document.querySelector('#modal .modal-b') || {}).innerHTML || '';
      ok('لوحة الإقرارات ظهرت', body.indexOf('fatConsentBox') > -1);
      ok('أزرار القوالب ظهرت في بانل الخطط', body.indexOf('fatPlanFromTemplate') > -1);

      console.log('\n▶ بنية الملف سليمة');
      const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
      ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

      console.log('\n' + '─'.repeat(50));
      console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
      dom.window.close();
      process.exit(fail ? 1 : 0);
    }, 40);
  }, 40);
}, 2500);
