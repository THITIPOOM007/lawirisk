# Performance Risks

### 1. Synchronous LLM Calls
* `api/v1/ai/extract` triggers Gemini synchronously in the Next.js API route. With a 25-second timeout, this could hit Cloudflare Worker execution limits or cause UX blocking.
* **Mitigation:** The system has an n8n webhook setup (`automation/jobs`) for async processing, but we need to ensure all large OCR/extraction tasks default to this async flow.

### 2. Full Table Scans for Cross-Case Matches
* `create_exact_match_candidates` queries across all cases for duplicate entities.
* **Mitigation:** We need vector search (Hybrid Search / Embeddings) for scale (Phase 6).

### 3. Client-Side Rendering Large Data
* Evidence and entity tables may become massive.
* **Mitigation:** Pagination needs to be enforced on API and UI.
