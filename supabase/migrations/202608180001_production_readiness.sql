-- Production-readiness invariants for evidence, review, reports, audit, and API abuse controls.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Evidence metadata is reserved before the immutable object is uploaded, then finalized.
ALTER TABLE public.evidence_files
  ADD COLUMN IF NOT EXISTS upload_state TEXT NOT NULL DEFAULT 'STORED',
  ADD COLUMN IF NOT EXISTS malware_scan_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS malware_scan_details JSONB,
  ADD COLUMN IF NOT EXISTS malware_scanned_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.evidence_files DROP CONSTRAINT IF EXISTS check_evidence_upload_state;
ALTER TABLE public.evidence_files ADD CONSTRAINT check_evidence_upload_state
  CHECK (upload_state IN ('RESERVED', 'STORED', 'FAILED'));
ALTER TABLE public.evidence_files DROP CONSTRAINT IF EXISTS check_evidence_malware_status;
ALTER TABLE public.evidence_files ADD CONSTRAINT check_evidence_malware_status
  CHECK (malware_scan_status IN ('PENDING', 'CLEAN', 'INFECTED', 'UNAVAILABLE', 'ERROR'));
ALTER TABLE public.evidence_files ALTER COLUMN upload_state SET DEFAULT 'RESERVED';

CREATE UNIQUE INDEX IF NOT EXISTS evidence_files_case_sha256_key
  ON public.evidence_files (case_id, sha256);
CREATE UNIQUE INDEX IF NOT EXISTS evidence_files_file_path_key
  ON public.evidence_files (file_path);
