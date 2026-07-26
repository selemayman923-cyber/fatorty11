const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e.message||e)));
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
 ev("db.cash=db.cash||[]; db.sales=[{id:'s',date:today(),total:500,cash:500}]; db.expenses=[];");
 var before=ev("db.cash.length");
 w.fatCashCounts && w.fatCashCounts();
 ev("views.cashcount();"); // يرسم الشاشة وفيها الشيك بوكس
 // نعمل عجز: متوقّع=500 (opening 0 + sales 500 - out 0)، نعدّ 2×200=400 => عجز 100
 ev("document.getElementById('cc_open').value='0'; document.getElementById('cc_out').value='0'; document.getElementById('cc_200').value='2';");
 w.fatCashCounted();
 // نتأكد الشيك بوكس موجود ومفعّل
 ok('خيار الترحيل للخزينة ظهر', ev("!!document.getElementById('cc_post')")===true);
 w.fatCashSave();
 var after=ev("db.cash.length");
 ok('الفرق اترحّل للخزينة (قيد جديد)', after===before+1, 'before '+before+' after '+after);
 ok('القيد نوعه صرف (عجز)', ev("db.cash[db.cash.length-1].type")==='out', ev("db.cash[db.cash.length-1] && db.cash[db.cash.length-1].type"));
 ok('قيمة القيد = 100', ev("db.cash[db.cash.length-1].amount")===100, ev("db.cash[db.cash.length-1] && db.cash[db.cash.length-1].amount"));
 ok('السجل بيقول اترحّل', ev("fatCashCounts()[fatCashCounts().length-1].posted")===true);
 console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
},2500);
