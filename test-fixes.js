/* اختبار الإقلاع الحقيقي — بيحمّل index.html ويشغّله زي المتصفح بالظبط
   ده اللي كان هيمسك كل مشاكل النهاردة قبل ما توصلك. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = process.argv[2] || '/home/claude/fixed.html';
const quiet = process.argv.includes('--quiet');

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  c ? (pass++, !quiet && console.log('  ✅ ' + n))
    : (fail++, console.log('  ❌ ' + n + (extra ? '\n       ' + extra : '')));
};

const html = fs.readFileSync(file, 'utf8');

/* ═══ ١) فحص البنية قبل التشغيل ═══ */
console.log('\n▶ بنية الملف');

const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
ok(`عدد بلوكات السكربت الداخلية = ${inlineBlocks.length} (المتوقع ٢)`, inlineBlocks.length === 2);

// أي </script> شاردة جوه كود أو تعليق بتقفل البلوك بدري
const strayClose = [];
inlineBlocks.forEach((b, i) => {
  const body = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
  if (/<\/script/i.test(body)) strayClose.push(i + 1);
});
ok('مفيش </script> شاردة جوه الكود', strayClose.length === 0,
   strayClose.length ? 'في البلوك رقم: ' + strayClose.join(', ') : '');

ok('الملف بينتهي بـ </html>', html.trim().endsWith('</html>'));
ok('وسم </body> موجود', /<\/body>/i.test(html));

/* ═══ ٢) فحص الصياغة ═══ */
console.log('\n▶ صياغة الجافاسكريبت');
let syntaxOk = true, syntaxErr = '';
inlineBlocks.forEach((b, i) => {
  const body = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
  try { new (require('vm').Script)(body, { filename: `block${i + 1}.js` }); }
  catch (e) { syntaxOk = false; syntaxErr += `بلوك ${i + 1}: ${e.message}\n       `; }
});
ok('كل البلوكات صياغتها سليمة', syntaxOk, syntaxErr.trim());

