/* اختبار: تجميع القايمة تحت أقسام */
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
function ensure(v){var nav=w.document.getElementById('nav');if(nav&&!nav.querySelector('a[data-view="'+v+'"]')){var a=w.document.createElement('a');a.setAttribute('data-view',v);a.textContent=v;a.onclick=function(){};nav.appendChild(a);}}
setTimeout(()=>{
 ok('نضيف من غير أخطاء', errs.length===0, errs.slice(0,2).join(' | '));
 ok('fatNavConsolidate موجودة', typeof w.fatNavConsolidate==='function');
 // نجهّز نav فيه شاشات متناثرة + رابط الإعدادات (نقطة الإدراج)
 var nav=w.document.getElementById('nav');
 ok('عنصر nav موجود', !!nav);
 ['patients','appointments','rfm','abc','cyclecount','labels','leaves','tasks','kds','production','satisfaction','warranties','settings'].forEach(ensure);
 var beforeCount=nav.querySelectorAll('a[data-view]').length;
 w.fatNavConsolidate();
 var afterCount=nav.querySelectorAll('a[data-view]').length;
 ok('مفيش لينك اتفقد بعد التجميع', afterCount===beforeCount, beforeCount+' → '+afterCount);
 ok('عنوان قسم العيادة اتعمل', !!nav.querySelector('.group[data-fatg="clinic"]'));
 ok('عنوان قسم التحليلات اتعمل', !!nav.querySelector('.group[data-fatg="analytics"]'));
 ok('عنوان قسم المخزون المتقدّم اتعمل', !!nav.querySelector('.group[data-fatg="invadv"]'));
 // شاشات العيادة بقت ورا عنوان العيادة مباشرة
 var hdr=nav.querySelector('.group[data-fatg="clinic"]');
 var nxt=hdr&&hdr.nextElementSibling;
 ok('شاشات العيادة اتجمّعت تحت عنوانها', !!nxt && nxt.getAttribute && ['clinic','patients','appointments','apptcal','queue','recall','reminders','clinicreports'].indexOf(nxt.getAttribute('data-view'))>-1, nxt&&nxt.getAttribute&&nxt.getAttribute('data-view'));
 // الإعدادات فضلت بعد المجموعات (التجميع قبلها)
 var links=Array.prototype.map.call(nav.querySelectorAll('a[data-view]'),function(a){return a.getAttribute('data-view');});
 ok('الإعدادات فضلت في الآخر', links.indexOf('settings')>links.indexOf('rfm'), 'settings@'+links.indexOf('settings')+' rfm@'+links.indexOf('rfm'));
 // تشغيل مرتين ما يكررش العناوين
 w.fatNavConsolidate();
 ok('التشغيل المتكرر ما بيكررش العناوين', nav.querySelectorAll('.group[data-fatg="clinic"]').length===1);
 ok('ولا بيكرر اللينكات', nav.querySelectorAll('a[data-view="patients"]').length===1);
 // التكامل مع إخفاء النشاط: سوبر ماركت يخفي العيادة حتى بعد التجميع
 ev("db.customers=[];db.appointments=[];db.settings=db.settings||{};db.settings.businessType='supermarket';db.settings.bizProfile={type:'supermarket',flags:{inventory:1,suppliers:1,purchases:1,kitchen:0,services:0}};");
 w.fatNavConsolidate();
 var pat=nav.querySelector('a[data-view="patients"]');
 ok('إخفاء النشاط لسه شغّال بعد التجميع', pat && pat.style.display==='none', pat?('display='+pat.style.display):'missing');
 const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
 ok('بلوكين سكربت', inline===2);
 console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
},2500);
