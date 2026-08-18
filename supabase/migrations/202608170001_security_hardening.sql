-- Security hardening for EvidenceVerse Lite.
-- This migration closes cross-case reads, prevents profile role escalation,
-- makes intake scanning fail closed, and adds RLS to omnichannel tables.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Keep the original parameter name from 202607270002_rls.sql. PostgreSQL does
-- not allow CREATE OR REPLACE FUNCTION to rename input parameters while
-- dependent RLS policies still reference the function.
CREATE OR REPLACE FUNCTION public.is_case_member(case_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.case_members cm
    WHERE cm.case_id = $1 AND cm.profile_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_case_owner(target_case_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.case_members cm
    WHERE cm.case_id = target_case_id
      AND cm.profile_id = auth.uid()
      AND cm.role = 'OWNER'
  );
$$;

DROP POLICY IF EXISTS "Only case owners or Admins can add/remove members" ON public.case_members;
CREATE POLICY "Only case owners or Admins can add/remove members" ON public.case_members
  FOR ALL
  USING (public.current_user_role() = 'ADMIN' OR public.is_case_owner(case_id))
  WITH CHECK (public.current_user_role() = 'ADMIN' OR public.is_case_owner(case_id));

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND COALESCE(public.current_user_role(), 'VIEWER') <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only an administrator may change a profile role.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- Derived evidence records must remain scoped through the parent case.
DROP POLICY IF EXISTS "Read extraction jobs" ON public.extraction_jobs;
CREATE POLICY "Read extraction jobs by case" ON public.extraction_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.evidence_files ef
      WHERE ef.id = evidence_id
        AND (public.current_user_role() = 'ADMIN' OR public.is_case_member(ef.case_id))
    )
  );

DROP POLICY IF EXISTS "Insert extraction jobs" ON public.extraction_jobs;
CREATE POLICY "Insert extraction jobs by case" ON public.extraction_jobs
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
    AND EXISTS (
      SELECT 1 FROM public.evidence_files ef
      WHERE ef.id = evidence_id AND public.is_case_member(ef.case_id)
    )
  );

DROP POLICY IF EXISTS "Read OCR blocks" ON public.ocr_blocks;
CREATE POLICY "Read OCR blocks by case" ON public.ocr_blocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.evidence_pages ep
      JOIN public.evidence_files ef ON ef.id = ep.evidence_id
      WHERE ep.id = page_id
        AND (public.current_user_role() = 'ADMIN' OR public.is_case_member(ef.case_id))
    )
  );

DROP POLICY IF EXISTS "Insert OCR blocks" ON public.ocr_blocks;
CREATE POLICY "Insert OCR blocks by case" ON public.ocr_blocks
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
    AND EXISTS (
      SELECT 1
      FROM public.evidence_pages ep
      JOIN public.evidence_files ef ON ef.id = ep.evidence_id
      WHERE ep.id = page_id AND public.is_case_member(ef.case_id)
    )
  );

DROP POLICY IF EXISTS "Read mentions" ON public.entity_mentions;
CREATE POLICY "Read mentions by case" ON public.entity_mentions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.extracted_entities ee
      WHERE ee.id = entity_id
        AND (public.current_user_role() = 'ADMIN' OR public.is_case_member(ee.case_id))
    )
  );

DROP POLICY IF EXISTS "Insert mentions" ON public.entity_mentions;
CREATE POLICY "Insert mentions by case" ON public.entity_mentions
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
    AND EXISTS (
      SELECT 1 FROM public.extracted_entities ee
      WHERE ee.id = entity_id AND public.is_case_member(ee.case_id)
    )
  );

DROP POLICY IF EXISTS "All reference access" ON public.relationship_references;
CREATE POLICY "Read relationship references by case" ON public.relationship_references
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.entity_relationships er
      WHERE er.id = relationship_id
        AND (public.current_user_role() = 'ADMIN' OR public.is_case_member(er.case_id))
    )
  );
CREATE POLICY "Add relationship references by case" ON public.relationship_references
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER')
    AND EXISTS (
      SELECT 1 FROM public.entity_relationships er
      WHERE er.id = relationship_id AND public.is_case_member(er.case_id)
    )
  );

DROP POLICY IF EXISTS "Read matches" ON public.match_candidates;
CREATE POLICY "Read matches by case" ON public.match_candidates
  FOR SELECT USING (
    public.current_user_role() = 'ADMIN'
    OR (public.is_case_member(source_case_id) AND public.is_case_member(target_case_id))
  );