if (!syntaxOk) {
  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت — وقفنا، الصياغة مكسورة`);
  process.exit(1);
}

/* ═══ ٣) التشغيل الفعلي في DOM حقيقي ═══ */
console.log('\n▶ الإقلاع الفعلي');

const jsErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));
vc.on('error', (...a) => jsErrors.push(a.map(String).join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://fatorty11.vercel.app/',
  virtualConsole: vc,
  beforeParse(w) {
    // نقلّد الحاجات اللي مش موجودة في jsdom
    w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = () => {};
    w.print = () => {};
    w.alert = () => {};
    w.confirm = () => true;
    w.prompt = () => '';
    w.navigator.serviceWorker = { register: () => Promise.resolve({ addEventListener() {}, update() {} }), addEventListener() {}, controller: null, ready: Promise.resolve({}) };
    w.indexedDB = { open: () => ({ addEventListener() {}, onsuccess: null, onerror: null, onupgradeneeded: null }) };
    w.AudioContext = function () { return { state: 'running', resume() {}, createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: {}, type: '' }), createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }), destination: {}, currentTime: 0 }; };
    // Supabase وهمي (الملف الحقيقي مش بيتحمّل هنا)
    w.supabase = {
      createClient: () => ({
        auth: {
          getSession: () => Promise.resolve({ data: { session: null } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signInWithPassword: () => Promise.resolve({ data: {}, error: null })
        },
        from: () => ({ select: () => ({ eq: () => ({ range: () => Promise.resolve({ data: [], error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        rpc: () => Promise.resolve({ data: [], error: null })
      })
    };
  }
});

const w = dom.window;

// استنى الكود الأولي يخلص
setTimeout(() => {
  ok('التطبيق اشتغل من غير أخطاء وقت التحميل', jsErrors.length === 0,
     jsErrors.slice(0, 3).join('\n       '));

  /* ═══ ٤) هل كل الباتشات وصلت لآخرها فعلًا؟ ═══ */
  console.log('\n▶ الباتشات وصلت ولا وقفت في النص');
  const checks = [
    ['v8.0 · أعمار الديون', 'fatAgingRows'],
    ['v8.0 · الحد الائتماني', 'fatCustDue'],
    ['v8.0 · الباركود المحلي', 'fatEnsureBarcodeLib'],
    ['v8.1 · مخزون الفروع', 'fatBQOf'],
    ['v8.1 · التحويل', 'fatTransferModal'],
    ['v8.2 · سداد الاشتراك', 'fatRenewCalc'],
    ['v8.3 · الفاتورة الإلكترونية', 'fatEtaDoc'],
    ['v8.4 · شاشة المطبخ', 'fatKdsList'],
    ['v8.5 · التشغيلات', 'fatBatchConsume'],
    ['v8.6 · العروض', 'fatPromoEval'],
    ['v8.7 · المزامنة', 'fatThreeWay'],
    ['v8.8 · تسريع التحميل', 'fatEnsureQRLib'],
    ['v8.9 · رصد الأخطاء', 'fatReportError'],
    ['v9.0 · تحذير رصيد الفرع', 'fatCartBranchIssues'],
    ['v9.0 · تقرير أداء العروض', 'fatPromoStats'],
    ['v9.1 · قفل الشاشة', 'fatLockScreen'],
    ['v9.2 · التقسيط', 'fatInstBuild'],
    ['v9.3 · عمولة المندوبين', 'fatCommStats'],
    ['v9.4 · مستويات الولاء', 'fatCustTier'],
    ['v9.4 · QR الطاولات', 'fatTableQRLink'],
    ['v9.5 · الطيارين', 'fatDriverStats'],
    ['v9.5 · أوامر التصنيع', 'fatProdRun'],
    ['v9.6 · استيراد CSV', 'fatCSVParse'],
    ['v9.6 · صحة الحساب', 'fatHealthCompute'],
    ['v9.7 · معاينة الإيصال', 'fatReceiptPreviewHTML'],
    ['v9.8 · تشغيلة فاتورة الشراء', 'fatInvBatchSet'],
    ['v9.9 · إصلاح دمج المكرر', 'fatMergeBranchBatch'],
    ['v9.10 · ربط المرتجعات', 'fatNetOfReturns'],
    ['v9.11 · تسوية طيار بالمرتجع', 'fatDriverStats'],
    ['v9.12 · فرع الفاتورة عند التعديل', 'fatWithSaleBranch'],
    ['v9.13 · حماية الصرف بحد الصلاحية', 'fatGuardPayout']
  ];
  checks.forEach(([label, fn]) => ok(label, typeof w[fn] === 'function'));

  /* ═══ ٥) الشاشات اتسجّلت ═══ */
  console.log('\n▶ الشاشات الجديدة اتسجّلت');
  const screens = ['aging', 'branchStock', 'renew', 'etaPrep', 'kds', 'batches', 'promos', 'syncHealth', 'installments', 'commissions', 'loyalty', 'drivers', 'production'];
  // views و V2_KINDS معرّفين بـconst فمش على window — نقيّمهم جوه نطاق الصفحة
  const evalIn = expr => { try { return w.eval(expr); } catch (e) { return undefined; } };
  screens.forEach(s => ok('شاشة ' + s, evalIn(`typeof views!=='undefined' && typeof views['${s}']==='function'`) === true));

  /* ═══ ٦) الدوال الأصلية ما اتكسرتش ═══ */
  console.log('\n▶ الدوال الأساسية لسه سليمة');
  ['save', 'moveStock', 'posCalc', 'canView', 'renderNav', 'fatMergeKind'].forEach(f =>
    ok(f + '()', typeof w[f] === 'function'));

  /* ═══ ٧) المجموعات الجديدة بتتزامن ═══ */
  console.log('\n▶ المزامنة');
  ['transfers', 'promos', 'payClaims'].forEach(k =>
    ok('db.' + k + ' في قائمة المزامنة',
       evalIn(`typeof V2_KINDS!=='undefined' && V2_KINDS.indexOf('${k}')>-1`) === true));

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
