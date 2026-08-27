-- Only the trusted Worker service client may persist an authoritative scanner
-- verdict. Browser/authenticated clients cannot self-assert CLEAN.

CREATE OR REPLACE FUNCTION public.finalize_scanned_evidence_upload(
  p_evidence_id UUID,
  p_actor_id UUID,
  p_verdict TEXT,
  p_scanner TEXT,
  p_signature_version TEXT,
  p_sha256 TEXT,
  p_size_bytes BIGINT,
  p_detected_mime TEXT
)
RETURNS public.evidence_files
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  record public.evidence_files%ROWTYPE;
  actor_role TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCANNER_FINALIZE_FORBIDDEN';
  END IF;

  SELECT profile.role INTO actor_role
  FROM public.profiles profile
  WHERE profile.id = p_actor_id;

  SELECT * INTO record
  FROM public.evidence_files
  WHERE id = p_evidence_id
  FOR UPDATE;

  IF NOT FOUND OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR')
     OR NOT (
       actor_role = 'ADMIN'
       OR EXISTS (
         SELECT 1 FROM public.case_members member
         WHERE member.case_id = record.case_id AND member.profile_id = p_actor_id
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCANNER_FINALIZE_FORBIDDEN';
  END IF;

  IF NOT (
    record.upload_state = 'RESERVED'
    OR (record.upload_state = 'STORED' AND record.malware_scan_status IN ('PENDING', 'NOT_SCANNED', 'UNAVAILABLE', 'ERROR'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'EVIDENCE_ALREADY_FINALIZED';
  END IF;

  IF p_verdict NOT IN ('CLEAN', 'INFECTED')
     OR p_scanner <> 'ClamAV'
     OR p_signature_version IS NULL OR length(p_signature_version) NOT BETWEEN 1 AND 200
     OR p_sha256 !~ '^[0-9a-f]{64}$'
     OR p_sha256 <> record.sha256
     OR p_size_bytes <> record.file_size
     OR p_detected_mime <> record.mime_type THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SCANNER_RESULT_INVALID';
  END IF;

  UPDATE public.evidence_files
  SET upload_state = 'STORED',
      malware_scan_status = p_verdict,
      malware_scan_details = jsonb_build_object(
        'scanner', p_scanner,
        'signature_version', p_signature_version,
        'sha256', p_sha256,
        'size_bytes', p_size_bytes,
        'detected_mime', p_detected_mime
      ),
      malware_scanned_at = timezone('utc'::text, now()),
      uploaded_at = coalesce(uploaded_at, timezone('utc'::text, now())),
      file_validated_at = timezone('utc'::text, now()),
      file_validation_details = jsonb_build_object(
        'mode', 'MALWARE_SCANNER_REFERENCE',
        'size_verified', true,
        'mime_verified', true,
        'magic_bytes_verified', true,
        'sha256_source', 'SCANNER_COMPUTED'
      )
  WHERE id = p_evidence_id
  RETURNING * INTO record;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (p_actor_id, 'EVIDENCE_MALWARE_SCAN_' || p_verdict, jsonb_build_object(
    'evidence_id', record.id,
    'case_id', record.case_id,
    'sha256', record.sha256,
    'scanner', p_scanner,
    'signature_version', p_signature_version
  ));

  RETURN record;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_scanned_evidence_upload(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_scanned_evidence_upload(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_scanned_evidence_upload(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_scanned_evidence_upload(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;

COMMENT ON FUNCTION public.finalize_scanned_evidence_upload(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) IS
  'Persists a VPC scanner verdict after independently matching hash, size, and MIME; service_role only.';
