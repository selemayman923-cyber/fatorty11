/* اختبار: إقفال الفترة + سلة الشراء + مركز التقارير */
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

 console.log('\n▶ 25) إقفال فترة محاسبية');
 ['fatPeriodLocked','fatSetLockDate','fatLockDialog','fatLockDate'].forEach(fn=>ok(fn+'()', typeof w[fn]==='function'));
 ev("db.settings=db.settings||{}; db.trash=[];");
 w.fatSetLockDate('2026-06-30');
 ok('تاريخ الإقفال اتحفظ', ev("fatLockDate()")==='2026-06-30');
 ok('تاريخ قديم = مقفول', ev("fatPeriodLocked('2026-05-10')")===true);
 ok('تاريخ جديد = مش مقفول', ev("fatPeriodLocked('2026-07-15')")===false);
 // محاولة حذف سجل داخل الفترة المقفولة
 var before=ev("db.trash.length");
 ev("trashAdd('sale',{id:'S1',date:'2026-05-10',total:100},'فاتورة قديمة');");
 ok('منع حذف سجل في فترة مقفولة', ev("db.trash.length")===before, 'trash: '+ev("db.trash.length"));
 // حذف سجل خارج الفترة يشتغل عادي
 ev("trashAdd('sale',{id:'S2',date:'2026-07-15',total:100},'فاتورة جديدة');");
 ok('الحذف خارج الفترة شغّال عادي', ev("db.trash.length")===before+1);
 w.fatLockDialog();
 ok('نافذة الإقفال بتفتح', !!w.document.getElementById('lk_date'));
 ev("closeModal&&closeModal()");
 w.fatSetLockDate('');

 console.log('\n▶ 19) تحليل سلة الشراء');
 ok('fatBasketPairs موجودة', typeof w.fatBasketPairs==='function');
 ev("db.products=[{id:'A',name:'شاي'},{id:'B',name:'سكر'},{id:'C',name:'لبن'}];");
 ev("db.sales=[{id:'1',date:today(),items:[{pid:'A',qty:1},{pid:'B',qty:1}]},{id:'2',date:today(),items:[{pid:'A',qty:1},{pid:'B',qty:1}]},{id:'3',date:today(),items:[{pid:'A',qty:1},{pid:'C',qty:1}]}];");
 var pairs=ev("JSON.stringify(fatBasketPairs(2))");
 ok('لقى الزوج المتكرّر (شاي+سكر)', pairs.indexOf('شاي')>-1 && pairs.indexOf('سكر')>-1, pairs.slice(0,80));
 ok('عدد مرات الزوج = 2', ev("fatBasketPairs(2)[0].count")===2, 'count '+ev("fatBasketPairs(2)[0] && fatBasketPairs(2)[0].count"));
 ok('استبعد الزوج اللي مرة واحدة', ev("fatBasketPairs(2).length")===1, 'len '+ev("fatBasketPairs(2).length"));
 let e1=ev("(function(){try{views.basket();return '';}catch(e){return e.message;}})()");
 ok('شاشة سلة الشراء بترسم', e1==='', e1);

 console.log('\n▶ 16) مركز التقارير');
 ok('views.reportshub موجودة', ev("typeof views.reportshub==='function'")===true);
 let e2=ev("(function(){try{views.reportshub();return '';}catch(e){return e.message;}})()");
 ok('المركز بيرسم', e2==='', e2);
 var body=(w.document.getElementById('content')||{}).innerHTML||'';
 ok('بيعرض أقسام التقارير', body.indexOf('المبيعات')>-1 || body.indexOf('العملاء')>-1);
 ok('فيه روابط لتقارير فعلية', body.indexOf("go('rfm')")>-1 || body.indexOf("go('reports')")>-1);

 const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
 ok('بلوكين سكربت', inline===2);
 console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
},2600);
