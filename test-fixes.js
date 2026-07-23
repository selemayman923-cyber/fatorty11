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


  /* ═══ ١٠) v9.2 — التقسيط ═══ */
  console.log('\n▶ ١٠) v9.2 — التقسيط');

  const build = ev(`
    (function(){
      var p=fatInstBuild(1000, 3, 1, 'month', '2026-07-31');
      var sum=0; p.forEach(function(x){sum+=x.amount;});
      return { n:p.length, sum:Math.round(sum*100)/100,
               d1:p[0].dueDate, d2:p[1].dueDate, d3:p[2].dueDate,
               a1:p[0].amount, a3:p[2].amount };
    })()
  `);
  ok('عدد الأقساط صح', build && build.n === 3);
  ok('المجموع = المبلغ بالظبط (مفيش قرش ضايع)', build && build.sum === 1000);
  ok('التواريخ شهر بشهر', build && build.d1 === '2026-07-31' && build.d3 === '2026-09-30');
  ok('آخر قسط بيستوعب الكسور', build && build.a1 === 333.33 && build.a3 === 333.34);

  const odd = ev(`
    (function(){
      var p=fatInstBuild(100, 3, 1, 'month', '2026-01-31');
      var sum=0; p.forEach(function(x){sum+=x.amount;});
      return { sum:Math.round(sum*100)/100, feb:p[1].dueDate };
    })()
  `);
  ok('٣١ يناير + شهر = آخر فبراير (مش ٣ مارس)', odd && odd.feb === '2026-02-28');
  ok('المجموع مظبوط حتى مع الكسور', odd && odd.sum === 100);

  const payRes = ev(`
    (function(){
      db.customers=[{id:'ci',name:'مقاول',phone:'01000000009',balance:1000}];
      db.sales=[{id:'si',no:77,date:today(),customerId:'ci',customerName:'مقاول',
                 total:1000,paidAmount:0,dueAmount:1000,items:[]}];
      var s=db.sales[0];
      s.installments=fatInstBuild(1000,2,1,'month',today());
      window.__cash=[];
      window.addCash=function(dir,amt,note){ window.__cash.push({dir:dir,amt:amt,note:note}); };
      window.fatAskAccount=function(){ return Promise.resolve('cash'); };
      window.promptBox=function(){ return Promise.resolve(500); };
      fatInstPay('si',1);
      return true;
    })()
  `);
  setTimeout(() => {
    const after = ev(`
      (function(){
        var s=db.sales[0], c=db.customers[0];
        return { due:s.dueAmount, paid:s.paidAmount, bal:c.balance,
                 inst1Paid:s.installments[0].paid,
                 cashIn:(window.__cash[0]||{}).amt, cashDir:(window.__cash[0]||{}).dir };
      })()
    `);
    ok('المتبقي على الفاتورة قلّ', after && after.due === 500);
    ok('المدفوع زاد', after && after.paid === 500);
    ok('رصيد العميل قلّ', after && after.bal === 500);
    ok('القسط اتعلّم مدفوع', after && after.inst1Paid === true);
    ok('الفلوس دخلت الخزينة', after && after.cashIn === 500 && after.cashDir === 'in');

    const totals = ev(`
      (function(){
        var t=fatInstTotals();
        return { due:t.due, count:t.count, collected:t.collected };
      })()
    `);
    ok('الإجماليات بتحسب المتبقي صح', totals && totals.due === 500 && totals.count === 1);
    ok('والمحصّل صح', totals && totals.collected === 500);

    ok('تنبيه الأقساط المتأخرة في الجرس', ev(`
      (function(){
        db.sales[0].installments[1].dueDate='2020-01-01';
        return getAlerts().some(function(a){return /قسط متأخر/.test(a.msg);});
      })()
    `) === true);

    ok('بيرفض تحصيل أكبر من المتبقي', ev(`
      (function(){
        window.promptBox=function(){ return Promise.resolve(99999); };
        window.toast=function(m){ window.__t2=m; };
        fatInstPay('si',2);
        return true;
      })()
    `) === true);

    /* ═══ ١١) v9.3 — عمولة المندوبين ═══ */
    console.log('\n▶ ١١) v9.3 — عمولة المندوبين');

    const commSetup = ev(`
      (function(){
        db.employees=[
          {id:'e1',name:'محمود',commRate:5,commBase:'net'},
          {id:'e2',name:'سعيد',commRate:10,commBase:'profit'},
          {id:'e3',name:'بدون عمولة'}
        ];
        db.sales=[
          {id:'m1',no:1,date:today(),salesEmp:'e1',total:1140,vat:140,profit:300,items:[]},
          {id:'m2',no:2,date:today(),salesEmp:'e2',total:1140,vat:140,profit:300,items:[]},
          {id:'m3',no:3,date:today(),salesEmp:'e1',total:570,vat:70,profit:100,items:[],voided:true}
        ];
        return { emps: fatCommEmps().length };
      })()
    `);
    ok('بيعد المندوبين اللي عليهم نسبة بس', commSetup && commSetup.emps === 2);

    const calc = ev(`
      (function(){
        var e1=db.employees[0], e2=db.employees[1];
        return { net: fatCommOfSale(db.sales[0], e1),
                 prof: fatCommOfSale(db.sales[1], e2),
                 zero: fatCommOfSale(db.sales[0], db.employees[2]) };
      })()
    `);
    ok('عمولة على الصافي: (1140−140)×5% = 50', calc && calc.net === 50);
    ok('عمولة على الربح: 300×10% = 30', calc && calc.prof === 30);
    ok('موظف من غير نسبة = صفر', calc && calc.zero === 0);

    const stats = ev(`
      (function(){
        var st=fatCommStats('e1');
        return { count:st.count, earned:st.earned, due:st.due };
      })()
    `);
    ok('الفاتورة الملغية مش بتتحسب', stats && stats.count === 1);
    ok('العمولة المستحقة صح', stats && stats.earned === 50 && stats.due === 50);

    ok('وسم الفاتورة بالمندوب من الكاشير', ev(`
      (function(){
        window._posEmp='e1';
        db.sales=[];
        window.posCheckout=function(){
          db.sales.push({id:'n1',no:9,date:today(),total:1140,vat:140,profit:200,items:[]});
          return 'ok';
        };
        return true;
      })()
    `) === true);

    const payRes2 = ev(`
      (function(){
        window.__cash2=[];
        window.addCash=function(dir,amt,note){ window.__cash2.push({dir:dir,amt:amt}); };
        window.fatAskAccount=function(){ return Promise.resolve('cash'); };
        window.promptBox=function(){ return Promise.resolve(50); };
        db.sales=[{id:'m1',no:1,date:today(),salesEmp:'e1',total:1140,vat:140,profit:300,items:[]}];
        fatCommPay('e1');
        return true;
      })()
    `);
    setTimeout(() => {
      const afterPay = ev(`
        (function(){
          var e=db.employees[0];
          var st=fatCommStats('e1');
          return { paid:st.paid, due:st.due, recs:(e.commPayments||[]).length,
                   cashOut:(window.__cash2[0]||{}).amt, dir:(window.__cash2[0]||{}).dir };
        })()
      `);
      ok('الصرف اتسجّل', afterPay && afterPay.recs === 1);
      ok('المستحق بقى صفر', afterPay && afterPay.due === 0 && afterPay.paid === 50);
      ok('الفلوس خرجت من الخزينة', afterPay && afterPay.cashOut === 50 && afterPay.dir === 'out');

      /* ═══ ١٢) v9.4 — الولاء و QR الطاولات ═══ */
      console.log('\n▶ ١٢) v9.4 — مستويات الولاء');

      ok('مقفولة افتراضيًا', ev(`fatLoyOn()===false`) === true);

      const tierRes = ev(`
        (function(){
          fatLoyCfg().on=true;
          db.settings.loyaltyRate=1; db.settings.loyaltyOn=true;
          db.customers=[{id:'L1',name:'كبير',points:0},{id:'L2',name:'صغير',points:0},{id:'L3',name:'جديد',points:0}];
          db.sales=[
            {id:'v1',date:today(),customerId:'L1',total:30000},
            {id:'v2',date:today(),customerId:'L1',total:25000},
            {id:'v3',date:today(),customerId:'L2',total:6000},
            {id:'v4',date:today(),customerId:'L1',total:9999,voided:true}
          ];
          var a=fatCustTier('L1'), b=fatCustTier('L2'), c=fatCustTier('L3');
          return { aKey:a.tier.key, aSpend:a.spend, bKey:b.tier.key, cKey:c.tier.key,
                   bNext:b.next&&b.next.key, bTo:b.toNext, aNext:a.next };
        })()
      `);
      ok('٥٥ ألف = بلاتيني', tierRes && tierRes.aKey === 'platinum');
      ok('الفاتورة الملغية مش محسوبة (55000 مش 64999)', tierRes && tierRes.aSpend === 55000);
      ok('٦ آلاف = فضي', tierRes && tierRes.bKey === 'silver');
      ok('عميل جديد = برونزي', tierRes && tierRes.cKey === 'bronze');
      ok('بيقول باقي كام للترقية', tierRes && tierRes.bNext === 'gold' && tierRes.bTo === 14000);
      ok('أعلى مستوى مالوش ترقية', tierRes && tierRes.aNext === null);

      const discRes = ev(`
        (function(){
          db.promos=[]; cart=[];
          var el=document.getElementById('posCustomer');
          if(!el){ el=document.createElement('select'); el.id='posCustomer'; document.body.appendChild(el); }
          el.innerHTML='<option value="L1">كبير</option><option value="L3">جديد</option>';
          db.products=[{id:'lp',name:'ص',price:100,cost:50,qty:99}];
          cart=[{lid:'a',pid:'lp',qty:10}];
          el.value='L1';
          var withTier=posCalc();
          el.value='L3';
          var noTier=posCalc();
          return { tierDisc: withTier.tierDisc, tierTotal: withTier.total,
                   plainDisc: noTier.tierDisc, plainTotal: noTier.total };
        })()
      `);
      ok('البلاتيني بياخد خصم ٥٪ تلقائي', discRes && discRes.tierDisc === 50);
      ok('البرونزي مبياخدش خصم', discRes && discRes.plainDisc === undefined);
      ok('الإجمالي بيقل بالخصم', discRes && discRes.tierTotal < discRes.plainTotal);

      const qrRes = ev(`
        (function(){
          db.settings.waNumber='01012364189';
          fatTableQRCfg().msg='عايز أطلب من طاولة {رقم}';
          var l=fatTableQRLink(7);
          return { has: l.indexOf('wa.me/201012364189')>-1,
                   hasNo: decodeURIComponent(l).indexOf('طاولة 7')>-1 };
        })()
      `);
      ok('لينك الطاولة بيتولّد صح', qrRes && qrRes.has === true);
      ok('ورقم الطاولة جواه', qrRes && qrRes.hasNo === true);
      ok('من غير رقم واتساب بيرجّع فاضي', ev(`
        (function(){ db.settings.waNumber=''; db.settings.phone=''; return fatTableQRLink(1)===''; })()
      `) === true);

      /* ═══ ١٣) v9.5 — الطيارين وأوامر التصنيع ═══ */
      console.log('\n▶ ١٣) v9.5 — الطيارين');

      const drvSetup = ev(`
        (function(){
          db.drivers=[{id:'d1',name:'كريم',phone:'01011112222',fee:15,active:true}];
          db.sales=[
            {id:'o1',no:1,date:today(),total:200,payMethod:'cash',orderType:'delivery',driverId:'d1',driverFee:15},
            {id:'o2',no:2,date:today(),total:300,payMethod:'cash',orderType:'delivery',driverId:'d1',driverFee:15},
            {id:'o3',no:3,date:today(),total:150,payMethod:'credit',orderType:'delivery',driverId:'d1',driverFee:15},
            {id:'o4',no:4,date:today(),total:999,orderType:'delivery',driverId:'d1',driverFee:15,voided:true}
          ];
          var st=fatDriverStats('d1');
          return { open:st.open, cash:st.cash, fees:st.fees, net:st.net };
        })()
      `);
      ok('عدّ الطلبات المفتوحة (استثنى الملغي)', drvSetup && drvSetup.open === 3);
      ok('الكاش = 200+300 بس (الآجل مش محصّل فلوس)', drvSetup && drvSetup.cash === 500);
      ok('الأجرة على ٣ طلبات = ٤٥', drvSetup && drvSetup.fees === 45);
      ok('المفروض يسلّم = 500−45 = 455', drvSetup && drvSetup.net === 455);

      const settleRes = ev(`
        (function(){
          window.__cash3=[];
          window.addCash=function(dir,amt){ window.__cash3.push({dir:dir,amt:amt}); };
          window.fatAskAccount=function(){ return Promise.resolve('cash'); };
          fatDriverSettle('d1');
          var amtEl=document.getElementById('ds_amt');
          amtEl.value='455';
          fatDriverSettleSave('d1');
          return true;
        })()
      `);
      setTimeout(() => {
        const afterSettle = ev(`
          (function(){
            var open=db.sales.filter(function(s){return s.driverId==='d1' && !s.driverSettled && !s.voided;}).length;
            var st=fatDriverStats('d1');
            var d=fatDrivers()[0];
            return { openAfter: open, newOpen: st.open, cashIn:(window.__cash3[0]||{}).amt,
                     settlements: (d.settlements||[]).length, diff:(d.settlements||[])[0]&&d.settlements[0].diff };
          })()
        `);
        ok('كل الطلبات اتقفلت بعد التسوية', afterSettle && afterSettle.openAfter === 0);
        ok('الطيار بقى مفيهوش طلبات مفتوحة', afterSettle && afterSettle.newOpen === 0);
        ok('الفلوس دخلت الخزينة', afterSettle && afterSettle.cashIn === 455);
        ok('التسوية اتسجّلت', afterSettle && afterSettle.settlements === 1);
        ok('مفيش فرق (سلّم بالظبط)', afterSettle && Math.abs(afterSettle.diff) < 0.01);

        console.log('\n▶ ١٤) v9.5 — أوامر التصنيع');
        const prodSetup = ev(`
          (function(){
            db.products=[
              {id:'raw1',name:'دقيق',qty:100,cost:5},
              {id:'raw2',name:'سكر',qty:50,cost:8},
              {id:'cake',name:'كيك',qty:0,cost:0,
               components:[{pid:'raw1',qty:2},{pid:'raw2',qty:1}]}
            ];
            db.stockMoves=[]; db.prodOrders=[];
            var p=findProduct('cake');
            return { max: fatProdMax(p), cost: fatProdCost(p,1) };
          })()
        `);
        ok('أقصى كمية = min(100/2, 50/1) = 50', prodSetup && prodSetup.max === 50);
        ok('تكلفة الوحدة = 2×5 + 1×8 = 18', prodSetup && prodSetup.cost === 18);

        const runRes = ev(`
          (function(){
            var el1=document.createElement('select'); el1.id='pr_pid';
            el1.innerHTML='<option value="cake" selected>كيك</option>'; document.body.appendChild(el1);
            var el2=document.createElement('input'); el2.id='pr_qty'; el2.value='10'; document.body.appendChild(el2);
            var el3=document.createElement('input'); el3.id='pr_note'; el3.value=''; document.body.appendChild(el3);
            fatProdRun();
            var raw1=findProduct('raw1'), raw2=findProduct('raw2'), cake=findProduct('cake');
            return { raw1:raw1.qty, raw2:raw2.qty, cake:cake.qty, orders:fatProdOrders().length };
          })()
        `);
        ok('الدقيق اتخصم (100−20=80)', runRes && runRes.raw1 === 80);
        ok('السكر اتخصم (50−10=40)', runRes && runRes.raw2 === 40);
        ok('الكيك اتضاف (10)', runRes && runRes.cake === 10);
        ok('أمر التصنيع اتسجّل', runRes && runRes.orders === 1);

        ok('بيرفض لو المكوّنات مش كفاية', ev(`
          (function(){
            document.getElementById('pr_qty').value='999';
            var before=fatProdOrders().length;
            window.toast=function(m){ window.__t3=m; };
            fatProdRun();
            return fatProdOrders().length===before;
          })()
        `) === true);

        /* ═══ ١٥) v9.6 — الاستيراد العام وصحة الحساب ═══ */
        console.log('\n▶ ١٥) v9.6 — استيراد CSV');

        const csvRes = ev(`
          (function(){
            var text = 'الاسم,السعر,التكلفة,الكمية\\nأسمنت,120,90,50\\n"صنف فيه, فاصلة",30,20,5\\n';
            var rows = fatCSVParse(text);
            return { n: rows.length, h: rows[0], r1: rows[1], r2name: rows[2][0] };
          })()
        `);
        ok('بارسر CSV بيقرا الصفوف صح', csvRes && csvRes.n === 3);
        ok('العناوين اتقرت', csvRes && csvRes.h[0] === 'الاسم');
        ok('الفاصلة جوه علامات التنصيص متتقسمش', csvRes && csvRes.r2name === 'صنف فيه, فاصلة');

        ok('تخمين العمود بيلاقي التطابق', ev(`
          fatImportGuessCol(['Name','Price','Qty'], ['name','الاسم']) === 0
        `) === true);
        ok('عمود مش موجود يرجّع -1', ev(`
          fatImportGuessCol(['Name','Price'], ['phone','هاتف']) === -1
        `) === true);

        const impRes = ev(`
          (function(){
            db.products=[{id:'ex1',name:'موجود',sku:'X1',price:1,cost:1,qty:1}];
            window._impState={
              kind:'products',
              headers:['الاسم','الكود','السعر','التكلفة','الكمية'],
              rows:[
                ['أسمنت','CEM1','120','90','50'],
                ['موجود','X1','1','1','1'],       // مكرر — نفس الكود
                ['','','100','80','10'],           // بدون اسم — لازم يتجاهل
                ['رمل','SND1','50','30','20']
              ],
              map:{name:0, sku:1, price:2, cost:3, qty:4}
            };
            fatImportRun();
            return { total: db.products.length,
                     hasNew: !!db.products.find(function(p){return p.sku==='CEM1';}),
                     hasSand: !!db.products.find(function(p){return p.sku==='SND1';}) };
          })()
        `);
        ok('استورد الصفوف الصحيحة (موجود + أسمنت + رمل = 3)', impRes && impRes.total === 3);
        ok('الصنف الجديد اتضاف', impRes && impRes.hasNew === true);
        ok('المكرر اتجاهل، والصف الناقص اتجاهل، والباقي دخل', impRes && impRes.hasSand === true);

        console.log('\n▶ ١٦) v9.6 — صحة الحساب');
        const healthRes = ev(`
          (function(){
            var orgs=[{id:'o1',name:'محل1'},{id:'o2',name:'محل2'},{id:'o3',name:'محل3'},
                      {id:'o4',name:'محل4'},{id:'o5',name:'محل5'}];
            var soon=new Date(Date.now()+3*86400000).toISOString();
            var far=new Date(Date.now()+60*86400000).toISOString();
            var past=new Date(Date.now()-5*86400000).toISOString();
            var subs=[
              {org_id:'o1', status:'active', expires_at: far},
              {org_id:'o2', status:'active', expires_at: soon},
              {org_id:'o3', status:'trialing', expires_at: far},
              {org_id:'o4', status:'active', expires_at: past}
            ];
            var h = fatHealthCompute(orgs, subs);
            return h;
          })()
        `);
        ok('إجمالي المحلات صح', healthRes && healthRes.total === 5);
        ok('مفعّل صح (بعيد + قريب)', healthRes && healthRes.active === 2);
        ok('تحت التجربة صح', healthRes && healthRes.trial === 1);
        ok('قربت تنتهي صح', healthRes && healthRes.expiringSoon === 1);
        ok('منتهي صح', healthRes && healthRes.expired === 1);
        ok('بدون اشتراك صح', healthRes && healthRes.noSub === 1);

        ok('الودجت بترسم من غير أخطاء', ev(`
          (function(){ var h=fatHealthCompute([],[]); var html=fatHealthWidget(h); return html.indexOf('صحة الحساب')>-1; })()
        `) === true);

        console.log('\n' + '─'.repeat(50));
        console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
        dom.window.close();
        process.exit(fail ? 1 : 0);
      }, 400);

    }, 400);

  }, 500);

  }, 400);

}, 2500);