-- Intake attachments and envelopes are untrusted until an explicit scanner result.
UPDATE public.intake_envelopes SET malware_scan_status = 'PENDING' WHERE malware_scan_status IS NULL;
ALTER TABLE public.intake_envelopes ALTER COLUMN malware_scan_status SET DEFAULT 'PENDING';
ALTER TABLE public.intake_envelopes DROP CONSTRAINT IF EXISTS check_intake_malware_status;
ALTER TABLE public.intake_envelopes ADD CONSTRAINT check_intake_malware_status
  CHECK (malware_scan_status IN ('PENDING', 'CLEAN', 'INFECTED', 'UNAVAILABLE', 'ERROR'));

ALTER TABLE public.intake_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triage_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_intake(target_envelope_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER')
    AND EXISTS (
      SELECT 1 FROM public.intake_envelopes ie WHERE ie.id = target_envelope_id
    );
$$;

CREATE POLICY "Authenticated staff read intake channels" ON public.intake_channels
  FOR SELECT USING (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER'));
CREATE POLICY "Admins manage intake channels" ON public.intake_channels
  FOR ALL USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

CREATE POLICY "Staff read intake envelopes" ON public.intake_envelopes
  FOR SELECT USING (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER'));
CREATE POLICY "Investigators create intake envelopes" ON public.intake_envelopes
  FOR INSERT WITH CHECK (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR'));
CREATE POLICY "Staff triage intake envelopes" ON public.intake_envelopes
  FOR UPDATE USING (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER'));

CREATE POLICY "Staff read intake messages" ON public.intake_messages
  FOR SELECT USING (public.can_access_intake(envelope_id));
CREATE POLICY "Investigators add intake messages" ON public.intake_messages
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
    AND public.can_access_intake(envelope_id)
  );

CREATE POLICY "Staff read intake attachments" ON public.intake_attachments
  FOR SELECT USING (public.can_access_intake(envelope_id));
CREATE POLICY "Investigators add intake attachments" ON public.intake_attachments
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
    AND public.can_access_intake(envelope_id)
  );

CREATE POLICY "Staff read intake participants" ON public.intake_participants
  FOR SELECT USING (public.can_access_intake(envelope_id));
CREATE POLICY "Investigators add intake participants" ON public.intake_participants
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
    AND public.can_access_intake(envelope_id)
  );

CREATE POLICY "Staff read duplicate candidates" ON public.intake_duplicate_candidates
  FOR SELECT USING (public.can_access_intake(source_envelope_id));
CREATE POLICY "Investigators add duplicate candidates" ON public.intake_duplicate_candidates
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
    AND public.can_access_intake(source_envelope_id)
  );

CREATE POLICY "Staff read triage decisions" ON public.triage_decisions
  FOR SELECT USING (public.can_access_intake(envelope_id));
CREATE POLICY "Staff create triage decisions" ON public.triage_decisions
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER')
    AND public.can_access_intake(envelope_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Staff read external references" ON public.external_references
  FOR SELECT USING (
    (case_id IS NOT NULL AND (public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id)))
    OR (envelope_id IS NOT NULL AND public.can_access_intake(envelope_id))
  );
CREATE POLICY "Investigators add external references" ON public.external_references
  FOR INSERT WITH CHECK (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR'));

CREATE POLICY "Staff read import batches" ON public.import_batches
  FOR SELECT USING (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER'));
CREATE POLICY "Investigators create import batches" ON public.import_batches
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'INVESTIGATOR') AND created_by = auth.uid()
  );
CREATE POLICY "Staff read import rows" ON public.import_rows
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.import_batches ib WHERE ib.id = batch_id)
    AND public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER')
  );
CREATE POLICY "Investigators add import rows" ON public.import_rows
  FOR INSERT WITH CHECK (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR'));

-- Audit is append-only even if table grants are broadened later.
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated;

-- Evidence originals live in a private bucket. No UPDATE policy is created.
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence-vault', 'evidence-vault', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY "Case members upload evidence originals" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence-vault'
    AND public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_case_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "Case members read evidence originals" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence-vault'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND (public.current_user_role() = 'ADMIN' OR public.is_case_member(split_part(name, '/', 1)::uuid))
  );

CREATE POLICY "Remove only unregistered evidence uploads" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence-vault'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_case_member(split_part(name, '/', 1)::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.evidence_files ef WHERE ef.file_path = name)
  );
