# Test Baseline

Baseline recorded 2026-08-27.

## Automated gates

- `pnpm lint`: pass.
- `pnpm typecheck`: pass, including Next.js route type generation.
- `pnpm test`: 23 Vitest files and 115 tests pass. Coverage includes schemas, normalization, cryptography/webhook verification, rate limiting, runtime configuration, auth fail-closed behavior, recon companion allowlist/HTTP acknowledgement and security source/migration regressions.
- `pnpm test:e2e`: 22/22 Chromium flows pass sequentially. Coverage includes protected workspace/demo login, 10-dimension Case Intelligence/dossier drafts, dashboard/case access, UTF-8 CSV/manual intake, CSRF rejection, mobile/reduced-motion behavior, local auto-login launch contract/HTTP acknowledgement, viewer RBAC, automation fail-closed behavior, Evidence Universe, evidence queue/OCR/review, authenticated PDF/report readiness and citizen search → complaint → tracking.
- `pnpm build`: Next.js production build passes.
- `pnpm build:vinext`: Cloudflare/vinext build passes.
- `pnpm audit --prod`: no known production dependency vulnerabilities.

## Live-environment tests still required

- Supabase migration/RLS matrix using ADMIN, two isolated INVESTIGATOR users, REVIEWER and VIEWER.
- Private object storage, signed download and stored-object size/MIME/magic-byte validation fixtures.
- Physical/platform WebAuthn registration and one-time step-up consumption on the staging RP domain.
- n8n callback, retry/idempotency and outage exercises against the real orchestrator.
- PDF visual inspection with Thai case fixtures in the deployed runtime.
- Backup restore, monitoring/alerting, WAF/request-size and rollback drills.

These are release gates, not optional test debt. Local passing results do not substitute for them.