CREATE INDEX IF NOT EXISTS evidence_files_case_created_at_idx
  ON public.evidence_files (case_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.protect_evidence_original_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.case_id IS DISTINCT FROM OLD.case_id
     OR NEW.filename IS DISTINCT FROM OLD.filename
     OR NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.file_size IS DISTINCT FROM OLD.file_size
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'EVIDENCE_ORIGINAL_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_evidence_original_metadata ON public.evidence_files;
CREATE TRIGGER protect_evidence_original_metadata
  BEFORE UPDATE ON public.evidence_files
  FOR EACH ROW EXECUTE FUNCTION public.protect_evidence_original_metadata();

CREATE OR REPLACE FUNCTION public.prevent_stored_evidence_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.upload_state = 'STORED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'EVIDENCE_ORIGINAL_IMMUTABLE';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_stored_evidence_delete ON public.evidence_files;
CREATE TRIGGER prevent_stored_evidence_delete
  BEFORE DELETE ON public.evidence_files
  FOR EACH ROW EXECUTE FUNCTION public.prevent_stored_evidence_delete();

-- Audit rows are append-only for every application role, including service integrations.
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUDIT_LOG_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS prevent_audit_update_or_delete ON public.audit_logs;
CREATE TRIGGER prevent_audit_update_or_delete
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

DROP POLICY IF EXISTS "Insert audit logs" ON public.audit_logs;
CREATE POLICY "Insert own audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;
CREATE POLICY "Users read own profile or admins read profiles" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Members or Admins can update cases" ON public.cases;
CREATE POLICY "Investigators update member cases" ON public.cases
  FOR UPDATE USING (
    public.current_user_role() = 'ADMIN'
    OR (public.current_user_role() = 'INVESTIGATOR' AND public.is_case_member(id))
  ) WITH CHECK (
    public.current_user_role() = 'ADMIN'
    OR (public.current_user_role() = 'INVESTIGATOR' AND public.is_case_member(id))
  );
DROP POLICY IF EXISTS "Admins/Investigators can create cases" ON public.cases;
DROP POLICY IF EXISTS "Investigators or Admins can add evidence" ON public.evidence_files;
DROP POLICY IF EXISTS "Staff triage intake envelopes" ON public.intake_envelopes;

-- Atomic shared rate limiting. Rows contain hashes/opaque keys, never credentials or evidence data.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key_hash TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL,
  window_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hashed_key TEXT;
  now_value TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
  bucket public.api_rate_limits%ROWTYPE;
  retry_after INTEGER;
BEGIN
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 500
     OR p_limit NOT BETWEEN 1 AND 10000
     OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RATE_LIMIT_INPUT_INVALID';
  END IF;
  hashed_key := encode(extensions.digest(p_key, 'sha256'), 'hex');

  INSERT INTO public.api_rate_limits (key_hash, request_count, window_started_at, updated_at)
  VALUES (hashed_key, 1, now_value, now_value)
  ON CONFLICT (key_hash) DO UPDATE SET
    request_count = CASE
      WHEN public.api_rate_limits.window_started_at <= now_value - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE public.api_rate_limits.request_count + 1
    END,
    window_started_at = CASE
      WHEN public.api_rate_limits.window_started_at <= now_value - make_interval(secs => p_window_seconds)
        THEN now_value
      ELSE public.api_rate_limits.window_started_at
    END,
    updated_at = now_value
  RETURNING * INTO bucket;

  retry_after := greatest(0, ceil(extract(epoch FROM (
    bucket.window_started_at + make_interval(secs => p_window_seconds) - now_value
  )))::INTEGER);
  RETURN jsonb_build_object(
    'allowed', bucket.request_count <= p_limit,
    'retry_after_seconds', CASE WHEN bucket.request_count <= p_limit THEN 0 ELSE retry_after END
  );
END;
$$;

-- Server-orchestrated evidence reservation and finalization.
CREATE OR REPLACE FUNCTION public.reserve_evidence_upload(
  p_case_id UUID,
  p_filename TEXT,
  p_file_path TEXT,
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
  evidence_id UUID;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR')
     OR NOT (actor_role = 'ADMIN' OR public.is_case_member(p_case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVIDENCE_UPLOAD_FORBIDDEN';
  END IF;
  IF p_filename IS NULL OR length(p_filename) NOT BETWEEN 1 AND 255
     OR p_file_size NOT BETWEEN 1 AND 20971520
     OR p_mime_type NOT IN ('application/pdf', 'image/png', 'image/jpeg')
     OR p_sha256 !~ '^[0-9a-f]{64}$'
     OR p_file_path !~ ('^' || p_case_id::text || '/[0-9a-f-]{36}\.(pdf|png|jpg)$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EVIDENCE_UPLOAD_INVALID';
  END IF;

  INSERT INTO public.evidence_files (
    case_id, filename, file_path, file_size, mime_type, sha256,
    status, upload_state, malware_scan_status, created_by
  ) VALUES (
    p_case_id, p_filename, p_file_path, p_file_size, p_mime_type, p_sha256,
    'PENDING', 'RESERVED', 'PENDING', actor_id
  ) RETURNING id INTO evidence_id;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_UPLOAD_RESERVED', jsonb_build_object(
    'evidence_id', evidence_id, 'case_id', p_case_id, 'sha256', p_sha256
  ));
  RETURN evidence_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_evidence_upload(p_evidence_id UUID)
RETURNS public.evidence_files
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  record public.evidence_files%ROWTYPE;
BEGIN
  SELECT * INTO record FROM public.evidence_files WHERE id = p_evidence_id FOR UPDATE;
  IF NOT FOUND OR record.created_by <> actor_id
     OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(record.case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVIDENCE_FINALIZE_FORBIDDEN';
  END IF;
  IF record.upload_state <> 'RESERVED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'EVIDENCE_ALREADY_FINALIZED';
  END IF;
  UPDATE public.evidence_files
  SET upload_state = 'STORED', uploaded_at = timezone('utc'::text, now())
  WHERE id = p_evidence_id RETURNING * INTO record;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_UPLOAD', jsonb_build_object(
    'evidence_id', record.id, 'case_id', record.case_id, 'sha256', record.sha256
  ));
  RETURN record;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_evidence_reservation(p_evidence_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  record public.evidence_files%ROWTYPE;
BEGIN
  SELECT * INTO record FROM public.evidence_files WHERE id = p_evidence_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF record.created_by <> actor_id OR record.upload_state <> 'RESERVED' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EVIDENCE_CANCEL_FORBIDDEN';
  END IF;
  DELETE FROM public.evidence_files WHERE id = p_evidence_id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_UPLOAD_CANCELLED', jsonb_build_object(
    'evidence_id', p_evidence_id, 'case_id', record.case_id, 'reason', left(coalesce(p_reason, ''), 200)
  ));
  RETURN true;
END;
$$;

-- Human-reviewable extraction suggestions with immutable source traceability.
CREATE TABLE IF NOT EXISTS public.extraction_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES public.evidence_files(id) ON DELETE RESTRICT,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  source_text TEXT NOT NULL CHECK (length(source_text) BETWEEN 1 AND 4000),
  source_location JSONB NOT NULL DEFAULT '{}'::jsonb,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PERSON', 'ORGANIZATION', 'PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID', 'LOCATION')),
  candidate_value TEXT NOT NULL CHECK (length(candidate_value) BETWEEN 1 AND 1000),
  confidence DOUBLE PRECISION CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  provider TEXT NOT NULL,
  model TEXT,
  prompt_schema_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUGGESTED' CHECK (status IN ('SUGGESTED', 'CONFIRMED', 'REJECTED', 'UNCERTAIN')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_reason TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS extraction_suggestions_case_status_idx
  ON public.extraction_suggestions (case_id, status, created_at DESC);
ALTER TABLE public.extraction_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read suggestions by case" ON public.extraction_suggestions
  FOR SELECT USING (public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id));

