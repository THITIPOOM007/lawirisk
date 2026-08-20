# Test Baseline

### 1. Unit Tests (Vitest)
* 16 Test files in `src/lib/`.
* High coverage on cryptographic functions (HMAC, SHA-256), rate limiting, normalization, CSV parsing, and Zod schemas.

### 2. E2E Tests (Playwright)
* `e2e/critical-flow.spec.ts` covers login, dashboard, CSV import, CSRF rejections, responsive design, and RBAC.

### 3. Missing Coverage
* Need E2E coverage for WebAuthn flow (mocking hardware).
* Need tests for the actual n8n callback execution (`api/v1/automation/jobs/[id]/run`).
* PDF generation visual tests / text extraction tests (ensure Thai renders).

Before committing any phases, we must run:
`pnpm typecheck`
`pnpm lint`
`pnpm test`
