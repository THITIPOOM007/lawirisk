-- Fix type mismatch between intake_attachments.malware_scan_details (TEXT) and evidence_files.malware_scan_details (JSONB)
-- and support NOT_SCANNED status in triage_intake.

CREATE OR REPLACE FUNCTION public.triage_intake(
  p_envelope_id UUID,
  p_action TEXT,
  p_reason TEXT,
  p_destination_case_id UUID DEFAULT NULL,
  p_new_case_number TEXT DEFAULT NULL,
  p_new_case_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  envelope_record public.intake_envelopes%ROWTYPE;
  destination_id UUID;
  next_status TEXT;
  att RECORD;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TRIAGE_FORBIDDEN';
  END IF;
  IF p_action IS NULL OR p_reason IS NULL
     OR p_action NOT IN ('CREATE_CASE', 'MERGE_INTAKE', 'REQUEST_MORE_INFO', 'REJECT_SPAM')
     OR length(trim(p_reason)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRIAGE_INPUT_INVALID';
  END IF;

  SELECT * INTO envelope_record
  FROM public.intake_envelopes
  WHERE id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'INTAKE_NOT_FOUND';
  END IF;
  IF envelope_record.status NOT IN ('TRIAGE_PENDING', 'NEEDS_INFO') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_ALREADY_TRIAGED';
  END IF;
  IF p_action IN ('CREATE_CASE', 'MERGE_INTAKE') AND envelope_record.malware_scan_status NOT IN ('CLEAN', 'NOT_SCANNED') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_SCAN_NOT_CLEAN';
  END IF;

  IF p_action IN ('CREATE_CASE', 'MERGE_INTAKE') THEN
    IF EXISTS (
      SELECT 1 FROM public.intake_attachments 
      WHERE envelope_id = p_envelope_id 
      AND (upload_state <> 'STORED' OR malware_scan_status NOT IN ('CLEAN', 'NOT_SCANNED'))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_ATTACHMENTS_NOT_READY';
    END IF;
  END IF;

  IF p_action = 'CREATE_CASE' THEN
    IF actor_role NOT IN ('ADMIN', 'INVESTIGATOR') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CASE_CREATE_FORBIDDEN';
    END IF;
    IF p_new_case_number IS NULL OR p_new_case_title IS NULL
       OR length(trim(p_new_case_number)) NOT BETWEEN 1 AND 100
       OR length(trim(p_new_case_title)) NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CASE_INPUT_INVALID';
    END IF;
    INSERT INTO public.cases (
      number, title, description, jurisdiction_region, jurisdiction_agency, created_by
    ) VALUES (
      trim(p_new_case_number), trim(p_new_case_title),
      'สร้างจากคำร้อง ' || p_envelope_id::text || ': ' || trim(p_reason),
      envelope_record.jurisdiction_region, envelope_record.jurisdiction_agency, actor_id
    ) RETURNING id INTO destination_id;
    INSERT INTO public.case_members (case_id, profile_id, role)
    VALUES (destination_id, actor_id, 'OWNER');
    next_status := 'PROMOTED';
  ELSIF p_action = 'MERGE_INTAKE' THEN
    IF p_destination_case_id IS NULL OR NOT (
      actor_role = 'ADMIN' OR public.is_case_member(p_destination_case_id)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DESTINATION_CASE_FORBIDDEN';
    END IF;
    destination_id := p_destination_case_id;
    next_status := 'MERGED';
  ELSIF p_action = 'REQUEST_MORE_INFO' THEN
    next_status := 'NEEDS_INFO';
  ELSE
    next_status := 'REJECTED';
  END IF;

  IF p_action IN ('CREATE_CASE', 'MERGE_INTAKE') THEN
    FOR att IN SELECT * FROM public.intake_attachments WHERE envelope_id = p_envelope_id AND upload_state = 'STORED' AND malware_scan_status IN ('CLEAN', 'NOT_SCANNED')
    LOOP
      INSERT INTO public.evidence_files (
        case_id, filename, file_path, file_size, mime_type, sha256, 
        status, upload_state, malware_scan_status, malware_scan_details,
        malware_scanner_name, malware_signature_version, malware_scanned_at,
        file_validation_details, file_validated_at,
        origin_intake_attachment_id, created_by
      ) VALUES (
        destination_id, att.filename, att.storage_path, att.file_size, att.mime_type, att.sha256,
        'PENDING', 'STORED', att.malware_scan_status,
        CASE
          WHEN att.malware_scan_details IS NULL THEN NULL
          WHEN att.malware_scan_details::text ~ '^\s*[\{\[]' THEN att.malware_scan_details::jsonb
          ELSE jsonb_build_object('raw', att.malware_scan_details::text)
        END,
        att.malware_scanner_name, att.malware_signature_version, att.malware_scanned_at,
        coalesce(att.file_validation_details, jsonb_build_object('mode', 'FILE_VALIDATION_ONLY')),
        coalesce(att.file_validated_at, timezone('utc'::text, now())),
        att.id, actor_id
      );
    END LOOP;
  END IF;

  INSERT INTO public.triage_decisions (
    envelope_id, action, reason, destination_case_id, created_by
  ) VALUES (
    p_envelope_id, p_action, trim(p_reason), destination_id, actor_id
  );

  UPDATE public.intake_envelopes
  SET status = next_status, updated_at = timezone('utc'::text, now())
  WHERE id = p_envelope_id;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'INTAKE_TRIAGE', jsonb_build_object(
    'envelope_id', p_envelope_id,
    'decision', p_action,
    'destination_case_id', destination_id
  ));

  RETURN jsonb_build_object('status', next_status, 'destination_case_id', destination_id);
END;
$$;

REVOKE ALL ON FUNCTION public.triage_intake(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.triage_intake(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
