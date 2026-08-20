# Gap Analysis

This document highlights the missing systems between the current state and the full production vision.

### 1. Evidence Autopilot & Pipeline
- **Current State:** Evidence upload works and is secure. Extraction uses Gemini API manually.
- **Gap:** No automated OCR (Vision processing) before sending text to Gemini. The automation pipeline (n8n) requires manual triggering.

### 2. External Trusted Sources & Resolvers
- **Current State:** `fda-smart-resolver.ts` uses static local data. External sources like FDA Skynet are strictly `MANUAL_ONLY`.
- **Gap:** True API connectors or robust database caching of these public records is missing. Needs a real `TRUSTED_SOURCE_REGISTRY` table to replace local objects.

### 3. Investigation Planner
- **Current State:** Non-existent.
- **Gap:** Needs a system to propose investigation steps after evidence extraction.

### 4. 3D Evidence Universe
- **Current State:** Uses 2D tables and alignment cards. No graph rendering library in `package.json`.
- **Gap:** Needs `react-force-graph-3d` or similar WebGL renderer for node-edge linking of entities and cases.

### 5. WebAuthn Step-Up
- **Current State:** Client calls `navigator.credentials.get()` but falls back to `SIMULATED_PASSKEY`. No server-side cryptographic verification (FIDO2).
- **Gap:** Needs `@simplewebauthn/server` or custom implementation to verify hardware signatures on the backend.

### 6. Entity Resolution & Cross-Case Match
- **Current State:** Basic matching via exact text (Phone, Citizen ID).
- **Gap:** Fuzzy matching, semantic similarities, and automatic job execution for matches.

### 7. PDF Export Thai Support
- **Current State:** `pdf-lib` replaces non-ASCII (Thai characters) with `?`.
- **Gap:** Need to embed a Thai font (e.g., TH Sarabun New) in the PDF generation process.
