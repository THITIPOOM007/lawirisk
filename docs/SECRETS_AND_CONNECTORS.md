# LawiRisk-SSK secrets and external connectors

Never commit, paste into chat, or expose server credentials through a
`NEXT_PUBLIC_` environment variable. A value in `.env.example` or
`.env.staging.example` is only a placeholder; real values belong in a local
ignored file or the Cloudflare secret store.

## Local development

Copy `.env.example` to `.env.local` and place the Gemini key there:

```dotenv
GEMINI_API_KEY=replace-locally
GEMINI_MODEL=gemini-2.5-flash
```

`.env.local` is ignored by Git. Gemini must only be called by a server route or
server-side provider adapter.

## Cloudflare staging

Set every required secret interactively so the value is not placed in shell history. Configure provider secrets before deployment:

```powershell
pnpm exec wrangler secret put GEMINI_API_KEY --env staging
pnpm exec wrangler secret put N8N_AUTOMATION_WEBHOOK_URL --env staging
pnpm exec wrangler secret put N8N_DISPATCH_TOKEN --env staging
pnpm exec wrangler secret put N8N_CALLBACK_TOKEN --env staging
```

The renamed staging Worker is `lawirisk-ssk`, so its expected workers.dev URL
after a successful deployment is:

```text
https://lawirisk-ssk.evidenceverse-th.workers.dev/login
```

Before deploying the renamed Worker, set all required secrets declared in
`wrangler.jsonc`, including the Supabase keys, private bucket, `APP_ORIGIN`, and
Gemini key. Update the Supabase Auth site URL and redirect allow-list in the live
Supabase project as well; changing `supabase/config.toml` does not change the
remote project by itself. `pnpm deploy:staging` now stops before building when
any secret required by the production readiness contract is absent. After
deployment, `/api/health` must return HTTP 200 with `status: "ready"`.

## SKYNET and OSS สบส.

The application now implements local Windows auto-login through Recon Companion;
it still does not implement a server-side automatic search API connector. Never
put an external username/password in an environment file or Cloudflare secret.

- SKYNET / Privus is `LOCAL_AUTO_LOGIN`; Windows DPAPI protects the local
  credential and the companion creates a fresh OIDC/PKCE transaction each run.
- OSS สบส. is `LOCAL_AUTO_LOGIN_RISK_ACK_REQUIRED`; the HTTPS path redirects
  to HTTP, so every run requires an explicit acknowledgement and does not pass
  the recommended production transport gate.

Install and configure it with `pnpm recon:install` and the steps in
`docs/RECON_COMPANION.md`. Credential files stay under LocalAppData and are not
Cloudflare/Supabase secrets.

When a source owner supplies a written system-to-system agreement and an
approved HTTPS API/OAuth contract, use server-only secrets such as:

```dotenv
FDA_SKYNET_API_BASE_URL=
FDA_SKYNET_CLIENT_ID=
FDA_SKYNET_CLIENT_SECRET=
HSS_OSS_API_BASE_URL=
HSS_OSS_API_TOKEN=
```

The connector still requires implementation, Zod validation, rate limits,
purpose/case authorization, immutable response snapshots, audit events, and a
human-review path. Never expose these values to the browser or let an AI model
choose arbitrary connector URLs.
