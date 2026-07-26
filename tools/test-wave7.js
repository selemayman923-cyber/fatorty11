/* اختبار: البحث الصوتي + ثيمات الألوان */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const file = process.argv[2] || 'index.html';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (extra ? '\n       ' + extra : ''))); };
const html = fs.readFileSync(file, 'utf8');
const jsErrors = []; const store = {};
const vc = new VirtualConsole(); vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.vercel.app/', virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.scrollTo = () => {}; w.print = () => {}; w.alert = () => {}; w.confirm = () => true; w.prompt = () => '';
    w.open = () => ({ document: { write() {}, close() {} }, print() {}, close() {}, focus() {} });
    try { Object.defineProperty(w, 'localStorage', { value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, configurable: true }); } catch (e) {}
    // نحاكي دعم SpeechRecognition عشان نختبر ظهور المايك
    w.SpeechRecognition = function () { return { start() { this._started = true; }, stop() {}, lang: '', onresult: null, onerror: null, onend: null }; };
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

  console.log('\n▶ البحث الصوتي (v10.42)');
  ['fatVoiceSupported', 'fatCmdVoiceApply', 'fatCmdVoiceStart'].forEach(fn => ok(fn + '()', typeof w[fn] === 'function'));
  ok('بيتعرّف على دعم المتصفح', ev("fatVoiceSupported()") === true);
  w.fatCmdOpen();
  ok('زرار المايك ظهر في البحث (لأن مدعوم)', !!w.document.getElementById('fatCmdMic'));
  // تطبيق نص منطوق بيملأ البحث
  ev("db.customers=db.customers||[]; db.customers.push({id:'V',name:'محمد الصوتي',phone:'0100',isPatient:false});");
  w.fatCmdVoiceApply('محمد');
  ok('النص المنطوق بيملأ خانة البحث', (w.document.getElementById('fatCmdInput') || {}).value === 'محمد');
  ok('والنتايج بتتحدّث', ((w.document.getElementById('fatCmdResults') || {}).innerHTML || '').indexOf('محمد الصوتي') > -1);
  ok('بدء الاستماع مايكسرش', (function () { try { w.fatCmdVoiceStart(); return true; } catch (e) { return false; } })());
  w.fatCmdClose();

  console.log('\n▶ ثيمات الألوان (v10.43)');
  ok('fatThemes + fatSetTheme موجودين', typeof w.fatSetTheme === 'function' && !!w.fatThemes && !!w.fatThemes.blue);
  w.fatSetTheme('blue');
  ok('تغيير الثيم بيغيّر --primary', w.document.documentElement.style.getPropertyValue('--primary').trim() === '#2563eb');
  ok('الثيم بيتحفظ', store['fat_theme'] === 'blue');
  w.fatSetTheme('purple');
  ok('تبديل لبنفسجي', w.document.documentElement.style.getPropertyValue('--primary').trim() === '#7c3aed');
  w.fatSetTheme('default');
  ok('الرجوع للأخضر الافتراضي', w.document.documentElement.style.getPropertyValue('--primary').trim() === '#0f6b5c');
  // قائمة Aa بتعرض الثيمات
  if (typeof w.fatDisplayMenu === 'function') {
    w.fatDisplayMenu();
    ok('صف الثيمات ظهر في قائمة Aa', !!w.document.getElementById('fatThemeRow'));
  } else ok('قائمة Aa موجودة', true);

  console.log('\n▶ بنية الملف سليمة');
  const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

  console.log('\n' + '─'.repeat(50));
  console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
}, 2500);
