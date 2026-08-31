-- Source-bound preliminary checks created automatically from public complaints.
-- All rows remain SUGGESTED until a staff member verifies the cited source.

CREATE TABLE IF NOT EXISTS public.intake_source_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id UUID NOT NULL REFERENCES public.intake_envelopes(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  source_key TEXT NOT NULL CONSTRAINT check_intake_source_check_source
    CHECK (source_key IN ('FDA_PUBLIC', 'HSS_PUBLIC_CLINIC', 'HSS_PUBLIC_HEALTH_BUSINESS')),
  source_label TEXT NOT NULL,
  source_url TEXT NOT NULL,
  query_text TEXT NOT NULL CONSTRAINT check_intake_source_check_query
    CHECK (length(trim(query_text)) BETWEEN 2 AND 200),
  query_kind TEXT NOT NULL CONSTRAINT check_intake_source_check_kind
    CHECK (query_kind IN ('PRODUCT_OR_LICENSE', 'CLINIC_OR_LICENSE', 'HEALTH_BUSINESS_OR_LICENSE')),
  source_category TEXT NOT NULL,
  routing_reason TEXT NOT NULL,
  status TEXT NOT NULL CONSTRAINT check_intake_source_check_status
    CHECK (status IN ('FOUND', 'NOT_FOUND', 'UNAVAILABLE')),
  classification TEXT NOT NULL DEFAULT 'SUGGESTED'
    CONSTRAINT check_intake_source_check_classification CHECK (classification = 'SUGGESTED'),
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count BETWEEN 0 AND 10),
  summary TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT check_intake_source_check_results CHECK (
      jsonb_typeof(results) = 'array'
      AND jsonb_array_length(results) <= 10
      AND octet_length(results::text) <= 131072
    ),
  checked_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.intake_source_checks
  ADD CONSTRAINT check_intake_source_check_url_allowlist CHECK (
    (source_key = 'FDA_PUBLIC' AND source_url = 'https://porta.fda.moph.go.th/fda_search_center_new/')
    OR (source_key = 'HSS_PUBLIC_CLINIC' AND source_url = 'https://privatehospital.hss.moph.go.th/s_view_hospital.php')
    OR (source_key = 'HSS_PUBLIC_HEALTH_BUSINESS' AND source_url = 'https://spa-services.hss.moph.go.th/permit/spa/establishment')
  );

CREATE UNIQUE INDEX IF NOT EXISTS intake_source_checks_envelope_source_query_key
  ON public.intake_source_checks (envelope_id, source_key, lower(query_text));
CREATE INDEX IF NOT EXISTS intake_source_checks_envelope_created_idx
  ON public.intake_source_checks (envelope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS intake_source_checks_case_created_idx
  ON public.intake_source_checks (case_id, created_at DESC) WHERE case_id IS NOT NULL;

ALTER TABLE public.intake_source_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read source checks for accessible intake or case"
  ON public.intake_source_checks FOR SELECT
  USING (
    public.can_access_intake(envelope_id)
    OR (case_id IS NOT NULL AND (public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id)))
  );

-- Linking is part of the same triage transaction: promoted/merged cases inherit the
-- preliminary official-source checks without changing them into confirmed evidence.
CREATE OR REPLACE FUNCTION public.link_intake_source_checks_to_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.destination_case_id IS NOT NULL THEN
    UPDATE public.intake_source_checks
    SET case_id = NEW.destination_case_id,
        updated_at = timezone('utc'::text, now())
    WHERE envelope_id = NEW.envelope_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS link_intake_source_checks_after_triage ON public.triage_decisions;
CREATE TRIGGER link_intake_source_checks_after_triage
AFTER INSERT ON public.triage_decisions
FOR EACH ROW EXECUTE FUNCTION public.link_intake_source_checks_to_case();

REVOKE ALL ON public.intake_source_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.intake_source_checks TO authenticated;
