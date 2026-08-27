# Current Evidence Pipeline

### 1. Upload & Reservation
1. Browser validates size (maximum 200 MB), MIME/magic bytes and computes SHA-256 incrementally.
2. Client requests a path-bound signed TUS grant from `POST /api/v1/evidence/uploads`.
3. Server executes `reserve_evidence_upload` RPC (creates a private `RESERVED/PENDING` row).

### 2. Physical Storage & Validation
4. Browser uploads 6 MB resumable chunks directly to private Supabase `evidence-vault`; the file body never passes through the Cloudflare Worker.
5. Client calls `/api/v1/evidence/uploads/{id}/complete`; Worker issues a five-minute private read URL and reads only the first eight bytes with an HTTP range request.
6. Worker verifies stored object size, declared MIME and magic bytes before finalization. Browser SHA-256 is retained as the upload integrity identifier; the product no longer depends on a malware scanner.

### 3. Finalization
7. A matching stored object executes `finalize_evidence_upload`; status becomes `STORED/NOT_SCANNED`, recording honestly that deterministic file validation—not malware scanning—was performed.
8. `STORED/NOT_SCANNED` and legacy `STORED/CLEAN` evidence are usable. Incomplete uploads and confirmed legacy `INFECTED` records remain unavailable.

### 4. Extraction & Intelligence (Manual)
9. Officer selects a stored, validated file, page and text on the UI, then starts extraction.
10. `POST /api/v1/ai/extract` sends text to Gemini 2.5 Flash.
11. Gemini returns JSON based on `workflow-contracts.ts`.
12. Records saved to `extraction_suggestions` as `SUGGESTED`.
13. Reviewer confirms them -> triggers insertion into `extracted_entities`.
