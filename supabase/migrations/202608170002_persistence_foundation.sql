-- Persistence foundation for authenticated case and intake workflows.
-- Canonical roles remain ADMIN, INVESTIGATOR, REVIEWER, and VIEWER.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS jurisdiction_region TEXT,
  ADD COLUMN IF NOT EXISTS jurisdiction_agency TEXT;

ALTER TABLE public.intake_channels ADD COLUMN IF NOT EXISTS code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS intake_channels_code_key
  ON public.intake_channels (code) WHERE code IS NOT NULL;

ALTER TABLE public.intake_envelopes ALTER COLUMN privacy_risk_status SET DEFAULT 'PENDING';
ALTER TABLE public.intake_envelopes DROP CONSTRAINT IF EXISTS check_intake_privacy_risk_status;
ALTER TABLE public.intake_envelopes ADD CONSTRAINT check_intake_privacy_risk_status
  CHECK (privacy_risk_status IN ('PENDING', 'LOW', 'MEDIUM', 'HIGH'));

CREATE INDEX IF NOT EXISTS intake_envelopes_status_created_at_idx
  ON public.intake_envelopes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS intake_messages_envelope_id_idx
  ON public.intake_messages (envelope_id, created_at);
CREATE INDEX IF NOT EXISTS intake_participants_envelope_id_idx
  ON public.intake_participants (envelope_id, created_at);
CREATE INDEX IF NOT EXISTS cases_created_at_idx
  ON public.cases (created_at DESC);

INSERT INTO public.intake_channels (id, code, name, type)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'MANUAL_WALKIN', 'แบบร้องเรียนมาด้วยตนเอง', 'MANUAL_WALKIN'),
  ('00000000-0000-4000-8000-000000000102', 'MANUAL_PHONE', 'บันทึกร้องเรียนทางโทรศัพท์', 'MANUAL_PHONE'),
  ('00000000-0000-4000-8000-000000000103', 'KOUPREY_PLUS', 'Kouprey Plus Webhook', 'KOUPREY_PLUS'),
  ('00000000-0000-4000-8000-000000000104', 'PARTNER_API', 'API หน่วยงานพันธมิตร', 'PARTNER_API'),
  ('00000000-0000-4000-8000-000000000105', 'FILE_IMPORT', 'นำเข้าจากไฟล์', 'FILE_IMPORT'),
  ('00000000-0000-4000-8000-000000000106', 'MAIL', 'อีเมลร้องเรียนกลาง', 'MAIL')
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  updated_at = timezone('utc'::text, now());

