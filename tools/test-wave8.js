/* اختبار: التراجع بعد الحذف + تثبيت الشاشات + اختصارات الكيبورد */
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
 ok('نضيف من غير أخطاء', errs.length===0, errs.slice(0,2).join(' | '));

 console.log('\n▶ 8) التراجع بعد الحذف');
 ok('trashAdd متلفوف', ev("typeof trashAdd==='function' && !!trashAdd._fatUndoWrapped")===true);
 ev("db.customers=[{id:'CX',name:'عميل للحذف',phone:'0100'}]; db.trash=[];");
 ev("trashAdd('customer', db.customers[0], 'عميل للحذف'); db.customers=[];");
 ok('العنصر راح لسلة المهملات', ev("db.trash.length")===1);
 setTimeout(()=>{
  const t=w.document.getElementById('toast');
  ok('ظهر إشعار فيه زر تراجع', !!(t && t.innerHTML.indexOf('toastAct')>-1), t?t.innerHTML.slice(0,60):'مفيش toast');
  // نضغط تراجع
  const btn=w.document.getElementById('toastAct');
  if(btn){ btn.click(); ok('الضغط على تراجع بيرجّع العنصر', ev("(db.customers||[]).length")===1, 'عملاء: '+ev("(db.customers||[]).length")); }
  else ok('زر التراجع موجود', false);

  console.log('\n▶ 10) تثبيت الشاشات');
  ['fatPinToggle','fatPinRender','fatPinned'].forEach(fn=>ok(fn+'()', typeof w[fn]==='function'));
  // نجهّز روابط
  const nav=w.document.getElementById('nav');
  ['dashboard','pos','products'].forEach(v=>{if(nav&&!nav.querySelector('a[data-view="'+v+'"]')){const a=w.document.createElement('a');a.setAttribute('data-view',v);a.textContent=v;nav.appendChild(a);}});
  w.fatPinToggle('products');
  ok('التثبيت اتحفظ', ev("fatPinned().indexOf('products')")===0, JSON.stringify(ev("fatPinned()")));
  w.fatPinRender();
  ok('شريط المثبّت ظهر', !!w.document.getElementById('fatPinBar'));
  ok('فيه زر للشاشة المثبّتة', (w.document.getElementById('fatPinBar')||{}).textContent.indexOf('products')>-1);
  w.fatPinToggle('products');
  ok('إلغاء التثبيت شغّال', ev("fatPinned().length")===0);

  console.log('\n▶ 11) اختصارات الكيبورد');
  ok('fatShortcutsHelp موجودة', typeof w.fatShortcutsHelp==='function');
  w.fatShortcutsHelp();
  ok('شاشة المساعدة بتفتح', ((w.document.querySelector('#modal .modal-b')||{}).innerHTML||'').indexOf('Alt+1')>-1);
  ev("closeModal&&closeModal()");
  // Alt+2 ينقل للكاشير
  ev("window.__went=''; var _g=window.go; window.go=function(v){window.__went=v; return _g.apply(this,arguments);};");
  const e1=new w.KeyboardEvent('keydown',{key:'2',altKey:true,bubbles:true});
  w.document.dispatchEvent(e1);
  ok('Alt+2 بينقل لنقطة البيع', ev("window.__went")==='pos', 'راح لـ: '+ev("window.__went"));
  // مابيشتغلش أثناء الكتابة في خانة
  ev("window.__went='';");
  const inp=w.document.createElement('input'); w.document.body.appendChild(inp);
  const e2=new w.KeyboardEvent('keydown',{key:'2',altKey:true,bubbles:true});
  Object.defineProperty(e2,'target',{value:inp});
  w.document.dispatchEvent(e2);
  ok('الاختصار مابيشتغلش وانت بتكتب (أمان)', ev("window.__went")==='', 'راح لـ: '+ev("window.__went"));

  const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
  ok('بلوكين سكربت', inline===2);
  console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
 },400);
},2600);
