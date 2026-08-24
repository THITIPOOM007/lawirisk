# Current Evidence Pipeline

### 1. Upload & Reservation
1. Browser validates size (maximum 200 MB), MIME/magic bytes and computes SHA-256 incrementally.
2. Client requests a path-bound signed TUS grant from `POST /api/v1/evidence/uploads`.
3. Server executes `reserve_evidence_upload` RPC (creates a quarantined `RESERVED/PENDING` row).

### 2. Physical Storage & Validation
4. Browser uploads 6 MB resumable chunks directly to private Supabase `evidence-vault`; the file body never passes through the Cloudflare Worker.
5. Client calls `/api/v1/evidence/uploads/{id}/complete`; Worker issues a five-minute private read URL and sends only that URL plus expected size/hash/type to the NAS scanner.
6. NAS streams the object into ClamAV while independently verifying size, SHA-256 and magic bytes. The source host must match the configured exact allowlist.

### 3. Finalization
7. Only a verified `CLEAN` or `INFECTED` scanner response with matching metadata may execute `finalize_evidence_upload`; status becomes `STORED` and the original becomes immutable.
8. `CLEAN` evidence becomes usable. `INFECTED`, scanner outage, timeout, mismatch and malformed responses remain quarantined/fail closed. Authorized case staff can retry a pending scan after browser refresh.

### 4. Extraction & Intelligence (Manual)
9. Officer selects page and text on the UI, hits "Extract".
10. `POST /api/v1/ai/extract` sends text to Gemini 2.5 Flash.
11. Gemini returns JSON based on `workflow-contracts.ts`.
12. Records saved to `extraction_suggestions` as `SUGGESTED`.
13. Reviewer confirms them -> triggers insertion into `extracted_entities`.
