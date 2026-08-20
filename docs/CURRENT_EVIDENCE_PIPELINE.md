# Current Evidence Pipeline

### 1. Upload & Reservation
1. Client requests upload to `POST /api/evidence/upload`.
2. Browser performs size, MIME, magic byte, and SHA-256 checks.
3. Server executes `reserve_evidence_upload` RPC (creates a `RESERVED` row in `evidence_files`).

### 2. Physical Storage & Validation
4. Server uploads file to Supabase `evidence-vault`.
5. External Malware Scanner (`malware-scanner.ts`) is pinged. Must return `CLEAN`.

### 3. Finalization
6. Server executes `finalize_evidence_upload` RPC. Status becomes `STORED`.
7. Evidence is now immutable (protected by PostgreSQL triggers).

### 4. Extraction & Intelligence (Manual)
8. Officer selects page and text on the UI, hits "Extract".
9. `POST /api/v1/ai/extract` sends text to Gemini 2.5 Flash.
10. Gemini returns JSON based on `workflow-contracts.ts`.
11. Records saved to `extraction_suggestions` as `SUGGESTED`.
12. Reviewer confirms them -> triggers insertion into `extracted_entities`.
