-- Evidence relevance screening is advisory until a reviewer confirms it.
CREATE TABLE IF NOT EXISTS public.evidence_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES public.evidence_files(id) ON DELETE RESTRICT,
  classification TEXT NOT NULL CHECK (classification IN (
    'DIRECT', 'CORROBORATIVE', 'CONTRADICTORY', 'CONTEXTUAL',
    'DUPLICATE', 'LOW_RELEVANCE', 'REVIEW_REQUIRED'
  )),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 4000),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source_trace JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT NOT NULL DEFAULT 'LAWIRISK_RULE_ENGINE',
  model TEXT NOT NULL DEFAULT 'source-trace-v1',
  status TEXT NOT NULL DEFAULT 'SUGGESTED' CHECK (status IN ('SUGGESTED', 'CONFIRMED', 'REJECTED', 'UNCERTAIN')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_reason TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (case_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS evidence_screenings_case_status_idx
  ON public.evidence_screenings (case_id, status, updated_at DESC);

ALTER TABLE public.evidence_screenings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read evidence screenings by case" ON public.evidence_screenings;
CREATE POLICY "Read evidence screenings by case" ON public.evidence_screenings
  FOR SELECT USING (public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id));

CREATE OR REPLACE FUNCTION public.refresh_evidence_screenings(p_case_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  affected_count INTEGER := 0;
BEGIN
  IF actor_id IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER')
     OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(p_case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCREENING_REFRESH_FORBIDDEN';
  END IF;

  WITH evidence_signals AS (
    SELECT
      ef.id AS evidence_id,
      count(DISTINCT em.id) AS mention_count,
      count(DISTINCT rr.id) AS reference_count,
      count(DISTINCT es.id) FILTER (WHERE es.status IN ('SUGGESTED', 'UNCERTAIN')) AS pending_count,
      count(DISTINCT shared.entity_id) AS shared_entity_count,
      coalesce(jsonb_agg(DISTINCT jsonb_build_object(
        'entity_id', ee.id,
        'entity_type', ee.type,
        'page_number', ep.page_number
      )) FILTER (WHERE ee.id IS NOT NULL), '[]'::jsonb) AS entity_trace
    FROM public.evidence_files ef
    LEFT JOIN public.evidence_pages ep ON ep.evidence_id = ef.id
    LEFT JOIN public.entity_mentions em ON em.page_id = ep.id AND nullif(trim(em.snippet), '') IS NOT NULL
    LEFT JOIN public.extracted_entities ee ON ee.id = em.entity_id AND ee.case_id = ef.case_id
    LEFT JOIN public.relationship_references rr ON rr.evidence_id = ef.id
      AND EXISTS (
        SELECT 1 FROM public.entity_relationships er
        WHERE er.id = rr.relationship_id AND er.case_id = ef.case_id AND er.status = 'VERIFIED'
      )
    LEFT JOIN public.extraction_suggestions es ON es.evidence_id = ef.id AND es.case_id = ef.case_id
    LEFT JOIN LATERAL (
      SELECT DISTINCT em_self.entity_id
      FROM public.evidence_pages ep_self
      JOIN public.entity_mentions em_self ON em_self.page_id = ep_self.id
      WHERE ep_self.evidence_id = ef.id
        AND EXISTS (
          SELECT 1
          FROM public.evidence_pages ep_other
          JOIN public.entity_mentions em_other ON em_other.page_id = ep_other.id
          WHERE ep_other.evidence_id <> ef.id AND em_other.entity_id = em_self.entity_id
        )
    ) shared ON true
    WHERE ef.case_id = p_case_id
      AND ef.upload_state = 'STORED'
      AND ef.malware_scan_status IN ('CLEAN', 'NOT_SCANNED')
    GROUP BY ef.id
  ), upserted AS (
    INSERT INTO public.evidence_screenings (
      case_id, evidence_id, classification, summary, reason, confidence,
      source_trace, provider, model, status, created_by, updated_at
    )
    SELECT
      p_case_id,
      signal.evidence_id,
      CASE
        WHEN signal.shared_entity_count > 0 THEN 'CORROBORATIVE'
        WHEN signal.mention_count > 0 OR signal.reference_count > 0 THEN 'DIRECT'
        WHEN signal.pending_count > 0 THEN 'REVIEW_REQUIRED'
        ELSE 'CONTEXTUAL'
      END,
      CASE
        WHEN signal.shared_entity_count > 0 THEN 'พบข้อมูลที่ยืนยันแล้วร่วมกับหลักฐานชิ้นอื่น'
        WHEN signal.mention_count > 0 OR signal.reference_count > 0 THEN 'พบข้อมูลหรือความสัมพันธ์ที่ยืนยันแล้วและย้อนกลับถึงต้นฉบับได้'
        WHEN signal.pending_count > 0 THEN 'พบข้อเสนอจากระบบอัตโนมัติที่ยังรอเจ้าหน้าที่ตรวจทาน'
        ELSE 'เก็บไว้เป็นข้อมูลประกอบ แต่ยังไม่มีข้อเท็จจริงที่ยืนยันแล้ว'
      END,
      format(
        'อ้างอิงจากข้อมูลยืนยัน %s รายการ, ความสัมพันธ์ยืนยัน %s รายการ, ข้อเสนอรอตรวจ %s รายการ และข้อมูลร่วมกับไฟล์อื่น %s รายการ',
        signal.mention_count, signal.reference_count, signal.pending_count, signal.shared_entity_count
      ),
      CASE
        WHEN signal.shared_entity_count > 0 THEN 0.95
        WHEN signal.mention_count > 0 OR signal.reference_count > 0 THEN 0.90
        WHEN signal.pending_count > 0 THEN 0.60
        ELSE 0.35
      END,
      jsonb_build_object(
        'confirmed_mentions', signal.mention_count,
        'verified_relationship_references', signal.reference_count,
        'pending_suggestions', signal.pending_count,
        'shared_entities', signal.shared_entity_count,
        'entities', signal.entity_trace
      ),
      'LAWIRISK_RULE_ENGINE', 'source-trace-v1', 'SUGGESTED', actor_id, timezone('utc'::text, now())
    FROM evidence_signals signal
    ON CONFLICT (case_id, evidence_id) DO UPDATE SET
      classification = EXCLUDED.classification,
      summary = EXCLUDED.summary,
      reason = EXCLUDED.reason,
      confidence = EXCLUDED.confidence,
      source_trace = EXCLUDED.source_trace,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      status = CASE
        WHEN public.evidence_screenings.status IN ('CONFIRMED', 'REJECTED')
          THEN public.evidence_screenings.status
        ELSE 'SUGGESTED'
      END,
      reviewed_by = CASE
        WHEN public.evidence_screenings.status IN ('CONFIRMED', 'REJECTED')
          THEN public.evidence_screenings.reviewed_by
        ELSE NULL
      END,
      review_reason = CASE
        WHEN public.evidence_screenings.status IN ('CONFIRMED', 'REJECTED')
          THEN public.evidence_screenings.review_reason
        ELSE NULL
      END,
      reviewed_at = CASE
        WHEN public.evidence_screenings.status IN ('CONFIRMED', 'REJECTED')
          THEN public.evidence_screenings.reviewed_at
        ELSE NULL
      END,
      updated_at = timezone('utc'::text, now())
    RETURNING 1
  )
  SELECT count(*) INTO affected_count FROM upserted;

  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_SCREENING_REFRESH', jsonb_build_object(
    'case_id', p_case_id, 'screening_count', affected_count, 'engine', 'source-trace-v1'
  ));
  RETURN affected_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_evidence_screening(
  p_screening_id UUID,
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
  screening public.evidence_screenings%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'REVIEWER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCREENING_REVIEW_FORBIDDEN';
  END IF;
  IF p_decision NOT IN ('CONFIRMED', 'REJECTED', 'UNCERTAIN')
     OR length(trim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SCREENING_REVIEW_INVALID';
  END IF;
  SELECT * INTO screening FROM public.evidence_screenings WHERE id = p_screening_id FOR UPDATE;
  IF NOT FOUND OR screening.status NOT IN ('SUGGESTED', 'UNCERTAIN')
     OR NOT (public.current_user_role() = 'ADMIN' OR public.is_case_member(screening.case_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SCREENING_NOT_REVIEWABLE';
  END IF;
  IF p_decision = 'CONFIRMED' AND NOT EXISTS (
    SELECT 1 FROM public.evidence_files ef
    WHERE ef.id = screening.evidence_id AND ef.case_id = screening.case_id
      AND ef.upload_state = 'STORED' AND ef.malware_scan_status = 'CLEAN'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SCREENING_SOURCE_NOT_CLEAN';
  END IF;

  UPDATE public.evidence_screenings SET
    status = p_decision,
    reviewed_by = actor_id,
    review_reason = trim(p_reason),
    reviewed_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_screening_id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'EVIDENCE_SCREENING_REVIEW', jsonb_build_object(
    'screening_id', p_screening_id, 'case_id', screening.case_id,
    'evidence_id', screening.evidence_id, 'decision', p_decision
  ));
  RETURN jsonb_build_object('id', p_screening_id, 'status', p_decision);
END;
$$;

-- Add the structured prediction/follow-up form without weakening immutable snapshots.
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
  IF p_report_type NOT IN ('SUMMARY', 'OVERLAP', 'PREDICTION_FORM') OR length(trim(p_title)) NOT BETWEEN 1 AND 300
     OR length(p_content) NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPORT_INPUT_INVALID';
  END IF;
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
    'evidence_id', source.evidence_id, 'sha256', source.sha256, 'page_number', source.page_number
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
    'report_type', p_report_type, 'source_count', jsonb_array_length(snapshot)
  ));
  RETURN report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_evidence_screenings(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_evidence_screening(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_evidence_screenings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_evidence_screening(UUID, TEXT, TEXT) TO authenticated;
