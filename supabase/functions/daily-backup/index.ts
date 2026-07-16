// فاتورتي — Daily Backup Edge Function
//
// بيحل فجوة: النسخ الاحتياطي السحابي الحالي (fatCloudBackupTick في index.html) شرطه إن
// المستخدم يفتح التطبيق في يومه — لو محل ما فتحش التطبيق كذا يوم، مفيش باك أب بياخده.
// الـ function دي بتعمل نفس منطق fatCloudBackupNow() لكن سيرفر-سايد لكل الحسابات دفعة
// واحدة، مستقلة تمامًا عن فتح التطبيق. تتجدول عبر supabase/cron.sql.
//
// النشر:
//   supabase functions deploy daily-backup --no-verify-jwt
// (--no-verify-jwt لازم لأن اللي هيستدعيها هو pg_cron/pg_net بـ service-role key، مش مستخدم عادي)
//
// Env vars مطلوبة (بتتحط تلقائيًا من Supabase لأي Edge Function):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const V2_KINDS = [
  "products","categories","employees","purchaseOrders","targets","customers","suppliers",
  "sales","purchases","returns","quotes","expenses","cash","stockMoves","branches","shifts",
  "heldSales","editLog","banks","recurring","bundles","audit","users","promoters","memberships",
  "serviceOrders","waste","attendance","reservations","shiftSessions","stockTakes","schedule",
  "recurringExpenses","accounts","journal","trash",
];

Deno.serve(async (req) => {
  // حماية بسيطة: لازم secret header يتبعت من pg_cron (شوف cron.sql)
  const expected = Deno.env.get("BACKUP_FUNCTION_SECRET");
  if (expected && req.headers.get("x-backup-secret") !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const today = new Date().toISOString().slice(0, 10);
  const results: { org_id: string; ok: boolean; error?: string }[] = [];

  const { data: orgs, error: orgsErr } = await sb.from("orgs").select("id, owner_id");
  if (orgsErr) {
    return new Response(JSON.stringify({ error: orgsErr.message }), { status: 500 });
  }

  for (const org of orgs ?? []) {
    try {
      const payload: Record<string, unknown> = {};

      let page = 0;
      const pageSize = 1000;
      // deno-lint-ignore no-constant-condition
      while (true) {
        const { data: rows, error } = await sb
          .from("v2_records")
          .select("kind, data")
          .eq("org_id", org.id)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (!rows || rows.length === 0) break;
        for (const row of rows) {
          const kind = row.kind as string;
          if (!V2_KINDS.includes(kind)) continue;
          (payload[kind] ??= [] as unknown[]);
          (payload[kind] as unknown[]).push(row.data);
        }
        if (rows.length < pageSize) break;
        page++;
        if (page > 50) break; // نفس الحماية الموجودة في pullV2() بالكلاينت
      }

      const { data: settingsRow, error: settingsErr } = await sb
        .from("v2_settings")
        .select("data")
        .eq("org_id", org.id)
        .maybeSingle();
      if (settingsErr) throw settingsErr;
      if (settingsRow?.data) {
        payload.settings = settingsRow.data.settings;
        payload.seq = settingsRow.data.seq;
      }

      // v2_backups مفتاحها user_id مش org_id (شوف schema.sql) — بنستخدم مالك المحل
      const { error: upsertErr } = await sb
        .from("v2_backups")
        .upsert(
          { user_id: org.owner_id, day: today, data: payload, created_at: new Date().toISOString() },
          { onConflict: "user_id,day" },
        );
      if (upsertErr) throw upsertErr;

      results.push({ org_id: org.id, ok: true });
    } catch (e) {
      results.push({ org_id: org.id, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ day: today, count: results.length, results }), {
    headers: { "content-type": "application/json" },
  });
});
