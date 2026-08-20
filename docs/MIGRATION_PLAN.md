# Migration Plan & Stability Fixes

Before adding new features, the following bug fixes and data model adjustments must be executed (Phase 1):

1. **Fix Encoding of Migration File:**
   - Convert `supabase/migrations/202608200004_performance_indexes.sql` from UTF-16LE to UTF-8.

2. **Fix Intake Attachments API (`src/app/api/v1/intake/[id]/attachments/route.ts`):**
   - Update bucket target to `evidence-vault` with `intake/` prefix.
   - Fix RPC parameter from `p_file_path` to `p_storage_path`.
   - Remove `!record` check since the RPC returns `VOID`.

3. **Fix Entity Relationships API (`src/app/api/v1/entity-relationships/route.ts`):**
   - Align API payload with schema (insert `type` instead of `relationship_type`). Remove `confidence` as it doesn't exist on the table.

4. **Fix Public Complaints API (`src/app/api/v1/public/complaints/route.ts`):**
   - Change `PUBLIC_PORTAL` to a valid channel type (or add it to the check constraint).
   - Use a real UUID fallback.

5. **Fix PDF Thai Text Export:**
   - Import a base64 Thai font (TH Sarabun) and embed it using `pdf-lib` instead of doing regex replacement.

6. **Implement Trusted Sources DB:**
   - Migrate `fda-smart-resolver.ts` static records to a real DB table or handle it in a scalable way.
