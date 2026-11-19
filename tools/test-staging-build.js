const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sns-staging-test-'));
  try {
    await fs.mkdir(path.join(tmp, 'tools'));
    for (const entry of ['index.html', 'wholesale.js', 'sw.js', 'manifest.json', 'vendor', 'tools/build-staging.js']) {
      await fs.cp(path.join(root, entry), path.join(tmp, entry), { recursive: true });
    }
    const source = await fs.readFile(path.join(tmp, 'index.html'), 'utf8');
    const production = source.match(/^const SUPA_URL='([^']+)';$/m)?.[1];
    assert.ok(production, 'Production project config is missing');
    const staging = 'https://testingfixtureabcxyz.supabase.co';
    const publishable = 'sb_publishable_test_fixture_only_20261119';
    const build = (url, key) => spawnSync(process.execPath, ['tools/build-staging.js'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, SNS_STAGING_SUPABASE_URL: url, SNS_STAGING_SUPABASE_PUBLISHABLE_KEY: key },
    });
    const output = path.join(tmp, 'dist-staging');
    for (const [url, key, message] of [
      ['', '', /HTTPS URL of the staging project/],
      [production, publishable, /production database cannot/],
      [staging, 'sb_secret_test_fixture_only', /to a publishable Supabase key/],
    ]) {
      const run = build(url, key);
      assert.equal(run.status, 1);
      assert.match(run.stderr, message);
      await assert.rejects(fs.access(output), { code: 'ENOENT' });
    }

    const valid = build(staging, publishable);
    assert.equal(valid.status, 0, valid.stderr);
    const html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    assert.ok(html.includes('const SUPA_URL=' + JSON.stringify(staging) + ';'));
    assert.ok(html.includes('const SUPA_KEY=' + JSON.stringify(publishable) + ';'));
    assert.ok(!html.includes(new URL(production).hostname));
    assert.match(html, /^const SNS_AUTH_STAGING=true;$/m);
    assert.match(html, /^const SNS_RELEASE_ID="[^"]+-staging";$/m);
    const worker = await fs.readFile(path.join(output, 'sw.js'), 'utf8');
    assert.match(worker, /^const CACHE = 'sns-staging-/m);
    for (const asset of ['/index.html', '/wholesale.js', '/manifest.json', '/vendor/jsbarcode.min.js', '/vendor/supabase.min.js', '/vendor/qrcode.min.js']) {
      assert.ok(worker.includes("'" + asset + "'"), 'Missing pre-cache entry ' + asset);
      await fs.access(path.join(output, asset));
    }
    assert.equal(await fs.readFile(path.join(tmp, 'index.html'), 'utf8'), source);
    console.log('PASS staging rejects production, secret and missing configuration and builds isolated assets.');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
