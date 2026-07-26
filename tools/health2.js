const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('/mnt/user-data/outputs/index.html','utf8');
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e.message||e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.vercel.app/',virtualConsole:vc,beforeParse(w){
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
 const time=(label,expr,n)=>{const t=Date.now();for(let i=0;i<n;i++)ev(expr);const ms=Date.now()-t;console.log('  '+label+': '+(ms/n).toFixed(1)+'ms لكل نداء ('+n+' نداء = '+ms+'ms)');return ms/n;};
 console.log('▶ تفكيك تكلفة القايمة:');
 time('renderNav (الكامل بكل اللفّات)','renderNav()',10);
 time('fatNavConsolidate (التجميع)','fatNavConsolidate&&fatNavConsolidate()',10);
 time('fatActivityNav (إخفاء النشاط)','fatActivityNav&&fatActivityNav()',10);
 time('fatAcctNav (المستوى المحاسبي)','fatAcctNav&&fatAcctNav()',10);
 console.log('');
 console.log('▶ سيناريو المستخدم الحالي (من غير بروفايل نشاط):');
 ev("db.settings=db.settings||{}; delete db.settings.bizProfile; delete db.settings.acctLevel;");
 ev("try{renderNav();}catch(e){}");
 setTimeout(()=>{
  const all=w.document.querySelectorAll('#nav a[data-view]');
  const vis=Array.prototype.filter.call(all,a=>a.style.display!=='none').length;
  console.log('  روابط ظاهرة: '+vis+' من '+all.length+'  ← ده اللي في الصورة');
  ev("db.settings.bizProfile={type:'supermarket',flags:{inventory:1,suppliers:1,purchases:1,returns:1,kitchen:0,tables:0,services:0}};db.settings.businessType='supermarket';db.settings.acctLevel='basic';db.customers=[];db.appointments=[];");
  ev("try{renderNav();}catch(e){}");
  setTimeout(()=>{
   const all2=w.document.querySelectorAll('#nav a[data-view]');
   const vis2=Array.prototype.filter.call(all2,a=>a.style.display!=='none').length;
   console.log('  بعد اختيار "سوبر ماركت + محاسبة بسيطة": '+vis2+' رابط ظاهر');
   console.log('  ← الفرق: '+(vis-vis2)+' رابط اختفوا');
   dom.window.close();process.exit(0);
  },1600);
 },1600);
},3000);
