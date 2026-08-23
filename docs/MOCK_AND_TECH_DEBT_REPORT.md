# Mock and Technical-Debt Report

## Deliberate demo/local behavior

- `src/lib/demo-data.ts` supplies isolated browser/local demo records only when non-production demo mode is enabled. Production auth/configuration failures do not fall back to demo identities or writes.
- WebAuthn is simulated only when the server explicitly returns demo mode. Production browser/hardware/server failures return an unsuccessful result.
- Public search has a reviewed static registry fallback when the database-backed trusted-source search is unavailable. The UI identifies citations; it must not be represented as a live official API response.

## External capabilities awaiting owner configuration

- FDA SKYNET/Privus remains manual-only until official API/OAuth credentials and an approved export contract exist.
- HSS OSS remains disabled because the observed path downgrades to HTTP.
- Email intake has no production mail provider.
- Kouprey, partner APIs, n8n and Gemini require production secrets, data-governance decisions and staging acceptance fixtures.

## Non-blocking engineering follow-up

- vinext reports a client chunk larger than 500 kB, primarily from the 3D graph stack. It builds successfully but should be profiled and further code-split before high-volume rollout.
- Add deployed-runtime PDF visual regression coverage and physical WebAuthn device coverage.
- Replace the static public registry fallback with authority-owned APIs when contracts become available.
