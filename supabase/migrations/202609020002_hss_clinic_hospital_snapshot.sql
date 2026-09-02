-- Dated HSS public-search snapshot for the user-reported term "โรงหมอ".
-- This preserves source traceability while the live HSS endpoint remains
-- unreachable from the Cloudflare application host.

INSERT INTO public.trusted_sources_registry (
  id,
  title,
  category,
  product_category_label,
  snippet,
  source,
  source_url,
  published_date,
  status,
  metadata
)
VALUES (
  'a1100001-0000-4000-8000-000000000006',
  'โรงหมอพุทธรักษา คลินิกการแพทย์แผนไทยประยุกต์',
  'CLINICS',
  'สำเนาทะเบียนสถานพยาบาลที่ตรวจสอบแล้ว',
  'พบชื่อในผลค้นหาสาธารณะ สบส. เมื่อ 2 กันยายน 2569 — เลขที่ใบอนุญาต 33111000167 — เลขที่ 1043/6 ถนนอุบล ตำบลเมืองใต้ อำเภอเมืองศรีสะเกษ จังหวัดศรีสะเกษ — โปรดเปิดต้นฉบับเพื่อตรวจสถานะล่าสุด',
  'ทะเบียนสถานพยาบาลเอกชน กรมสนับสนุนบริการสุขภาพ (สบส.)',
  'https://hosp.hss.moph.go.th',
  '2026-09-02T15:06:46.000Z',
  'WARNING',
  '{"ชื่อสถานพยาบาล":"โรงหมอพุทธรักษา คลินิกการแพทย์แผนไทยประยุกต์","เลขที่ใบอนุญาต":"33111000167","ที่ตั้ง":"เลขที่ 1043/6 ถนนอุบล ตำบลเมืองใต้ อำเภอเมืองศรีสะเกษ จังหวัดศรีสะเกษ","ใช้ได้ถึง":"31 ธันวาคม 2576","ตรวจสอบเมื่อ":"2 กันยายน 2569 (สำเนาผลค้นหา)"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  product_category_label = EXCLUDED.product_category_label,
  snippet = EXCLUDED.snippet,
  source = EXCLUDED.source,
  source_url = EXCLUDED.source_url,
  published_date = EXCLUDED.published_date,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata;
