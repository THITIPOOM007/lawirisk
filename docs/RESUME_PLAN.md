# Resume Plan: LawiRisk EvidenceVerse Implementation

This plan outlines the exact sequence to fulfill the 14-phase implementation based on the audit.

**Pre-requisite / Phase 1: Stabilize & Fix Discrepancies**
1. Fix SQL encoding (`202608200004_performance_indexes.sql`).
2. Fix Intake Attachments API mismatch.
3. Fix Entity Relationships API payload.
4. Fix Public Complaints API channel type.
5. Embed Thai font in `pdf-lib` generation.

**Phase 2: Evidence Autopilot Infrastructure**
- Link n8n job queues securely.

**Phase 3: OCR + Structured Extraction**
- Introduce OCR (e.g. Tesseract.js / Vision API) for images.

**Phase 4: Investigation Planner**
- Auto-generate task lists based on extracted entities.

**Phase 5: Trusted Source Registry**
- Replace `fda-smart-resolver` mock with a database-backed or real-fetch system.

**Phase 6 & 7: Hybrid Search & Entity Resolution**
- Vector embeddings and fuzzy matching.

**Phase 8: Human Review & Source Trace**
- UI enhancements for review.

**Phase 9: 3D Evidence Universe**
- Integrate `react-force-graph-3d` / Three.js in `/matches` and `/entities`.

**Phase 10 & 11: Public Search & WebAuthn**
- Implement Server-side FIDO2 verification.

**Phases 12 - 14: Polishing, Sec, Tests, Deploy**
- Final CSS/Motion tweaks, load testing, comprehensive E2E.
