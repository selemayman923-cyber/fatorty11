const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('/mnt/user-data/outputs/index.html','utf8');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e.message||e)));
let timerCount=0;
const t0=Date.now();
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.vercel.app/',virtualConsole:vc,beforeParse(w){
 const _st=w.setTimeout; w.setTimeout=function(f,ms){ if(ms>=100) timerCount++; return _st.apply(this,arguments); };
 w.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({}),text:()=>Promise.resolve('')});
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 w.scrollTo=()=>{};w.print=()=>{};w.alert=()=>{};w.confirm=()=>true;w.prompt=()=>'';w.open=()=>({document:{write(){},close(){}},print(){},close(){},focus(){}});
 w.navigator.serviceWorker={register:()=>Promise.resolve({addEventListener(){},update(){}}),addEventListener(){},controller:null,ready:Promise.resolve({})};
 w.indexedDB={open:()=>({addEventListener(){}})};
 w.AudioContext=function(){return{state:'running',resume(){},createOscillator:()=>({connect(){},start(){},stop(){},frequency:{},type:''}),createGain:()=>({connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}}),destination:{},currentTime:0};};
 w.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select:()=>({eq:()=>({range:()=>Promise.resolve({data:[],error:null})})})}),rpc:()=>Promise.resolve({data:[],error:null})})};
}});
const w=dom.window;const ev=e=>{try{return w.eval(e);}catch(x){return 'ERR:'+x.message;}};
setTimeout(()=>{
 const bootMs=Date.now()-t0;
 console.log('⏱  زمن الإقلاع الكامل: '+bootMs+'ms');
 console.log('⏲  مؤقّتات فعليًا اتسجّلت (>=100ms): '+timerCount);
 console.log('❌ أخطاء وقت التشغيل: '+errs.length);
 // قياس تكلفة renderNav (المتراكم عليه لفّات)
 let t=Date.now(); for(let i=0;i<20;i++) ev("renderNav()"); console.log('🔁 20 نداء renderNav: '+(Date.now()-t)+'ms');
 t=Date.now(); for(let i=0;i<200;i++) ev("canView('pos')"); console.log('🔁 200 نداء canView: '+(Date.now()-t)+'ms');
 t=Date.now(); for(let i=0;i<50;i++) ev("getAlerts()"); console.log('🔁 50 نداء getAlerts: '+(Date.now()-t)+'ms');
 // عدد الروابط في القايمة النهائية
 ev("try{renderNav();}catch(e){}");
 setTimeout(()=>{
   const links=w.document.querySelectorAll('#nav a[data-view]').length;
   const visible=Array.prototype.filter.call(w.document.querySelectorAll('#nav a[data-view]'),a=>a.style.display!=='none').length;
   console.log('🔗 روابط القايمة: '+links+' (ظاهر: '+visible+')');
   dom.window.close();process.exit(0);
 },1500);
},3000);
