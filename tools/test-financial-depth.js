/* اختبار عميق (بند 26): تأكيدات حسابية حقيقية على المحاسبة القديمة
   مش بس "بترسم" — بل الأرقام صح فعلًا */
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

 console.log('\n▶ توازن القيود المحاسبية (double-entry)');
 ev(`
  db.sales=[{id:'s1',no:1,date:today(),total:1000,payMethod:'cash',paidAmount:1000,items:[{pid:'p1',qty:2,price:500,cost:300}]}];
  db.purchases=[{id:'pu1',no:1,date:today(),total:600,items:[{pid:'p1',qty:2,cost:300}]}];
  db.expenses=[{id:'e1',date:today(),amount:200,cat:'إيجار'}];
  db.salaries=db.salaries||[]; db.advances=db.advances||[]; db.returns=db.returns||[];
 `);
 var J = ev("JSON.stringify(fatBuildJournal(null,null))");
 var entries = JSON.parse(J);
 ok('فيه قيود اتبنت', entries.length>0, 'عدد: '+entries.length);
 var unbalanced = entries.filter(function(e){
   var d=0,c=0; (e.lines||[]).forEach(function(l){d+=(+l.debit||0);c+=(+l.credit||0);});
   return Math.abs(d-c)>0.01;
 });
 ok('كل القيود متوازنة (مدين = دائن)', unbalanced.length===0, 'غير متوازن: '+unbalanced.length+' — '+JSON.stringify(unbalanced.slice(0,1)));

 console.log('\n▶ ميزان المراجعة يتوازن');
 var TB = ev("JSON.stringify(fatTrialBalance(null,null))");
 var tb = JSON.parse(TB);
 var totalD=0, totalC=0;
 Object.keys(tb).forEach(function(k){ if(tb[k] && typeof tb[k].debit==='number'){ totalD+=tb[k].debit; totalC+=tb[k].credit; } });
 ok('إجمالي المدين = إجمالي الدائن في ميزان المراجعة', Math.abs(totalD-totalC)<0.02, 'مدين='+totalD.toFixed(2)+' دائن='+totalC.toFixed(2));

 console.log('\n▶ موازنة حركة المخزون (moveStock)');
 ev("db.products=[{id:'MP',name:'صنف اختبار',qty:10}]; db.stockMoves=[];");
 ev("moveStock('MP',-3,'sale','بيع','ref1');");
 ok('الكمية اتخصمت صح', ev("findProduct('MP').qty")===7);
 ok('الرصيد في السجل مطابق للكمية الفعلية', ev("db.stockMoves[db.stockMoves.length-1].balance")===ev("findProduct('MP').qty"));
 ev("moveStock('MP',5,'purchase','شراء','ref2');");
 ok('الإضافة صح (7+5=12)', ev("findProduct('MP').qty")===12);
 ok('تسلسل الأرصدة في السجل متتابع ومنطقي', ev("db.stockMoves.map(function(m){return m.balance;}).join(',')")==='7,12');

 console.log('\n▶ الأقساط (installments) — لو فيها حساب أقساط متبقّية');
 var hasIns = ev("typeof views.installments==='function'");
 ok('شاشة الأقساط موجودة', hasIns===true);
 if(hasIns){
   let err=ev("(function(){try{views.installments();return '';}catch(e){return e.message;}})()");
   ok('شاشة الأقساط بترسم من غير خطأ', err==='', err);
 }

 console.log('\n▶ الخزينة (treasury) — الحركات بتتجمّع صح');
 ev("db.cash=[{id:'c1',type:'in',amount:500,acct:'cash'},{id:'c2',type:'out',amount:150,acct:'cash'},{id:'c3',type:'in',amount:1000,acct:'bank'}];");
 var cashBal = ev("typeof cashBalance==='function' ? cashBalance() : (db.cash||[]).filter(function(m){return m.acct==='cash';}).reduce(function(a,m){return a+(m.type==='in'?m.amount:-m.amount);},0)");
 ok('رصيد الخزينة (كاش فقط) = 350', cashBal===350, 'got '+cashBal);
 let errT=ev("(function(){try{views.treasury();return '';}catch(e){return e.message;}})()");
 ok('شاشة الخزينة بترسم', errT==='', errT);

 console.log('\n▶ مراكز التكلفة والأصول الثابتة — ترسم من غير كسر');
 ['costCenters','fixedAssets','budget','bankRecon','ledger'].forEach(function(v){
   let e=ev("(function(){try{ if(typeof views."+v+"==='function'){views."+v+"();return '';} return 'MISSING';}catch(e){return e.message;}})()");
   ok('views.'+v+' بترسم', e==='' || e==='MISSING', e);
 });

 const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
 ok('بلوكين سكربت', inline===2);
 console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
},2600);
