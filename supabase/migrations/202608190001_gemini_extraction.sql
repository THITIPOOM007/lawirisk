-- Persist schema-validated AI proposals as SUGGESTED only.
CREATE OR REPLACE FUNCTION public.create_ai_extraction_suggestions(
  p_case_id UUID,
  p_evidence_id UUID,
  p_page_number INTEGER,
  p_source_text TEXT,
  p_source_location JSONB,
  p_candidates JSONB,
  p_provider TEXT,
  p_model TEXT,
  p_prompt_schema_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  candidate JSONB;
  suggestion_id UUID;
  suggestion_ids JSONB := '[]'::jsonb;
  candidate_type TEXT;
  candidate_value TEXT;
  candidate_reason TEXT;
  candidate_confidence DOUBLE PRECISION;
BEGIN
  IF actor_id IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER')
     OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(p_case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI_SUGGESTION_CREATE_FORBIDDEN';
  END IF;
  IF p_page_number < 1 OR p_page_number > 100000
     OR length(trim(p_source_text)) NOT BETWEEN 1 AND 4000
     OR length(trim(p_provider)) NOT BETWEEN 1 AND 100
     OR length(trim(p_model)) NOT BETWEEN 1 AND 200
     OR length(trim(p_prompt_schema_version)) NOT BETWEEN 1 AND 100
     OR jsonb_typeof(p_candidates) <> 'array'
     OR jsonb_array_length(p_candidates) > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI_SUGGESTION_PAYLOAD_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.evidence_files ef
    WHERE ef.id = p_evidence_id AND ef.case_id = p_case_id
      AND ef.upload_state = 'STORED' AND ef.malware_scan_status = 'CLEAN'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI_SUGGESTION_SOURCE_NOT_CLEAN';
  END IF;

  FOR candidate IN SELECT value FROM jsonb_array_elements(p_candidates)
  LOOP
    candidate_type := candidate->>'entity_type';
    candidate_value := trim(candidate->>'candidate_value');
    candidate_reason := trim(candidate->>'reason');
    candidate_confidence := (candidate->>'confidence')::double precision;
    IF candidate_type NOT IN ('PERSON', 'ORGANIZATION', 'PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID', 'LOCATION')
       OR length(candidate_value) NOT BETWEEN 1 AND 1000
       OR length(candidate_reason) NOT BETWEEN 1 AND 2000
       OR candidate_confidence NOT BETWEEN 0 AND 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI_SUGGESTION_CANDIDATE_INVALID';
    END IF;

    INSERT INTO public.extraction_suggestions (
      case_id, evidence_id, page_number, source_text, source_location,
      entity_type, candidate_value, confidence, reason, provider, model,
      prompt_schema_version, status, created_by
    ) VALUES (
      p_case_id, p_evidence_id, p_page_number, trim(p_source_text), coalesce(p_source_location, '{}'::jsonb),
      candidate_type, candidate_value, candidate_confidence, candidate_reason, trim(p_provider), trim(p_model),
      trim(p_prompt_schema_version), 'SUGGESTED', actor_id
    ) RETURNING id INTO suggestion_id;
    suggestion_ids := suggestion_ids || to_jsonb(suggestion_id::text);
  END LOOP;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'AI_EXTRACTION_SUGGESTIONS_CREATE', jsonb_build_object(
    'case_id', p_case_id,
    'evidence_id', p_evidence_id,
    'provider', trim(p_provider),
    'model', trim(p_model),
    'prompt_schema_version', trim(p_prompt_schema_version),
    'suggestion_count', jsonb_array_length(p_candidates)
  ));
  RETURN suggestion_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ai_extraction_suggestions(UUID, UUID, INTEGER, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ai_extraction_suggestions(UUID, UUID, INTEGER, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT) TO authenticated;
