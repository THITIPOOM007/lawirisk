-- Phase 7: Fuzzy Trigram & Cross-Case Match Engine
-- Enables pg_trgm and creates intelligent entity similarity matching for PERSON, ORGANIZATION, LOCATION

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIST / GIN Trigram indexes for fast fuzzy string matching
CREATE INDEX IF NOT EXISTS idx_entities_trgm_value ON public.extracted_entities USING gin (value gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_type_trgm ON public.extracted_entities (type, value);

-- RPC to generate fuzzy match candidates for a specific entity
CREATE OR REPLACE FUNCTION public.create_fuzzy_match_candidates(
  p_entity_id UUID,
  p_similarity_threshold FLOAT DEFAULT 0.65
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  source_entity RECORD;
  target RECORD;
  match_count INTEGER := 0;
  calc_score FLOAT;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'REVIEWER', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MATCH_CREATE_FORBIDDEN';
  END IF;

  SELECT * INTO source_entity FROM public.extracted_entities WHERE id = p_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ENTITY_NOT_FOUND';
  END IF;

  -- Only fuzzy-match for PERSON, ORGANIZATION, LOCATION
  IF source_entity.type NOT IN ('PERSON', 'ORGANIZATION', 'LOCATION') THEN
    RETURN jsonb_build_object('match_count', 0, 'message', 'NOT_FUZZY_MATCH_TYPE');
  END IF;

  IF length(trim(source_entity.value)) < 3 THEN
    RETURN jsonb_build_object('match_count', 0, 'message', 'VALUE_TOO_SHORT');
  END IF;

  -- Search across different cases with trigram similarity
  FOR target IN
    SELECT 
      e.*, 
      similarity(e.value, source_entity.value) AS sim_score,
      em.evidence_id AS mention_evidence_id, 
      em.page_number AS mention_page_number, 
      em.snippet AS mention_snippet
    FROM public.extracted_entities e
    LEFT JOIN public.entity_mentions em ON em.entity_id = e.id
    WHERE e.type = source_entity.type
      AND e.case_id <> source_entity.case_id
      AND e.id <> source_entity.id
      AND similarity(e.value, source_entity.value) >= p_similarity_threshold
    ORDER BY sim_score DESC
    LIMIT 20
  LOOP
    calc_score := round(target.sim_score::numeric, 2);

    INSERT INTO public.match_candidates (
      source_case_id, target_case_id, entity_id, target_entity_id,
      entity_type, entity_value, confidence, status, created_by,
      matching_signals,
      source_evidence_id, source_page_number, source_text,
      target_evidence_id, target_page_number, target_text
    ) VALUES (
      source_entity.case_id, target.case_id, source_entity.id, target.id,
      source_entity.type, source_entity.value, calc_score, 'PENDING', auth.uid(),
      jsonb_build_object(
        'method', 'TRIGRAM_FUZZY_SIMILARITY',
        'score', calc_score,
        'matched_target_value', target.value
      ),
      NULL, NULL, NULL,
      target.mention_evidence_id, target.mention_page_number, target.mention_snippet
    )
    ON CONFLICT (entity_id, target_entity_id) 
    DO UPDATE SET 
      confidence = EXCLUDED.confidence,
      matching_signals = EXCLUDED.matching_signals,
      updated_at = timezone('utc'::text, now());

    match_count := match_count + 1;
  END LOOP;

  IF match_count > 0 THEN
    INSERT INTO public.audit_logs (profile_id, action, details)
    VALUES (auth.uid(), 'FUZZY_MATCH_CANDIDATES_CREATED', jsonb_build_object(
      'entity_id', p_entity_id, 'entity_type', source_entity.type, 'match_count', match_count
    ));
  END IF;

  RETURN jsonb_build_object('match_count', match_count, 'entity_id', p_entity_id);
END;
$$;

-- Comprehensive Cross-Case Match Scanner for an entire case or globally
CREATE OR REPLACE FUNCTION public.scan_cross_case_matches(p_case_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ent RECORD;
  exact_res JSONB;
  fuzzy_res JSONB;
  total_exact INTEGER := 0;
  total_fuzzy INTEGER := 0;
  entity_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'REVIEWER', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MATCH_SCAN_FORBIDDEN';
  END IF;

  FOR ent IN
    SELECT id, type, value FROM public.extracted_entities
    WHERE (p_case_id IS NULL OR case_id = p_case_id)
  LOOP
    entity_count := entity_count + 1;

    -- Exact match for deterministic types
    IF ent.type IN ('PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID') THEN
      SELECT public.create_exact_match_candidates(ent.id) INTO exact_res;
      total_exact := total_exact + COALESCE((exact_res->>'match_count')::INTEGER, 0);
    END IF;

    -- Fuzzy match for names/orgs/locations
    IF ent.type IN ('PERSON', 'ORGANIZATION', 'LOCATION') THEN
      SELECT public.create_fuzzy_match_candidates(ent.id, 0.65) INTO fuzzy_res;
      total_fuzzy := total_fuzzy + COALESCE((fuzzy_res->>'match_count')::INTEGER, 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned_entities', entity_count,
    'exact_matches_found', total_exact,
    'fuzzy_matches_found', total_fuzzy,
    'total_matches', total_exact + total_fuzzy
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_fuzzy_match_candidates(UUID, FLOAT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_fuzzy_match_candidates(UUID, FLOAT) TO authenticated;

REVOKE ALL ON FUNCTION public.scan_cross_case_matches(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_cross_case_matches(UUID) TO authenticated;
