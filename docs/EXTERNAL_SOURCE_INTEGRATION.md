# External investigation source integration

Verified 2026-08-18. This document records only public entry-point behavior and EvidenceVerse controls. It contains no external credentials, query results, citizen identifiers, or live OAuth state/nonce values.

## FDA SKYNET / Privus

- Authority: สำนักงานคณะกรรมการอาหารและยา กระทรวงสาธารณสุข
- Public entry point: `https://privus.fda.moph.go.th/`
- Observed authentication: eGov Connect / OpenID Connect with PKCE-style callback parameters
- EvidenceVerse mode: `MANUAL_ONLY`

EvidenceVerse opens only the stable public entry point. It never stores or replays the long callback URL because its state, nonce, and code challenge belong to a single authentication session. The officer authenticates directly with eGov/FDA. An official PDF/image export with source reference and capture time must be imported as private evidence before any extracted fact can be reviewed or confirmed.

## HSS OSS

- Authority: กรมสนับสนุนบริการสุขภาพ กระทรวงสาธารณสุข
- Supplied entry point: `http://oss.hss.moph.go.th/auth/login`
- Observed transport: requesting the HTTPS path redirects back to HTTP
- EvidenceVerse mode: `BLOCKED_INSECURE_TRANSPORT`

EvidenceVerse does not render a login form, store a credential, or launch the portal while the credential path is HTTP. Enablement requires an HTTPS endpoint or official API, valid TLS, written authorization for system-to-system use, scoped credentials, auditability, retention limits, test fixtures, and a revocation/rotation procedure.

## Manual evidence capture invariant

1. Search only under the officer's authorized purpose and source account.
2. Export the smallest official result needed, preserving the record reference and capture timestamp.
3. Import the file through Evidence Intake to validate type/magic bytes/size, compute SHA-256, store privately, and scan malware.
4. Treat derived values as suggestions until an authorized human reviews the exact source mention.
5. Never copy an external password, access token, OAuth code, citizen identifier, or raw result into chat, application logs, URL query strings, or Git.

## Automatic connector acceptance

Automation remains deferred until the source owner provides an approved API or supported export mechanism. The connector contract must define allowed queries, purpose/role scope, rate limits, data fields, pagination, source version, immutable response snapshot, error/retry rules, retention, incident contact, credential rotation, and a non-production test environment.
