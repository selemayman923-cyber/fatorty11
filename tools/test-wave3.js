/* اختبار: RFM + مهام الموظفين + ABC */
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

  console.log('\n▶ الدوال/الشاشات موجودة');
  ['fatRfmData', 'fatTasks', 'fatTaskSave', 'fatTaskToggle', 'fatAbcData'].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));
  ['rfm', 'tasks', 'abc'].forEach(v => ok('views.' + v, ev("typeof views." + v + "==='function'") === true));

  ev("db.customers=db.customers||[]; db.sales=db.sales||[]; db.products=db.products||[]; db.settings=db.settings||{};");
  ev("db.customers.push({id:'CV',name:'عميل مميز',phone:'0100'});db.customers.push({id:'CL',name:'عميل قديم',phone:'0101'});");
  ev("db.products.push({id:'PA',name:'صنف غالي'});db.products.push({id:'PB',name:'صنف رخيص'});");
  // عميل مميز: ٦ فواتير حديثة
  ev("for(var i=0;i<6;i++)db.sales.push({id:'v'+i,no:i,date:today(),customerId:'CV',total:1000,items:[{pid:'PA',qty:1,price:1000}]});");
  // عميل قديم: فاتورة واحدة من زمان
  ev("db.sales.push({id:'old',no:99,date:fatAddMonths(today(),-8),customerId:'CL',total:200,items:[{pid:'PB',qty:1,price:200}]});");

  console.log('\n▶ تصنيف RFM (v10.31)');
  const rfm = ev("JSON.stringify(fatRfmData().map(function(r){return {n:r.name,seg:r.seg,f:r.count};}))");
  ok('العميل كثير الشراء الحديث = vip', ev("fatRfmData().filter(function(r){return r.id==='CV';})[0].seg") === 'vip', rfm);
  ok('العميل القديم = lost', ev("fatRfmData().filter(function(r){return r.id==='CL';})[0].seg") === 'lost');
  let rErr = ev("(function(){try{views.rfm();return '';}catch(e){return e.message;}})()");
  ok('views.rfm بترسم', rErr === '', rErr);

  console.log('\n▶ مهام الموظفين (v10.32)');
  ev("db.settings.staffTasks=[];");
  ev("(function(){var d=document.createElement('input');d.id='tk_title';d.value='اطلب بضاعة';document.body.appendChild(d);var w=document.createElement('input');w.id='tk_who';w.value='أحمد';document.body.appendChild(w);var p=document.createElement('select');p.id='tk_pri';var o=document.createElement('option');o.value='high';o.selected=true;p.appendChild(o);document.body.appendChild(p);})()");
  w.fatTaskSave();
  ok('المهمة اتحفظت', ev("fatTasks().length") === 1);
  var tid = ev("fatTasks()[0].id");
  w.fatTaskToggle(tid);
  ok('تعليم المهمة تمّت', ev("fatTasks()[0].done") === true);
  ok('الجرس بيحسب المهام المفتوحة', (function(){ w.fatTaskToggle(tid); var a=w.getAlerts()||[]; return a.some(x=>/مهمة مفتوحة|open tasks/.test(x.msg||'')); })());
  let tErr = ev("(function(){try{views.tasks();return '';}catch(e){return e.message;}})()");
  ok('views.tasks بترسم', tErr === '', tErr);
  ev("['tk_title','tk_who','tk_pri'].forEach(function(i){var e=document.getElementById(i);if(e)e.remove();});");

  console.log('\n▶ تحليل ABC (v10.33)');
  const abc = ev("(function(){var d=fatAbcData();return JSON.stringify(d.rows.map(function(r){return {n:r.name,v:r.value,cls:r.cls};}));})()");
  ok('الصنف الأغلى قيمة = فئة A', ev("fatAbcData().rows[0].cls") === 'A', abc);
  ok('التراكمي بيوصل ١٠٠٪ للأخير', Math.round(ev("(function(){var r=fatAbcData().rows;return r[r.length-1].cumPct;})()")) === 100);
  let aErr = ev("(function(){try{views.abc();return '';}catch(e){return e.message;}})()");
  ok('views.abc بترسم', aErr === '', aErr);

  console.log('\n▶ بنية الملف سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
