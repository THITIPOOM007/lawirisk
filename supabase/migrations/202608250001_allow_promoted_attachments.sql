-- Allow attaching files to promoted envelopes so investigators can add
-- supplementary evidence after an intake has been promoted to a case.

CREATE OR REPLACE FUNCTION public.reserve_intake_attachment_upload(
  p_envelope_id UUID,
  p_filename TEXT,
  p_storage_path TEXT,
  p_file_size BIGINT,
  p_mime_type TEXT,
  p_sha256 TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  new_id UUID;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INTAKE_ATTACHMENT_FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intake_envelopes ie WHERE ie.id = p_envelope_id AND ie.status IN ('RECEIVED', 'NORMALIZING', 'TRIAGE_PENDING', 'NEEDS_INFO', 'PROMOTED')) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_ENVELOPE_NOT_ATTACHABLE';
  END IF;
  INSERT INTO public.intake_attachments (
    envelope_id, filename, file_size, mime_type, sha256, storage_path, upload_state, malware_scan_status
  ) VALUES (
    p_envelope_id, p_filename, p_file_size, p_mime_type, p_sha256, p_storage_path, 'RESERVED', 'PENDING'
  ) RETURNING id INTO new_id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'INTAKE_ATTACHMENT_RESERVED', jsonb_build_object(
    'attachment_id', new_id, 'envelope_id', p_envelope_id, 'filename', p_filename, 'sha256', p_sha256
  ));
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_intake_attachment_upload(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_intake_attachment_upload(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) TO authenticated;
