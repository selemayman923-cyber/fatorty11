const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e.message||e)));
let warns=[]; 
const t0=Date.now();
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
 console.log('⏱  زمن الإقلاع: '+(Date.now()-t0)+'ms');
 console.log('❌ أخطاء وقت التشغيل: '+errs.length+(errs.length?'\n   '+errs.slice(0,3).join('\n   '):''));

 // 1) دوال مفقودة بيتنادى عليها من onclick
 const onclicks=[...new Set((html.match(/onclick="([a-zA-Z_$][a-zA-Z0-9_$]*)\(/g)||[]).map(x=>x.replace(/onclick="|\($/g,'')))];
 const missing=onclicks.filter(fn=>ev("typeof "+fn)==='undefined');
 console.log('\n🔍 دوال مستدعاة من الأزرار: '+onclicks.length+' · مفقودة: '+missing.length);
 if(missing.length) console.log('   ⚠️ '+missing.join(' '));

 // 2) شاشات في القايمة من غير تعريف
 const navViews=[...new Set((html.match(/data-view="([a-zA-Z]+)"/g)||[]).map(x=>x.replace(/data-view="|"/g,'')))];
 const undef=navViews.filter(v=>ev("typeof views['"+v+"']")!=='function');
 console.log('\n🔗 روابط القايمة: '+navViews.length+' · بدون شاشة: '+undef.length);
 if(undef.length) console.log('   ⚠️ '+undef.join(' '));

 // 3) تعارض الثيمات مع الألوان الجديدة
 ev("if(typeof fatSetTheme==='function'){fatSetTheme('blue');fatSetTheme('default');}");
 const prim=w.document.documentElement.style.getPropertyValue('--primary').trim();
 console.log('\n🎨 الثيم الافتراضي بعد التبديل: '+(prim||'(من CSS)')+(prim==='#0a2c56'?' ✓':' ⚠️'));

 // 4) الوضع الليلي
 ev("document.body.classList.add('dark')");
 const darkBg=w.getComputedStyle(w.document.body).backgroundColor;
 console.log('🌙 الوضع الليلي شغّال: '+(darkBg?'✓ '+darkBg:'⚠️'));
 ev("document.body.classList.remove('dark')");

 dom.window.close();process.exit(0);
},3000);