CREATE OR REPLACE FUNCTION public.create_manual_extraction_suggestion(
  p_case_id UUID,
  p_evidence_id UUID,
  p_page_number INTEGER,
  p_source_text TEXT,
  p_source_location JSONB,
  p_entity_type TEXT,
  p_candidate_value TEXT,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  suggestion_id UUID;
BEGIN
  IF actor_id IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER')
     OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(p_case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SUGGESTION_CREATE_FORBIDDEN';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.evidence_files ef
    WHERE ef.id = p_evidence_id AND ef.case_id = p_case_id AND ef.upload_state = 'STORED'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUGGESTION_SOURCE_INVALID';
  END IF;
  INSERT INTO public.extraction_suggestions (
    case_id, evidence_id, page_number, source_text, source_location,
    entity_type, candidate_value, confidence, reason, provider,
    prompt_schema_version, created_by
  ) VALUES (
    p_case_id, p_evidence_id, p_page_number, trim(p_source_text), coalesce(p_source_location, '{}'::jsonb),
    p_entity_type, trim(p_candidate_value), NULL, trim(p_reason), 'MANUAL', 'manual-v1', actor_id
  ) RETURNING id INTO suggestion_id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EXTRACTION_SUGGESTION_CREATE', jsonb_build_object(
    'suggestion_id', suggestion_id, 'case_id', p_case_id, 'evidence_id', p_evidence_id
  ));
  RETURN suggestion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_extraction_suggestion(
  p_suggestion_id UUID,
  p_decision TEXT,
  p_reason TEXT,
  p_edited_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  suggestion public.extraction_suggestions%ROWTYPE;
  entity_id UUID;
  page_id UUID;
  final_value TEXT;
BEGIN
  IF actor_id IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'REVIEWER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SUGGESTION_REVIEW_FORBIDDEN';
  END IF;
  IF p_decision NOT IN ('CONFIRMED', 'REJECTED', 'UNCERTAIN') OR length(trim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUGGESTION_REVIEW_INVALID';
  END IF;
  SELECT * INTO suggestion FROM public.extraction_suggestions WHERE id = p_suggestion_id FOR UPDATE;
  IF NOT FOUND OR suggestion.status <> 'SUGGESTED'
     OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(suggestion.case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SUGGESTION_NOT_REVIEWABLE';
  END IF;
  IF p_decision = 'CONFIRMED' AND NOT EXISTS (
    SELECT 1 FROM public.evidence_files ef
    WHERE ef.id = suggestion.evidence_id AND ef.case_id = suggestion.case_id
      AND ef.upload_state = 'STORED' AND ef.malware_scan_status = 'CLEAN'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SUGGESTION_SOURCE_NOT_CLEAN';
  END IF;

  final_value := coalesce(nullif(trim(p_edited_value), ''), suggestion.candidate_value);
  IF p_decision = 'CONFIRMED' THEN
    INSERT INTO public.extracted_entities (case_id, type, value)
    VALUES (suggestion.case_id, suggestion.entity_type, final_value)
    ON CONFLICT (case_id, type, value) DO UPDATE SET value = EXCLUDED.value
    RETURNING id INTO entity_id;
    INSERT INTO public.evidence_pages (evidence_id, page_number)
    VALUES (suggestion.evidence_id, suggestion.page_number)
    ON CONFLICT (evidence_id, page_number) DO UPDATE SET page_number = EXCLUDED.page_number
    RETURNING id INTO page_id;
    INSERT INTO public.entity_mentions (entity_id, page_id, snippet, confidence)
    VALUES (entity_id, page_id, suggestion.source_text, suggestion.confidence);
  END IF;

  UPDATE public.extraction_suggestions SET
    status = p_decision,
    candidate_value = final_value,
    reviewed_by = actor_id,
    review_reason = trim(p_reason),
    reviewed_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_suggestion_id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EXTRACTION_SUGGESTION_REVIEW', jsonb_build_object(
    'suggestion_id', p_suggestion_id, 'decision', p_decision,
    'case_id', suggestion.case_id, 'evidence_id', suggestion.evidence_id, 'entity_id', entity_id
  ));
  RETURN jsonb_build_object('status', p_decision, 'entity_id', entity_id);
END;
$$;

-- Match review is server-authoritative; person-name-only signals can never be confirmed.
ALTER TABLE public.match_candidates
  ADD COLUMN IF NOT EXISTS matching_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
CREATE TABLE IF NOT EXISTS public.match_candidate_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_candidate_id UUID NOT NULL REFERENCES public.match_candidates(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES public.evidence_files(id) ON DELETE RESTRICT,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  source_text TEXT NOT NULL CHECK (length(source_text) BETWEEN 1 AND 4000),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (match_candidate_id, evidence_id, page_number, source_text)
);
ALTER TABLE public.match_candidate_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read match sources by case" ON public.match_candidate_sources
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.match_candidates mc
      WHERE mc.id = match_candidate_id
        AND (public.current_user_role() = 'ADMIN'
          OR (public.is_case_member(mc.source_case_id) AND public.is_case_member(mc.target_case_id)))
    )
  );
