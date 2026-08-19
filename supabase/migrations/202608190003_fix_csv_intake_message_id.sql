-- Fix JSON extraction precedence in the FILE_IMPORT message identifier fallback.
CREATE OR REPLACE FUNCTION public.create_csv_intake_batch(
  p_filename TEXT,
  p_rows JSONB,
  p_failures JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  selected_channel_id UUID;
  batch_id UUID;
  envelope_id UUID;
  item JSONB;
  failure JSONB;
  successful_count INTEGER := 0;
  failed_count INTEGER := 0;
  total_count INTEGER;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INTAKE_IMPORT_FORBIDDEN';
  END IF;
  IF p_filename IS NULL OR length(trim(p_filename)) < 1 OR length(p_filename) > 255
     OR jsonb_typeof(p_rows) <> 'array' OR jsonb_typeof(p_failures) <> 'array'
     OR jsonb_array_length(p_rows) + jsonb_array_length(p_failures) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INTAKE_IMPORT_INVALID';
  END IF;

  SELECT id INTO selected_channel_id FROM public.intake_channels WHERE code = 'FILE_IMPORT';
  IF selected_channel_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTAKE_CHANNEL_NOT_CONFIGURED';
  END IF;

  total_count := jsonb_array_length(p_rows) + jsonb_array_length(p_failures);
  INSERT INTO public.import_batches (filename, total_rows, success_rows, failed_rows, created_by)
  VALUES (trim(p_filename), total_count, 0, 0, actor_id)
  RETURNING id INTO batch_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF coalesce(item->>'complainant_mode', '') NOT IN ('IDENTIFIED', 'INCOMPLETE', 'ANONYMOUS')
       OR coalesce(item->>'urgency', '') NOT IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')
       OR length(trim(coalesce(item->>'urgency_reason', ''))) NOT BETWEEN 1 AND 2000
       OR length(coalesce(item->>'region', '')) > 200
       OR length(coalesce(item->>'agency', '')) > 200
       OR length(coalesce(item->>'document_ref', '')) > 200
       OR (item->>'complainant_mode' = 'IDENTIFIED' AND length(trim(coalesce(item->>'complainant_name', ''))) < 1) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INTAKE_IMPORT_ROW_INVALID';
    END IF;

    INSERT INTO public.intake_envelopes (
      channel_id, status, complainant_mode, urgency, urgency_reason,
      jurisdiction_region, jurisdiction_agency, malware_scan_status, privacy_risk_status
    ) VALUES (
      selected_channel_id, 'TRIAGE_PENDING', item->>'complainant_mode', item->>'urgency', trim(item->>'urgency_reason'),
      nullif(trim(item->>'region'), ''), nullif(trim(item->>'agency'), ''), 'CLEAN', 'PENDING'
    ) RETURNING id INTO envelope_id;

    INSERT INTO public.intake_messages (envelope_id, raw_payload, message_id)
    VALUES (
      envelope_id,
      jsonb_build_object(
        'channel', 'FILE_IMPORT', 'batch_id', batch_id, 'row_index', (item->>'row_index')::integer,
        'document_ref', item->>'document_ref', 'urgency_reason', item->>'urgency_reason'
      )::text,
      coalesce(
        nullif(trim(item->>'document_ref'), ''),
        'IMPORT-' || batch_id::text || '-' || (item->>'row_index')
      )
    );

    IF item->>'complainant_mode' <> 'ANONYMOUS' AND nullif(trim(item->>'complainant_name'), '') IS NOT NULL THEN
      INSERT INTO public.intake_participants (envelope_id, role, name, email, phone, address)
      VALUES (envelope_id, 'COMPLAINANT', nullif(trim(item->>'complainant_name'), ''), nullif(trim(item->>'complainant_email'), ''), nullif(trim(item->>'complainant_phone'), ''), nullif(trim(item->>'complainant_address'), ''));
    END IF;
    IF nullif(trim(item->>'accused_name'), '') IS NOT NULL THEN
      INSERT INTO public.intake_participants (envelope_id, role, name, email, phone, address)
      VALUES (envelope_id, 'ACCUSED', nullif(trim(item->>'accused_name'), ''), nullif(trim(item->>'accused_email'), ''), nullif(trim(item->>'accused_phone'), ''), nullif(trim(item->>'accused_address'), ''));
    END IF;

    INSERT INTO public.import_rows (batch_id, row_index, status, envelope_id)
    VALUES (batch_id, (item->>'row_index')::integer, 'SUCCESS', envelope_id);
    successful_count := successful_count + 1;
  END LOOP;

  FOR failure IN SELECT value FROM jsonb_array_elements(p_failures)
  LOOP
    INSERT INTO public.import_rows (batch_id, row_index, status, error_details)
    VALUES (batch_id, (failure->>'row')::integer, 'FAILED', left(coalesce(failure->>'error', 'INVALID_ROW'), 2000));
    failed_count := failed_count + 1;
  END LOOP;

  UPDATE public.import_batches
  SET success_rows = successful_count, failed_rows = failed_count
  WHERE id = batch_id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'INTAKE_IMPORT_BATCH', jsonb_build_object(
    'batch_id', batch_id, 'filename', p_filename, 'total_rows', total_count,
    'success_rows', successful_count, 'failed_rows', failed_count
  ));
  RETURN jsonb_build_object(
    'batch_id', batch_id, 'total_rows', total_count,
    'success_rows', successful_count, 'failed_rows', failed_count
  );
END;
$$;
