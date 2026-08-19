# LawiRisk-SSK n8n Automation V1

This slice makes selected-text extraction asynchronous without placing evidence,
external-system credentials, Supabase keys, or the Gemini key in n8n.

## Trust boundary

1. An authorized staff user queues a job against a `STORED + CLEAN` evidence file.
2. LawiRisk stores the selected source text in `automation_job_inputs`, which has
   RLS enabled and no authenticated-user policy.
3. LawiRisk sends n8n only `job_id`, `dispatch_id`, schema version, and a
   server-defined LawiRisk callback URL.
4. n8n calls the callback with a separate callback credential.
5. LawiRisk loads the private input, calls Gemini server-side, validates the
   provider output, and transactionally creates `SUGGESTED` records.
6. The private job input is deleted after success. A reviewer must still confirm,
   reject, edit, or mark every suggestion uncertain.

## Import and activate the workflow

1. Import `n8n/lawirisk-text-extraction-v1.json` into a current n8n instance.
2. Create a **Header Auth** credential named `LawiRisk Dispatch Token`:
   - Header: `X-LawiRisk-Dispatch-Token`
   - Value: the same random value used for `N8N_DISPATCH_TOKEN` in Cloudflare.
3. Attach that credential to the **LawiRisk Dispatch** Webhook node.
4. Create a second **Header Auth** credential named `LawiRisk Callback Token`:
   - Header: `X-N8N-Callback-Token`
   - Value: the same random value used for `N8N_CALLBACK_TOKEN` in Cloudflare.
5. Attach it to the **Run Inside LawiRisk** HTTP Request node.
6. Activate the workflow and copy its production webhook URL into
   `N8N_AUTOMATION_WEBHOOK_URL`.
7. Use HTTPS only. Do not enable successful-execution payload retention; the
   workflow template sets `saveDataSuccessExecution` to `none`.

Generate two different random tokens of at least 32 bytes. Never paste them into
the workflow JSON, source control, browser code, or a chat transcript.

## Runtime behavior

- Browser create route: `POST /api/v1/automation/jobs`
- Browser retry route: `POST /api/v1/automation/jobs/:id/retry`
- Private n8n callback: `POST /api/v1/automation/jobs/:id/run`
- Command center: `/automation`

The callback is idempotent per `dispatch_id`. A repeated callback after success
returns the stored result count without creating duplicate suggestions. Failed or
stalled jobs can be retried up to three attempts; each retry has a fresh dispatch
identifier and an append-only audit event.

## n8n hardening

- Run the built-in `n8n audit` regularly.
- Disable community nodes unless explicitly approved.
- Set a persistent encryption key and restrict editor access to credentials.
- Put n8n behind TLS, access controls, WAF/rate limits, and outbound allow-lists.
- Retain failed executions only as long as incident handling requires.
- Keep the n8n instance and database in an approved region.

References:

- <https://docs.n8n.io/hosting/securing/security-audit/>
- <https://docs.n8n.io/workflows/executions/all-executions/>
- <https://docs.n8n.io/workflows/sharing/>

## Deferred next slice

V1 deliberately processes selected text. Full-file OCR remains deferred until a
malware scanner and approved OCR provider are configured. The next slice will
read a private evidence object inside LawiRisk, persist page-level OCR source
mentions, and queue extraction automatically without sending raw binary data to
n8n.
