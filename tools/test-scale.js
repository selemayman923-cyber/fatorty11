/* اختبار حِمل + تكامل بيانات: بيزرع بيانات ضخمة ويقيس الأداء وسلامة البيانات
   عشان نتأكد إن التطبيق يتحمّل نشاط كبير قبل التوزيع على العملاء. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const file = process.argv[2] || 'index.html';
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
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (extra ? '  ' + extra : ''))); };

setTimeout(() => {
  console.log('=== اختبار الحِمل والتكامل ===\n');
  ok('الإقلاع نظيف', jsErrors.length === 0, jsErrors[0] || '');

  // نتأكد عناصر DOM
  ev("if(!document.getElementById('content')){var d=document.createElement('div');d.id='content';document.body.appendChild(d);}if(!document.getElementById('topActions')){var t=document.createElement('div');t.id='topActions';document.body.appendChild(t);}");

  console.log('\n▶ زرع بيانات ضخمة');
  const t0 = Date.now();
  const seed = ev(`(function(){
    ['products','customers','sales','appointments','cash','stockMoves','stockTakes'].forEach(function(k){db[k]=db[k]||[];});
    var N_PROD=2000, N_CUST=1500, N_SALE=8000, N_APPT=800;
    for(var i=0;i<N_PROD;i++) db.products.push({id:'p'+i,name:'صنف '+i,cat:'تصنيف '+(i%25),sku:'S'+i,qty:(i%200),min:5,cost:50+(i%100),price:80+(i%150)});
    for(var i=0;i<N_CUST;i++){var c={id:'c'+i,name:'عميل '+i,phone:'010'+(10000000+i),balance:(i%7===0?100:0),isPatient:(i%3===0)};
      if(c.isPatient){c.treatmentPlans=[{id:'pl'+i,title:'خطة '+(i%5),sessions:[{id:'s',no:1,title:'ج',status:'pending',price:500}],payments:(i%2?[{id:'pp'+i,amount:200,date:today(),acct:'cash'}]:[])}];
        c.recalls=[{id:'rc'+i,reason:'متابعة',intervalMonths:6,nextDue:fatAddMonths(today(),(i%12)-6),active:true}];}
      db.customers.push(c);}
    for(var i=0;i<N_APPT;i++) db.appointments.push({id:'a'+i,patientId:'c'+((i*3)%N_CUST),patientName:'عميل',patientPhone:'0100',date:addDays(today(),(i%30)-10),time:'10:00',status:'scheduled'});
    var base=new Date(); for(var i=0;i<N_SALE;i++){var d=new Date(base.getTime()-(i%400)*86400000).toISOString().slice(0,10);
      var pid='p'+(i%N_PROD); var price=80+(i%150); db.sales.push({id:'sa'+i,no:i+1,date:d,ts:new Date().toISOString(),customerId:(i%4?'':'c'+(i%N_CUST)),customerName:'',items:[{pid:pid,name:'صنف',qty:1+(i%3),price:price,cost:50,cat:'ت'}],total:price,sub:price,vat:0,cost:50,profit:price-50,paidAmount:price,dueAmount:0,payMethod:'cash',acct:'cash',branch:activeBranch?activeBranch():''});}
    return {p:db.products.length,c:db.customers.length,s:db.sales.length,a:db.appointments.length};
  })()`);
  const seedMs = Date.now() - t0;
  console.log('  زُرع: ' + JSON.stringify(seed) + ' في ' + seedMs + 'ms');
  ok('زرع البيانات نجح', seed && seed.s >= 8000);

  function timeView(vn) {
    jsErrors.length = 0;
    const t = Date.now();
    const r = ev("(function(){try{document.getElementById('content').innerHTML='';go&&typeof go==='function'?go('" + vn + "'):views['" + vn + "']();return 'OK';}catch(e){return 'THROW:'+e.message;}})()");
    const ms = Date.now() - t;
    const okr = r === 'OK' && jsErrors.length === 0;
    console.log('  ' + (okr ? '✅' : '❌') + ' ' + vn + ' → ' + ms + 'ms' + (okr ? '' : '  ' + (r + ' ' + (jsErrors[0] || ''))));
    if (okr) pass++; else fail++;
    return ms;
  }

  console.log('\n▶ زمن رسم الشاشات الثقيلة (بيانات ضخمة)');
  ['dashboard', 'products', 'sales', 'customers', 'reports', 'clinic', 'clinicreports', 'recall', 'reminders', 'apptcal', 'cyclecount', 'supcompare'].forEach(timeView);

  console.log('\n▶ تكامل البيانات');
  // إجماليات مفيش فيها NaN
  ok('مجموع مبيعات بدون NaN', ev("(function(){var s=0;for(var i=0;i<db.sales.length;i++)s+=(+db.sales[i].total||0);return isFinite(s)&&s>0;})()") === true);
  // fatClinicStats مايكسرش على بيانات ضخمة
  const t2 = Date.now(); const cs = ev("(function(){try{var s=fatClinicStats();return s.patients+'/'+s.overdue.length+'/'+s.debtors.length;}catch(e){return 'ERR:'+e.message;}})()"); const csMs = Date.now() - t2;
  ok('إحصائيات العيادة على بيانات ضخمة (' + csMs + 'ms)', String(cs).indexOf('ERR') !== 0, cs);
  // fatAllPlanPayments
  ok('تجميع كل دفعات الخطط مايكسرش', String(ev("(function(){try{return fatAllPlanPayments().length>=0;}catch(e){return 'ERR';}})()")) === 'true');
  // fatBuildJournal (المحاسبة) على بيانات ضخمة
  if (ev("typeof fatBuildJournal==='function'") === true) {
    const t3 = Date.now(); const jr = ev("(function(){try{var j=fatBuildJournal('','');return j.length;}catch(e){return 'ERR:'+e.message;}})()"); const jMs = Date.now() - t3;
    ok('بناء دفتر اليومية على ٨٠٠٠ فاتورة (' + jMs + 'ms)', typeof jr === 'number' && jr > 0, String(jr));
  }
  // save() round-trip: نتأكد إنه مايرميش
  ok('save() مايرميش على بيانات ضخمة', String(ev("(function(){try{save();return 'OK';}catch(e){return 'ERR:'+e.message;}})()")) === 'OK');
  // البحث عن عميل/منتج سريع
  const t4 = Date.now(); ev("for(var i=0;i<200;i++){findCustomer('c'+(i*7%1500));findProduct('p'+(i*5%2000));}"); const findMs = Date.now() - t4;
  ok('٤٠٠ عملية بحث (findCustomer/Product) في ' + findMs + 'ms', findMs < 3000, findMs + 'ms');

  console.log('\n' + '═'.repeat(52));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت · إجمالي وقت الزرع ${seedMs}ms`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
