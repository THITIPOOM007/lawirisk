# Project Status

## LawiRisk SSK Smart EvidenceVerse

**Source status (2026-08-23): release candidate; local quality gates pass.**

The application is feature-complete for its current product scope in demo/local mode and builds for both Next.js and vinext/Cloudflare. It is not approved for real case data until the staging and operational gates in `PRODUCTION_READINESS.md` have passed.

## Implemented

- Staff authentication with exact ADMIN, INVESTIGATOR, REVIEWER and VIEWER authorization; production auth failures are fail-closed and demo cookies are accepted only in non-production demo mode.
- Case registry, membership, intake/triage, evidence vault, entity extraction, human review, cross-case matching, reports, immutable audit, automation job state and 3D evidence graph.
- Evidence reserve/upload/finalize/cancel lifecycle with SHA-256, stored-object size/magic-byte/MIME checks, private storage and short-lived signed download.
- Public search, anonymous/identified complaint intake, opaque tracking token, shared production rate limits and private validated attachments.
- WebAuthn/FIDO2 passkey enrollment, device listing/revocation, passwordless login with normal Supabase session issuance, atomic credential counter/challenge handling and a five-minute, one-time, HttpOnly step-up session for confirmed review decisions. Biometrics remain on-device and there is no production simulated-passkey fallback.
- Multi-file evidence intake (up to 20 files) with drag/drop and mobile camera capture, per-file browser validation, sequential reserve/upload/finalize boundaries and partial-failure reporting.
- Vision OCR for usable image/PDF evidence when source text is omitted, text extraction when supplied, provider/schema failure states, manual fallback and an explicitly labeled deterministic demo path.
- Evidence Universe demo/live states with case, entity, evidence and verified cross-case nodes; errors fail visibly with retry rather than rendering a blank graph.
- Origin checks on browser mutations, signed/idempotent external intake, least-privilege RLS/RPC boundaries and append-only audit events.
- Thai-font PDF generation, responsive/mobile navigation and reduced-motion support.

## Verified locally

- ESLint: pass
- TypeScript/Next route types: pass
- Vitest: 18 files, 94 tests pass
- Playwright critical flows: 14/14 pass
- Next.js production build: pass (52 generated routes/pages)
- vinext/Cloudflare build: pass
- Production dependency audit: no known vulnerabilities

## External release blockers

The current machine has no staging secrets or linked infrastructure, so `pnpm staging:preflight` is 0/19. Before real data can be used, the owner must configure and prove:

1. Staging Supabase, migration dry-run/apply and multi-role RLS tests.
2. Private `evidence-vault` storage and 200 MB stored-object size/MIME/magic-byte validation tests.
3. Cloudflare staging secrets/domain, health check, WAF/rate limits, monitoring and rollback.
4. Backup/restore, retention, incident response and Product/Security/DPO/DB/Cloudflare sign-off.
5. Production credentials and acceptance fixtures for optional n8n, Kouprey, partner and official-source connectors.

Static public registry records and manual-only official portal launching remain deliberate fallbacks; HSS OSS stays blocked until an authority-approved HTTPS/API endpoint exists.
