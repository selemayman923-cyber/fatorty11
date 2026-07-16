# فاتورتي — ملفات Supabase (SQL + Edge Function)

هذا المجلد يوثّق ويوفّر ملفات جاهزة لسدّ فجوة رصدناها: backend schema/RLS/RPC كانت
موجودة فقط على مشروع Supabase الحقيقي، بدون أي أثر لها في هذا الـ repo (لا version
control، لا مراجعة، لا rollback). **هذه الملفات لم تُنفَّذ على أي مشروع Supabase من
هذه الجلسة** — لا يوجد service-role key متاح هنا، وهذا قرار متعمَّد.

## قبل ما تشغّل أي حاجة من دول

```bash
supabase db dump --schema public --file live_schema.sql
```

قارن `live_schema.sql` بـ `schema.sql` هنا. أي فرق بينهم، الحقيقة هي `live_schema.sql`
لأن ملفنا معاد بناؤه (best-effort) من قراءة استدعاءات `sb.from(...)` داخل `index.html`
فقط — مفيش أنواع بيانات دقيقة ولا defaults مؤكدة ولا فهارس حقيقية.

## الملفات

| الملف | الحالة | ملاحظة |
|---|---|---|
| `schema.sql` | best-effort، غير مؤكد | إعادة بناء الجداول من الاستخدام. جدول `error_logs` فقط جديد بالكامل وآمن للتنفيذ المباشر. |
| `policies.sql` | best-effort للموجود، كامل للجديد | نفس الملاحظة — RLS بتاعة `error_logs` مصممة من الصفر ومكتملة. |
| `functions_contract.sql` | توثيق فقط، **مش SQL قابل للتنفيذ** | Signature + السلوك المتوقع لكل RPC موجود فعليًا (`v2_apply_changes` وغيرها). **لا تلصقه كـ `CREATE FUNCTION` حقيقي** — هيدهس منطق شغال في الإنتاج بمنطق متخيَّل. استخدمه كمرجع بس لحد ما تجيب الـ body الحقيقي بـ `supabase db dump`. |
| `functions/daily-backup/index.ts` | جديد بالكامل، قابل للنشر | Edge Function تعمل نسخة احتياطية يومية لكل المحلات سيرفر-سايد، بدون اعتماد على فتح التطبيق. |
| `cron.sql` | جديد، يحتاج تعديل القيم | يجدول `daily-backup` يوميًا عبر `pg_cron`+`pg_net`. |

## خطوات النشر (لو قررت تنفّذها)

1. راجع `schema.sql`/`policies.sql` مقابل `live_schema.sql` وعدّل أي فرق.
2. طبّق جدول `error_logs` وسياسته بس أول حاجة (هو الجزء الآمن الجديد، مالوش تأثير على أي حاجة شغالة):
   ```sql
   -- من schema.sql: قسم "error_logs" فقط
   -- من policies.sql: قسم "error_logs" فقط
   ```
3. انشر الـ Edge Function:
   ```bash
   supabase functions deploy daily-backup --no-verify-jwt
   supabase secrets set BACKUP_FUNCTION_SECRET=<اختار قيمة عشوائية طويلة>
   ```
4. فعّل `pg_cron`+`pg_net` من Dashboard → Database → Extensions، وعدّل القيم في `cron.sql` وشغّله.
5. اختبر الـ Edge Function يدويًا أول مرة (`curl` بالـ headers نفسها) قبل ما تعتمد على الجدولة.

## ملاحظة خارج نطاق هذه الخطة

أثناء الفحص لاحظنا إن نظام تفعيل التراخيص الأوفلاين (أكواد `FATP-/FATM-/FATY-` في
`index.html`) معتمد بالكامل على سر مُعتّم client-side (XOR بسيط، الكود نفسه معلّق عليه
"ده مش تشفير قوي")، وسهل الالتفاف حوله بإعادة هندسة الكود. الدالة الاختيارية
`fat_check_blocked` بترجع بلوك-لست بس ومش بتمنع التفعيل نفسه، وملف SQL المرافق ليها
(`supabase-license-blocking.sql`) مش موجود في أي نسخة وصلتنا. هذا قرار بزنس/anti-piracy
وليس فجوة reliability — لم يُعالَج في هذه الخطة، لكنه يستحق مراجعة منفصلة لو مهم لك.
