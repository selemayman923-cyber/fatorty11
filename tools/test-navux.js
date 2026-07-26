/* اختبار: الطي + البحث في القايمة + التنبيه */
const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const file=process.argv[2]||'index.html';const html=fs.readFileSync(file,'utf8');const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e.message||e)));
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
let pass=0,fail=0;const ok=(n,c,ex)=>{c?(pass++,console.log('  ✅ '+n)):(fail++,console.log('  ❌ '+n+(ex?' '+ex:'')));};
setTimeout(()=>{
 const nav=w.document.getElementById('nav');
 // نعبّي القايمة (في بيئة الاختبار بتكون فاضية بسبب شاشة الدخول)
 (function(){
   if(!nav) return;
   const mk=(t,v)=>{const e=w.document.createElement(v?'a':'div');if(v){e.setAttribute('data-view',v);e.textContent=t;}else{e.className='group';e.setAttribute('data-fatg',t);e.textContent=t;}nav.appendChild(e);return e;};
   mk('core');['dashboard','pos','sales','products','customers'].forEach(v=>mk(v,v));
   mk('clinic');['patients','appointments','apptcal','queue'].forEach(v=>mk(v,v));
   mk('analytics');['rfm','abc','periodcompare','cashierperf'].forEach(v=>mk(v,v));
   mk('invadv');['cyclecount','labels','warranties'].forEach(v=>mk(v,v));
   mk('sys');['settings'].forEach(v=>mk(v,v));
 })();
 ok('نضيف من غير أخطاء', errs.length===0, errs.slice(0,2).join(' | '));
 ['fatNavAccordion','fatNavSearch','fatNavToggle','fatNavRefresh'].forEach(fn=>ok(fn+'()', typeof w[fn]==='function'));
 ok('استايل القايمة اتحقن', !!w.document.getElementById('fatNavStyle'));

 console.log('\n▶ الطي (Accordion)');
 w.fatNavAccordion();
 const hdrs=nav.querySelectorAll('.group[data-fatacc]');
 ok('عناوين الأقسام بقت قابلة للطي', hdrs.length>0, 'عدد: '+hdrs.length);
 ok('فيه سهم ▼ في العناوين', !!nav.querySelector('.group .fat-caret'));
 const collapsed=nav.querySelectorAll('.group[data-fatcollapsed="1"]').length;
 ok('فيه أقسام مطوية افتراضيًا', collapsed>0, 'مطوي: '+collapsed);
 const hiddenByAcc=nav.querySelectorAll('a.fat-navhidden').length;
 ok('روابط اتخفت بالطي', hiddenByAcc>0, 'مخفي: '+hiddenByAcc);
 // فتح قسم
 const firstCollapsed=nav.querySelector('.group[data-fatcollapsed="1"]');
 if(firstCollapsed){
   const key=firstCollapsed.getAttribute('data-fatg')||(firstCollapsed.textContent||'').trim().slice(0,24);
   w.fatNavToggle(key);
   ok('الضغط بيفتح القسم', firstCollapsed.getAttribute('data-fatcollapsed')==='0');
   ok('حالة الطي اتحفظت', !!store['fat_nav_open']);
 } else ok('قسم مطوي موجود للاختبار', false);

 console.log('\n▶ البحث في القايمة');
 w.fatNavRefresh();


 setTimeout(()=>{
 ok('مربع البحث ظهر', !!w.document.getElementById('fatNavSearch'));
 w.fatNavSearch('customers');
 const shown=Array.prototype.filter.call(nav.querySelectorAll('a[data-view]'),a=>!a.classList.contains('fat-searchhidden')).length;
 const total=nav.querySelectorAll('a[data-view]').length;
 ok('البحث بيفلتر الروابط', shown>0 && shown<total, shown+' من '+total);
 w.fatNavSearch('');
 ok('مسح البحث بيرجّع الكل', nav.querySelectorAll('a.fat-searchhidden').length===0);

 console.log('\n▶ التوافق مع إخفاء النشاط (الأهم)');
 ev("db.customers=[];db.appointments=[];db.settings=db.settings||{};db.settings.businessType='supermarket';db.settings.bizProfile={type:'supermarket',flags:{inventory:1,suppliers:1,purchases:1,kitchen:0,tables:0,services:0}};");
 w.fatActivityNav && w.fatActivityNav();
 const pat=nav.querySelector('a[data-view="patients"]');
 // نفتح كل الأقسام ونتأكد إن إخفاء النشاط لسه شغّال
 Array.prototype.forEach.call(nav.querySelectorAll('.group[data-fatg]'),h=>{const k=h.getAttribute('data-fatg');if(h.getAttribute('data-fatcollapsed')==='1')w.fatNavToggle(k);});
 ok('فتح الأقسام مابيلغيش إخفاء النشاط', !pat || pat.style.display==='none', pat?('display='+pat.style.display):'مفيش لينك');

 console.log('\n▶ الأداء: تجميع النداءات (debounce)');
 ev("window.__consolidateCalls=0; if(window.fatNavConsolidate){var _o=window.fatNavConsolidate; window.fatNavConsolidate=function(){window.__consolidateCalls++; return _o.apply(this,arguments);};}");
 for(let i=0;i<10;i++) w.fatNavRefresh();
 setTimeout(()=>{
   const calls=ev("window.__consolidateCalls");
   ok('10 نداءات متلاحقة = تمريرة واحدة بس', calls===1, 'اتنفّذ '+calls+' مرة');
   const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
   ok('بلوكين سكربت', inline===2);
   console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
 },400);
 },400);
 return;

 const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
 ok('بلوكين سكربت', inline===2);
 console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
},3000);
