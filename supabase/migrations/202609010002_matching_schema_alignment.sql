-- Align matching RPCs with the deployed match_candidates schema and the actual pg_trgm namespace.

DO $do$
DECLARE
  similarity_schema TEXT;
BEGIN
  SELECT n.nspname
    INTO similarity_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'similarity'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'text, text'
  ORDER BY CASE n.nspname WHEN 'extensions' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;

  IF similarity_schema IS NULL THEN
    RAISE EXCEPTION 'PG_TRGM_SIMILARITY_NOT_FOUND';
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.entity_similarity(p_left TEXT, p_right TEXT)
       RETURNS REAL LANGUAGE SQL IMMUTABLE PARALLEL SAFE STRICT SET search_path = ''''
       AS %L',
    pg_catalog.format('SELECT %I.similarity($1, $2)', similarity_schema)
  );
END;
$do$;

REVOKE ALL ON FUNCTION public.entity_similarity(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_exact_match_candidates(p_entity_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  source_entity RECORD;
  target RECORD;
  match_count INTEGER := 0;
  source_evidence_id UUID;
  source_page_number INTEGER;
  source_text TEXT;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'REVIEWER', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MATCH_CREATE_FORBIDDEN';
  END IF;

  SELECT * INTO source_entity FROM public.extracted_entities WHERE id = p_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ENTITY_NOT_FOUND';
  END IF;
  IF source_entity.type NOT IN ('PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID') THEN
    RETURN pg_catalog.jsonb_build_object('match_count', 0, 'message', 'NO_EXACT_MATCH_TYPE');
  END IF;
  IF source_entity.normalized_value IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('match_count', 0, 'message', 'NORMALIZATION_FAILED');
  END IF;

  SELECT ep.evidence_id, ep.page_number, em.snippet
    INTO source_evidence_id, source_page_number, source_text
  FROM public.entity_mentions em
  JOIN public.evidence_pages ep ON ep.id = em.page_id
  WHERE em.entity_id = source_entity.id
  ORDER BY em.created_at, em.id
  LIMIT 1;

  FOR target IN
    SELECT e.*, trace.evidence_id AS mention_evidence_id,
      trace.page_number AS mention_page_number, trace.snippet AS mention_snippet
    FROM public.extracted_entities e
    LEFT JOIN LATERAL (
      SELECT ep.evidence_id, ep.page_number, em.snippet
      FROM public.entity_mentions em
      JOIN public.evidence_pages ep ON ep.id = em.page_id
      WHERE em.entity_id = e.id
      ORDER BY em.created_at, em.id
      LIMIT 1
    ) trace ON TRUE
    WHERE e.type = source_entity.type
      AND e.normalized_value = source_entity.normalized_value
      AND e.case_id <> source_entity.case_id
      AND e.id <> source_entity.id
  LOOP
    INSERT INTO public.match_candidates (
      source_case_id, target_case_id, entity_id, target_entity_id,
      confidence, status,
      source_evidence_id, source_page_number, source_text,
      target_evidence_id, target_page_number, target_text
    ) VALUES (
      source_entity.case_id, target.case_id, source_entity.id, target.id,
      1.0, 'PENDING',
      source_evidence_id, source_page_number, source_text,
      target.mention_evidence_id, target.mention_page_number, target.mention_snippet
    )
    ON CONFLICT (entity_id, target_entity_id) DO NOTHING;
    IF FOUND THEN match_count := match_count + 1; END IF;
  END LOOP;

  IF match_count > 0 THEN
    INSERT INTO public.audit_logs (profile_id, action, details)
    VALUES (auth.uid(), 'MATCH_CANDIDATES_CREATED', pg_catalog.jsonb_build_object(
      'entity_id', p_entity_id, 'entity_type', source_entity.type, 'match_count', match_count
    ));
  END IF;
  RETURN pg_catalog.jsonb_build_object('match_count', match_count, 'entity_id', p_entity_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_fuzzy_match_candidates(
  p_entity_id UUID,
  p_similarity_threshold FLOAT DEFAULT 0.65
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  source_entity RECORD;
  target RECORD;
  match_count INTEGER := 0;
  calc_score FLOAT;
  source_evidence_id UUID;
  source_page_number INTEGER;
  source_text TEXT;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'REVIEWER', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MATCH_CREATE_FORBIDDEN';
  END IF;

  SELECT * INTO source_entity FROM public.extracted_entities WHERE id = p_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ENTITY_NOT_FOUND';
  END IF;
  IF source_entity.type NOT IN ('PERSON', 'ORGANIZATION', 'LOCATION') THEN
    RETURN pg_catalog.jsonb_build_object('match_count', 0, 'message', 'NOT_FUZZY_MATCH_TYPE');
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(source_entity.value)) < 3 THEN
    RETURN pg_catalog.jsonb_build_object('match_count', 0, 'message', 'VALUE_TOO_SHORT');
  END IF;

  SELECT ep.evidence_id, ep.page_number, em.snippet
    INTO source_evidence_id, source_page_number, source_text
  FROM public.entity_mentions em
  JOIN public.evidence_pages ep ON ep.id = em.page_id
  WHERE em.entity_id = source_entity.id
  ORDER BY em.created_at, em.id
  LIMIT 1;

  FOR target IN
    SELECT e.*, public.entity_similarity(e.value, source_entity.value) AS sim_score,
      trace.evidence_id AS mention_evidence_id,
      trace.page_number AS mention_page_number,
      trace.snippet AS mention_snippet
    FROM public.extracted_entities e
    LEFT JOIN LATERAL (
      SELECT ep.evidence_id, ep.page_number, em.snippet
      FROM public.entity_mentions em
      JOIN public.evidence_pages ep ON ep.id = em.page_id
      WHERE em.entity_id = e.id
      ORDER BY em.created_at, em.id
      LIMIT 1
    ) trace ON TRUE
    WHERE e.type = source_entity.type
      AND e.case_id <> source_entity.case_id
      AND e.id <> source_entity.id
      AND public.entity_similarity(e.value, source_entity.value) >= p_similarity_threshold
    ORDER BY sim_score DESC
    LIMIT 20
  LOOP
    calc_score := pg_catalog.round(target.sim_score::numeric, 2);
    INSERT INTO public.match_candidates (
      source_case_id, target_case_id, entity_id, target_entity_id,
      confidence, status, matching_signals,
      source_evidence_id, source_page_number, source_text,
      target_evidence_id, target_page_number, target_text
    ) VALUES (
      source_entity.case_id, target.case_id, source_entity.id, target.id,
      calc_score, 'PENDING',
      pg_catalog.jsonb_build_object(
        'method', 'TRIGRAM_FUZZY_SIMILARITY',
        'score', calc_score,
        'matched_target_value', target.value
      ),
      source_evidence_id, source_page_number, source_text,
      target.mention_evidence_id, target.mention_page_number, target.mention_snippet
    )
    ON CONFLICT (entity_id, target_entity_id)
    DO UPDATE SET
      confidence = EXCLUDED.confidence,
      matching_signals = EXCLUDED.matching_signals,
      source_evidence_id = EXCLUDED.source_evidence_id,
      source_page_number = EXCLUDED.source_page_number,
      source_text = EXCLUDED.source_text,
      target_evidence_id = EXCLUDED.target_evidence_id,
      target_page_number = EXCLUDED.target_page_number,
      target_text = EXCLUDED.target_text,
      updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now());
    match_count := match_count + 1;
  END LOOP;

  IF match_count > 0 THEN
    INSERT INTO public.audit_logs (profile_id, action, details)
    VALUES (auth.uid(), 'FUZZY_MATCH_CANDIDATES_CREATED', pg_catalog.jsonb_build_object(
      'entity_id', p_entity_id, 'entity_type', source_entity.type, 'match_count', match_count
    ));
  END IF;
  RETURN pg_catalog.jsonb_build_object('match_count', match_count, 'entity_id', p_entity_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_exact_match_candidates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_exact_match_candidates(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.create_fuzzy_match_candidates(UUID, FLOAT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_fuzzy_match_candidates(UUID, FLOAT) TO authenticated;
