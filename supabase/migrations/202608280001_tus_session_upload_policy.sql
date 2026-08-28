-- Direct resumable uploads use the authenticated browser session. Limit every
-- new Storage object to the exact immutable path reserved by the API route.
-- This replaces the former service-signed upload grant without exposing a
-- service-role credential to the browser.

DROP POLICY IF EXISTS "Case members upload evidence originals" ON storage.objects;

CREATE POLICY "Reserved evidence uploads only" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence-vault'
    AND public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND (
      public.current_user_role() = 'ADMIN'
      OR public.is_case_member(split_part(name, '/', 1)::uuid)
    )
    AND EXISTS (
      SELECT 1
      FROM public.evidence_files evidence
      WHERE evidence.case_id = split_part(name, '/', 1)::uuid
        AND evidence.file_path = name
        AND evidence.created_by = auth.uid()
        AND evidence.upload_state = 'RESERVED'
    )
  );
