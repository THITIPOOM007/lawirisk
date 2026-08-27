# Project Status

## LawiRisk SSK Smart EvidenceVerse

**Source status (2026-08-27): release candidate with local Recon Companion deployed to staging; automated quality gates pass.**

The application is feature-complete for its current product scope and is deployed at `https://lawirisk-ssk.evidenceverse-th.workers.dev`. Operational approval for real case data still depends on the remaining drills and sign-offs in `PRODUCTION_READINESS.md`.

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
- Case Intelligence Workspace ครอบคลุม 10 มิติ รวมชื่อ/เบอร์โทร ภาพถ่าย สถานที่ พยานแวดล้อม cross-case และกฎหมาย พร้อมร่าง dossier แบบ plain text ที่ติดป้ายให้ตรวจทาน
- Windows Recon Companion ใช้ DPAPI เก็บบัญชีเฉพาะเครื่อง, auto-login SKYNET/eGov และ HSS ตาม allowlist, หยุดรอ MFA/CAPTCHA และไม่ส่ง credential/session ขึ้น Cloudflare/Supabase; HSS บังคับยืนยัน HTTP ทุกครั้ง

## Verified locally

- ESLint: pass
- TypeScript/Next route types: pass
- Vitest: 23 files, 115 tests pass
- Coverage thresholds pass: 77.77% statements, 62.24% branches, 82.35% functions, 79.14% lines
- Playwright critical/surface flows: 22/22 pass
- Next.js production build: pass (57 generated routes/pages)
- vinext/Cloudflare build: pass
- Production dependency audit: no known vulnerabilities

## Verified on staging

- Cloudflare version `fe6d5ddb-39a0-42f9-8c27-7e5f596e3ed4` deployed successfully.
- `/api/health` returns HTTP 200 `ready`; login and public search return HTTP 200.
- Linked Supabase migrations are up to date.
- Anonymous case reads return no rows and anonymous private-storage reads are denied.
- Worker has no malware-scanner binding or runtime dependency.

## Remaining external/operational acceptance

1. Run authenticated multi-role staging journeys with real ADMIN/INVESTIGATOR/REVIEWER/VIEWER accounts and real passkey devices.
2. Complete a real 200 MB TUS pause/resume/upload/download test against the staging bucket.
3. Run WAF/rate-limit/monitoring/rollback and backup/PITR restore drills, then record Product/Security/DPO/DB/Cloudflare sign-off.
4. Rotate the Supabase privileged key that appeared in Git history and rewrite/purge the affected remote history before production approval.
5. Obtain production contracts, credentials and acceptance fixtures for optional n8n, Kouprey, partner and official-source connectors.

Static public registry records remain a deliberate fallback. Local auto-login เปิดใช้แล้ว แต่ automated search/export หลังล็อกอินยังต้องเพิ่ม adapter จากหน้าจริงและ acceptance fixture ของแต่ละแหล่ง; HSS ยังเป็น transport exception จนมี HTTPS/API ที่หน่วยงานรับรอง
