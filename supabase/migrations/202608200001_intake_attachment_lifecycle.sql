-- Migration 202608200001_intake_attachment_lifecycle.sql
-- Adds lifecycle management to intake_attachments for the custody chain.

-- 1. New columns on intake_attachments
ALTER TABLE public.intake_attachments 
  ADD COLUMN IF NOT EXISTS upload_state TEXT NOT NULL DEFAULT 'RESERVED' CHECK (upload_state IN ('RESERVED', 'STORED', 'FAILED')),
  ADD COLUMN IF NOT EXISTS malware_scanner_name TEXT,
  ADD COLUMN IF NOT EXISTS malware_signature_version TEXT,
  ADD COLUMN IF NOT EXISTS malware_scanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origin_intake_attachment_id UUID REFERENCES public.intake_attachments(id) ON DELETE SET NULL;

ALTER TABLE public.intake_attachments DROP CONSTRAINT IF EXISTS check_malware;
ALTER TABLE public.intake_attachments ADD CONSTRAINT check_malware CHECK (malware_scan_status IN ('PENDING', 'CLEAN', 'INFECTED', 'UNAVAILABLE', 'ERROR'));

-- 2. Unique constraints
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intake_attachments_envelope_id_sha256_key') THEN
    ALTER TABLE public.intake_attachments ADD CONSTRAINT intake_attachments_envelope_id_sha256_key UNIQUE (envelope_id, sha256);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intake_attachments_storage_path_key') THEN
    ALTER TABLE public.intake_attachments ADD CONSTRAINT intake_attachments_storage_path_key UNIQUE (storage_path);
  END IF;
END $$;

-- 3. Immutable trigger
CREATE OR REPLACE FUNCTION public.protect_intake_attachment_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow state transitions RESERVED→STORED, RESERVED→FAILED, and scan status updates
  IF TG_OP = 'DELETE' THEN
    IF OLD.upload_state = 'STORED' THEN
      RAISE EXCEPTION 'Cannot delete stored intake attachment metadata.';
    END IF;
    RETURN OLD;
  END IF;
  -- Allow finalization updates from RESERVED state only
  IF OLD.upload_state = 'STORED' AND OLD.malware_scan_status = 'CLEAN' THEN
    RAISE EXCEPTION 'Cannot modify finalized STORED/CLEAN intake attachment metadata.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_intake_attachment_metadata ON public.intake_attachments;
CREATE TRIGGER protect_intake_attachment_metadata
  BEFORE UPDATE OR DELETE ON public.intake_attachments
  FOR EACH ROW EXECUTE FUNCTION public.protect_intake_attachment_metadata();

-- 4. Storage bucket and policy
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff upload intake attachments' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Staff upload intake attachments" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'evidence-vault'
        AND split_part(name, '/', 1) = 'intake'
        AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
        AND public.can_access_intake(split_part(name, '/', 2)::uuid)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff read intake attachments storage' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Staff read intake attachments storage" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'evidence-vault'
        AND split_part(name, '/', 1) = 'intake'
        AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND (public.current_user_role() = 'ADMIN' OR public.can_access_intake(split_part(name, '/', 2)::uuid))
      );
  END IF;
END $$;

-- Update evidence_files for promotion
ALTER TABLE public.evidence_files 
  ADD COLUMN IF NOT EXISTS origin_intake_attachment_id UUID REFERENCES public.intake_attachments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS malware_scanner_name TEXT,
  ADD COLUMN IF NOT EXISTS malware_signature_version TEXT,
  ADD COLUMN IF NOT EXISTS malware_scanned_at TIMESTAMPTZ;

-- 5. RPC function reserve_intake_attachment_upload
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
  IF NOT EXISTS (SELECT 1 FROM public.intake_envelopes ie WHERE ie.id = p_envelope_id AND ie.status IN ('RECEIVED', 'NORMALIZING', 'TRIAGE_PENDING', 'NEEDS_INFO')) THEN
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

-- 6. RPC function finalize_intake_attachment_upload
CREATE OR REPLACE FUNCTION public.finalize_intake_attachment_upload(p_attachment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  v_attachment public.intake_attachments%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INTAKE_ATTACHMENT_FORBIDDEN';
  END IF;

  SELECT * INTO v_attachment FROM public.intake_attachments WHERE id = p_attachment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'INTAKE_ATTACHMENT_NOT_FOUND';
  END IF;

  IF NOT public.can_access_intake(v_attachment.envelope_id) THEN
     RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INTAKE_ATTACHMENT_FORBIDDEN';
  END IF;

  IF v_attachment.upload_state <> 'RESERVED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_ATTACHMENT_NOT_RESERVED';
  END IF;

  UPDATE public.intake_attachments
  SET upload_state = 'STORED'
  WHERE id = p_attachment_id;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'INTAKE_ATTACHMENT_STORED', jsonb_build_object(
    'attachment_id', p_attachment_id, 'envelope_id', v_attachment.envelope_id
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_intake_attachment_upload(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_intake_attachment_upload(UUID) TO authenticated;

-- 7. RPC function cancel_intake_attachment_reservation
CREATE OR REPLACE FUNCTION public.cancel_intake_attachment_reservation(p_attachment_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  v_attachment public.intake_attachments%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INTAKE_ATTACHMENT_FORBIDDEN';
  END IF;

  SELECT * INTO v_attachment FROM public.intake_attachments WHERE id = p_attachment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'INTAKE_ATTACHMENT_NOT_FOUND';
  END IF;

  IF NOT public.can_access_intake(v_attachment.envelope_id) THEN
     RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INTAKE_ATTACHMENT_FORBIDDEN';
  END IF;

  IF v_attachment.upload_state <> 'RESERVED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_ATTACHMENT_NOT_RESERVED';
  END IF;

  UPDATE public.intake_attachments
  SET upload_state = 'FAILED'
  WHERE id = p_attachment_id;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'INTAKE_ATTACHMENT_CANCELLED', jsonb_build_object(
    'attachment_id', p_attachment_id, 'envelope_id', v_attachment.envelope_id, 'reason', p_reason
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_intake_attachment_reservation(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_intake_attachment_reservation(UUID, TEXT) TO authenticated;

-- 8. Update triage_intake function
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
  IF p_action IN ('CREATE_CASE', 'MERGE_INTAKE') AND envelope_record.malware_scan_status <> 'CLEAN' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_SCAN_NOT_CLEAN';
  END IF;

  IF p_action IN ('CREATE_CASE', 'MERGE_INTAKE') THEN
    IF EXISTS (
      SELECT 1 FROM public.intake_attachments 
      WHERE envelope_id = p_envelope_id 
      AND (upload_state <> 'STORED' OR malware_scan_status <> 'CLEAN')
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
    FOR att IN SELECT * FROM public.intake_attachments WHERE envelope_id = p_envelope_id AND upload_state = 'STORED' AND malware_scan_status = 'CLEAN'
    LOOP
      INSERT INTO public.evidence_files (
        case_id, filename, file_path, file_size, mime_type, sha256, 
        status, upload_state, malware_scan_status, malware_scan_details,
        malware_scanner_name, malware_signature_version, malware_scanned_at,
        origin_intake_attachment_id, created_by
      ) VALUES (
        destination_id, att.filename, att.storage_path, att.file_size, att.mime_type, att.sha256,
        'PENDING', 'STORED', 'CLEAN', att.malware_scan_details,
        att.malware_scanner_name, att.malware_signature_version, att.malware_scanned_at,
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
