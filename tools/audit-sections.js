/* تدقيق: أنهي شاشات مش داخلة في أي قسم / مكررة / يتيمة */
const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e.message||e)));
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
 const allViews=ev("Object.keys(views)");
 // الشاشات المذكورة في مجموعات التجميع
 const groupsSrc = html.match(/var GROUPS = \[([\s\S]*?)\];/);
 let grouped=[];
 if(groupsSrc){ const m=groupsSrc[1].match(/views: \[([^\]]*)\]/g)||[]; m.forEach(x=>{ (x.match(/'([a-zA-Z]+)'/g)||[]).forEach(v=>grouped.push(v.replace(/'/g,''))); }); }
 // شاشات المحاسبة
 const acctSrc = html.match(/var ACCT = \[([\s\S]*?)\];/);
 let acct=[]; if(acctSrc){ (acctSrc[1].match(/v: '([a-zA-Z]+)'/g)||[]).forEach(x=>acct.push(x.replace(/v: '|'/g,''))); }
 // شاشات مركز التقارير
 const repSrc = html.match(/var REPORTS = \[([\s\S]*?)\];/);
 let reps=[]; if(repSrc){ (repSrc[1].match(/v: '([a-zA-Z]+)'/g)||[]).forEach(x=>reps.push(x.replace(/v: '|'/g,''))); }

 console.log('إجمالي الشاشات: '+allViews.length);
 console.log('مصنّفة في أقسام القايمة: '+[...new Set(grouped)].length);
 console.log('في مركز المحاسبة: '+[...new Set(acct)].length);
 console.log('في مركز التقارير: '+[...new Set(reps)].length);

 const covered=new Set([...grouped,...acct,...reps]);
 // شاشات أساسية في القايمة الأصلية (مش محتاجة تصنيف)
 const core=['dashboard','pos','sales','products','customers','suppliers','purchases','expenses','settings','reports','employees','users','audit','trash','login','auth'];
 const orphans=allViews.filter(v=>!covered.has(v) && !core.includes(v));
 console.log('\n⚠️ شاشات مش داخلة في أي تصنيف ('+orphans.length+'):');
 console.log('  '+orphans.join(' '));

 // شاشات مصنّفة بس مش موجودة (روابط ميتة)
 const dead=[...covered].filter(v=>allViews.indexOf(v)===-1);
 console.log('\n🔴 شاشات مذكورة في تصنيف لكن غير موجودة ('+dead.length+'):');
 console.log('  '+(dead.join(' ')||'مفيش'));

 // شاشات مكررة في أكتر من قسم
 const counts={}; [...grouped].forEach(v=>counts[v]=(counts[v]||0)+1);
 const dup=Object.keys(counts).filter(k=>counts[k]>1);
 console.log('\n🟡 شاشات مكررة في أكتر من قسم ('+dup.length+'): '+(dup.join(' ')||'مفيش'));
 dom.window.close();process.exit(0);
},2600);