DROP POLICY IF EXISTS "Verify/Dismiss matches (Reviewer/Admin only)" ON public.match_candidates;

CREATE OR REPLACE FUNCTION public.review_match_candidate(
  p_match_id UUID,
  p_decision TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  candidate public.match_candidates%ROWTYPE;
  entity_type TEXT;
BEGIN
  IF actor_id IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'REVIEWER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MATCH_REVIEW_FORBIDDEN';
  END IF;
  IF p_decision NOT IN ('VERIFIED', 'DISMISSED') OR length(trim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATCH_REVIEW_INVALID';
  END IF;
  SELECT * INTO candidate FROM public.match_candidates WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR candidate.status <> 'PENDING'
     OR NOT (public.current_user_role() = 'ADMIN'
       OR (public.is_case_member(candidate.source_case_id) AND public.is_case_member(candidate.target_case_id))) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MATCH_NOT_REVIEWABLE';
  END IF;
  SELECT type INTO entity_type FROM public.extracted_entities WHERE id = candidate.entity_id;
  IF p_decision = 'VERIFIED' AND NOT EXISTS (
    SELECT 1 FROM public.match_candidate_sources mcs
    JOIN public.evidence_files ef ON ef.id = mcs.evidence_id
    WHERE mcs.match_candidate_id = candidate.id
      AND ef.upload_state = 'STORED' AND ef.malware_scan_status = 'CLEAN'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MATCH_SOURCE_REQUIRED';
  END IF;
  IF p_decision = 'VERIFIED' AND entity_type = 'PERSON'
     AND NOT (candidate.matching_signals ?| ARRAY['phone', 'email', 'bank_account', 'citizen_id', 'document_hash']) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PERSON_NAME_ONLY_MATCH_FORBIDDEN';
  END IF;
  UPDATE public.match_candidates SET
    status = p_decision, reviewed_by = actor_id, review_reason = trim(p_reason),
    reviewed_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
  WHERE id = p_match_id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'MATCH_REVIEW', jsonb_build_object('match_id', p_match_id, 'decision', p_decision));
  RETURN jsonb_build_object('id', p_match_id, 'status', p_decision);
END;
$$;

-- Reports freeze exact accepted source IDs and hashes at creation time.
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'SUMMARY',
  ADD COLUMN IF NOT EXISTS source_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_sha256 TEXT;

CREATE OR REPLACE FUNCTION public.create_report_snapshot(
  p_case_id UUID,
  p_title TEXT,
  p_report_type TEXT,
  p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  snapshot JSONB;
  report_id UUID;
BEGIN
  IF actor_id IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'INVESTIGATOR')
     OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(p_case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'REPORT_CREATE_FORBIDDEN';
  END IF;
  IF p_report_type NOT IN ('SUMMARY', 'OVERLAP') OR length(trim(p_title)) NOT BETWEEN 1 AND 300
     OR length(p_content) NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPORT_INPUT_INVALID';
  END IF;
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
    'evidence_id', source.evidence_id,
    'sha256', source.sha256,
    'page_number', source.page_number
  )), '[]'::jsonb) INTO snapshot
  FROM (
    SELECT ef.id AS evidence_id, ef.sha256, ep.page_number
    FROM public.entity_mentions em
    JOIN public.extracted_entities ee ON ee.id = em.entity_id AND ee.case_id = p_case_id
    JOIN public.evidence_pages ep ON ep.id = em.page_id
    JOIN public.evidence_files ef ON ef.id = ep.evidence_id AND ef.case_id = p_case_id
    UNION
    SELECT ef.id, ef.sha256, rr.page_number
    FROM public.relationship_references rr
    JOIN public.entity_relationships er ON er.id = rr.relationship_id
      AND er.case_id = p_case_id AND er.status = 'VERIFIED'
    JOIN public.evidence_files ef ON ef.id = rr.evidence_id AND ef.case_id = p_case_id
  ) source;
  IF jsonb_array_length(snapshot) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'REPORT_SOURCE_REQUIRED';
  END IF;
  INSERT INTO public.reports (
    case_id, title, report_type, content, source_snapshot, snapshot_sha256, created_by
  ) VALUES (
    p_case_id, trim(p_title), p_report_type, p_content, snapshot,
    encode(extensions.digest(snapshot::text, 'sha256'), 'hex'), actor_id
  ) RETURNING id INTO report_id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'REPORT_GENERATE', jsonb_build_object(
    'report_id', report_id, 'case_id', p_case_id,
    'source_count', jsonb_array_length(snapshot)
  ));
  RETURN report_id;