CREATE OR REPLACE FUNCTION public.create_case(
  p_number TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_jurisdiction_region TEXT DEFAULT NULL,
  p_jurisdiction_agency TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  new_case_id UUID;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CASE_CREATE_FORBIDDEN';
  END IF;
  IF p_number IS NULL OR p_title IS NULL
     OR length(trim(p_number)) NOT BETWEEN 1 AND 100
     OR length(trim(p_title)) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CASE_INPUT_INVALID';
  END IF;

  INSERT INTO public.cases (
    number, title, description, jurisdiction_region, jurisdiction_agency, created_by
  ) VALUES (
    trim(p_number), trim(p_title), nullif(trim(p_description), ''),
    nullif(trim(p_jurisdiction_region), ''), nullif(trim(p_jurisdiction_agency), ''), actor_id
  ) RETURNING id INTO new_case_id;

  INSERT INTO public.case_members (case_id, profile_id, role)
  VALUES (new_case_id, actor_id, 'OWNER');

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'CASE_CREATE', jsonb_build_object('case_id', new_case_id));

  RETURN new_case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_intake(
  p_channel_code TEXT,
  p_complainant_mode TEXT,
  p_urgency TEXT,
  p_urgency_reason TEXT,
  p_region TEXT DEFAULT NULL,
  p_agency TEXT DEFAULT NULL,
  p_document_ref TEXT DEFAULT NULL,
  p_accused JSONB DEFAULT NULL,
  p_complainant JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  selected_channel_id UUID;
  new_envelope_id UUID;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INTAKE_CREATE_FORBIDDEN';
  END IF;
  IF p_channel_code IS NULL OR p_complainant_mode IS NULL OR p_urgency IS NULL
     OR p_urgency_reason IS NULL
     OR p_channel_code NOT IN ('MANUAL_WALKIN', 'MANUAL_PHONE')
     OR p_complainant_mode NOT IN ('IDENTIFIED', 'INCOMPLETE', 'ANONYMOUS')
     OR p_urgency NOT IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INTAKE_INPUT_INVALID';
  END IF;
  IF p_complainant_mode = 'IDENTIFIED' AND p_complainant IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COMPLAINANT_REQUIRED';
  END IF;

  SELECT id INTO selected_channel_id
  FROM public.intake_channels
  WHERE code = p_channel_code;
  IF selected_channel_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_CHANNEL_NOT_CONFIGURED';
  END IF;

  INSERT INTO public.intake_envelopes (
    channel_id, status, complainant_mode, urgency, urgency_reason,
    jurisdiction_region, jurisdiction_agency, malware_scan_status, privacy_risk_status
  ) VALUES (
    selected_channel_id, 'TRIAGE_PENDING', p_complainant_mode, p_urgency,
    trim(p_urgency_reason), nullif(trim(p_region), ''), nullif(trim(p_agency), ''),
    'PENDING', 'PENDING'
  ) RETURNING id INTO new_envelope_id;

  INSERT INTO public.intake_messages (envelope_id, raw_payload, message_id)
  VALUES (
    new_envelope_id,
    jsonb_build_object(
      'channel', p_channel_code,
      'complainant_mode', p_complainant_mode,
      'urgency', p_urgency,
      'urgency_reason', p_urgency_reason,
      'region', p_region,
      'agency', p_agency,
      'document_ref', p_document_ref
    )::text,
    coalesce(nullif(trim(p_document_ref), ''), 'MANUAL-' || new_envelope_id::text)
  );

  IF p_accused IS NOT NULL THEN
    INSERT INTO public.intake_participants (envelope_id, role, name, email, phone, address)
    VALUES (
      new_envelope_id, 'ACCUSED', nullif(trim(p_accused->>'name'), ''),
      nullif(trim(p_accused->>'email'), ''), nullif(trim(p_accused->>'phone'), ''),
      nullif(trim(p_accused->>'address'), '')
    );
  END IF;
  IF p_complainant_mode <> 'ANONYMOUS' AND p_complainant IS NOT NULL THEN
    INSERT INTO public.intake_participants (envelope_id, role, name, email, phone, address)
    VALUES (
      new_envelope_id, 'COMPLAINANT', nullif(trim(p_complainant->>'name'), ''),
      nullif(trim(p_complainant->>'email'), ''), nullif(trim(p_complainant->>'phone'), ''),
      nullif(trim(p_complainant->>'address'), '')
    );
  END IF;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'INTAKE_MANUAL_CREATE', jsonb_build_object('envelope_id', new_envelope_id));

  RETURN new_envelope_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_external_intake(
  p_channel_code TEXT,
  p_payload JSONB,
  p_idempotency_key TEXT DEFAULT NULL,
  p_source_label TEXT DEFAULT 'External intake'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_channel_id UUID;
  new_envelope_id UUID;
  mode_value TEXT := coalesce(p_payload->>'complainant_mode', 'IDENTIFIED');
  urgency_value TEXT := coalesce(p_payload->>'urgency', 'NORMAL');
BEGIN
  IF p_channel_code IS NULL OR p_payload IS NULL
     OR p_channel_code NOT IN ('KOUPREY_PLUS', 'PARTNER_API')
     OR mode_value NOT IN ('IDENTIFIED', 'INCOMPLETE', 'ANONYMOUS')
     OR urgency_value NOT IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EXTERNAL_INTAKE_INVALID';
  END IF;

  SELECT id INTO selected_channel_id FROM public.intake_channels WHERE code = p_channel_code;
  IF selected_channel_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_CHANNEL_NOT_CONFIGURED';
  END IF;

  INSERT INTO public.intake_envelopes (
    channel_id, status, complainant_mode, urgency, urgency_reason,
    jurisdiction_region, jurisdiction_agency, malware_scan_status,
    privacy_risk_status, idempotency_key
  ) VALUES (
    selected_channel_id, 'TRIAGE_PENDING', mode_value, urgency_value,
    coalesce(p_payload->>'urgency_reason', p_source_label),
    p_payload->>'region', p_payload->>'agency', 'PENDING', 'PENDING', p_idempotency_key
  ) RETURNING id INTO new_envelope_id;

  INSERT INTO public.intake_messages (envelope_id, raw_payload, message_id)
  VALUES (
    new_envelope_id, p_payload::text,
    coalesce(p_payload->>'ref_no', p_payload->>'external_case_id', p_source_label || '-' || new_envelope_id::text)
  );

  IF p_payload ? 'accused' THEN
    INSERT INTO public.intake_participants (envelope_id, role, name, email, phone, address)
    VALUES (
      new_envelope_id, 'ACCUSED', p_payload#>>'{accused,name}', p_payload#>>'{accused,email}',
      p_payload#>>'{accused,phone}', p_payload#>>'{accused,address}'
    );
  END IF;
  IF mode_value <> 'ANONYMOUS' AND p_payload ? 'complainant' THEN
    INSERT INTO public.intake_participants (envelope_id, role, name, email, phone, address)
    VALUES (
      new_envelope_id, 'COMPLAINANT', p_payload#>>'{complainant,name}', p_payload#>>'{complainant,email}',
      p_payload#>>'{complainant,phone}', p_payload#>>'{complainant,address}'
    );
  END IF;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (NULL, 'INTAKE_EXTERNAL_RECEIVE', jsonb_build_object(
    'envelope_id', new_envelope_id, 'channel', p_channel_code, 'source', p_source_label
  ));

  RETURN new_envelope_id;
END;
$$;

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

REVOKE ALL ON FUNCTION public.create_case(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_manual_intake(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_external_intake(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.triage_intake(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_case(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_intake(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_external_intake(TEXT, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.triage_intake(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
