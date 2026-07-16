const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let idx=0; let errors = [];
while((m = re.exec(html)) !== null){
  const code = m[1].trim();
  if(!code) continue;
  idx++;
  try{
    // Try to parse the code by creating a new function (syntax check)
    new Function(code);
  }catch(e){
    errors.push({scriptIndex: idx, error: e.message});
  }
}

if(errors.length){
  console.error('Inline script syntax errors:');
  errors.forEach(e=>console.error(`Script #${e.scriptIndex}: ${e.error}`));
  process.exit(1);
}else{
  console.log('OK: inline scripts parsed without syntax errors');
  process.exit(0);
}
