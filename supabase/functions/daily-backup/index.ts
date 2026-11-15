import { createClient } from "npm:@supabase/supabase-js@2.87.1";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const secret = Deno.env.get("BACKUP_FUNCTION_SECRET");
  if (!secret) return new Response("Backup configuration is missing", { status: 503 });
  if (request.headers.get("x-backup-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let after = "";
  let succeeded = 0;
  let failed = 0;
  for (;;) {
    let query = client.from("orgs").select("id").order("id").limit(250);
    if (after) query = query.gt("id", after);
    const { data: orgs, error } = await query;
    if (error) {
      console.error("Backup org listing failed", error.code);
      return Response.json({ succeeded, failed, error: "listing_failed" }, { status: 500 });
    }
    if (!orgs.length) break;

    for (const { id } of orgs) {
      const { error: backupError } = await client.rpc("sns_create_org_backup", { p_org: id });
      if (backupError) {
        failed++;
        console.error("Organization backup failed", id, backupError.code);
      } else {
        succeeded++;
      }
    }
    after = orgs[orgs.length - 1].id;
  }
  return Response.json({ succeeded, failed }, { status: failed ? 500 : 200 });
});
