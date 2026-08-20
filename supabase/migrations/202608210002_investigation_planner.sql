-- Phase 4: Investigation Planner
-- Creates tasks for investigators based on extracted entities

CREATE TABLE IF NOT EXISTS public.investigation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES public.extracted_entities(id) ON DELETE SET NULL,
  suggestion_id UUID REFERENCES public.extraction_suggestions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS investigation_tasks_case_idx ON public.investigation_tasks(case_id);
CREATE INDEX IF NOT EXISTS investigation_tasks_status_idx ON public.investigation_tasks(status);

ALTER TABLE public.investigation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tasks in their cases" ON public.investigation_tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.case_members
      WHERE case_members.case_id = investigation_tasks.case_id
      AND case_members.profile_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "Users can modify tasks in their cases" ON public.investigation_tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.case_members
      WHERE case_members.case_id = investigation_tasks.case_id
      AND case_members.profile_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Database trigger to automatically generate tasks when a suggestion is confirmed and an entity is created.
CREATE OR REPLACE FUNCTION public.generate_investigation_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.entity_type = 'BANK_ACCOUNT' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority)
    VALUES 
      (NEW.case_id, NEW.id, 'ตรวจสอบสถานะบัญชีม้า (AOC 1441)', 'นำเลขบัญชี ' || NEW.candidate_value || ' ไปตรวจสอบความเสี่ยงในระบบ AOC 1441', 'HIGH'),
      (NEW.case_id, NEW.id, 'ขอรายการเดินบัญชี (Statement)', 'ทำหนังสือถึงธนาคารเพื่อขอรายการเดินบัญชีย้อนหลังของ ' || NEW.candidate_value, 'MEDIUM');
  ELSIF NEW.entity_type = 'PHONE' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority)
    VALUES 
      (NEW.case_id, NEW.id, 'ตรวจสอบการลงทะเบียนซิม (NBTC)', 'ตรวจสอบชื่อผู้จดทะเบียนหมายเลข ' || NEW.candidate_value || ' จากฐานข้อมูล กสทช.', 'HIGH');
  ELSIF NEW.entity_type = 'PERSON' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority)
    VALUES 
      (NEW.case_id, NEW.id, 'ตรวจสอบทะเบียนราษฎร์', 'ตรวจสอบข้อมูลบุคคล ' || NEW.candidate_value || ' ในระบบทะเบียนราษฎร์', 'MEDIUM');
  ELSIF NEW.entity_type = 'ORGANIZATION' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority)
    VALUES 
      (NEW.case_id, NEW.id, 'ตรวจสอบการจดทะเบียนนิติบุคคล', 'ตรวจสอบข้อมูลนิติบุคคล ' || NEW.candidate_value || ' ที่กรมพัฒนาธุรกิจการค้า (DBD)', 'MEDIUM');
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to extracted_entities
DROP TRIGGER IF EXISTS trg_generate_investigation_tasks_on_entity_insert ON public.extracted_entities;
CREATE TRIGGER trg_generate_investigation_tasks_on_entity_insert
  AFTER INSERT ON public.extracted_entities
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_investigation_tasks();
