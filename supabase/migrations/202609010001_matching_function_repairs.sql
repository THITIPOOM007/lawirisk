-- Repair cross-case matching functions discovered by the staging database lint.
-- Keep SECURITY DEFINER functions fail-closed with a fixed search path and fully-qualified objects.

CREATE OR REPLACE FUNCTION public.normalize_entity_value(p_type TEXT, p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  cleaned TEXT;
  digits TEXT;
  digit_count INTEGER;
  checksum INTEGER := 0;
BEGIN
  IF p_type NOT IN ('PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID') THEN
    RETURN NULL;
  END IF;
  IF p_value IS NULL OR pg_catalog.btrim(p_value) = '' THEN RETURN NULL; END IF;

  IF p_type = 'EMAIL' THEN
    cleaned := pg_catalog.lower(pg_catalog.btrim(p_value));
    IF cleaned = '' THEN RETURN NULL; END IF;
    RETURN cleaned;
  END IF;

  IF p_type = 'PHONE' THEN
    digits := pg_catalog.regexp_replace(pg_catalog.btrim(p_value), '[^0-9]', '', 'g');
    IF pg_catalog.length(digits) = 0 THEN RETURN NULL; END IF;
    IF pg_catalog.left(pg_catalog.btrim(p_value), 1) = '+' THEN
      cleaned := '+' || digits;
    ELSIF pg_catalog.left(digits, 1) = '0' THEN
      cleaned := '+66' || pg_catalog.substr(digits, 2);
    ELSE
      cleaned := digits;
    END IF;
    digit_count := pg_catalog.length(pg_catalog.regexp_replace(cleaned, '[^0-9]', '', 'g'));
    IF digit_count < 8 THEN RETURN NULL; END IF;
    RETURN cleaned;
  END IF;

  IF p_type = 'BANK_ACCOUNT' THEN
    cleaned := pg_catalog.regexp_replace(p_value, '[^0-9]', '', 'g');
    IF pg_catalog.length(cleaned) < 10 THEN RETURN NULL; END IF;
    RETURN cleaned;
  END IF;

  IF p_type = 'CITIZEN_ID' THEN
    cleaned := pg_catalog.regexp_replace(p_value, '[^0-9]', '', 'g');
    IF pg_catalog.length(cleaned) <> 13 THEN RETURN NULL; END IF;
    FOR digit_position IN 1..12 LOOP
      checksum := checksum + (pg_catalog.substr(cleaned, digit_position, 1)::integer * (14 - digit_position));
    END LOOP;
    IF ((11 - (checksum % 11)) % 10) <> pg_catalog.substr(cleaned, 13, 1)::integer THEN
      RETURN NULL;
    END IF;
    RETURN cleaned;
  END IF;

  RETURN NULL;
END;
$function$;

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
      entity_type, entity_value, confidence, status, created_by,
      source_evidence_id, source_page_number, source_text,
      target_evidence_id, target_page_number, target_text
    ) VALUES (
      source_entity.case_id, target.case_id, source_entity.id, target.id,
      source_entity.type, source_entity.value, 1.0, 'PENDING', auth.uid(),
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
    SELECT e.*, extensions.similarity(e.value, source_entity.value) AS sim_score,
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
      AND extensions.similarity(e.value, source_entity.value) >= p_similarity_threshold
    ORDER BY sim_score DESC
    LIMIT 20
  LOOP
    calc_score := pg_catalog.round(target.sim_score::numeric, 2);

    INSERT INTO public.match_candidates (
      source_case_id, target_case_id, entity_id, target_entity_id,
      entity_type, entity_value, confidence, status, created_by,
      matching_signals,
      source_evidence_id, source_page_number, source_text,
      target_evidence_id, target_page_number, target_text
    ) VALUES (
      source_entity.case_id, target.case_id, source_entity.id, target.id,
      source_entity.type, source_entity.value, calc_score, 'PENDING', auth.uid(),
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

REVOKE ALL ON FUNCTION public.normalize_entity_value(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_exact_match_candidates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_exact_match_candidates(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.create_fuzzy_match_candidates(UUID, FLOAT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_fuzzy_match_candidates(UUID, FLOAT) TO authenticated;
