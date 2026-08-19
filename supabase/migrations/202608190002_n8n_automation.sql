-- Secure n8n orchestration for asynchronous, human-reviewed AI extraction.
-- n8n receives job identifiers only; evidence text remains inside LawiRisk-SSK.

CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES public.evidence_files(id) ON DELETE RESTRICT,
  job_type TEXT NOT NULL DEFAULT 'TEXT_EXTRACTION'
    CHECK (job_type IN ('TEXT_EXTRACTION')),
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'DISPATCHED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  page_number INTEGER NOT NULL CHECK (page_number BETWEEN 1 AND 100000),
  source_location JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_sha256 TEXT NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key UUID NOT NULL,
  dispatch_id UUID,
  external_execution_id TEXT,
  provider TEXT,
  model TEXT,
  prompt_schema_version TEXT,
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 5),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count BETWEEN 0 AND 20),
  error_code TEXT,
  error_message TEXT,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (requested_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS automation_jobs_case_created_idx
  ON public.automation_jobs (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_jobs_status_updated_idx
  ON public.automation_jobs (status, updated_at);

-- Sensitive input is deliberately separated from the user-readable job record.
CREATE TABLE IF NOT EXISTS public.automation_job_inputs (
  job_id UUID PRIMARY KEY REFERENCES public.automation_jobs(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL CHECK (length(source_text) BETWEEN 1 AND 4000),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_job_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read automation jobs by case" ON public.automation_jobs;
CREATE POLICY "Read automation jobs by case" ON public.automation_jobs
  FOR SELECT USING (
    public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id)
  );

REVOKE INSERT, UPDATE, DELETE ON public.automation_jobs FROM anon, authenticated;
REVOKE ALL ON public.automation_job_inputs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_text_extraction_job(
  p_case_id UUID,
  p_evidence_id UUID,
  p_page_number INTEGER,
  p_source_text TEXT,
  p_source_location JSONB,
  p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT := public.current_user_role();
  job public.automation_jobs%ROWTYPE;
  inserted BOOLEAN := false;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER')
     OR NOT (actor_role = 'ADMIN' OR public.is_case_member(p_case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTOMATION_JOB_FORBIDDEN';
  END IF;
  IF p_page_number NOT BETWEEN 1 AND 100000
     OR length(trim(p_source_text)) NOT BETWEEN 1 AND 4000
     OR p_idempotency_key IS NULL
     OR jsonb_typeof(coalesce(p_source_location, '{}'::jsonb)) <> 'object'
     OR octet_length(coalesce(p_source_location, '{}'::jsonb)::text) > 4096 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_JOB_INPUT_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.evidence_files ef
    WHERE ef.id = p_evidence_id AND ef.case_id = p_case_id
      AND ef.upload_state = 'STORED' AND ef.malware_scan_status = 'CLEAN'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_EVIDENCE_NOT_CLEAN';
  END IF;

  INSERT INTO public.automation_jobs (
    case_id, evidence_id, page_number, source_location, input_sha256,
    idempotency_key, requested_by
  ) VALUES (
    p_case_id, p_evidence_id, p_page_number, coalesce(p_source_location, '{}'::jsonb),
    encode(extensions.digest(trim(p_source_text), 'sha256'), 'hex'),
    p_idempotency_key, actor_id
  )
  ON CONFLICT (requested_by, idempotency_key) DO NOTHING
  RETURNING * INTO job;

  IF FOUND THEN
    inserted := true;
    INSERT INTO public.automation_job_inputs (job_id, source_text)
    VALUES (job.id, trim(p_source_text));
    INSERT INTO public.audit_logs (profile_id, action, details)
    VALUES (actor_id, 'AUTOMATION_JOB_QUEUED', jsonb_build_object(
      'job_id', job.id, 'case_id', job.case_id, 'evidence_id', job.evidence_id,
      'job_type', job.job_type, 'input_sha256', job.input_sha256
    ));
  ELSE
    SELECT * INTO job FROM public.automation_jobs
    WHERE requested_by = actor_id AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object(
    'id', job.id,
    'status', job.status,
    'attempt', job.attempt,
    'created', inserted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_automation_job_dispatched(
  p_job_id UUID,
  p_dispatch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  job public.automation_jobs%ROWTYPE;
BEGIN
  SELECT * INTO job FROM public.automation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR actor_id IS NULL
     OR NOT (public.current_user_role() = 'ADMIN' OR job.requested_by = actor_id)
     OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(job.case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTOMATION_JOB_DISPATCH_FORBIDDEN';
  END IF;
  IF job.status = 'DISPATCHED' AND job.dispatch_id = p_dispatch_id THEN
    RETURN jsonb_build_object('id', job.id, 'status', job.status, 'attempt', job.attempt);
  END IF;
  IF job.status <> 'QUEUED' OR p_dispatch_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUTOMATION_JOB_NOT_QUEUEABLE';
  END IF;
  UPDATE public.automation_jobs SET
    status = 'DISPATCHED', dispatch_id = p_dispatch_id,
    error_code = NULL, error_message = NULL,
    updated_at = timezone('utc'::text, now())
  WHERE id = job.id RETURNING * INTO job;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'AUTOMATION_JOB_DISPATCHED', jsonb_build_object(
    'job_id', job.id, 'dispatch_id', p_dispatch_id, 'attempt', job.attempt
  ));
  RETURN jsonb_build_object('id', job.id, 'status', job.status, 'attempt', job.attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_automation_job_dispatch_failed(
  p_job_id UUID,
  p_error_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  job public.automation_jobs%ROWTYPE;
BEGIN
  SELECT * INTO job FROM public.automation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR actor_id IS NULL
     OR NOT (public.current_user_role() = 'ADMIN' OR job.requested_by = actor_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTOMATION_JOB_UPDATE_FORBIDDEN';
  END IF;
  IF job.status NOT IN ('QUEUED', 'DISPATCHED') THEN
    RETURN jsonb_build_object('id', job.id, 'status', job.status, 'attempt', job.attempt);
  END IF;
  UPDATE public.automation_jobs SET
    status = 'FAILED', error_code = left(coalesce(nullif(trim(p_error_code), ''), 'N8N_DISPATCH_FAILED'), 100),
    error_message = 'ส่งงานไปยังระบบอัตโนมัติไม่สำเร็จ', completed_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = job.id RETURNING * INTO job;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'AUTOMATION_JOB_DISPATCH_FAILED', jsonb_build_object(
    'job_id', job.id, 'error_code', job.error_code, 'attempt', job.attempt
  ));
  RETURN jsonb_build_object('id', job.id, 'status', job.status, 'attempt', job.attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_automation_job_retry(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  job public.automation_jobs%ROWTYPE;
BEGIN
  SELECT * INTO job FROM public.automation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR actor_id IS NULL
     OR public.current_user_role() NOT IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER')
     OR NOT (public.current_user_role() = 'ADMIN' OR job.requested_by = actor_id)
     OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(job.case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTOMATION_JOB_RETRY_FORBIDDEN';
  END IF;
  IF job.attempt >= job.max_attempts THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUTOMATION_JOB_RETRY_EXHAUSTED';
  END IF;
  IF job.status <> 'FAILED' AND NOT (
    job.status IN ('DISPATCHED', 'RUNNING')
    AND job.updated_at < timezone('utc'::text, now()) - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUTOMATION_JOB_NOT_RETRYABLE';
  END IF;

  UPDATE public.automation_jobs SET
    status = 'QUEUED', dispatch_id = NULL, external_execution_id = NULL,
    attempt = attempt + 1, error_code = NULL, error_message = NULL,
    started_at = NULL, completed_at = NULL, updated_at = timezone('utc'::text, now())
  WHERE id = job.id RETURNING * INTO job;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'AUTOMATION_JOB_RETRY_QUEUED', jsonb_build_object(
    'job_id', job.id, 'attempt', job.attempt
  ));
  RETURN jsonb_build_object('id', job.id, 'status', job.status, 'attempt', job.attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_automation_job(
  p_job_id UUID,
  p_dispatch_id UUID,
  p_external_execution_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job public.automation_jobs%ROWTYPE;
  input_text TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTOMATION_CALLBACK_FORBIDDEN';
  END IF;
  SELECT * INTO job FROM public.automation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR job.dispatch_id IS DISTINCT FROM p_dispatch_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_DISPATCH_INVALID';
  END IF;
  IF job.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('claim_state', 'SUCCEEDED', 'result_count', job.result_count);
  END IF;
  IF job.status = 'RUNNING' THEN
    RETURN jsonb_build_object('claim_state', 'RUNNING');
  END IF;
  IF job.status <> 'DISPATCHED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUTOMATION_JOB_NOT_CLAIMABLE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.evidence_files ef
    WHERE ef.id = job.evidence_id AND ef.case_id = job.case_id
      AND ef.upload_state = 'STORED' AND ef.malware_scan_status = 'CLEAN'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUTOMATION_EVIDENCE_NOT_CLEAN';
  END IF;
  SELECT source_text INTO input_text FROM public.automation_job_inputs WHERE job_id = job.id;
  IF input_text IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUTOMATION_INPUT_MISSING';
  END IF;

  UPDATE public.automation_jobs SET
    status = 'RUNNING', external_execution_id = left(nullif(trim(p_external_execution_id), ''), 200),
    started_at = coalesce(started_at, timezone('utc'::text, now())),
    updated_at = timezone('utc'::text, now())
  WHERE id = job.id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (job.requested_by, 'AUTOMATION_JOB_STARTED', jsonb_build_object(
    'job_id', job.id, 'dispatch_id', p_dispatch_id, 'attempt', job.attempt, 'executor', 'N8N'
  ));
  RETURN jsonb_build_object(
    'claim_state', 'CLAIMED', 'job_id', job.id, 'case_id', job.case_id,
    'evidence_id', job.evidence_id, 'page_number', job.page_number,
    'source_location', job.source_location, 'source_text', input_text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_automation_job(
  p_job_id UUID,
  p_dispatch_id UUID,
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
  job public.automation_jobs%ROWTYPE;
  input_text TEXT;
  candidate JSONB;
  suggestion_id UUID;
  suggestion_ids JSONB := '[]'::jsonb;
  candidate_type TEXT;
  candidate_value TEXT;
  candidate_reason TEXT;
  candidate_confidence DOUBLE PRECISION;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTOMATION_CALLBACK_FORBIDDEN';
  END IF;
  SELECT * INTO job FROM public.automation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR job.dispatch_id IS DISTINCT FROM p_dispatch_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_DISPATCH_INVALID';
  END IF;
  IF job.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('status', 'SUCCEEDED', 'result_count', job.result_count, 'duplicate', true);
  END IF;
  IF job.status <> 'RUNNING'
     OR jsonb_typeof(p_candidates) <> 'array' OR jsonb_array_length(p_candidates) > 20
     OR length(trim(p_provider)) NOT BETWEEN 1 AND 100
     OR length(trim(p_model)) NOT BETWEEN 1 AND 200
     OR length(trim(p_prompt_schema_version)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_RESULT_INVALID';
  END IF;
  SELECT source_text INTO input_text FROM public.automation_job_inputs WHERE job_id = job.id;
  IF input_text IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUTOMATION_INPUT_MISSING';
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
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_CANDIDATE_INVALID';
    END IF;
    INSERT INTO public.extraction_suggestions (
      case_id, evidence_id, page_number, source_text, source_location,
      entity_type, candidate_value, confidence, reason, provider, model,
      prompt_schema_version, status, created_by
    ) VALUES (
      job.case_id, job.evidence_id, job.page_number, input_text, job.source_location,
      candidate_type, candidate_value, candidate_confidence, candidate_reason,
      trim(p_provider), trim(p_model), trim(p_prompt_schema_version), 'SUGGESTED', job.requested_by
    ) RETURNING id INTO suggestion_id;
    suggestion_ids := suggestion_ids || to_jsonb(suggestion_id::text);
  END LOOP;

  UPDATE public.automation_jobs SET
    status = 'SUCCEEDED', provider = trim(p_provider), model = trim(p_model),
    prompt_schema_version = trim(p_prompt_schema_version), result_count = jsonb_array_length(p_candidates),
    error_code = NULL, error_message = NULL, completed_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = job.id;
  DELETE FROM public.automation_job_inputs WHERE job_id = job.id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (job.requested_by, 'AUTOMATION_JOB_SUCCEEDED', jsonb_build_object(
    'job_id', job.id, 'case_id', job.case_id, 'evidence_id', job.evidence_id,
    'provider', trim(p_provider), 'model', trim(p_model),
    'prompt_schema_version', trim(p_prompt_schema_version),
    'suggestion_count', jsonb_array_length(p_candidates), 'executor', 'N8N'
  ));
  RETURN jsonb_build_object(
    'status', 'SUCCEEDED', 'result_count', jsonb_array_length(p_candidates),
    'suggestion_ids', suggestion_ids, 'duplicate', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_automation_job(
  p_job_id UUID,
  p_dispatch_id UUID,
  p_error_code TEXT,
  p_error_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job public.automation_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTOMATION_CALLBACK_FORBIDDEN';
  END IF;
  SELECT * INTO job FROM public.automation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR job.dispatch_id IS DISTINCT FROM p_dispatch_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_DISPATCH_INVALID';
  END IF;
  IF job.status IN ('SUCCEEDED', 'FAILED') THEN
    RETURN jsonb_build_object('status', job.status, 'duplicate', true);
  END IF;
  UPDATE public.automation_jobs SET
    status = 'FAILED', error_code = left(coalesce(nullif(trim(p_error_code), ''), 'AUTOMATION_FAILED'), 100),
    error_message = left(coalesce(nullif(trim(p_error_message), ''), 'ระบบอัตโนมัติประมวลผลไม่สำเร็จ'), 500),
    completed_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
  WHERE id = job.id RETURNING * INTO job;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (job.requested_by, 'AUTOMATION_JOB_FAILED', jsonb_build_object(
    'job_id', job.id, 'error_code', job.error_code, 'attempt', job.attempt, 'executor', 'N8N'
  ));
  RETURN jsonb_build_object('status', job.status, 'duplicate', false);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_text_extraction_job(UUID, UUID, INTEGER, TEXT, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_automation_job_dispatched(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_automation_job_dispatch_failed(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_automation_job_retry(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_automation_job(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_automation_job(UUID, UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_automation_job(UUID, UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.queue_text_extraction_job(UUID, UUID, INTEGER, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_automation_job_dispatched(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_automation_job_dispatch_failed(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_automation_job_retry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_job(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_automation_job(UUID, UUID, JSONB, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_automation_job(UUID, UUID, TEXT, TEXT) TO service_role;
