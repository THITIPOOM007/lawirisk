-- Raise the evidence-original limit to 200 MiB. Uploads remain RESERVED until
-- the server verifies the completed private object and the NAS scanner verdict.

UPDATE storage.buckets
SET file_size_limit = 209715200
WHERE id = 'evidence-vault';

CREATE OR REPLACE FUNCTION public.reserve_evidence_upload(
  p_case_id UUID,
  p_filename TEXT,
  p_file_path TEXT,
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
  evidence_id UUID;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR')
     OR NOT (actor_role = 'ADMIN' OR public.is_case_member(p_case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVIDENCE_UPLOAD_FORBIDDEN';
  END IF;
  IF p_filename IS NULL OR length(p_filename) NOT BETWEEN 1 AND 255
     OR p_file_size NOT BETWEEN 1 AND 209715200
     OR p_mime_type NOT IN ('application/pdf', 'image/png', 'image/jpeg')
     OR p_sha256 !~ '^[0-9a-f]{64}$'
     OR p_file_path !~ ('^' || p_case_id::text || '/[0-9a-f-]{36}\.(pdf|png|jpg)$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EVIDENCE_UPLOAD_INVALID';
  END IF;

  INSERT INTO public.evidence_files (
    case_id, filename, file_path, file_size, mime_type, sha256,
    status, upload_state, malware_scan_status, created_by
  ) VALUES (
    p_case_id, p_filename, p_file_path, p_file_size, p_mime_type, p_sha256,
    'PENDING', 'RESERVED', 'PENDING', actor_id
  ) RETURNING id INTO evidence_id;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_UPLOAD_RESERVED', jsonb_build_object(
    'evidence_id', evidence_id, 'case_id', p_case_id, 'sha256', p_sha256
  ));
  RETURN evidence_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_evidence_upload(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_evidence_upload(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) TO authenticated;

-- Case-authorized staff can recover a completed upload after a browser refresh
-- or shift handoff; every finalization/cancellation still records the actor.
CREATE OR REPLACE FUNCTION public.finalize_evidence_upload(p_evidence_id UUID)
RETURNS public.evidence_files
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  record public.evidence_files%ROWTYPE;
BEGIN
  SELECT * INTO record FROM public.evidence_files WHERE id = p_evidence_id FOR UPDATE;
  IF NOT FOUND OR actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR')
     OR NOT (actor_role = 'ADMIN' OR public.is_case_member(record.case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVIDENCE_FINALIZE_FORBIDDEN';
  END IF;
  IF record.upload_state <> 'RESERVED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'EVIDENCE_ALREADY_FINALIZED';
  END IF;
  UPDATE public.evidence_files
  SET upload_state = 'STORED', uploaded_at = timezone('utc'::text, now())
  WHERE id = p_evidence_id RETURNING * INTO record;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_UPLOAD', jsonb_build_object(
    'evidence_id', record.id, 'case_id', record.case_id, 'sha256', record.sha256
  ));
  RETURN record;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_evidence_reservation(p_evidence_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  record public.evidence_files%ROWTYPE;
BEGIN
  SELECT * INTO record FROM public.evidence_files WHERE id = p_evidence_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR')
     OR record.upload_state <> 'RESERVED'
     OR NOT (actor_role = 'ADMIN' OR public.is_case_member(record.case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVIDENCE_CANCEL_FORBIDDEN';
  END IF;
  DELETE FROM public.evidence_files WHERE id = p_evidence_id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_UPLOAD_CANCELLED', jsonb_build_object(
    'evidence_id', p_evidence_id, 'case_id', record.case_id, 'reason', left(coalesce(p_reason, ''), 200)
  ));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_evidence_upload(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_evidence_reservation(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_evidence_upload(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_evidence_reservation(UUID, TEXT) TO authenticated;
