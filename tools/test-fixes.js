/* اختبار الإصلاحات — بيشتغل جوه index.html الحقيقي عن طريق jsdom
   الفكرة: نختبر الحاجة اللي هتتشحن فعلًا، مش نسخة منفصلة منها. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = process.argv[2] || '/home/claude/fixed.html';
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  c ? (pass++, console.log('  ✅ ' + n))
    : (fail++, console.log('  ❌ ' + n + (extra ? '\n       ' + extra : '')));
};

const vc = new VirtualConsole();
const jsErrors = [];
vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));

const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://fatorty11.vercel.app/', virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = w.print = w.alert = () => {};
    w.navigator.serviceWorker = { register: () => Promise.resolve({ addEventListener() {} }), addEventListener() {}, controller: null };
    w.indexedDB = { open: () => ({ addEventListener() {} }) };
    w.AudioContext = function () { return { state: 'running', resume() {}, createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: {} }), createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }), destination: {}, currentTime: 0 }; };
    w.supabase = {
      createClient: function () {
        return {
          auth: {
            getSession: function () { return Promise.resolve({ data: { session: null } }); },
            onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; }
          },
          from: function () {
            return {
              insert: function () { return Promise.resolve({}); },
              select: function () {
                return { eq: function () {
                  return {
                    range: function () { return Promise.resolve({ data: [], error: null }); },
                    maybeSingle: function () { return Promise.resolve({ data: null }); }
                  };
                } };
              }
            };
          },
          rpc: function () { return Promise.resolve({ data: [] }); }
        };
      }
    };
  }
});

const w = dom.window;
const ev = expr => { try { return w.eval(expr); } catch (e) { return '__ERR__:' + e.message; } };

setTimeout(() => {
  ok('التطبيق أقلع من غير أخطاء', jsErrors.length === 0, jsErrors[0] || '');

  /* ═══ ١) الأسماء اللي فيها علامات تنصيص ═══ */
  console.log('\n▶ ١) اسم فيه علامة تنصيص مبيكسرش الزرار');
  ev(`
    db.settings = db.settings || {}; db.branches = db.branches || [{id:'b1',name:'رئيسي'}];
    db.customers = [{id:'c1', name:'محل "النور" و\\'أبو أحمد\\'', phone:'01000000001'}];
    db.sales = [{id:'s1', no:1, date:today(), customerId:'c1',
                 customerName:'محل "النور" و\\'أبو أحمد\\'', dueAmount:500}];
    db.purchases = [];
    window._agTab='cust';
    document.getElementById('topActions') || (function(){
      var d=document.createElement('div'); d.id='topActions'; document.body.appendChild(d);
    })();
    document.getElementById('content') || (function(){
      var d=document.createElement('div'); d.id='content'; document.body.appendChild(d);
    })();
    views.aging();
    'done';
  `);
  const btnCount = ev(`document.querySelectorAll('#content button[onclick^="fatAgingRemind"]').length`);
  ok('زرار التذكير اتولّد', btnCount === 1, 'العدد: ' + btnCount);
  const onclickAttr = ev(`(document.querySelector('#content button[onclick^="fatAgingRemind"]')||{}).outerHTML||''`);
  ok('الزرار بيمرّر رقم مش نص', /fatAgingRemind\(\d+\)/.test(String(onclickAttr)),
     String(onclickAttr).slice(0, 90));
  ok('اسم العميل ظهر كامل في الجدول',
     String(ev(`document.getElementById('content').textContent`)).indexOf('النور') > -1);
  ok('التذكير بيلاقي العميل الصح برقمه',
     ev(`(function(){ var r=(window._agRows||[])[0]; return r && r.phone==='01000000001'; })()`) === true);

  /* ═══ ٢) أثر التشغيلة ═══ */
  console.log('\n▶ ٢) التشغيلة اللي خلصت بيفضل ليها أثر');
  const batchRes = ev(`
    (function(){
      db.products=[{id:'p1',name:'لبن',qty:10,cost:5,trackBatch:true,
                    bq:{b1:10}, batches:[{id:'bt1',code:'LOT-A',expiry:'2026-12-01',qty:10,branch:'b1'}]}];
      db.stockMoves=[];
      var p=findProduct('p1');
      fatBatchConsume(p, 10, 'b1');                  // بيع التشغيلة كلها
      var still = p.batches.filter(function(b){return b.code==='LOT-A';})[0];
      return { kept: !!still, qty: still?still.qty:null, marked: !!(still&&still.depletedAt),
               shown: fatBatchRows().filter(function(r){return r.b.code==='LOT-A';}).length };
    })()
  `);
  ok('التشغيلة لسه موجودة بعد ما خلصت', batchRes && batchRes.kept === true);
  ok('كميتها صفر', batchRes && batchRes.qty === 0);
  ok('اتعلّم عليها تاريخ النفاد', batchRes && batchRes.marked === true);
  ok('بس مش بتظهر في الشاشة (نضافة العرض)', batchRes && batchRes.shown === 0);

  /* ═══ ٣) الفرع المؤقت ═══ */
  console.log('\n▶ ٣) استلام تشغيلة مبيلمسش الفرع النشط المحفوظ');
  const brRes = ev(`
    (function(){
      db.branches=[{id:'b1',name:'رئيسي'},{id:'b2',name:'فرع ٢'}];
      db.settings.activeBranch='b1';
      db.products=[{id:'p2',name:'صنف',qty:0,cost:1,trackBatch:true,bq:{},batches:[]}];
      db.stockMoves=[];
      var seen=[];
      var _s=window.save; window.save=function(){ seen.push(db.settings.activeBranch); return _s&&_s.apply(this,arguments); };
      window._fatBranchOverride='b2';
      moveStock('p2', 5, 'in', 'اختبار');
      window._fatBranchOverride=null;
      window.save=_s;
      return { settingUnchanged: db.settings.activeBranch==='b1',
               wentToB2: fatBQOf(findProduct('p2'),'b2')===5,
               b1Empty: fatBQOf(findProduct('p2'),'b1')===0,
               savedBranches: seen };
    })()
  `);
  ok('الفرع النشط المحفوظ ما اتغيّرش', brRes && brRes.settingUnchanged === true);
  ok('الكمية راحت للفرع الصح', brRes && brRes.wentToB2 === true);
  ok('الفرع الرئيسي ما اتأثرش', brRes && brRes.b1Empty === true);

  /* ═══ ٤) المزامنة والسقف ═══ */
  console.log('\n▶ ٤) المزامنة والسقوف');
  ['transfers', 'promos', 'payClaims'].forEach(k =>
    ok('db.' + k + ' بتتزامن', ev(`V2_KINDS.indexOf('${k}')>-1`) === true));
  ok('سقف السحب اترفع من ٥٠ ألف',
     !/if\(page>50\) break/.test(fs.readFileSync(file, 'utf8')));
  ok('السقف الجديد مليون سجل',
     /if\(page>1000\)/.test(fs.readFileSync(file, 'utf8')));

  /* ═══ ٥) رصد الأخطاء ═══ */
  console.log('\n▶ ٥) رصد الأخطاء');
  ok('دالة الإرسال موجودة', typeof w.fatReportError === 'function');
  ok('التسجيل بينادي الإرسال',
     /if\(typeof fatReportError==='function'\) fatReportError\(entry\)/.test(fs.readFileSync(file, 'utf8')));
  const dedup = ev(`
    (function(){
      var n=0; var _f=sb&&sb.from;
      if(sb) sb.from=function(t){ if(t==='error_reports') n++; return { insert:function(){return Promise.resolve({});} }; };
      var e={message:'نفس الخطأ',view:'pos',context:'x',source:'test'};
      fatReportError(e); fatReportError(e); fatReportError(e);
      if(sb&&_f) sb.from=_f;
      return n;
    })()
  `);
  ok('الخطأ المكرر بيتبعت مرة واحدة بس', dedup === 1, 'اتبعت ' + dedup + ' مرة');

  /* ═══ ٦) الحاجات القديمة لسه شغّالة ═══ */
  console.log('\n▶ ٦) اللي كان شغّال لسه شغّال');
  ok('حسبة الفاتورة سليمة', ev(`
    (function(){
      db.promos=[]; window.cart=[]; 
      var T=posCalc();
      return typeof T==='object' && typeof T.total==='number';
    })()
  `) === true);
  ok('الدمج الثلاثي شغّال', ev(`
    (function(){
      var base={id:'x',a:1,b:2}, cloud={id:'x',a:9,b:2}, local={id:'x',a:1,b:8};
      var out=fatMergeKind([local],[cloud],{x:JSON.stringify(base)},'products')[0];
      return out.a===9 && out.b===8;
    })()
  `) === true);
  ok('FEFO لسه بيخصم الأقرب انتهاءً', ev(`
    (function(){
      db.products=[{id:'p9',name:'ت',qty:20,cost:1,trackBatch:true,bq:{b1:20},batches:[
        {id:'x1',code:'بعيد',expiry:'2027-01-01',qty:10,branch:'b1'},
        {id:'x2',code:'قريب',expiry:'2026-08-01',qty:10,branch:'b1'}]}];
      db.stockMoves=[];
      fatBatchConsume(findProduct('p9'), 4, 'b1');
      var near=findProduct('p9').batches.filter(function(b){return b.code==='قريب';})[0];
      return near.qty===6;
    })()
  `) === true);


  /* ═══ ٧) شاشة صحة البيانات — الإصلاح الجديد ═══ */
  console.log('\n▶ ٧) صحة البيانات: التكرار والتسوية');
  const dupRes = ev(`
    (function(){
      db.branches=[{id:'b1',name:'رئيسي'}];
      db.products=[
        {id:'d1',name:'بن تركي',sku:'C100',qty:6.65,cost:1},
        {id:'d2',name:'بن تركي',sku:'C100',qty:6.65,cost:1},
        {id:'d3',name:'سليم',sku:'X1',qty:5,cost:1}
      ];
      db.stockMoves=[
        {pid:'d1',date:today(),balance:6.90},
        {pid:'d2',date:today(),balance:6.90},
        {pid:'d3',date:today(),balance:5}
      ];
      var a=fatStockAudit();
      var d1=a.filter(function(r){return r.p.id==='d1';})[0];
      return {
        flaggedDup: !!(d1 && d1.issues.some(function(i){return i.type==='dup';})),
        flaggedMoves: !!(d1 && d1.issues.some(function(i){return i.type==='moves';})),
        cleanNotFlagged: !a.filter(function(r){return r.p.id==='d3';})[0]
      };
    })()
  `);
  ok('كشف الكارت المكرر', dupRes && dupRes.flaggedDup === true);
  ok('ولسه بيكشف فرق سجل الحركة', dupRes && dupRes.flaggedMoves === true);
  ok('الصنف السليم مش بيتفلگ', dupRes && dupRes.cleanNotFlagged === true);

  const fixRes = ev(`
    (function(){
      db.products=[{id:'f1',name:'صنف',sku:'F1',qty:8,cost:1,bq:{b1:8}}];
      db.stockMoves=[{pid:'f1',date:today(),balance:10}];
      var before=db.stockMoves.length;
      window.confirmBox=function(){ return Promise.resolve(true); };  // نوافق تلقائيًا
      fatStockFix('f1');
      return { pending:true, before:before };
    })()
  `);
  setTimeout(() => {
    const after = ev(`
      (function(){
        var mv=(db.stockMoves||[]).filter(function(m){return m.kind==='adjust';})[0];
        return { added: !!mv, delta: mv?mv.delta:null, qtyUnchanged: findProduct('f1').qty===8,
                 clean: fatStockAudit().filter(function(r){return r.p.id==='f1';}).length===0 };
      })()
    `);
    ok('التصحيح سجّل حركة تسوية', after && after.added === true);
    ok('التسوية بالفرق الصح (−٢)', after && after.delta === -2);
    ok('الكمية نفسها ما اتغيّرتش', after && after.qtyUnchanged === true);
    ok('المشكلة اتحلّت بعد التسوية', after && after.clean === true);

    console.log('\n' + '─'.repeat(50));
    console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
    dom.window.close();
    process.exit(fail ? 1 : 0);
  }, 400);

}, 2500);
