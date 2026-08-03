-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper functions for checking membership/role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_case_member(case_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.case_members 
    WHERE case_members.case_id = $1 AND case_members.profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. Profiles Policies
CREATE POLICY "Users can read all profiles" ON public.profiles
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own profile name" ON public.profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Only admins can change roles" ON public.profiles
    FOR UPDATE USING (public.current_user_role() = 'ADMIN');

-- 2. Cases Policies
CREATE POLICY "Admins/Investigators can create cases" ON public.cases
    FOR INSERT WITH CHECK (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR'));

CREATE POLICY "Members or Admins can view cases" ON public.cases
    FOR SELECT USING (public.current_user_role() = 'ADMIN' OR public.is_case_member(id));

CREATE POLICY "Members or Admins can update cases" ON public.cases
    FOR UPDATE USING (public.current_user_role() = 'ADMIN' OR public.is_case_member(id));

-- 3. Case Members Policies
CREATE POLICY "Case members or Admins can read memberships" ON public.case_members
    FOR SELECT USING (public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id));

CREATE POLICY "Only case owners or Admins can add/remove members" ON public.case_members
    FOR ALL USING (
        public.current_user_role() = 'ADMIN' OR 
        EXISTS (
            SELECT 1 FROM public.case_members 
            WHERE case_members.case_id = case_members.case_id 
              AND case_members.profile_id = auth.uid() 
              AND case_members.role = 'OWNER'
        )
    );

-- 4. Evidence Files Policies (Immutable once uploaded, no UPDATE/DELETE)
CREATE POLICY "Members or Admins can read evidence metadata" ON public.evidence_files
    FOR SELECT USING (public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id));

CREATE POLICY "Investigators or Admins can add evidence" ON public.evidence_files
    FOR INSERT WITH CHECK (
        (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR')) 
        AND public.is_case_member(case_id)
    );

-- 5. Evidence Pages Policies
CREATE POLICY "Read evidence pages if case member/admin" ON public.evidence_pages
    FOR SELECT USING (
        public.current_user_role() = 'ADMIN' OR 
        EXISTS (
            SELECT 1 FROM public.evidence_files
            WHERE evidence_files.id = evidence_id AND public.is_case_member(evidence_files.case_id)
        )
    );

CREATE POLICY "Insert evidence pages if case member/admin" ON public.evidence_pages
    FOR INSERT WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'INVESTIGATOR') AND
        EXISTS (
            SELECT 1 FROM public.evidence_files
            WHERE evidence_files.id = evidence_id AND public.is_case_member(evidence_files.case_id)
        )
    );

-- 6. Extraction Jobs Policies
CREATE POLICY "Read extraction jobs" ON public.extraction_jobs
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Insert extraction jobs" ON public.extraction_jobs
    FOR INSERT WITH CHECK (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR'));

-- 7. OCR Blocks Policies
CREATE POLICY "Read OCR blocks" ON public.ocr_blocks
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Insert OCR blocks" ON public.ocr_blocks
    FOR INSERT WITH CHECK (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR'));

-- 8. Extracted Entities Policies
CREATE POLICY "Read entities" ON public.extracted_entities
    FOR SELECT USING (public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id));

CREATE POLICY "Insert/Update entities" ON public.extracted_entities
    FOR ALL USING (
        public.current_user_role() IN ('ADMIN', 'INVESTIGATOR') AND public.is_case_member(case_id)
    );

-- 9. Entity Mentions Policies
CREATE POLICY "Read mentions" ON public.entity_mentions
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Insert mentions" ON public.entity_mentions
    FOR INSERT WITH CHECK (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR'));

-- 10. Entity Relationships Policies
CREATE POLICY "Read relationships" ON public.entity_relationships
    FOR SELECT USING (public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id));

CREATE POLICY "Modify relationships" ON public.entity_relationships
    FOR ALL USING (
        public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER') AND public.is_case_member(case_id)
    );

-- 11. Relationship References Policies
-- Trigger to verify relationship has references before marking as VERIFIED
CREATE POLICY "All reference access" ON public.relationship_references
    FOR ALL USING (auth.uid() IS NOT NULL);

-- 12. Match Candidates Policies
CREATE POLICY "Read matches" ON public.match_candidates
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Verify/Dismiss matches (Reviewer/Admin only)" ON public.match_candidates
    FOR UPDATE USING (public.current_user_role() IN ('ADMIN', 'REVIEWER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'REVIEWER'));

-- 13. Reports Policies
CREATE POLICY "Read reports" ON public.reports
    FOR SELECT USING (public.current_user_role() = 'ADMIN' OR public.is_case_member(case_id));

CREATE POLICY "Modify reports" ON public.reports
    FOR ALL USING (
        public.current_user_role() IN ('ADMIN', 'INVESTIGATOR') AND public.is_case_member(case_id)
    );

-- 14. Audit Logs Policies (Append-only: SELECT, INSERT only. No UPDATE/DELETE)
CREATE POLICY "Insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Read audit logs (Admin/Investigator only)" ON public.audit_logs
    FOR SELECT USING (public.current_user_role() IN ('ADMIN', 'INVESTIGATOR'));

-- Relationship verification reference constraint trigger
CREATE OR REPLACE FUNCTION public.check_relationship_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'VERIFIED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.relationship_references 
      WHERE relationship_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot verify relationship without at least one evidence reference.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER verify_relationship_has_references
  BEFORE INSERT OR UPDATE ON public.entity_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.check_relationship_verification();
