-- Atomically register a validated public-complaint attachment after the Worker
-- has uploaded the immutable bytes to private Storage. The legacy scan field
-- remains NOT_SCANNED; this function does not claim a malware verdict.

CREATE OR REPLACE FUNCTION public.finalize_public_complaint_attachment(
  p_attachment_id UUID,
  p_envelope_id UUID,
  p_bucket_name TEXT,
  p_filename TEXT,
  p_file_size BIGINT,
  p_mime_type TEXT,
  p_sha256 TEXT,
  p_storage_path TEXT,
  p_tracking_token TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_prefix TEXT := 'intake/' || p_envelope_id::text || '/' || p_attachment_id::text || '.';
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PUBLIC_ATTACHMENT_FINALIZE_FORBIDDEN';
  END IF;
  IF p_attachment_id IS NULL OR p_envelope_id IS NULL
     OR length(trim(p_filename)) NOT BETWEEN 1 AND 255
     OR p_file_size NOT BETWEEN 1 AND 20971520
     OR p_mime_type NOT IN ('application/pdf', 'image/png', 'image/jpeg')
     OR p_sha256 !~ '^[0-9a-f]{64}$'
     OR p_storage_path NOT LIKE expected_prefix || '%'
     OR length(trim(p_tracking_token)) NOT BETWEEN 8 AND 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PUBLIC_ATTACHMENT_INPUT_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.intake_envelopes envelope
    WHERE envelope.id = p_envelope_id AND envelope.status = 'TRIAGE_PENDING'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PUBLIC_ATTACHMENT_ENVELOPE_NOT_READY';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects object
    WHERE object.bucket_id = p_bucket_name AND object.name = p_storage_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PUBLIC_ATTACHMENT_OBJECT_MISSING';
  END IF;

  INSERT INTO public.intake_attachments (
    id, envelope_id, filename, file_size, mime_type, sha256, storage_path,
    upload_state, malware_scan_status, file_validation_details, file_validated_at
  ) VALUES (
    p_attachment_id, p_envelope_id, trim(p_filename), p_file_size, p_mime_type,
    p_sha256, p_storage_path, 'STORED', 'NOT_SCANNED',
    jsonb_build_object(
      'mode', 'FILE_VALIDATION_ONLY',
      'size_verified', true,
      'mime_verified', true,
      'signature_verified', true,
      'magic_bytes_verified', true,
      'sha256_source', 'SERVER_COMPUTED'
    ),
    timezone('utc'::text, now())
  );

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (NULL, 'PUBLIC_COMPLAINT_RECEIVED', jsonb_build_object(
    'envelope_id', p_envelope_id,
    'tracking_token', trim(p_tracking_token),
    'has_attachment', true,
    'attachment_id', p_attachment_id,
    'file_validation_status', 'VALIDATED',
    'malware_scan_performed', false
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_public_complaint_attachment(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_public_complaint_attachment(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Repair only rows created by the public route where immutable bytes exist in
-- the configured bucket and deterministic validation was already recorded.
WITH recovered AS (
  UPDATE public.intake_attachments attachment
  SET upload_state = 'STORED'
  WHERE attachment.upload_state = 'RESERVED'
    AND attachment.malware_scan_status = 'NOT_SCANNED'
    AND attachment.file_validated_at IS NOT NULL
    AND attachment.file_validation_details->>'signature_verified' = 'true'
    AND EXISTS (
      SELECT 1 FROM storage.objects object
      WHERE object.name = attachment.storage_path
    )
  RETURNING attachment.id, attachment.envelope_id, attachment.sha256
)
INSERT INTO public.audit_logs (profile_id, action, details)
SELECT NULL, 'PUBLIC_ATTACHMENT_UPLOAD_STATE_RECOVERED', jsonb_build_object(
  'attachment_id', recovered.id,
  'envelope_id', recovered.envelope_id,
  'sha256', recovered.sha256,
  'recovery_basis', 'STORAGE_OBJECT_AND_SERVER_VALIDATION_PRESENT'
)
FROM recovered;
