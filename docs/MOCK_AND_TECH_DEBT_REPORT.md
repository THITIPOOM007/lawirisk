# Mock and Tech Debt Report

### 1. Mock Data / Fake Implementations
* **`demo-data.ts`**: Complete fallback engine using `localStorage`. Useful for testing, but must ensure it doesn't leak into production logic.
* **WebAuthn**: `webauthn-client.ts` uses `SIMULATED_PASSKEY` when hardware isn't available or fails. The server completely trusts the client's success signal.
* **Public Search (`fda-smart-resolver.ts`)**: Uses a static 15-item array (`VERIFIED_OFFICIAL_REGISTRY`). The "AI summary" is just a hardcoded string template.

### 2. Technical Debt
* **Type Definitions:** Some mismatches between API handlers and SQL RPC signatures (e.g., `finalize_intake_attachment_upload` returning VOID while API expects a record).
* **Hardcoded UI elements**: Dashboard `LATENCY: 18ms` and `INTEGRITY: 100%` are purely cosmetic CSS elements in `src/app/page.tsx`.
* **PDF Export Limitations**: Using standard fonts in `pdf-lib` without loading Thai fonts causes data loss in reports (`?`).
