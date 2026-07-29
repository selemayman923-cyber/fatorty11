/* اختبار: نشاط الأكاديمية الرياضية */
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

 console.log('\n▶ نوع النشاط اتسجّل');
 ok('BIZ_TYPES.academy موجود', ev("typeof BIZ_TYPES!=='undefined' && !!BIZ_TYPES.academy")===true);
 ok('اسمه بالعربي صح', ev("BIZ_TYPES.academy.ar")==='أكاديمية رياضية');
 ok('services مفعّل و inventory مقفول (منطقي للأكاديمية)', ev("BIZ_TYPES.academy.flags.services===1 && BIZ_TYPES.academy.flags.inventory===0")===true);
 ok('موديول الأكاديمية في قائمة المميزات', ev("!!FAT_FLAG_LABELS.academy")===true);

 console.log('\n▶ حساب السن من تاريخ الميلاد');
 ok('طفل مولود من 8 سنين = 8', ev("(function(){var d=new Date();d.setFullYear(d.getFullYear()-8);d.setDate(d.getDate()-1);return acAge(d.toISOString().slice(0,10));})()")===8);
 ok('تاريخ فاضي = null', ev("acAge('')")===null);

 console.log('\n▶ ملف اللاعب');
 ev("db.customers=[{id:'P1',name:'أحمد',phone:'0100'},{id:'P2',name:'محمود',phone:'0101'}]; db.employees=[{id:'E1',name:'كابتن سيد'}]; db.settings=db.settings||{}; db.settings.businessType='academy'; db.settings.acGroups=[]; db.settings.acAttend=[];");
 ev("(function(){var c=findCustomer('P1');c.player={dob:'2016-05-10',guardian:'والد أحمد',guardianPhone:'0111'};var d=findCustomer('P2');d.player={dob:'2016-08-01'};})()");
 ok('acPlayers بترجّع اللاعبين بس', ev("acPlayers().length")===2);
 ok('اللاعب معاه بيانات ولي الأمر', ev("findCustomer('P1').player.guardian")==='والد أحمد');
 ok('isAcademy بترجّع true', ev("fatIsAcademy()")===true);

 console.log('\n▶ المجموعات');
 ev("(function(){var g=acGroups();g.push({id:'G1',name:'براعم 2016',coachId:'E1',coachName:'كابتن سيد',capacity:2,ageMin:6,ageMax:10,days:'سبت',time:'5 م',players:[]});})()");
 w.acToggle('G1','P1');
 ok('ضم لاعب للمجموعة', ev("acGroups()[0].players.length")===1);
 ok('acGroupOf بترجّع مجموعة اللاعب', ev("(acGroupOf('P1')||{}).name")==='براعم 2016');
 w.acToggle('G1','P2');
 ok('ضم لاعب تاني (السعة 2)', ev("acGroups()[0].players.length")===2);
 // محاولة تجاوز السعة
 ev("db.customers.push({id:'P3',name:'زياد',player:{dob:'2016-01-01'}});");
 w.acToggle('G1','P3');
 ok('منع تجاوز السعة (فضلت 2)', ev("acGroups()[0].players.length")===2, 'صار '+ev("acGroups()[0].players.length"));
 // لاعب واحد في مجموعة واحدة
 ev("acGroups().push({id:'G2',name:'أشبال',coachId:'E1',capacity:10,ageMin:10,ageMax:14,players:[]});");
 w.acToggle('G2','P1');
 ok('اللاعب اتنقل لمجموعة واحدة بس', ev("acGroups()[0].players.indexOf('P1')")===-1 && ev("acGroups()[1].players.indexOf('P1')")>-1);

 console.log('\n▶ حضور الحصص');
 var t=ev("today()");
 w.acMark('G2','P1',t);
 ok('أول ضغطة = حاضر', ev("acStatusOf('G2','P1','"+t+"')")==='present');
 w.acMark('G2','P1',t);
 ok('التانية = غائب', ev("acStatusOf('G2','P1','"+t+"')")==='absent');
 w.acMark('G2','P1',t);
 ok('التالتة = بعذر', ev("acStatusOf('G2','P1','"+t+"')")==='excused');
 w.acMark('G2','P1',t);
 ok('الرابعة = مسح', ev("acStatusOf('G2','P1','"+t+"')")==='');
 ok('حضور اللاعبين منفصل عن حضور الموظفين', ev("(db.attendance||[]).length")===0);

 console.log('\n▶ الشاشة');
 let e1=ev("(function(){try{views.academy();return '';}catch(e){return e.message;}})()");
 ok('شاشة الأكاديمية بترسم', e1==='', e1);
 var body=(w.document.getElementById('content')||{}).innerHTML||'';
 ok('بتعرض المجموعات', body.indexOf('براعم 2016')>-1);
 ok('بتعرض المدرب', body.indexOf('كابتن سيد')>-1);
 ok('بتنبّه على لاعبين من غير مجموعة', body.indexOf('غير مجموعة')>-1 || body.indexOf('زياد')>-1);

 console.log('\n▶ الأمان: مايظهرش لنشاط تاني');
 ev("db.settings.businessType='supermarket'; db.customers.forEach(function(c){delete c.player;}); db.settings.acGroups=[];");
 ok('isAcademy=false لنشاط تاني من غير لاعبين', ev("fatIsAcademy()")===false);

 const inline=(html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)||[]).length;
 ok('بلوكين سكربت', inline===2);
 console.log('النتيجة: '+pass+' نجحت · '+fail+' فشلت');dom.window.close();process.exit(fail?1:0);
},2600);
