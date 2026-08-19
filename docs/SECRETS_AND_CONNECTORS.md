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

Set a secret interactively so the value is not placed in shell history:

```powershell
pnpm exec wrangler secret put GEMINI_API_KEY --env staging
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
remote project by itself.

## SKYNET and OSS สบส.

The current application does not implement an automatic API connector for
either source. Adding a username and password to an environment file would not
make automatic searching work and would create a central credential risk.

- SKYNET / Privus remains `MANUAL_ONLY`; the app opens the stable Privus
  `STATE=3` entry for `เจ้าหน้าที่ สสจ.` and the officer authenticates directly
  at the official Digital ID/OIDC page.
- OSS สบส. remains `BLOCKED_INSECURE_TRANSPORT` because the supplied login
  path redirects to HTTP.

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
