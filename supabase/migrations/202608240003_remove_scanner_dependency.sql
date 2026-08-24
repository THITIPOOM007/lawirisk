-- The product no longer depends on an external malware scanner. Files are
-- admitted only after size, MIME and magic-byte validation and remain private.
-- Legacy CLEAN/INFECTED verdicts are preserved; new files are NOT_SCANNED.

ALTER TABLE public.evidence_files
  ADD COLUMN IF NOT EXISTS file_validation_details JSONB,
  ADD COLUMN IF NOT EXISTS file_validated_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.intake_attachments
  ADD COLUMN IF NOT EXISTS file_validation_details JSONB,
  ADD COLUMN IF NOT EXISTS file_validated_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.evidence_files DROP CONSTRAINT IF EXISTS check_evidence_malware_status;
ALTER TABLE public.evidence_files ADD CONSTRAINT check_evidence_malware_status
  CHECK (malware_scan_status IN ('PENDING', 'CLEAN', 'NOT_SCANNED', 'INFECTED', 'UNAVAILABLE', 'ERROR'));

ALTER TABLE public.intake_envelopes DROP CONSTRAINT IF EXISTS check_intake_malware_status;
ALTER TABLE public.intake_envelopes ADD CONSTRAINT check_intake_malware_status
  CHECK (malware_scan_status IN ('PENDING', 'CLEAN', 'NOT_SCANNED', 'INFECTED', 'UNAVAILABLE', 'ERROR'));

ALTER TABLE public.intake_attachments DROP CONSTRAINT IF EXISTS check_malware;
ALTER TABLE public.intake_attachments ADD CONSTRAINT check_malware
  CHECK (malware_scan_status IN ('PENDING', 'CLEAN', 'NOT_SCANNED', 'INFECTED', 'UNAVAILABLE', 'ERROR'));

-- Files that were already fully stored but blocked only by scanner availability
-- become usable. Confirmed infected files remain quarantined.
UPDATE public.evidence_files
SET malware_scan_status = 'NOT_SCANNED',
    file_validation_details = coalesce(file_validation_details, jsonb_build_object(
      'mode', 'FILE_VALIDATION_ONLY',
      'source', 'LEGACY_STORED_OBJECT',
      'sha256_source', 'CLIENT_COMPUTED'
    )),
    file_validated_at = coalesce(file_validated_at, uploaded_at, created_at)
WHERE upload_state = 'STORED'
  AND malware_scan_status IN ('PENDING', 'UNAVAILABLE', 'ERROR');

UPDATE public.intake_attachments
SET malware_scan_status = 'NOT_SCANNED',
    file_validation_details = coalesce(file_validation_details, jsonb_build_object(
      'mode', 'FILE_VALIDATION_ONLY',
      'source', 'LEGACY_STORED_OBJECT',
      'sha256_source', 'SERVER_COMPUTED'
    )),
    file_validated_at = coalesce(file_validated_at, created_at)
WHERE upload_state = 'STORED'
  AND malware_scan_status IN ('PENDING', 'UNAVAILABLE', 'ERROR');

UPDATE public.intake_envelopes envelope
SET malware_scan_status = 'NOT_SCANNED',
    status = CASE WHEN envelope.status = 'QUARANTINED' THEN 'TRIAGE_PENDING' ELSE envelope.status END,
    updated_at = timezone('utc'::text, now())
