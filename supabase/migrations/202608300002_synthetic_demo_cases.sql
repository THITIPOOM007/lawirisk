-- Three fully linked synthetic cases for staging demonstrations.
-- Every user-visible title and evidence body states that it is test data.

-- Repair the legacy planner trigger contract before seeding entities. The
-- canonical extracted_entities columns are type/value (not entity_type/candidate_value).
CREATE OR REPLACE FUNCTION public.generate_investigation_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.type = 'BANK_ACCOUNT' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority, created_by)
    VALUES
      (NEW.case_id, NEW.id, 'ตรวจสอบสถานะบัญชีม้า (AOC 1441)', 'ตรวจสอบความเสี่ยงของข้อมูลบัญชีผ่านช่องทางที่ได้รับอนุญาต', 'HIGH', auth.uid()),
      (NEW.case_id, NEW.id, 'ขอรายการเดินบัญชี (Statement)', 'จัดทำคำขอรายการเดินบัญชีตามขั้นตอนที่ได้รับอนุมัติ', 'MEDIUM', auth.uid());
  ELSIF NEW.type = 'PHONE' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority, created_by)
    VALUES (NEW.case_id, NEW.id, 'ตรวจสอบการลงทะเบียนซิม (NBTC)', 'ตรวจสอบผู้จดทะเบียนผ่านช่องทางที่ได้รับอนุญาต', 'HIGH', auth.uid());
  ELSIF NEW.type = 'PERSON' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority, created_by)
    VALUES (NEW.case_id, NEW.id, 'ตรวจสอบทะเบียนราษฎร์', 'ตรวจสอบข้อมูลผ่านช่องทางที่ได้รับอนุญาตและบันทึกแหล่งอ้างอิง', 'MEDIUM', auth.uid());
  ELSIF NEW.type = 'ORGANIZATION' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority, created_by)
    VALUES (NEW.case_id, NEW.id, 'ตรวจสอบการจดทะเบียนนิติบุคคล', 'ตรวจสอบข้อมูลนิติบุคคลผ่านช่องทางที่ได้รับอนุญาต', 'MEDIUM', auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO public.cases (
  id, number, title, description, status, jurisdiction_region, jurisdiction_agency, created_by
) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'DEMO-2569-001', '[ข้อมูลทดสอบ] ตรวจสอบแหล่งผลิตน้ำดื่มสังเคราะห์',
   '[SYNTHETIC TEST DATA] เรื่องจำลองสำหรับทดสอบระบบ: ตรวจสอบฉลาก แหล่งผลิต และความเชื่อมโยงของสถานที่ผลิตน้ำดื่ม ไม่มีบุคคลหรือกิจการจริง',
   'ACTIVE', 'จังหวัดศรีสะเกษ (พื้นที่จำลอง)', 'หน่วยงานสาธิต LAW-i-RISK', NULL),
  ('d0000000-0000-4000-8000-000000000002', 'DEMO-2569-002', '[ข้อมูลทดสอบ] โฆษณาผลิตภัณฑ์สุขภาพออนไลน์สังเคราะห์',
   '[SYNTHETIC TEST DATA] เรื่องจำลองสำหรับทดสอบระบบ: วิเคราะห์หน้าโฆษณา ช่องทางติดต่อ และเส้นทางการชำระเงิน ไม่มีบุคคลหรือธุรกรรมจริง',
   'ACTIVE', 'ช่องทางออนไลน์ (ข้อมูลจำลอง)', 'หน่วยงานสาธิต LAW-i-RISK', NULL),
  ('d0000000-0000-4000-8000-000000000003', 'DEMO-2569-003', '[ข้อมูลทดสอบ] ตรวจสอบใบอนุญาตสถานประกอบการสุขภาพสังเคราะห์',
   '[SYNTHETIC TEST DATA] เรื่องจำลองสำหรับทดสอบระบบ: เปรียบเทียบข้อมูลร้องเรียน รายการใบอนุญาตสาธารณะ และบันทึกลงพื้นที่ ไม่มีสถานประกอบการจริง',
   'ACTIVE', 'อำเภอตัวอย่าง จังหวัดศรีสะเกษ', 'หน่วยงานสาธิต LAW-i-RISK', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.case_members (case_id, profile_id, role)
SELECT demo_case.id, profile.id,
  CASE WHEN profile.role IN ('ADMIN', 'INVESTIGATOR') THEN 'OWNER' ELSE 'MEMBER' END
FROM public.cases demo_case
CROSS JOIN public.profiles profile
WHERE demo_case.id IN (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003'
)
ON CONFLICT (case_id, profile_id) DO NOTHING;

WITH evidence_seed(id, case_id, filename, body) AS (VALUES
  ('d1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'DEMO-01-บันทึกรับเรื่อง.txt', '[SYNTHETIC TEST DATA]\nบันทึกรับเรื่องจำลอง: พบผลิตภัณฑ์น้ำดื่มชื่อ เดโม อควา บนฉลากระบุผู้ผลิต บริษัท ไพรม์วอเตอร์ เดโม จำกัด ติดต่อ 099-000-1001 และระบุสถานที่ อำเภอตัวอย่าง จังหวัดศรีสะเกษ\nเอกสารนี้สร้างเพื่อทดสอบระบบเท่านั้น'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'DEMO-01-ผลค้นทะเบียนสาธารณะ.txt', '[SYNTHETIC TEST DATA]\nผลค้นจำลองจากทะเบียนสาธารณะ: บริษัท ไพรม์วอเตอร์ เดโม จำกัด ที่ตั้ง อำเภอตัวอย่าง จังหวัดศรีสะเกษ สถานะต้องตรวจยืนยันกับระบบต้นทาง\nเอกสารนี้ไม่ใช่ผลทะเบียนจริง'),
  ('d1000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'DEMO-01-บันทึกภาพและสถานที่.txt', '[SYNTHETIC TEST DATA]\nบันทึกภาพจำลอง: ป้ายสถานที่แสดงชื่อ บริษัท ไพรม์วอเตอร์ เดโม จำกัด และหมายเลข 099-000-1001 พิกัดเป็นพื้นที่จำลอง ไม่มีภาพบุคคลจริง'),

  ('d1000000-0000-4000-8000-000000000011'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'DEMO-02-หน้าโฆษณาออนไลน์.txt', '[SYNTHETIC TEST DATA]\nภาพหน้าโฆษณาจำลองของ ร้านไลฟ์เวลล์ เดโม ระบุข้อความผลิตภัณฑ์สุขภาพและช่องทางติดต่อ 099-000-2002 ไม่มีการกล่าวอ้างถึงบุคคลจริง'),
  ('d1000000-0000-4000-8000-000000000012'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'DEMO-02-เส้นทางชำระเงิน.txt', '[SYNTHETIC TEST DATA]\nหลักฐานธุรกรรมจำลอง: ช่องทางชำระเงิน TEST-ACCOUNT-2002 เชื่อมกับคำสั่งซื้อทดสอบของ ร้านไลฟ์เวลล์ เดโม ไม่มีบัญชีหรือเงินจริง'),
  ('d1000000-0000-4000-8000-000000000013'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'DEMO-02-บันทึกการติดต่อ.txt', '[SYNTHETIC TEST DATA]\nบันทึกการติดต่อจำลอง: หมายเลข 099-000-2002 ใช้ตอบข้อความของ ร้านไลฟ์เวลล์ เดโม ข้อมูลทั้งหมดสร้างเพื่อทดสอบ'),

  ('d1000000-0000-4000-8000-000000000021'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'DEMO-03-รายละเอียดเรื่องร้องเรียน.txt', '[SYNTHETIC TEST DATA]\nเรื่องร้องเรียนจำลองเกี่ยวกับ เดโมเวลเนส เซ็นเตอร์ ผู้ประสานงาน นายทดสอบ ระบบดี ติดต่อ 099-000-3003 ตั้งอยู่ที่ อำเภอตัวอย่าง จังหวัดศรีสะเกษ'),
  ('d1000000-0000-4000-8000-000000000022'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'DEMO-03-รายการใบอนุญาตสาธารณะ.txt', '[SYNTHETIC TEST DATA]\nทะเบียนจำลอง: เดโมเวลเนส เซ็นเตอร์ ผู้ดำเนินการ นายทดสอบ ระบบดี สถานะใบอนุญาตต้องตรวจยืนยันกับระบบต้นทาง เอกสารนี้ไม่ใช่ทะเบียนจริง'),
  ('d1000000-0000-4000-8000-000000000023'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'DEMO-03-บันทึกลงพื้นที่.txt', '[SYNTHETIC TEST DATA]\nบันทึกลงพื้นที่จำลอง: พบป้าย เดโมเวลเนส เซ็นเตอร์ ที่ อำเภอตัวอย่าง จังหวัดศรีสะเกษ และหมายเลข 099-000-3003 ไม่มีการลงพื้นที่จริง')
)
INSERT INTO public.evidence_files (
  id, case_id, filename, file_path, file_size, mime_type, sha256, status,
  upload_state, malware_scan_status, malware_scan_details, uploaded_at,
  file_validation_details, file_validated_at, created_by
)
SELECT
  id, case_id, filename, 'synthetic-demo/' || case_id::text || '/' || id::text || '.txt',
  octet_length(convert_to(replace(body, '\n', chr(10)), 'UTF8')), 'text/plain',
  encode(extensions.digest(convert_to(replace(body, '\n', chr(10)), 'UTF8'), 'sha256'), 'hex'),
  'PROCESSED', 'STORED', 'NOT_SCANNED',
  jsonb_build_object('synthetic_test_data', true, 'scanner_required', false),
  timezone('utc'::text, now()),
  jsonb_build_object('mode', 'SYNTHETIC_TEST_FIXTURE', 'mime_verified', true, 'utf8_verified', true),
  timezone('utc'::text, now()), NULL
FROM evidence_seed
ON CONFLICT (id) DO NOTHING;

WITH evidence_seed(id, body) AS (VALUES
  ('d1000000-0000-4000-8000-000000000001'::uuid, '[SYNTHETIC TEST DATA]\nบันทึกรับเรื่องจำลอง: พบผลิตภัณฑ์น้ำดื่มชื่อ เดโม อควา บนฉลากระบุผู้ผลิต บริษัท ไพรม์วอเตอร์ เดโม จำกัด ติดต่อ 099-000-1001 และระบุสถานที่ อำเภอตัวอย่าง จังหวัดศรีสะเกษ\nเอกสารนี้สร้างเพื่อทดสอบระบบเท่านั้น'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, '[SYNTHETIC TEST DATA]\nผลค้นจำลองจากทะเบียนสาธารณะ: บริษัท ไพรม์วอเตอร์ เดโม จำกัด ที่ตั้ง อำเภอตัวอย่าง จังหวัดศรีสะเกษ สถานะต้องตรวจยืนยันกับระบบต้นทาง\nเอกสารนี้ไม่ใช่ผลทะเบียนจริง'),
  ('d1000000-0000-4000-8000-000000000003'::uuid, '[SYNTHETIC TEST DATA]\nบันทึกภาพจำลอง: ป้ายสถานที่แสดงชื่อ บริษัท ไพรม์วอเตอร์ เดโม จำกัด และหมายเลข 099-000-1001 พิกัดเป็นพื้นที่จำลอง ไม่มีภาพบุคคลจริง'),
  ('d1000000-0000-4000-8000-000000000011'::uuid, '[SYNTHETIC TEST DATA]\nภาพหน้าโฆษณาจำลองของ ร้านไลฟ์เวลล์ เดโม ระบุข้อความผลิตภัณฑ์สุขภาพและช่องทางติดต่อ 099-000-2002 ไม่มีการกล่าวอ้างถึงบุคคลจริง'),
  ('d1000000-0000-4000-8000-000000000012'::uuid, '[SYNTHETIC TEST DATA]\nหลักฐานธุรกรรมจำลอง: ช่องทางชำระเงิน TEST-ACCOUNT-2002 เชื่อมกับคำสั่งซื้อทดสอบของ ร้านไลฟ์เวลล์ เดโม ไม่มีบัญชีหรือเงินจริง'),
  ('d1000000-0000-4000-8000-000000000013'::uuid, '[SYNTHETIC TEST DATA]\nบันทึกการติดต่อจำลอง: หมายเลข 099-000-2002 ใช้ตอบข้อความของ ร้านไลฟ์เวลล์ เดโม ข้อมูลทั้งหมดสร้างเพื่อทดสอบ'),
  ('d1000000-0000-4000-8000-000000000021'::uuid, '[SYNTHETIC TEST DATA]\nเรื่องร้องเรียนจำลองเกี่ยวกับ เดโมเวลเนส เซ็นเตอร์ ผู้ประสานงาน นายทดสอบ ระบบดี ติดต่อ 099-000-3003 ตั้งอยู่ที่ อำเภอตัวอย่าง จังหวัดศรีสะเกษ'),
  ('d1000000-0000-4000-8000-000000000022'::uuid, '[SYNTHETIC TEST DATA]\nทะเบียนจำลอง: เดโมเวลเนส เซ็นเตอร์ ผู้ดำเนินการ นายทดสอบ ระบบดี สถานะใบอนุญาตต้องตรวจยืนยันกับระบบต้นทาง เอกสารนี้ไม่ใช่ทะเบียนจริง'),
  ('d1000000-0000-4000-8000-000000000023'::uuid, '[SYNTHETIC TEST DATA]\nบันทึกลงพื้นที่จำลอง: พบป้าย เดโมเวลเนส เซ็นเตอร์ ที่ อำเภอตัวอย่าง จังหวัดศรีสะเกษ และหมายเลข 099-000-3003 ไม่มีการลงพื้นที่จริง')
)
INSERT INTO public.evidence_pages (id, evidence_id, page_number, text_content)
SELECT ('d2000000-0000-4000-8000-' || right(id::text, 12))::uuid, id, 1, replace(body, '\n', chr(10))
FROM evidence_seed
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.extracted_entities (id, case_id, type, value, normalized_value) VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'ORGANIZATION', 'บริษัท ไพรม์วอเตอร์ เดโม จำกัด', 'บริษัท ไพรม์วอเตอร์ เดโม จำกัด'),
  ('d3000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'PHONE', '099-000-1001', '0990001001'),
  ('d3000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'LOCATION', 'อำเภอตัวอย่าง จังหวัดศรีสะเกษ', 'อำเภอตัวอย่าง จังหวัดศรีสะเกษ'),
  ('d3000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000002', 'ORGANIZATION', 'ร้านไลฟ์เวลล์ เดโม', 'ร้านไลฟ์เวลล์ เดโม'),
  ('d3000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000002', 'PHONE', '099-000-2002', '0990002002'),
  ('d3000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000002', 'BANK_ACCOUNT', 'TEST-ACCOUNT-2002', 'TESTACCOUNT2002'),
  ('d3000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000003', 'ORGANIZATION', 'เดโมเวลเนส เซ็นเตอร์', 'เดโมเวลเนส เซ็นเตอร์'),
  ('d3000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-000000000003', 'PERSON', 'นายทดสอบ ระบบดี', 'นายทดสอบ ระบบดี'),
  ('d3000000-0000-4000-8000-000000000023', 'd0000000-0000-4000-8000-000000000003', 'LOCATION', 'อำเภอตัวอย่าง จังหวัดศรีสะเกษ', 'อำเภอตัวอย่าง จังหวัดศรีสะเกษ'),
  ('d3000000-0000-4000-8000-000000000024', 'd0000000-0000-4000-8000-000000000003', 'PHONE', '099-000-3003', '0990003003')
ON CONFLICT (id) DO NOTHING;

-- Mentions deliberately repeat entities across evidence so the screening graph shows corroboration.
INSERT INTO public.entity_mentions (id, entity_id, page_id, snippet, confidence) VALUES
  ('d4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '[SYNTHETIC] บริษัท ไพรม์วอเตอร์ เดโม จำกัด', 1),
  ('d4000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', '[SYNTHETIC] 099-000-1001', 1),
  ('d4000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', '[SYNTHETIC] อำเภอตัวอย่าง จังหวัดศรีสะเกษ', 1),
  ('d4000000-0000-4000-8000-000000000004', 'd3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', '[SYNTHETIC] บริษัท ไพรม์วอเตอร์ เดโม จำกัด', 1),
  ('d4000000-0000-4000-8000-000000000005', 'd3000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000002', '[SYNTHETIC] อำเภอตัวอย่าง จังหวัดศรีสะเกษ', 1),
  ('d4000000-0000-4000-8000-000000000006', 'd3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000003', '[SYNTHETIC] บริษัท ไพรม์วอเตอร์ เดโม จำกัด', 1),
  ('d4000000-0000-4000-8000-000000000007', 'd3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003', '[SYNTHETIC] 099-000-1001', 1),

  ('d4000000-0000-4000-8000-000000000011', 'd3000000-0000-4000-8000-000000000011', 'd2000000-0000-4000-8000-000000000011', '[SYNTHETIC] ร้านไลฟ์เวลล์ เดโม', 1),
  ('d4000000-0000-4000-8000-000000000012', 'd3000000-0000-4000-8000-000000000012', 'd2000000-0000-4000-8000-000000000011', '[SYNTHETIC] 099-000-2002', 1),
  ('d4000000-0000-4000-8000-000000000013', 'd3000000-0000-4000-8000-000000000013', 'd2000000-0000-4000-8000-000000000012', '[SYNTHETIC] TEST-ACCOUNT-2002', 1),
  ('d4000000-0000-4000-8000-000000000014', 'd3000000-0000-4000-8000-000000000011', 'd2000000-0000-4000-8000-000000000012', '[SYNTHETIC] ร้านไลฟ์เวลล์ เดโม', 1),
  ('d4000000-0000-4000-8000-000000000015', 'd3000000-0000-4000-8000-000000000012', 'd2000000-0000-4000-8000-000000000013', '[SYNTHETIC] 099-000-2002', 1),
  ('d4000000-0000-4000-8000-000000000016', 'd3000000-0000-4000-8000-000000000011', 'd2000000-0000-4000-8000-000000000013', '[SYNTHETIC] ร้านไลฟ์เวลล์ เดโม', 1),

  ('d4000000-0000-4000-8000-000000000021', 'd3000000-0000-4000-8000-000000000021', 'd2000000-0000-4000-8000-000000000021', '[SYNTHETIC] เดโมเวลเนส เซ็นเตอร์', 1),
  ('d4000000-0000-4000-8000-000000000022', 'd3000000-0000-4000-8000-000000000022', 'd2000000-0000-4000-8000-000000000021', '[SYNTHETIC] นายทดสอบ ระบบดี', 1),
  ('d4000000-0000-4000-8000-000000000023', 'd3000000-0000-4000-8000-000000000023', 'd2000000-0000-4000-8000-000000000021', '[SYNTHETIC] อำเภอตัวอย่าง จังหวัดศรีสะเกษ', 1),
  ('d4000000-0000-4000-8000-000000000024', 'd3000000-0000-4000-8000-000000000021', 'd2000000-0000-4000-8000-000000000022', '[SYNTHETIC] เดโมเวลเนส เซ็นเตอร์', 1),
  ('d4000000-0000-4000-8000-000000000025', 'd3000000-0000-4000-8000-000000000022', 'd2000000-0000-4000-8000-000000000022', '[SYNTHETIC] นายทดสอบ ระบบดี', 1),
  ('d4000000-0000-4000-8000-000000000026', 'd3000000-0000-4000-8000-000000000021', 'd2000000-0000-4000-8000-000000000023', '[SYNTHETIC] เดโมเวลเนส เซ็นเตอร์', 1),
  ('d4000000-0000-4000-8000-000000000027', 'd3000000-0000-4000-8000-000000000023', 'd2000000-0000-4000-8000-000000000023', '[SYNTHETIC] อำเภอตัวอย่าง จังหวัดศรีสะเกษ', 1),
  ('d4000000-0000-4000-8000-000000000028', 'd3000000-0000-4000-8000-000000000024', 'd2000000-0000-4000-8000-000000000023', '[SYNTHETIC] 099-000-3003', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entity_relationships (
  id, case_id, source_entity_id, target_entity_id, type, status, verified_by
) VALUES
  ('d5000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'LOCATED_AT_SYNTHETIC', 'PROPOSED', NULL),
  ('d5000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000011', 'd3000000-0000-4000-8000-000000000013', 'USES_PAYMENT_CHANNEL_SYNTHETIC', 'PROPOSED', NULL),
  ('d5000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000021', 'd3000000-0000-4000-8000-000000000022', 'OPERATED_BY_SYNTHETIC', 'PROPOSED', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.relationship_references (id, relationship_id, evidence_id, page_number, quote) VALUES
  ('d6000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 1, '[SYNTHETIC] บริษัทและสถานที่ปรากฏร่วมกันในผลทะเบียนจำลอง'),
  ('d6000000-0000-4000-8000-000000000011', 'd5000000-0000-4000-8000-000000000011', 'd1000000-0000-4000-8000-000000000012', 1, '[SYNTHETIC] ร้านและช่องทางชำระเงินปรากฏร่วมกันในธุรกรรมจำลอง'),
  ('d6000000-0000-4000-8000-000000000021', 'd5000000-0000-4000-8000-000000000021', 'd1000000-0000-4000-8000-000000000022', 1, '[SYNTHETIC] สถานประกอบการและผู้ดำเนินการปรากฏร่วมกันในทะเบียนจำลอง')
ON CONFLICT (id) DO NOTHING;

UPDATE public.entity_relationships
SET status = 'VERIFIED', updated_at = timezone('utc'::text, now())
WHERE id IN (
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000011',
  'd5000000-0000-4000-8000-000000000021'
);

INSERT INTO public.evidence_screenings (
  id, case_id, evidence_id, classification, summary, reason, confidence,
  source_trace, provider, model, status, created_by
)
SELECT
  ('d7000000-0000-4000-8000-' || right(ef.id::text, 12))::uuid,
  ef.case_id, ef.id,
  CASE WHEN ef.filename LIKE '%บันทึก%' OR ef.filename LIKE '%หน้าโฆษณา%' THEN 'DIRECT' ELSE 'CORROBORATIVE' END,
  '[ข้อมูลทดสอบ] พบข้อมูลสังเคราะห์ที่เชื่อมกับหลักฐานชิ้นอื่นและย้อนกลับถึงหน้า 1 ได้',
  'ผลสกรีนนิ่งเริ่มต้นสำหรับเดโม สร้างจาก entity mention และ relationship reference สังเคราะห์ ต้องให้ผู้ตรวจทานยืนยันก่อนใช้',
  0.95,
  jsonb_build_object('synthetic_test_data', true, 'confirmed_mentions', (
    SELECT count(*) FROM public.entity_mentions em JOIN public.evidence_pages ep ON ep.id = em.page_id WHERE ep.evidence_id = ef.id
  ), 'entities', coalesce((
    SELECT jsonb_agg(jsonb_build_object('entity_id', em.entity_id, 'page_number', ep.page_number))
    FROM public.entity_mentions em JOIN public.evidence_pages ep ON ep.id = em.page_id WHERE ep.evidence_id = ef.id
  ), '[]'::jsonb)),
  'LAWIRISK_SYNTHETIC_FIXTURE', 'synthetic-source-trace-v1', 'SUGGESTED', NULL
FROM public.evidence_files ef
WHERE ef.case_id IN (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003'
)
ON CONFLICT (case_id, evidence_id) DO NOTHING;

WITH report_seed(id, case_id, case_number, case_title) AS (VALUES
  ('d8000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'DEMO-2569-001', '[ข้อมูลทดสอบ] ตรวจสอบแหล่งผลิตน้ำดื่มสังเคราะห์'),
  ('d8000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'DEMO-2569-002', '[ข้อมูลทดสอบ] โฆษณาผลิตภัณฑ์สุขภาพออนไลน์สังเคราะห์'),
  ('d8000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'DEMO-2569-003', '[ข้อมูลทดสอบ] ตรวจสอบใบอนุญาตสถานประกอบการสุขภาพสังเคราะห์')
), snapshots AS (
  SELECT seed.*, coalesce(jsonb_agg(jsonb_build_object(
    'evidence_id', ef.id, 'sha256', ef.sha256, 'page_number', 1, 'synthetic_test_data', true
  ) ORDER BY ef.filename), '[]'::jsonb) AS snapshot
  FROM report_seed seed JOIN public.evidence_files ef ON ef.case_id = seed.case_id
  GROUP BY seed.id, seed.case_id, seed.case_number, seed.case_title
)
INSERT INTO public.reports (
  id, case_id, title, report_type, content, source_snapshot, snapshot_sha256, created_by
)
SELECT
  id, case_id, '[ข้อมูลทดสอบ] ฟอร์มกำหนดคาดการณ์ ' || case_number, 'PREDICTION_FORM',
  jsonb_build_object(
    'schemaVersion', 'lawirisk-prediction-form-v1',
    'title', 'ฟอร์มกำหนดคาดการณ์เรื่องร้องเรียน [ข้อมูลทดสอบ]',
    'caseNumber', case_number,
    'caseTitle', case_title,
    'generatedAt', timezone('utc'::text, now()),
    'sections', jsonb_build_array(
      jsonb_build_object('number', 1, 'title', 'ผู้ร้องเรียน', 'content', '[ข้อมูลทดสอบ] ผู้ร้องเรียนสังเคราะห์ ไม่ใช่บุคคลจริง'),
      jsonb_build_object('number', 2, 'title', 'ประเด็นผู้ร้องเรียนระบุ', 'content', case_title),
      jsonb_build_object('number', 3, 'title', 'วัน เวลา และสถานที่เกิดเหตุร้องเรียน โดยสรุป', 'content', '[ข้อมูลทดสอบ] เวลาและสถานที่จำลองตามรายละเอียดสำนวน'),
      jsonb_build_object('number', 4, 'title', 'เป้าหมายพื้นที่ลงตรวจ', 'content', '[ข้อมูลทดสอบ] พื้นที่จำลอง ห้ามใช้เป็นคำสั่งลงพื้นที่จริง'),
      jsonb_build_object('number', 5, 'title', 'ข้อหาที่คาดว่าจะพบ', 'content', 'รอเจ้าหน้าที่ตรวจทาน ระบบไม่สร้างข้อหาอัตโนมัติ'),
      jsonb_build_object('number', 6, 'title', 'ข้อกฎหมายที่เกี่ยวข้อง', 'content', 'รอผู้มีอำนาจตรวจทานและยืนยันข้อกฎหมาย'),
      jsonb_build_object('number', 7, 'title', 'ของกลางที่คาดว่าจะเก็บและยึดหรืออายัด', 'content', '[ข้อมูลทดสอบ] ไฟล์สังเคราะห์ 3 รายการใน source snapshot'),
      jsonb_build_object('number', 8, 'title', 'ผู้ร่วมปฏิบัติการลงตรวจสอบเรื่องร้องเรียน', 'content', 'ทีมสาธิต LAW-i-RISK'),
      jsonb_build_object('number', 9, 'title', 'เอกสารที่ใช้', 'content', '[ข้อมูลทดสอบ] เอกสารสังเคราะห์พร้อม SHA-256 และ page trace'),
      jsonb_build_object('number', 10, 'title', 'แนวทางดำเนินการ', 'content', 'เปิดต้นฉบับ ตรวจ hash ตรวจข้อเสนอ และบันทึกเหตุผลก่อนยืนยัน')
    ),
    'legalAppendix', '[]'::jsonb,
    'reviewNotice', '[ข้อมูลทดสอบ] เอกสารนี้เป็น fixture สังเคราะห์ ไม่ใช่ข้อเท็จจริง ไม่ใช่คำสั่ง และห้ามนำไปใช้กับบุคคลจริง'
  )::text,
  snapshot,
  encode(extensions.digest(snapshot::text, 'sha256'), 'hex'), NULL
FROM snapshots
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audit_logs (profile_id, action, details)
VALUES (NULL, 'SYNTHETIC_DEMO_CASES_SEEDED', jsonb_build_object(
  'synthetic_test_data', true, 'case_count', 3, 'evidence_count', 9,
  'case_numbers', jsonb_build_array('DEMO-2569-001', 'DEMO-2569-002', 'DEMO-2569-003')
));
