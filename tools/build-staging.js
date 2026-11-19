// Build the static files for a separate SNS staging deployment.
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist-staging');
const hostedProject = /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/;
const productionHost = 'https://kedfgspcpnmcrmujcpxh.supabase.co';

function replaceOnce(source, pattern, replacement) {
  const matches = source.match(new RegExp(pattern.source, 'gm')) || [];
  if (matches.length !== 1) throw new Error('Staging build could not identify a unique configuration entry.');
  return source.replace(pattern, () => replacement);
}

async function build() {
  const rawUrl = (process.env.SNS_STAGING_SUPABASE_URL || '').trim();
  const key = (process.env.SNS_STAGING_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!hostedProject.test(rawUrl)) {
    throw new Error('Set SNS_STAGING_SUPABASE_URL to the HTTPS URL of the staging project.');
  }
  const url = new URL(rawUrl).origin;
  if (url === productionHost) {
    throw new Error('The SNS production database cannot be used by a staging build.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new Error('Set SNS_STAGING_SUPABASE_PUBLISHABLE_KEY to a publishable Supabase key.');
  }

  let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const worker = await fs.readFile(path.join(root, 'sw.js'), 'utf8');
  const release = html.match(/^const SNS_RELEASE_ID='([0-9.]+-r[0-9]+)';$/m)?.[1];
  if (!release) throw new Error('Missing SNS release identifier.');
  html = replaceOnce(html, /^const SUPA_URL='[^']+';$/m, 'const SUPA_URL=' + JSON.stringify(url) + ';');
  html = replaceOnce(html, /^const SUPA_KEY='[^']+';$/m, 'const SUPA_KEY=' + JSON.stringify(key) + ';');
  html = replaceOnce(html, /^const SNS_AUTH_STAGING=.*;$/m, 'const SNS_AUTH_STAGING=true;');
  html = replaceOnce(html, /^const SNS_RELEASE_ID='[^']+';$/m, 'const SNS_RELEASE_ID=' + JSON.stringify(release + '-staging') + ';');
  if (html.includes(new URL(productionHost).hostname)) {
    throw new Error('A reference to the SNS production database remains in the staging build.');
  }
  const stagingWorker = replaceOnce(worker, /^const CACHE = '[^']+';$/m, "const CACHE = 'sns-staging-" + release + "';");

  await fs.mkdir(output);
  try {
    await fs.writeFile(path.join(output, 'index.html'), html);
    await fs.writeFile(path.join(output, 'sw.js'), stagingWorker);
    for (const asset of ['manifest.json', 'wholesale.js', 'vendor']) {
      await fs.cp(path.join(root, asset), path.join(output, asset), { recursive: true });
    }
  } catch (error) {
    await fs.rm(output, { recursive: true, force: true });
    throw error;
  }
  console.log('Built SNS staging files in dist-staging.');
}

build().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