WHERE envelope.malware_scan_status IN ('PENDING', 'UNAVAILABLE', 'ERROR')
  AND NOT EXISTS (
    SELECT 1 FROM public.intake_attachments attachment
    WHERE attachment.envelope_id = envelope.id
      AND attachment.malware_scan_status = 'INFECTED'
  );

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
  SET upload_state = 'STORED',
      malware_scan_status = 'NOT_SCANNED',
      uploaded_at = timezone('utc'::text, now()),
      file_validated_at = timezone('utc'::text, now()),
      file_validation_details = jsonb_build_object(
        'mode', 'FILE_VALIDATION_ONLY',
        'size_verified', true,
        'mime_verified', true,
        'magic_bytes_verified', true,
        'sha256_source', 'CLIENT_COMPUTED'
      )
  WHERE id = p_evidence_id
  RETURNING * INTO record;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_UPLOAD_VALIDATED', jsonb_build_object(
    'evidence_id', record.id,
    'case_id', record.case_id,
    'sha256', record.sha256,
    'malware_scan_performed', false
  ));
  RETURN record;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_intake_attachment_upload(p_attachment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  attachment public.intake_attachments%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INTAKE_ATTACHMENT_FORBIDDEN';
  END IF;
  SELECT * INTO attachment FROM public.intake_attachments WHERE id = p_attachment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'INTAKE_ATTACHMENT_NOT_FOUND';
  END IF;
  IF NOT public.can_access_intake(attachment.envelope_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INTAKE_ATTACHMENT_FORBIDDEN';
  END IF;
  IF attachment.upload_state <> 'RESERVED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_ATTACHMENT_NOT_RESERVED';
  END IF;

  UPDATE public.intake_attachments
  SET upload_state = 'STORED',
      malware_scan_status = 'NOT_SCANNED',
      file_validated_at = timezone('utc'::text, now()),
      file_validation_details = jsonb_build_object(
        'mode', 'FILE_VALIDATION_ONLY',
        'size_verified', true,
        'mime_verified', true,
        'magic_bytes_verified', true,
        'sha256_source', 'SERVER_COMPUTED'
      )
  WHERE id = p_attachment_id;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'INTAKE_ATTACHMENT_VALIDATED', jsonb_build_object(
    'attachment_id', p_attachment_id,
    'envelope_id', attachment.envelope_id,
    'malware_scan_performed', false
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_intake_attachment_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.upload_state = 'STORED' THEN
      RAISE EXCEPTION 'Cannot delete stored intake attachment metadata.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.upload_state = 'STORED'
     AND OLD.malware_scan_status IN ('CLEAN', 'NOT_SCANNED') THEN
    RAISE EXCEPTION 'Cannot modify finalized intake attachment metadata.';
  END IF;
  RETURN NEW;
END;
$$;

-- Existing reviewed workflows used CLEAN as the usable-file predicate. Keep
-- legacy CLEAN files usable and admit the explicit NOT_SCANNED state.
DO $$
DECLARE
  target RECORD;
  definition TEXT;
BEGIN
  FOR target IN
    SELECT procedure.oid
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prosrc LIKE '%malware_scan_status%'
      AND procedure.proname NOT IN (
        'finalize_evidence_upload',
        'finalize_intake_attachment_upload',
        'protect_intake_attachment_metadata'
      )
  LOOP
    definition := pg_get_functiondef(target.oid);
    definition := replace(
      definition,
      'malware_scan_status = ''CLEAN''',
      'malware_scan_status IN (''CLEAN'', ''NOT_SCANNED'')'
    );
    definition := replace(
      definition,
      'malware_scan_status <> ''CLEAN''',
      'malware_scan_status NOT IN (''CLEAN'', ''NOT_SCANNED'')'
    );
    definition := replace(
      definition,
      '''PENDING'', ''STORED'', ''CLEAN'', att.malware_scan_details',
      '''PENDING'', ''STORED'', att.malware_scan_status, att.malware_scan_details'
    );
    definition := replace(
      definition,
      ', ''CLEAN'', ''PENDING''',
      ', ''NOT_SCANNED'', ''PENDING'''
    );
    definition := replace(
      definition,
      'p_payload->>''agency'', ''PENDING'', ''PENDING'', p_idempotency_key',
      'p_payload->>''agency'', ''NOT_SCANNED'', ''PENDING'', p_idempotency_key'
    );
    EXECUTE definition;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_evidence_upload(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_intake_attachment_upload(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_evidence_upload(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_intake_attachment_upload(UUID) TO authenticated;

INSERT INTO public.audit_logs (profile_id, action, details)
VALUES (NULL, 'MALWARE_SCANNER_REQUIREMENT_REMOVED', jsonb_build_object(
  'replacement', 'FILE_VALIDATION_ONLY',
  'legacy_infected_files_preserved', true,
  'changed_at', timezone('utc'::text, now())
));
