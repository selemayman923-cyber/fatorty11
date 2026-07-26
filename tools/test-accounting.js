/* اختبار: مركز المحاسبة + المستوى المحاسبي + تكامل الأحداث */
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
function navVisible(v){var a=w.document.querySelector('#nav a[data-view="'+v+'"]');return !!a && a.style.display!=='none';}
function ensure(v){var nav=w.document.getElementById('nav');if(nav&&!nav.querySelector('a[data-view="'+v+'"]')){var a=w.document.createElement('a');a.setAttribute('data-view',v);nav.appendChild(a);}}
function reset(){var nav=w.document.getElementById('nav');if(nav)Array.prototype.forEach.call(nav.querySelectorAll('a[data-view]'),function(a){a.style.display='';});}
setTimeout(()=>{
 ok('نضيف من غير أخطاء', errs.length===0, errs.slice(0,2).join(' | '));
 ok('views.accounting موجودة', ev("typeof views.accounting==='function'")===true);
 ['fatAcctLevel','fatSetAcctLevel','fatAcctNav'].forEach(fn=>ok(fn+'()', typeof w[fn]==='function'));

 ev("db.sales=[{id:'s',date:today(),total:1000,profit:400}]; db.expenses=[{id:'e',date:today(),amount:100}]; db.cash=[{id:'c',type:'in',amount:500,acct:'cash'}];");
 let err=ev("(function(){try{views.accounting();return '';}catch(e){return e.message;}})()");
 ok('المركز بيرسم', err==='', err);
 var body=(w.document.getElementById('content')||{}).innerHTML||'';
 ok('بيعرض المؤشرات (إيراد/ربح/نقدية)', body.indexOf('إيراد الشهر')>-1 && body.indexOf('رصيد النقدية')>-1);
 ok('بيعرض أقسام (قوائم مالية/نقدية)', body.indexOf('القوائم المالية')>-1 || body.indexOf('النقدية والبنوك')>-1);

 console.log('\n▶ المستوى المحاسبي + الإخفاء');
 ['ledger','fixedAssets','bankRecon','treasury','cashcount','costCenters','taxReport'].forEach(ensure);
 // بسيط: يخفي المتقدّم (ledger/fixedAssets/bankRecon/costCenters/taxReport)، يسيب الأساسي (treasury/cashcount)
 ev("db.settings.acctLevel='basic';"); reset(); w.fatAcctNav();
 ok('بسيط: الخزينة وجرد الكاش ظاهرين', navVisible('treasury') && navVisible('cashcount'));
 ok('بسيط: القيود/الأصول/التسوية اتخفوا', !navVisible('ledger') && !navVisible('fixedAssets') && !navVisible('bankRecon'));
 // احترافي: يعرض الكل
 ev("db.settings.acctLevel='pro';"); reset(); w.fatAcctNav();
 ok('احترافي: القيود والأصول ظاهرين', navVisible('ledger') && navVisible('fixedAssets'));
 // مفيش مستوى = اعرض الكل (سلوك أصلي)
 ev("db.settings.acctLevel=null;"); reset(); w.fatAcctNav();
 ok('مفيش مستوى = الكل ظاهر (أمان)', navVisible('ledger') && navVisible('bankRecon'));

 console.log('\n▶ تكامل الأحداث');
 ok('نظام الأحداث موجود (fatOn/fatEmit)', ev("typeof fatOn==='function' && typeof fatEmit==='function')")===true || ev("typeof fatOn==='function'")===true);
 // ضمان تلقائي عند بيع منتج له warrantyMonths
 ev("db.products=[{id:'pw',name:'تليفزيون',warrantyMonths:24}]; db.settings.warranties=[];");
 ev("fatEmit('sale:completed',{no:5,date:today(),customerId:'',customerName:'',items:[{pid:'pw',qty:1}]});");
 ok('ضمان اتسجّل تلقائيًا عند البيع', ev("(db.settings.warranties||[]).length")===1, 'len '+ev("(db.settings.warranties||[]).length"));
 ok('مدة الضمان صح (24)', ev("(db.settings.warranties[0]||{}).months")===24);

 const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
 ok('بلوكين سكربت', inline===2);
 console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
},2500);
