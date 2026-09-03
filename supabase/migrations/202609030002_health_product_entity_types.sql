-- Permit source-bound health-product identifiers to be reviewed and routed to
-- the correct FDA registry. These are still only suggestions until a reviewer
-- confirms them against the immutable evidence source.
ALTER TABLE public.extracted_entities DROP CONSTRAINT IF EXISTS check_entity_type;
ALTER TABLE public.extracted_entities
  ADD CONSTRAINT check_entity_type CHECK (type IN (
    'PERSON', 'ORGANIZATION', 'PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID', 'LOCATION',
    'PRODUCT_NAME', 'REGISTRATION_NUMBER', 'LICENSE_NUMBER'
  ));

ALTER TABLE public.extraction_suggestions DROP CONSTRAINT IF EXISTS extraction_suggestions_entity_type_check;
ALTER TABLE public.extraction_suggestions DROP CONSTRAINT IF EXISTS check_extraction_suggestion_entity_type;
ALTER TABLE public.extraction_suggestions
  ADD CONSTRAINT check_extraction_suggestion_entity_type CHECK (entity_type IN (
    'PERSON', 'ORGANIZATION', 'PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID', 'LOCATION',
    'PRODUCT_NAME', 'REGISTRATION_NUMBER', 'LICENSE_NUMBER'
  ));

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
  -- A file whose upload/format validation completed is usable for a proposal.
  -- It is never promoted to a fact until reviewer confirmation and source trace.
  IF NOT EXISTS (
    SELECT 1 FROM public.evidence_files ef
    WHERE ef.id = p_evidence_id AND ef.case_id = p_case_id
      AND ef.upload_state = 'STORED' AND ef.malware_scan_status IN ('CLEAN', 'NOT_SCANNED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI_SUGGESTION_SOURCE_NOT_USABLE';
  END IF;

  FOR candidate IN SELECT value FROM jsonb_array_elements(p_candidates)
  LOOP
    candidate_type := candidate->>'entity_type';
    candidate_value := trim(candidate->>'candidate_value');
    candidate_reason := trim(candidate->>'reason');
    candidate_confidence := (candidate->>'confidence')::double precision;
    IF candidate_type NOT IN ('PERSON', 'ORGANIZATION', 'PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID', 'LOCATION', 'PRODUCT_NAME', 'REGISTRATION_NUMBER', 'LICENSE_NUMBER')
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
    'case_id', p_case_id, 'evidence_id', p_evidence_id, 'provider', trim(p_provider),
    'model', trim(p_model), 'prompt_schema_version', trim(p_prompt_schema_version),
    'suggestion_count', jsonb_array_length(p_candidates)
  ));
  RETURN suggestion_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ai_extraction_suggestions(UUID, UUID, INTEGER, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ai_extraction_suggestions(UUID, UUID, INTEGER, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT) TO authenticated;
