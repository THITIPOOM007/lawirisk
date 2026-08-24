-- Manual text/phone intake has no binary payload at creation time. Mark the
-- envelope CLEAN so triage is not blocked; any attachment added later still
-- has its own reserve/store/scan lifecycle and triage gate.

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
    'CLEAN', 'PENDING'
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

REVOKE ALL ON FUNCTION public.create_manual_intake(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_intake(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated;

-- Repair manual envelopes created before this migration only when no binary
-- attachment exists. Envelopes with attachments retain their scanner verdict.
UPDATE public.intake_envelopes AS envelope
SET malware_scan_status = 'CLEAN', updated_at = timezone('utc'::text, now())
FROM public.intake_channels AS channel
WHERE envelope.channel_id = channel.id
  AND channel.code IN ('MANUAL_WALKIN', 'MANUAL_PHONE')
  AND envelope.malware_scan_status = 'PENDING'
  AND envelope.status IN ('RECEIVED', 'NORMALIZING', 'TRIAGE_PENDING', 'NEEDS_INFO')
  AND NOT EXISTS (
    SELECT 1 FROM public.intake_attachments AS attachment
    WHERE attachment.envelope_id = envelope.id
  );
