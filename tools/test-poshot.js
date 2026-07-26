const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const file=process.argv[2]||'index.html';const html=fs.readFileSync(file,'utf8');const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e.message||e)));
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
let pass=0,fail=0;const ok=(n,c,ex)=>{c?(pass++,console.log('  ✅ '+n)):(fail++,console.log('  ❌ '+n+(ex?' '+ex:'')));};
setTimeout(()=>{
 ok('نضيف من غير أخطاء', errs.length===0, errs.slice(0,2).join(' | '));
 ['fatPosHotBar','fatPosTopSellers','fatPosFavPick','fatPosFavToggle','fatPosFavorites'].forEach(fn=>ok(fn+'()', typeof w[fn]==='function'));
 ev("db.products=[{id:'p1',name:'شاي',price:10,qty:100},{id:'p2',name:'قهوة',price:15,qty:100},{id:'p3',name:'مياه',price:5,qty:100}]; db.sales=[{id:'s',date:today(),items:[{pid:'p2',qty:9},{pid:'p1',qty:3}]}]; db.settings=db.settings||{}; db.settings.posFavorites=[];");
 ok('الأكتر مبيعًا: القهوة الأول', ev("fatPosTopSellers(3)[0]")==='p2', ev("fatPosTopSellers(3)[0]"));
 // نجهّز الحاوية ونملأها
 ev("(function(){var d=document.getElementById('posHotBar'); if(!d){d=document.createElement('div');d.id='posHotBar';document.body.appendChild(d);}})();");
 w.fatPosHotBar();
 ok('الشريط اتملأ بالأكتر مبيعًا', (w.document.getElementById('posHotBar')||{}).innerHTML.indexOf('قهوة')>-1);
 ok('فيه زر تخصيص ⚙️', (w.document.getElementById('posHotBar')||{}).innerHTML.indexOf('fatPosFavPick')>-1);
 // تخصيص المفضلة
 w.fatPosFavToggle('p3'); w.fatPosFavToggle('p1');
 ok('المفضلة اتحفظت', ev("db.settings.posFavorites.length")===2);
 w.fatPosHotBar();
 ok('الشريط بيعرض المفضلة (مياه)', (w.document.getElementById('posHotBar')||{}).innerHTML.indexOf('مياه')>-1);
 ok('أزرار المفضلة بتنادي posTap', (w.document.getElementById('posHotBar')||{}).innerHTML.indexOf('posTap(')>-1);
 const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
 ok('بلوكين سكربت', inline===2);
 console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
},2500);
