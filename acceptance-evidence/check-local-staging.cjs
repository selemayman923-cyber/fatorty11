const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const {spawnSync} = require('node:child_process');

const release = path.resolve(process.argv[2] || '.');
const {chromium} = require(path.join(release, 'node_modules/playwright'));
const fixtureHost = 'https://snsqastaginglocalxyz.supabase.co';
const originKey = 'sb_publishable_snsqa_fixture_not_a_secret';
const output = path.join(release, 'dist-staging');

async function main() {
  const build = spawnSync('npm', ['run','build:staging'], {cwd: release, encoding:'utf-8',
    env: {...process.env, SNS_STAGING_SUPABASE_URL: fixtureHost, SNS_STAGING_SUPABASE_PUBLISHABLE_KEY: originKey}});
  assert.equal(build.status,0,build.stderr);
  const index = await fs.readFile(path.join(output,'index.html'),'utf8');
  const worker = await fs.readFile(path.join(output,'sw.js'),'utf8');
  const source = await fs.readFile(path.join(release,'index.html'),'utf8');
  const production = source.match(/^const SUPA_URL='([^']+)';$/m)[1];
  assert.ok(!index.includes(new URL(production).hostname));
  assert.ok(index.includes('2026.11.21-r13-staging'));
  assert.ok(worker.includes('sns-staging-2026.11.21-r13'));
  const server = http.createServer(async (req,res)=>{
    const url = new URL(req.url,'http://localhost');
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(output,name);
    if (!file.startsWith(output+path.sep)) {res.writeHead(404).end();return;}
    try {
      const bytes = await fs.readFile(file);
      const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'application/octet-stream';
      res.writeHead(200,{'Content-Type':type}).end(bytes);
    } catch {res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.SNS_CHROMIUM || '/tmp/sns-r8-chromium'});
    const page = await browser.newPage({serviceWorkers:'block'});
    const local = 'http://127.0.0.1:'+server.address().port;
    const calls = [];
    const all = [];
    page.on('request',req=>all.push(new URL(req.url()).origin));
    await page.route('**/*',async route=>{
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === local) return route.continue();
      if (url.origin !== fixtureHost) return route.abort();
      if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      calls.push(request.method()+' '+url.pathname);
      return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},
        json:url.pathname.endsWith('/signup')?{id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',identities:[{id:'synthetic'}]}:{}});
    });
    await page.addInitScript(()=>localStorage.setItem('fat_mode','online'));
    await page.goto(local+'/index.html');
    await page.evaluate(()=>landingStart());
    await page.locator('#snsAuthEnvironment').waitFor({state:'visible'});
    await page.locator('#authEmail').fill('owner@example.test');
    await page.locator('#authPass').fill('qa-test-only-189');
    await page.locator('#authPass2').fill('qa-test-only-189');
    await page.locator('#authConsent').check();
    await page.evaluate(()=>authSubmit());
    await page.locator('#authForgot').click();
    await page.locator('#authBtn').click();
    assert.deepEqual(calls,['POST /auth/v1/signup','POST /auth/v1/recover']);
    assert.ok(!all.includes(production));
    console.log('PASS built r13-staging assets and version; no production target requests');
    console.log('PASS real browser library generated signup and recovery requests to fixture origin; both intercepted locally');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
    await fs.rm(output,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
