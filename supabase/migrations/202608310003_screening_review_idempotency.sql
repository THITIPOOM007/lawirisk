-- Screening review must follow the repository-wide usable-evidence policy.
-- A structurally validated file may be used when the retired malware scanner
-- reports NOT_SCANNED, while INFECTED and incomplete uploads still fail closed.
-- Repeating the same final decision is idempotent so browser retries do not
-- surface a misleading 409 after the first transaction already succeeded.
CREATE OR REPLACE FUNCTION public.review_evidence_screening(
  p_screening_id UUID,
  p_decision TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  screening public.evidence_screenings%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'REVIEWER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCREENING_REVIEW_FORBIDDEN';
  END IF;
  IF p_decision NOT IN ('CONFIRMED', 'REJECTED', 'UNCERTAIN')
     OR length(trim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SCREENING_REVIEW_INVALID';
  END IF;

  SELECT * INTO screening
  FROM public.evidence_screenings
  WHERE id = p_screening_id
  FOR UPDATE;

  IF NOT FOUND OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(screening.case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCREENING_REVIEW_FORBIDDEN';
  END IF;

  IF screening.status IN ('CONFIRMED', 'REJECTED') THEN
    IF screening.status = p_decision THEN
      RETURN jsonb_build_object('id', p_screening_id, 'status', screening.status, 'idempotent', true);
    END IF;
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SCREENING_REVIEW_CONFLICT';
  END IF;

  IF p_decision = 'CONFIRMED' AND NOT EXISTS (
    SELECT 1
    FROM public.evidence_files ef
    WHERE ef.id = screening.evidence_id
      AND ef.case_id = screening.case_id
      AND ef.upload_state = 'STORED'
      AND ef.malware_scan_status IN ('CLEAN', 'NOT_SCANNED')
      AND ef.file_validated_at IS NOT NULL
      AND (
        ef.malware_scan_status = 'CLEAN'
        OR coalesce(ef.file_validation_details->>'signature_verified', 'false') = 'true'
        OR coalesce(ef.file_validation_details->>'magic_bytes_verified', 'false') = 'true'
        OR coalesce(ef.file_validation_details->>'mime_verified', 'false') = 'true'
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SCREENING_SOURCE_NOT_CLEAN';
  END IF;

  UPDATE public.evidence_screenings SET
    status = p_decision,
    reviewed_by = actor_id,
    review_reason = trim(p_reason),
    reviewed_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_screening_id;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_SCREENING_REVIEW', jsonb_build_object(
    'screening_id', p_screening_id,
    'case_id', screening.case_id,
    'evidence_id', screening.evidence_id,
    'decision', p_decision
  ));

  RETURN jsonb_build_object('id', p_screening_id, 'status', p_decision, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.review_evidence_screening(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_evidence_screening(UUID, TEXT, TEXT) TO authenticated;
