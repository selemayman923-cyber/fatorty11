// Simple serverless handler to accept client error batches.
// When deployed, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) env vars
// If those are present the function will attempt to insert into a `client_errors` table
// using the REST API. Otherwise it logs to stdout.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

async function forwardToSupabase(errors){
  if(!SUPABASE_URL || !SUPABASE_KEY) return false;
  try{
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/client_errors`,{
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(errors.map(e=>({payload:e, created_at: new Date().toISOString()})))
    });
    return resp.ok;
  }catch(e){ console.error('forwardToSupabase error',e); return false; }
}

// Minimal handler compatible with many serverless adapters.
module.exports = async function handler(req, res){
  if(req.method !== 'POST'){
    res.statusCode = 405; res.end('Method Not Allowed'); return;
  }
  let body = null;
  try{ body = await new Promise((resolve,reject)=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>{ try{ resolve(JSON.parse(d||'{}')); }catch(e){ resolve({errors:[]}); } }); req.on('error', reject); }); }catch(e){ body = {errors:[]}; }
  const errors = Array.isArray(body.errors) ? body.errors : (body.errors ? [body.errors] : []);
  if(errors.length===0){ res.statusCode=204; res.end(); return; }
  const ok = await forwardToSupabase(errors);
  if(ok){ res.statusCode=204; res.end(); return; }
  // fallback: write to a local file (best-effort)
  try{
    const fs = require('fs');
    const p = 'supabase/client-error-log.jsonl';
    for(const e of errors){ fs.appendFileSync(p, JSON.stringify({ts:new Date().toISOString(),e})+'\n'); }
  }catch(_){ }
  res.statusCode = 202; res.end();
};
