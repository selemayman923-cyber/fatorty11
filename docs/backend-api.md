# Backend API & serverless hooks

This document describes the minimal backend endpoints and serverless hooks added in this change set.

Endpoints
- `/supabase/functions/log-client-error` — POST
  - Accepts JSON: `{ errors: [ { ...errorPayload } ] }`
  - Behavior: attempts to forward to Supabase REST endpoint `client_errors` when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, else writes to `supabase/client-error-log.jsonl` for manual collection.

Deployment notes
- The function in `supabase/functions/log-client-error/index.js` is a minimal Node-compatible handler. When deploying to Supabase Edge Functions (Deno) you may need to port to the Deno runtime or deploy behind a small Node lambda.
- Recommended: Create a `client_errors` table (jsonb payload + created_at) in Supabase and grant the service role insert permissions.

CI / Scripts
- `npm run check:syntax` — validates inline `<script>` blocks in `index.html` for syntax errors (implemented in `tools/checkInlineJs.js`).
