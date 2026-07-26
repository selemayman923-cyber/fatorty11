/* تغطية شاملة: بينادي كل شاشة عبر go() ببيانات واقعية ويتأكد إنها بترسم من غير أخطاء */
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
setTimeout(()=>{
 // بيانات واقعية
 ev(`
  db.customers=[{id:'c1',name:'عميل',phone:'01000000000',balance:50,isPatient:true,medical:{},visits:[],treatmentPlans:[],prescriptions:[]},{id:'c2',name:'مريض',phone:'01111111111',isPatient:true}];
  db.products=[{id:'p1',name:'صنف',price:100,cost:60,qty:20,min:5,cat:'عام',sku:'X1'},{id:'p2',name:'صنف2',price:50,cost:30,qty:2,cat:'عام'}];
  db.suppliers=[{id:'s1',name:'مورد',phone:'0100',balance:200}];
  db.sales=[{id:'sa1',no:1,date:today(),ts:new Date().toISOString(),total:1000,cost:600,profit:400,cash:1000,cashier:'أحمد',customerId:'c1',items:[{pid:'p1',qty:2,price:100,cost:60}]}];
  db.expenses=[{id:'e1',date:today(),amount:100,cat:'إيجار',acct:'cash'}];
  db.employees=[{id:'emp1',name:'موظف',salary:3000,phone:'0100'}];
  db.appointments=[{id:'ap1',date:today(),time:'10:00',customerId:'c2',status:'confirmed'}];
  db.purchases=[{id:'pu1',no:1,date:today(),supplierId:'s1',total:500,items:[{pid:'p1',qty:5,cost:60}]}];
  if(typeof save==='function'){try{save();}catch(e){}}
 `);
 var views=ev("Object.keys(views)");
 var results={pass:[],fail:[]};
 (Array.isArray(views)?views:[]).forEach(function(v){
   var before=errs.length;
   var r=ev("(function(){try{ if(typeof go==='function'){go('"+v+"');} else {views."+v+"();} var c=document.getElementById('content'); return (c && c.innerHTML && c.innerHTML.length>5)?'OK':'EMPTY'; }catch(e){return 'ERR:'+e.message;}})()");
   var newErr=errs.length>before;
   if(r==='OK' && !newErr) results.pass.push(v);
   else results.fail.push(v+' ['+r+(newErr?' +jsErr':'')+']');
 });
 console.log('إجمالي الشاشات: '+(views.length||0));
 console.log('✅ رسمت تمام: '+results.pass.length);
 console.log('⚠️ محتاجة مراجعة: '+results.fail.length);
 if(results.fail.length){ console.log('\nالشاشات دي مرسمتش ببيانات (يا إما محتاجة تفاعل مسبق يا إما فيها مشكلة):'); console.log('  '+results.fail.join('\n  ')); }
 dom.window.close();process.exit(0);
},2500);
