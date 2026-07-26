const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const file=process.argv[2]||'index.html';const html=fs.readFileSync(file,'utf8');const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e.message||e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.vercel.app/',virtualConsole:vc,beforeParse(w){
 w.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({}),text:()=>Promise.resolve('')});
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 w.scrollTo=()=>{};w.print=()=>{};w.open=()=>({document:{write(){},close(){}},print(){},close(){}});
 w.navigator.serviceWorker={register:()=>Promise.resolve({addEventListener(){},update(){}}),addEventListener(){},controller:null,ready:Promise.resolve({})};
 w.indexedDB={open:()=>({addEventListener(){}})};
 w.AudioContext=function(){return{state:'running',resume(){},createOscillator:()=>({connect(){},start(){},stop(){},frequency:{},type:''}),createGain:()=>({connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}}),destination:{},currentTime:0};};
 w.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select:()=>({eq:()=>({range:()=>Promise.resolve({data:[],error:null})})})}),rpc:()=>Promise.resolve({data:[],error:null})})};
}});
const w=dom.window;const ev=e=>{try{return w.eval(e);}catch(x){return 'ERR:'+x.message;}};
let pass=0,fail=0;const ok=(n,c,ex)=>{c?(pass++,console.log('  ✅ '+n)):(fail++,console.log('  ❌ '+n+(ex?' '+ex:'')));};
setTimeout(()=>{
 ok('نضيف من غير أخطاء', errs.length===0, errs.slice(0,2).join(' | '));
 ['fatCashCounts','fatCashCounted','fatCashSave','_ccRecalc'].forEach(fn=>ok(fn+'()', typeof w[fn]==='function'));
 ok('views.cashcount', ev("typeof views.cashcount==='function'")===true);
 // نجهّز مبيعات نقدي النهاردة 500 ومصروف نقدي 100
 ev("db.sales=[{id:'s',date:today(),total:500,cash:500}]; db.expenses=[{id:'e',date:today(),amount:100,acct:'cash'}];");
 let err=ev("(function(){try{views.cashcount();return '';}catch(e){return e.message;}})()");
 ok('الشاشة بترسم', err==='', err);
 ok('مبيعات النقدي اتحسبت تلقائي (500)', ev("window._ccSales")===500, 'got '+ev("window._ccSales"));
 // رصيد افتتاحي 200، مصروف نقدي 100 → متوقّع = 200+500-100 = 600
 ev("document.getElementById('cc_open').value='200'; document.getElementById('cc_out').value='100';");
 // نعدّ الدرج: ورقة 500؟ لأ، أقصى فئة 200. نحط 3×200=600
 ev("document.getElementById('cc_200').value='3';");
 w.fatCashCounted();
 ok('إجمالي المعدود صح (600)', ev("(function(){return document.getElementById('cc_counted').textContent;})()").indexOf('600')>-1, ev("document.getElementById('cc_counted').textContent"));
 ok('المتوقّع صح (600)', ev("document.getElementById('cc_expected').textContent").indexOf('600')>-1, ev("document.getElementById('cc_expected').textContent"));
 ok('الفرق = مظبوط', /مظبوط|Balanced/.test(ev("document.getElementById('cc_diff').textContent")), ev("document.getElementById('cc_diff').textContent"));
 // نغيّر العدّ لـ 2×200=400 → عجز 200
 ev("document.getElementById('cc_200').value='2';"); w.fatCashCounted();
 ok('العجز بيتحسب صح', /عجز|Short/.test(ev("document.getElementById('cc_diff').textContent")), ev("document.getElementById('cc_diff').textContent"));
 // حفظ
 w.fatCashSave();
 ok('الجرد اتحفظ في السجل', ev("fatCashCounts().length")===1);
 const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
 ok('بلوكين سكربت', inline===2);
 console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');
 dom.window.close();process.exit(fail?1:0);
},2500);
