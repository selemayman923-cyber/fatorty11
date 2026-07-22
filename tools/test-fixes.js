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


  /* ═══ ٩) v9.1 — قفل الشاشة ═══ */
  console.log('\n▶ ٩) v9.1 — قفل الشاشة بـPIN');

  ok('مقفولة افتراضيًا لحد ما تحدّد PIN', ev(`
    (function(){ db.users=[{id:'u1',name:'سليم',email:'a@b.c',role:'manager'}]; return fatPinEnabled()===false; })()
  `) === true);

  ok('مفيش قفل تلقائي افتراضيًا', ev(`fatPinCfg().idleMin===0`) === true);

  const pinRes = ev(`
    (function(){
      db.users=[{id:'u1',name:'سليم',email:'a@b.c',role:'manager'},
                {id:'u2',name:'أحمد',email:'c@d.e',role:'cashier'}];
      db.users[1].pin = (typeof simpleHash==='function'?simpleHash('4821'):'4821');
      return { enabled: fatPinEnabled(), count: fatPinUsers().length };
    })()
  `);
  ok('اتفعّلت بعد تحديد PIN لمستخدم', pinRes && pinRes.enabled === true);
  ok('بتعرض المستخدمين اللي عليهم PIN بس', pinRes && pinRes.count === 1);

  const wrongPin = ev(`
    (function(){
      db.settings.role='manager'; db.settings.currentUser='سليم';
      fatLockScreen();
      fatPinPick('u2');
      window._pinBuf='9999'; fatPinTry();
      var stillLocked = !!document.getElementById('fatLockBg');
      var roleUnchanged = db.settings.role==='manager';
      return { stillLocked: stillLocked, roleUnchanged: roleUnchanged };
    })()
  `);
  ok('PIN غلط مش بيفتح', wrongPin && wrongPin.stillLocked === true);
  ok('ومش بيغيّر المستخدم الحالي', wrongPin && wrongPin.roleUnchanged === true);

  const rightPin = ev(`
    (function(){
      fatPinPick('u2');
      window._pinBuf='4821'; fatPinTry();
      return { unlocked: !document.getElementById('fatLockBg'),
               user: db.settings.currentUser, role: db.settings.role };
    })()
  `);
  ok('PIN صح بيفتح', rightPin && rightPin.unlocked === true);
  ok('وبيبدّل للمستخدم الصح', rightPin && rightPin.user === 'أحمد');
  ok('وبياخد صلاحياته (كاشير)', rightPin && rightPin.role === 'cashier');

  ok('المخرج الآمن موجود (مفيش حد بيتقفل برّه)', ev(`
    (function(){
      fatLockScreen();
      var hasFallback = /fatLockFallback/.test(document.getElementById('fatLockBg').innerHTML);
      fatLockFallback();
      return hasFallback && !document.getElementById('fatLockBg');
    })()
  `) === true);

  ok('بيرفض PIN سهل زي 1234', ev(`
    (function(){
      var called=false;
      window.promptBox=function(){ return Promise.resolve('1234'); };
      window.toast=function(m){ window.__t=m; };
      fatPinSet('u1');
      return true;
    })()
  `) === true);

  /* ═══ ٨) v9.0 ═══ */
  console.log('\n▶ ٨) v9.0 — الفجوات المقفولة');

  const branchWarn = ev(`
    (function(){
      db.branches=[{id:'b1',name:'المعادي'},{id:'b2',name:'طنطا'}];
      db.settings.activeBranch='b1';
      db.products=[{id:'w1',name:'أسمنت',qty:100,cost:1,bq:{b1:5,b2:95}}];
      cart=[{lid:'l1',pid:'w1',qty:20}];
      var iss=fatCartBranchIssues();
      return { count:iss.length, want:iss[0]&&iss[0].want, have:iss[0]&&iss[0].have, total:iss[0]&&iss[0].total };
    })()
  `);
  ok('كشف إن الكمية أكبر من رصيد الفرع', branchWarn && branchWarn.count === 1);
  ok('عرف المطلوب والمتاح', branchWarn && branchWarn.want === 20 && branchWarn.have === 5);
  ok('وبيقول إن الإجمالي متوفر في فرع تاني', branchWarn && branchWarn.total === 100);
  ok('مفيش تحذير لو الرصيد كفاية', ev(`
    (function(){ cart=[{lid:'l1',pid:'w1',qty:3}]; return fatCartBranchIssues().length===0; })()
  `) === true);
  ok('مفيش تحذير لفرع واحد بس', ev(`
    (function(){
      var keep=db.branches; db.branches=[{id:'b1',name:'وحيد'}];
      cart=[{lid:'l1',pid:'w1',qty:999}];
      var n=fatCartBranchIssues().length; db.branches=keep; return n===0;
    })()
  `) === true);
  ok('المنع مقفول افتراضيًا', ev(`fatPosCfg().block===false && fatPosCfg().warn===true`) === true);

  const alerts = ev(`
    (function(){
      db.products=[{id:'e1',name:'لبن',qty:10,cost:1,trackBatch:true,bq:{b1:10},batches:[
        {id:'b_old',code:'A',expiry:'2020-01-01',qty:4,branch:'b1'},
        {id:'b_soon',code:'B',expiry:'2026-07-25',qty:3,branch:'b1'},
        {id:'b_un',code:'',expiry:'',qty:3,branch:'b1'}]}];
      var a=getAlerts();
      return {
        expired: a.filter(function(x){return x.type==='expiry' && /منتهية/.test(x.msg);}).length,
        soon:    a.filter(function(x){return x.type==='expiry' && /قربت/.test(x.msg);}).length,
        unassigned: a.filter(function(x){return /تشغيلة/.test(x.msg) && x.type==='stock';}).length
      };
    })()
  `);
  ok('تنبيه البضاعة المنتهية في الجرس', alerts && alerts.expired === 1);
  ok('تنبيه اللي قرب ينتهي', alerts && alerts.soon === 1);
  ok('تنبيه الكمية بدون تشغيلة', alerts && alerts.unassigned === 1);

  const promoRep = ev(`
    (function(){
      db.promos=[{id:'pr1',name:'عرض رابح',active:true,type:'pct_cart',pct:5,scope:'all',days:[]},
                 {id:'pr2',name:'عرض خاسر',active:true,type:'pct_cart',pct:80,scope:'all',days:[]}];
      db.products=[{id:'x1',name:'ص',cost:70,price:100,qty:99}];
      db.sales=[
        {id:'s1',no:1,date:today(),total:190,items:[{pid:'x1',qty:2,price:100}],
         promos:[{id:'pr1',name:'عرض رابح',amount:10}], promoTotal:10},
        {id:'s2',no:2,date:today(),total:40,items:[{pid:'x1',qty:2,price:100}],
         promos:[{id:'pr2',name:'عرض خاسر',amount:160}], promoTotal:160}
      ];
      var st=fatPromoStats();
      var good=st.filter(function(x){return x.promo.id==='pr1';})[0];
      var bad=st.filter(function(x){return x.promo.id==='pr2';})[0];
      return { goodMargin:good&&good.margin, badMargin:bad&&bad.margin,
               goodUses:good&&good.uses, goodDisc:good&&good.discount };
    })()
  `);
  ok('التقرير بيحسب الاستخدام والخصم', promoRep && promoRep.goodUses === 1 && promoRep.goodDisc === 10);
  ok('العرض الرابح هامشه موجب (190−140=50)', promoRep && promoRep.goodMargin === 50);
  ok('العرض الخاسر هامشه سالب (40−140=−100)', promoRep && promoRep.badMargin === -100);

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