END;
$$;

-- Admin-managed operational settings. Provider credentials remain environment-only.
CREATE TABLE IF NOT EXISTS public.system_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  confidence_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.85 CHECK (confidence_threshold BETWEEN 0 AND 1),
  auto_extraction BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);
INSERT INTO public.system_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read system settings" ON public.system_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins update system settings" ON public.system_settings
  FOR UPDATE USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN' AND updated_by = auth.uid());

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_evidence_upload(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_evidence_upload(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_evidence_reservation(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_manual_extraction_suggestion(UUID, UUID, INTEGER, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_extraction_suggestion(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_match_candidate(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_report_snapshot(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_evidence_upload(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_evidence_upload(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_evidence_reservation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_extraction_suggestion(UUID, UUID, INTEGER, TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_extraction_suggestion(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_match_candidate(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_report_snapshot(UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_audit_logs(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (
  id UUID,
  profile_id UUID,
  profile_name TEXT,
  action TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'INVESTIGATOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUDIT_READ_FORBIDDEN';
  END IF;
  RETURN QUERY
  SELECT al.id, al.profile_id, coalesce(p.name, 'ระบบ'), al.action, al.details, al.ip_address, al.created_at
  FROM public.audit_logs al
  LEFT JOIN public.profiles p ON p.id = al.profile_id
  ORDER BY al.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 200), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.list_audit_logs(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(INTEGER) TO authenticated;

-- CSV intake import is performed atomically through one RPC. The application
-- parses CSV; the database independently enforces roles, enums, lengths, and
-- creates the batch, envelopes, participants, row ledger, and audit event.
DROP POLICY IF EXISTS "Investigators create import batches" ON public.import_batches;
DROP POLICY IF EXISTS "Investigators add import rows" ON public.import_rows;

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
      coalesce(nullif(trim(item->>'document_ref'), ''), 'IMPORT-' || batch_id::text || '-' || item->>'row_index')
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
  VALUES (actor_id, 'INTAKE_IMPORT_BATCH', jsonb_build_object('batch_id', batch_id, 'filename', p_filename, 'total_rows', total_count, 'success_rows', successful_count, 'failed_rows', failed_count));

  RETURN jsonb_build_object('batch_id', batch_id, 'total_rows', total_count, 'success_rows', successful_count, 'failed_rows', failed_count);
END;
$$;

REVOKE ALL ON FUNCTION public.create_csv_intake_batch(TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_csv_intake_batch(TEXT, JSONB, JSONB) TO authenticated;
