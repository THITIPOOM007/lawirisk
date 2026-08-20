-- Add normalized_value column to extracted_entities
ALTER TABLE public.extracted_entities ADD COLUMN IF NOT EXISTS normalized_value TEXT;

-- Add target_entity_id and source mention columns to match_candidates
ALTER TABLE public.match_candidates 
  ADD COLUMN IF NOT EXISTS target_entity_id UUID REFERENCES public.extracted_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_evidence_id UUID REFERENCES public.evidence_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_page_number INTEGER,
  ADD COLUMN IF NOT EXISTS source_text TEXT,
  ADD COLUMN IF NOT EXISTS target_evidence_id UUID REFERENCES public.evidence_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_page_number INTEGER,
  ADD COLUMN IF NOT EXISTS target_text TEXT;

-- Unique constraint to prevent duplicate cross-case match candidates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_candidates_entity_pair_key') THEN
    ALTER TABLE public.match_candidates ADD CONSTRAINT match_candidates_entity_pair_key UNIQUE (entity_id, target_entity_id);
  END IF;
END $$;

-- Deterministic normalizer functions in SQL for the 4 exact-match types
CREATE OR REPLACE FUNCTION public.normalize_entity_value(p_type TEXT, p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  cleaned TEXT;
  digits TEXT;
  digit_count INTEGER;
  checksum INTEGER := 0;
  i INTEGER;
BEGIN
  IF p_type NOT IN ('PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID') THEN
    RETURN NULL;
  END IF;
  IF p_value IS NULL OR trim(p_value) = '' THEN RETURN NULL; END IF;
  
  IF p_type = 'EMAIL' THEN
    cleaned := lower(trim(p_value));
    IF cleaned = '' THEN RETURN NULL; END IF;
    RETURN cleaned;
  END IF;
  
  IF p_type = 'PHONE' THEN
    digits := regexp_replace(trim(p_value), '[^0-9]', '', 'g');
    IF length(digits) = 0 THEN RETURN NULL; END IF;
    IF left(trim(p_value), 1) = '+' THEN
      cleaned := '+' || digits;
    ELSIF left(digits, 1) = '0' THEN
      cleaned := '+66' || substr(digits, 2);
    ELSE
      cleaned := digits;
    END IF;
    digit_count := length(regexp_replace(cleaned, '[^0-9]', '', 'g'));
    IF digit_count < 8 THEN RETURN NULL; END IF;
    RETURN cleaned;
  END IF;
  
  IF p_type = 'BANK_ACCOUNT' THEN
    cleaned := regexp_replace(p_value, '[^0-9]', '', 'g');
    IF length(cleaned) < 10 THEN RETURN NULL; END IF;
    RETURN cleaned;
  END IF;
  
  IF p_type = 'CITIZEN_ID' THEN
    cleaned := regexp_replace(p_value, '[^0-9]', '', 'g');
    IF length(cleaned) <> 13 THEN RETURN NULL; END IF;
    FOR i IN 1..12 LOOP
      checksum := checksum + (substr(cleaned, i, 1)::integer * (14 - i));
    END LOOP;
    IF ((11 - (checksum % 11)) % 10) <> substr(cleaned, 13, 1)::integer THEN
      RETURN NULL;
    END IF;
    RETURN cleaned;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Trigger to auto-compute normalized_value on INSERT/UPDATE of extracted_entities
CREATE OR REPLACE FUNCTION public.set_entity_normalized_value()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.normalized_value := public.normalize_entity_value(NEW.type, NEW.value);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_entity_normalized_value ON public.extracted_entities;
CREATE TRIGGER set_entity_normalized_value
  BEFORE INSERT OR UPDATE OF value, type ON public.extracted_entities
  FOR EACH ROW EXECUTE FUNCTION public.set_entity_normalized_value();

-- Backfill existing entities with normalized values
UPDATE public.extracted_entities SET normalized_value = public.normalize_entity_value(type, value) WHERE normalized_value IS NULL;

-- Index for exact matching lookups
CREATE INDEX IF NOT EXISTS idx_entities_normalized_match ON public.extracted_entities (type, normalized_value) WHERE normalized_value IS NOT NULL;

-- RPC function create_exact_match_candidates
CREATE OR REPLACE FUNCTION public.create_exact_match_candidates(p_entity_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  source_entity RECORD;
  target RECORD;
  new_match_id UUID;
  match_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'REVIEWER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MATCH_CREATE_FORBIDDEN';
  END IF;
  
  SELECT * INTO source_entity FROM public.extracted_entities WHERE id = p_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ENTITY_NOT_FOUND';
  END IF;
  
  -- Only exact-match for PHONE, EMAIL, BANK_ACCOUNT, CITIZEN_ID
  IF source_entity.type NOT IN ('PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID') THEN
    RETURN jsonb_build_object('match_count', 0, 'message', 'NO_EXACT_MATCH_TYPE');
  END IF;
  
  IF source_entity.normalized_value IS NULL THEN
    RETURN jsonb_build_object('match_count', 0, 'message', 'NORMALIZATION_FAILED');
  END IF;
  
  -- Find confirmed entities in OTHER cases with same type+normalized_value
  FOR target IN
    SELECT e.*, em.evidence_id AS mention_evidence_id, em.page_number AS mention_page_number, em.snippet AS mention_snippet
    FROM public.extracted_entities e
    LEFT JOIN public.entity_mentions em ON em.entity_id = e.id
    WHERE e.type = source_entity.type
      AND e.normalized_value = source_entity.normalized_value
      AND e.case_id <> source_entity.case_id
      AND e.id <> source_entity.id
    GROUP BY e.id, em.evidence_id, em.page_number, em.snippet
  LOOP
    INSERT INTO public.match_candidates (
      source_case_id, target_case_id, entity_id, target_entity_id,
      entity_type, entity_value, confidence, status, created_by,
      source_evidence_id, source_page_number, source_text,
      target_evidence_id, target_page_number, target_text
    ) VALUES (
      source_entity.case_id, target.case_id, source_entity.id, target.id,
      source_entity.type, source_entity.value, 1.0, 'PENDING', auth.uid(),
      NULL, NULL, NULL,
      target.mention_evidence_id, target.mention_page_number, target.mention_snippet
    )
    ON CONFLICT (entity_id, target_entity_id) DO NOTHING;
    IF FOUND THEN match_count := match_count + 1; END IF;
  END LOOP;
  
  IF match_count > 0 THEN
    INSERT INTO public.audit_logs (profile_id, action, details)
    VALUES (auth.uid(), 'MATCH_CANDIDATES_CREATED', jsonb_build_object(
      'entity_id', p_entity_id, 'entity_type', source_entity.type, 'match_count', match_count
    ));
  END IF;
  
  RETURN jsonb_build_object('match_count', match_count, 'entity_id', p_entity_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_exact_match_candidates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_exact_match_candidates(UUID) TO authenticated;
