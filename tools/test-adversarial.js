/* QA عدائي: بيستدعي كل شاشات التطبيق على قاعدة فاضية وبعدين على قاعدة فيها داتا،
   وبيرصد أي كراش أو خطأ. الهدف: نلاقي الأعطال زي مشتري بيدقّق. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(file, 'utf8');
const jsErrors = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://fatorty11.vercel.app/', virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = () => {}; w.print = () => {}; w.alert = () => {}; w.confirm = () => true; w.prompt = () => '';
    w.open = () => ({ document: { write() {}, close() {} }, print() {}, close() {}, focus() {} });
    w.navigator.serviceWorker = { register: () => Promise.resolve({ addEventListener() {}, update() {} }), addEventListener() {}, controller: null, ready: Promise.resolve({}) };
    w.indexedDB = { open: () => ({ addEventListener() {} }) };
    w.AudioContext = function () { return { state: 'running', resume() {}, createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: {}, type: '' }), createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }), destination: {}, currentTime: 0 }; };
    w.supabase = { createClient: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signInWithPassword: () => Promise.resolve({ data: {}, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ range: () => Promise.resolve({ data: [], error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }), rpc: () => Promise.resolve({ data: [], error: null }) }) };
  }
});
const w = dom.window;
const ev = e => { try { return w.eval(e); } catch (x) { return '__ERR__:' + x.message; } };

setTimeout(() => {
  console.log('=== QA عدائي: استدعاء كل الشاشات ===\n');
  // نتأكد عناصر الـDOM الأساسية موجودة
  ev("if(!document.getElementById('content')){var d=document.createElement('div');d.id='content';document.body.appendChild(d);} if(!document.getElementById('topActions')){var t=document.createElement('div');t.id='topActions';document.body.appendChild(t);}");

  const viewNames = ev("Object.keys(views)");
  console.log('عدد الشاشات المكتشفة: ' + (Array.isArray(viewNames) ? viewNames.length : '??') + '\n');

  function runAll(label) {
    let crashes = [];
    (viewNames || []).forEach(function (vn) {
      jsErrors.length = 0;
      const res = ev("(function(){try{ document.getElementById('content').innerHTML=''; views['" + vn + "'](); return 'OK'; }catch(e){ return 'THROW:'+e.message; }})()");
      if (String(res).indexOf('THROW:') === 0) crashes.push(vn + '  → ' + res.slice(6));
      else if (jsErrors.length) crashes.push(vn + '  → (jsdomError) ' + jsErrors[0]);
    });
    console.log('▶ ' + label + ': ' + ((viewNames || []).length - crashes.length) + '/' + (viewNames || []).length + ' نجحت');
    if (crashes.length) { console.log('   ❌ شاشات فيها مشكلة:'); crashes.forEach(c => console.log('      - ' + c)); }
    else console.log('   ✅ كل الشاشات اشتغلت من غير كراش');
    return crashes;
  }

  console.log('--- (1) قاعدة بيانات فاضية تمامًا ---');
  const emptyCrashes = runAll('فاضية');

  console.log('\n--- (2) قاعدة فيها بيانات واقعية ---');
  ev(`
    db.products.push({id:'P1',name:'صنف',cat:'عام',qty:5,min:3,cost:100,price:150});
    db.customers.push({id:'C1',name:'عميل',phone:'01000000000',isPatient:true,balance:0,
      treatmentPlans:[{id:'PL',title:'خطة',sessions:[{id:'s',no:1,title:'ج',status:'pending',price:500}],payments:[{id:'p',amount:200,date:today(),acct:'cash'}]}],
      prescriptions:[{id:'r',date:today(),doctor:'د',items:[{drug:'x',dose:'1'}]}],
      recalls:[{id:'rc',reason:'x',intervalMonths:6,nextDue:fatAddMonths(today(),-1),active:true}],
      files:[{id:'f',name:'a.jpg',type:'image',data:'data:image/png;base64,AAA',size:100,date:today()}],
      toothChart:{'16':{s:'filling'}}, consents:[], visits:[{id:'v',date:today(),nextVisit:'بعد شهر'}]});
    db.suppliers.push({id:'S1',name:'مورد',balance:0});
    db.employees.push({id:'E1',name:'موظف',payments:[]});
    db.sales.push({id:'SA',no:1,date:today(),total:150,paidAmount:150,dueAmount:0,items:[{pid:'P1',name:'صنف',qty:1,price:150,cost:100}],payMethod:'cash'});
    db.appointments.push({id:'AP',patientId:'C1',patientName:'عميل',patientPhone:'01000000000',date:today(),time:'10:00',status:'scheduled'});
    db.settings.currencies=[{code:'USD',name:'دولار',rate:50}];
    db.settings.walkInQueue=[{id:'Q',date:today(),num:1,name:'ز',status:'waiting'}];
    'seeded';
  `);
  const fullCrashes = runAll('فيها بيانات');

  console.log('\n=== (3) فحوصات حواف دقيقة ===');
  let edge = [];
  const chk = (n, cond) => { if (cond) console.log('  ✅ ' + n); else { console.log('  ❌ ' + n); edge.push(n); } };

  // تحويل عملة بسعر صفر ماينهارش
  chk('تحويل عملة بسعر صفر مايكسرش (يرجع 0)', ev("(function(){try{return fatConvert(100,'__base','ZZZ');}catch(e){return 'ERR';}})()") === 0);
  // دفع أكتر من باقي الجلسة
  ev("var c=findCustomer('C1');var p=c.treatmentPlans[0];p.payments.push({id:'p2',amount:99999,date:today(),acct:'cash'});");
  chk('الدفع الزائد: الباقي مايبقاش سالب', ev("fatPlanFin(findCustomer('C1').treatmentPlans[0]).balance") >= 0);
  // جرد بقيمة نصية غير رقمية
  ev("window._cycleCat='';window._cycleCounts={P1:'abc'};");
  chk('جرد بإدخال نصّي غلط مايكسرش', String(ev("(function(){try{fatCycleApply();return 'OK';}catch(e){return 'THROW:'+e.message;}})()")).indexOf('THROW') !== 0);
  // صلاحيات: override بيقفل ومايأثرش على الأدمن/المدير
  chk('override مايأثرش على المدير', ev("(function(){db.settings.role='manager';fatRoleOverrides()['manager']=['pos'];return canView('sales');})()") !== false);
  ev("db.settings.role='manager';delete db.settings.roleViewOverrides.manager;");
  // XSS: اسم عميل فيه وسم — لازم يتـescape في ملف المريض
  ev("db.customers.push({id:'XSS',name:'<img src=x onerror=alert(1)>',phone:'',isPatient:true});");
  ev("(function(){try{fatPatientProfile('XSS');}catch(e){}})()");
  const xssBody = ev("(document.querySelector('#modal .modal-b')||{}).innerHTML||''");
  chk('اسم عميل خبيث بيتـescape (مفيش <img خام)', xssBody.indexOf('<img src=x onerror') === -1);

  console.log('\n' + '═'.repeat(52));
  const total = emptyCrashes.length + fullCrashes.length + edge.length;
  console.log('إجمالي المشاكل المكتشفة: ' + total);
  console.log('  - كراش على فاضية: ' + emptyCrashes.length);
  console.log('  - كراش على بيانات: ' + fullCrashes.length);
  console.log('  - فحوصات حواف فشلت: ' + edge.length);
  dom.window.close();
  process.exit(0);
}, 2500);
