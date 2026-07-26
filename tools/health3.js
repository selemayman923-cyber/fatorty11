const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('/mnt/user-data/outputs/index.html','utf8');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e.message||e)));
const store={};
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.vercel.app/',virtualConsole:vc,beforeParse(w){
 w.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({}),text:()=>Promise.resolve('')});
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 w.scrollTo=()=>{};w.print=()=>{};w.alert=()=>{};w.confirm=()=>true;w.prompt=()=>'';w.open=()=>({document:{write(){},close(){}},print(){},close(){},focus(){}});
 try{Object.defineProperty(w,'localStorage',{value:{getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},configurable:true});}catch(e){}
 w.navigator.serviceWorker={register:()=>Promise.resolve({addEventListener(){},update(){}}),addEventListener(){},controller:null,ready:Promise.resolve({})};
 w.indexedDB={open:()=>({addEventListener(){}})};
 w.AudioContext=function(){return{state:'running',resume(){},createOscillator:()=>({connect(){},start(){},stop(){},frequency:{},type:''}),createGain:()=>({connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}}),destination:{},currentTime:0};};
 w.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select:()=>({eq:()=>({range:()=>Promise.resolve({data:[],error:null})})})}),rpc:()=>Promise.resolve({data:[],error:null})})};
}});
const w=dom.window;const ev=e=>{try{return w.eval(e);}catch(x){return 'ERR:'+x.message;}};
setTimeout(()=>{
 const nav=w.document.getElementById('nav');
 // نبني قايمة واقعية بنفس أقسام التطبيق
 const mk=(t,v)=>{const e=w.document.createElement(v?'a':'div');if(v){e.setAttribute('data-view',v);e.textContent=v;}else{e.className='group';e.setAttribute('data-fatg',t);e.textContent=t;}nav.appendChild(e);return e;};
 mk('العمليات اليومية');['dashboard','pos','sales','returns','expenses','treasury','cashcount','quotes'].forEach(v=>mk(0,v));
 mk('المخزون');['products','stocktake','waste','transfers','purchases','suppliers','batches','labels','cyclecount'].forEach(v=>mk(0,v));
 mk('العيادة');['patients','appointments','apptcal','queue','recall','clinicreports'].forEach(v=>mk(0,v));
 mk('تحليلات');['rfm','abc','periodcompare','cashierperf','satisfaction','insights','forecast'].forEach(v=>mk(0,v));
 mk('محاسبة');['ledger','taxReport','costCenters','fixedAssets','budget','bankRecon','accounting'].forEach(v=>mk(0,v));
 mk('موظفين');['employees','payroll','leaves','tasks','schedule','commissions'].forEach(v=>mk(0,v));
 mk('النظام');['settings','users','audit','trash'].forEach(v=>mk(0,v));
 const total=nav.querySelectorAll('a[data-view]').length;
 w.fatNavRefresh();
 setTimeout(()=>{
  const visible=Array.prototype.filter.call(nav.querySelectorAll('a[data-view]'),
    a=>a.style.display!=='none' && !a.classList.contains('fat-navhidden') && !a.classList.contains('fat-searchhidden')).length;
  const groups=nav.querySelectorAll('.group[data-fatacc]').length;
  console.log('📋 إجمالي الروابط: '+total);
  console.log('👁  ظاهر فعليًا بعد الطي: '+visible+'  (أقسام قابلة للطي: '+groups+')');
  console.log('📉 اتخفى: '+(total-visible)+' رابط ('+Math.round((total-visible)/total*100)+'%)');
  console.log('🔎 مربع بحث القايمة: '+(w.document.getElementById('fatNavSearch')?'موجود ✓':'غير موجود'));
  console.log('❌ أخطاء وقت التشغيل: '+errs.length);
  dom.window.close();process.exit(0);
 },900);
},3200);
