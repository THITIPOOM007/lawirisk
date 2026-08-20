-- Migration 202608200003_report_immutability_and_closure.sql
-- Report immutability, automation cancellation, and exact-match hook.

-- 1. Add CANCELLED to automation_jobs status constraint if not present
ALTER TABLE public.automation_jobs DROP CONSTRAINT IF EXISTS automation_jobs_status_check;
ALTER TABLE public.automation_jobs ADD CONSTRAINT automation_jobs_status_check
  CHECK (status IN ('QUEUED', 'DISPATCHED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'));

-- 2. Protect reports immutability trigger
CREATE OR REPLACE FUNCTION public.protect_report_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'REPORT_IMMUTABLE_DELETE_PROHIBITED';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'REPORT_IMMUTABLE_UPDATE_PROHIBITED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_report_immutability ON public.reports;
CREATE TRIGGER protect_report_immutability
  BEFORE UPDATE OR DELETE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.protect_report_immutability();

-- 3. RPC function to manually cancel a failed or stuck automation job
CREATE OR REPLACE FUNCTION public.cancel_automation_job(
  p_job_id UUID,
  p_reason TEXT
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
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTOMATION_CANCEL_FORBIDDEN';
  END IF;
  IF length(trim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_CANCEL_REASON_REQUIRED';
  END IF;

  SELECT * INTO job FROM public.automation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AUTOMATION_JOB_NOT_FOUND';
  END IF;

  IF NOT (actor_role = 'ADMIN' OR public.is_case_member(job.case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTOMATION_CANCEL_FORBIDDEN';
  END IF;

  IF job.status IN ('SUCCEEDED', 'CANCELLED') THEN
    RETURN jsonb_build_object('id', job.id, 'status', job.status);
  END IF;

  UPDATE public.automation_jobs SET
    status = 'CANCELLED',
    error_code = 'MANUALLY_CANCELLED',
    error_message = trim(p_reason),
    completed_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = job.id RETURNING * INTO job;

  -- Clean up sensitive input if any
  DELETE FROM public.automation_job_inputs WHERE job_id = job.id;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'AUTOMATION_JOB_CANCELLED', jsonb_build_object(
    'job_id', job.id, 'case_id', job.case_id, 'reason', trim(p_reason)
  ));

  RETURN jsonb_build_object('id', job.id, 'status', job.status);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_automation_job(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_automation_job(UUID, TEXT) TO authenticated;
