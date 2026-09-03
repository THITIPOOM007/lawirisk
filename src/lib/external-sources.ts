import { z } from 'zod';

export const externalSourceKeySchema = z.enum(['FDA_PUBLIC', 'FDA_SKYNET', 'HSS_OSS', 'HSS_ESTA2']);
export type ExternalSourceKey = z.infer<typeof externalSourceKeySchema>;

export const reconServiceKeySchema = z.enum([
  'DBD',
  'DOPA',
  'FDA_PLACE_DRUG',
  'FDA_DRUG_REGISTRY',
  'FDA_FOOD_REGISTRY',
  'FDA_HAZARDOUS_REGISTRY',
  'FDA_COSMETIC_REGISTRY',
  'FDA_HERBAL_REGISTRY',
  'FDA_MEDICAL_DEVICE_REGISTRY',
  'FDA_STAFF_DRUG_LOCATION',
  'FDA_STAFF_FOOD_LOCATION',
  'FDA_STAFF_HAZARDOUS',
  'FDA_STAFF_COSMETIC',
  'FDA_STAFF_HERBAL_LOCATION',
  'FDA_STAFF_MEDICAL_DEVICE',
  'HSS_FACILITY',
  'HSS_PROFESSIONAL',
  'HSS_HEALTH_BUSINESS_APPROVED',
]);
export type ReconServiceKey = z.infer<typeof reconServiceKeySchema>;

const reconServiceSchema = z.object({
  key: reconServiceKeySchema,
  name: z.string().min(1),
  description: z.string().min(1),
  automationMode: z.enum(['FORM_ONLY', 'LOCAL_SEARCH']),
  searchFields: z.array(z.object({
    key: z.string().regex(/^[A-Z_]+$/),
    label: z.string().min(1),
    inputMode: z.enum(['text', 'tel', 'numeric']),
  }).strict()),
}).strict();

export const externalSourceSchema = z.object({
  key: externalSourceKeySchema,
  name: z.string().min(1),
  authority: z.string().min(1),
  coverage: z.string().min(1),
  authMode: z.enum(['NONE', 'EGOV_OIDC', 'LEGACY_CREDENTIAL']),
  accessMode: z.enum(['LOCAL_PUBLIC_SEARCH', 'LOCAL_AUTO_LOGIN', 'LOCAL_AUTO_LOGIN_RISK_ACK_REQUIRED']),
  transport: z.enum(['HTTPS', 'HTTP_ONLY']),
  launchUrl: z.string().url().nullable(),
  companionSetupUrl: z.string().url().nullable(),
  verifiedAt: z.string().date(),
  guidance: z.array(z.string().min(1)).min(1),
  limitation: z.string().min(1),
  services: z.array(reconServiceSchema).min(1),
}).strict();

export type ExternalSource = z.infer<typeof externalSourceSchema>;

export const EXTERNAL_SOURCES: readonly ExternalSource[] = [
  {
    key: 'FDA_PUBLIC',
    name: 'ศูนย์ตรวจสอบการอนุญาต อย.',
    authority: 'สำนักงานคณะกรรมการอาหารและยา กระทรวงสาธารณสุข',
    coverage: 'ผลิตภัณฑ์และสถานที่ด้านยา อาหาร วัตถุอันตราย เครื่องสำอาง สมุนไพร และเครื่องมือแพทย์',
    authMode: 'NONE',
    accessMode: 'LOCAL_PUBLIC_SEARCH',
    transport: 'HTTPS',
    launchUrl: 'https://meshlog.fda.moph.go.th/SEARCH_CENTER_HERB/MAIN/SEARCH_CENTER_MAIN.aspx',
    companionSetupUrl: null,
    verifiedAt: '2026-08-30',
    guidance: [
      'ระบบเลือกหมวดจากประเภทคดีก่อนกรอกคำค้น จึงไม่ส่งคดีร้านยาไปค้นทะเบียนร้านนวด',
      'คำค้นส่งตรงจากเบราว์เซอร์ไป Recon Companion บนเครื่องเจ้าหน้าที่ ไม่ผ่าน Cloudflare หรือ Supabase',
      'Companion เลือกชนิดผลิตภัณฑ์หรือสถานที่ กดค้น อ่านแถวผลลัพธ์ และบันทึกหน้าอย่างเป็นทางการเป็น PDF พร้อม SHA-256',
      'ผลที่นำเข้าคลังหลักฐานมีสถานะข้อเสนอและต้องตรวจบริบทก่อนใช้อ้างอิงในสำนวน',
    ],
    limitation: 'การค้นอาศัยฟอร์มสาธารณะของ อย. ที่ตรวจ field contract แล้ว หากต้นทางเปลี่ยน selector, redirect ไปหน้าล็อกอิน หรือคืนผลไม่สัมพันธ์กับคำค้น ระบบจะหยุดและไม่บันทึกผลผิดหมวด',
    services: [
      { key: 'FDA_DRUG_REGISTRY', name: 'ยาและสถานที่ด้านยา', description: 'ค้นชื่อ/เลขผลิตภัณฑ์ยา หรือชื่อ/เลขใบอนุญาตสถานที่ด้านยา', automationMode: 'LOCAL_SEARCH', searchFields: [{ key: 'FACILITY_TERM', label: 'ชื่อหรือเลขใบอนุญาตสถานที่', inputMode: 'text' }, { key: 'PRODUCT_TERM', label: 'ชื่อหรือเลขทะเบียนผลิตภัณฑ์', inputMode: 'text' }] },
      { key: 'FDA_FOOD_REGISTRY', name: 'อาหารและสถานที่อาหาร', description: 'ค้นชื่อ/เลขสารบบอาหาร หรือชื่อ/เลขใบอนุญาตสถานที่อาหาร', automationMode: 'LOCAL_SEARCH', searchFields: [{ key: 'FACILITY_TERM', label: 'ชื่อหรือเลขใบอนุญาตสถานที่', inputMode: 'text' }, { key: 'PRODUCT_TERM', label: 'ชื่อหรือเลขสารบบผลิตภัณฑ์', inputMode: 'text' }] },
      { key: 'FDA_HAZARDOUS_REGISTRY', name: 'วัตถุอันตราย', description: 'ค้นชื่อ/เลขทะเบียนผลิตภัณฑ์ หรือชื่อสถานที่วัตถุอันตราย', automationMode: 'LOCAL_SEARCH', searchFields: [{ key: 'FACILITY_TERM', label: 'ชื่อหรือเลขใบอนุญาตสถานที่', inputMode: 'text' }, { key: 'PRODUCT_TERM', label: 'ชื่อหรือเลขทะเบียนผลิตภัณฑ์', inputMode: 'text' }] },
      { key: 'FDA_COSMETIC_REGISTRY', name: 'เครื่องสำอาง', description: 'ค้นชื่อผู้ประกอบการ ชื่อการค้า ชื่อผลิตภัณฑ์ หรือเลขจดแจ้ง', automationMode: 'LOCAL_SEARCH', searchFields: [{ key: 'PRODUCT_TERM', label: 'ชื่อผู้ประกอบการ/ผลิตภัณฑ์/เลขจดแจ้ง', inputMode: 'text' }] },
      { key: 'FDA_HERBAL_REGISTRY', name: 'สมุนไพรและสถานที่สมุนไพร', description: 'ค้นชื่อ/เลขผลิตภัณฑ์สมุนไพร หรือชื่อ/เลขใบอนุญาตสถานที่', automationMode: 'LOCAL_SEARCH', searchFields: [{ key: 'FACILITY_TERM', label: 'ชื่อหรือเลขใบอนุญาตสถานที่', inputMode: 'text' }, { key: 'PRODUCT_TERM', label: 'ชื่อหรือเลขทะเบียนผลิตภัณฑ์', inputMode: 'text' }] },
      { key: 'FDA_MEDICAL_DEVICE_REGISTRY', name: 'เครื่องมือแพทย์และสถานที่', description: 'ค้นชื่อ/เลขเครื่องมือแพทย์ หรือชื่อ/เลขใบอนุญาตสถานที่', automationMode: 'LOCAL_SEARCH', searchFields: [{ key: 'FACILITY_TERM', label: 'ชื่อหรือเลขใบอนุญาตสถานที่', inputMode: 'text' }, { key: 'PRODUCT_TERM', label: 'ชื่อหรือเลขทะเบียนผลิตภัณฑ์', inputMode: 'text' }] },
    ],
  },
  {
    key: 'FDA_SKYNET',
    name: 'SKYNET / Privus อย.',
    authority: 'สำนักงานคณะกรรมการอาหารและยา กระทรวงสาธารณสุข',
    coverage: 'ผลิตภัณฑ์และบริการสุขภาพภายใต้สิทธิ์ของเจ้าหน้าที่',
    authMode: 'EGOV_OIDC',
    accessMode: 'LOCAL_AUTO_LOGIN',
    transport: 'HTTPS',
    launchUrl: 'https://privus.fda.moph.go.th/FDA_LOGIN2/HOME/SET_STATE?STATE=3',
    companionSetupUrl: 'lawirisk-recon://setup?source=FDA_SKYNET',
    verifiedAt: '2026-08-28',
    guidance: [
      'ตั้งบัญชีครั้งแรกใน Recon Companion บนเครื่อง Windows; รหัสผ่านถูกเข้ารหัสด้วย DPAPI ของผู้ใช้ Windows',
      'Companion เริ่มจากหน้า SKYNET คงที่เพื่อสร้าง OIDC/PKCE state และ nonce ใหม่ทุกครั้ง ก่อนกรอกบัญชีและกดเข้าสู่ระบบอัตโนมัติ',
      'หาก DGA ขอ OTP, QR, MFA หรือ CAPTCHA ระบบจะหยุดรอให้เจ้าหน้าที่ดำเนินการเอง',
      'DBD รองรับค้นเลขนิติบุคคล 13 หลัก และ DOPA รองรับค้นเลขบัตรประชาชน 13 หลักแบบ local-only ตามสิทธิ์บัญชี',
      'ส่งออกผลทางการเป็น PDF หรือภาพหน้าจอที่มีเลขอ้างอิงและวันเวลา',
      'นำไฟล์กลับเข้าคลังหลักฐานเพื่อคำนวณ hash ตรวจรูปแบบ และผูกกับคดี',
    ],
    limitation: 'DBD/DOPA รองรับค้นอัตโนมัติเฉพาะเลข 13 หลักที่ตรวจ field contract แล้ว หน้าสถานที่ด้านยาและสมุนไพรของเจ้าหน้าที่รองรับค้นด้วยเลขผู้รับอนุญาตหรือเลขใบอนุญาตและเก็บภาพ/PDF ได้ ส่วนอาหาร วัตถุอันตราย เครื่องสำอาง และเครื่องมือแพทย์จะเปิดเฉพาะหลัง Privus เพื่อให้เจ้าหน้าที่ตรวจ selector/สิทธิ์ก่อนเปิด automation; LAW-i-RISK ไม่รับรหัสผ่าน คำค้น หรือ session และทุกผลต้องให้เจ้าหน้าที่ตรวจ',
    services: [
      {
        key: 'DBD',
        name: 'ทะเบียนนิติบุคคล (DBD)',
        description: 'ค้นเลขนิติบุคคล 13 หลักในหน้าที่ตรวจยืนยันแล้วตามสิทธิ์บัญชี',
        automationMode: 'LOCAL_SEARCH',
        searchFields: [{ key: 'JURISTIC_ID', label: 'เลขนิติบุคคล 13 หลัก', inputMode: 'numeric' }],
      },
      {
        key: 'DOPA',
        name: 'ทะเบียนบุคคล (DOPA)',
        description: 'ค้นเลขบัตรประชาชน 13 หลักในหน้าที่ตรวจยืนยันแล้วตามสิทธิ์บัญชี',
        automationMode: 'LOCAL_SEARCH',
        searchFields: [{ key: 'CITIZEN_ID', label: 'เลขบัตรประชาชน 13 หลัก', inputMode: 'numeric' }],
      },
      { key: 'FDA_PLACE_DRUG', name: 'สถานที่และทะเบียนยา', description: 'เปิดระบบค้นหาสถานที่และทะเบียนผลิตภัณฑ์ยา', automationMode: 'FORM_ONLY', searchFields: [] },
      { key: 'FDA_STAFF_DRUG_LOCATION', name: 'เจ้าหน้าที่ อย. — สถานที่ด้านยา', description: 'ค้นเลขผู้รับอนุญาตหรือเลขใบอนุญาตสถานที่ด้านยาจาก Medicina แล้วเก็บ PDF/ภาพผลค้น', automationMode: 'LOCAL_SEARCH', searchFields: [{ key: 'CITIZEN_ID', label: 'เลขนิติบุคคล/เลขบัตรประชาชนผู้รับอนุญาต', inputMode: 'numeric' }, { key: 'LICENSE_NUMBER', label: 'เลขที่ใบอนุญาตสถานที่ด้านยา', inputMode: 'text' }] },
      { key: 'FDA_STAFF_FOOD_LOCATION', name: 'เจ้าหน้าที่ อย. — สถานที่และผลิตภัณฑ์อาหาร', description: 'เปิด Alimentum ภายใต้สิทธิ์ Privus; ระบบหยุดที่ฟอร์มจนกว่าจะตรวจ field contract ของบัญชีจริง', automationMode: 'FORM_ONLY', searchFields: [] },
      { key: 'FDA_STAFF_HAZARDOUS', name: 'เจ้าหน้าที่ อย. — วัตถุอันตราย', description: 'เปิด Excercitium/Privus ภายใต้สิทธิ์เจ้าหน้าที่; ยังไม่ส่งคำค้นจนกว่าจะตรวจ field contract', automationMode: 'FORM_ONLY', searchFields: [] },
      { key: 'FDA_STAFF_COSMETIC', name: 'เจ้าหน้าที่ อย. — เครื่องสำอาง', description: 'เปิด Cosmetica ภายใต้สิทธิ์ Privus; ยังไม่ส่งคำค้นจนกว่าจะตรวจ field contract', automationMode: 'FORM_ONLY', searchFields: [] },
      { key: 'FDA_STAFF_HERBAL_LOCATION', name: 'เจ้าหน้าที่ อย. — สถานที่ผลิตสมุนไพร', description: 'ค้นเลขผู้รับอนุญาตหรือเลขใบอนุญาตสถานที่ผลิตสมุนไพร แล้วเก็บ PDF/ภาพผลค้น', automationMode: 'LOCAL_SEARCH', searchFields: [{ key: 'CITIZEN_ID', label: 'เลขนิติบุคคล/เลขบัตรประชาชนผู้รับอนุญาต', inputMode: 'numeric' }, { key: 'LICENSE_NUMBER', label: 'เลขที่ใบอนุญาตสถานที่สมุนไพร', inputMode: 'text' }] },
      { key: 'FDA_STAFF_MEDICAL_DEVICE', name: 'เจ้าหน้าที่ อย. — เครื่องมือแพทย์', description: 'เปิด Medeva ภายใต้สิทธิ์ Privus; ระบบตรวจ token/session ก่อนจึงจะเสนอ automation', automationMode: 'FORM_ONLY', searchFields: [] },
    ],
  },
  {
    key: 'HSS_OSS',
    name: 'OSS สบส.',
    authority: 'กรมสนับสนุนบริการสุขภาพ กระทรวงสาธารณสุข',
    coverage: 'สถานพยาบาลและสถานประกอบการด้านสุขภาพภายใต้สิทธิ์ของเจ้าหน้าที่',
    authMode: 'LEGACY_CREDENTIAL',
    accessMode: 'LOCAL_AUTO_LOGIN_RISK_ACK_REQUIRED',
    transport: 'HTTP_ONLY',
    launchUrl: 'http://oss.hss.moph.go.th/auth/login',
    companionSetupUrl: 'lawirisk-recon://setup?source=HSS_OSS',
    verifiedAt: '2026-08-18',
    guidance: [
      'ตั้งบัญชีใน Recon Companion บนเครื่อง Windows โดยข้อมูลถูกเข้ารหัสด้วย DPAPI และไม่ส่งขึ้น LAW-i-RISK',
      'ก่อน auto-login ทุกครั้งต้องยืนยันว่ารับทราบว่าปลายทางเป็น HTTP และรหัสผ่านเดินทางโดยไม่มี TLS',
      'ควรขอ HTTPS endpoint หรือ API ที่ สบส. รับรองเพื่อยกเลิกข้อยกเว้นนี้',
    ],
    limitation: 'ตรวจยืนยันแล้วว่า HTTPS redirect กลับ HTTP; auto-login จึงเป็นข้อยกเว้นเฉพาะเครื่องที่ต้องยืนยันความเสี่ยง ไม่ใช่ค่าเริ่มต้นและไม่ใช่ช่องทางที่แนะนำ',
    services: [
      {
        key: 'HSS_FACILITY',
        name: 'ข้อมูลสถานพยาบาล',
        description: 'ค้นชื่อ เลขประจำตัว ใบอนุญาต เบอร์โทร หรือที่อยู่ ภายใต้สิทธิ์ของบัญชี',
        automationMode: 'LOCAL_SEARCH',
        searchFields: [
          { key: 'FACILITY_NAME', label: 'ชื่อสถานพยาบาล', inputMode: 'text' },
          { key: 'OPERATOR_NAME', label: 'ชื่อผู้ประกอบกิจการ', inputMode: 'text' },
          { key: 'OPERATOR_ID', label: 'เลขประจำตัว/เลขนิติบุคคล', inputMode: 'numeric' },
          { key: 'MANAGER_NAME', label: 'ชื่อผู้ดำเนินการ', inputMode: 'text' },
          { key: 'MANAGER_ID', label: 'เลขประจำตัวผู้ดำเนินการ', inputMode: 'numeric' },
          { key: 'BUSINESS_LICENSE', label: 'เลขใบอนุญาตประกอบกิจการ', inputMode: 'text' },
          { key: 'OPERATION_LICENSE', label: 'เลขใบอนุญาตดำเนินการ', inputMode: 'text' },
          { key: 'PHONE', label: 'เบอร์โทรศัพท์', inputMode: 'tel' },
          { key: 'ADDRESS_NUMBER', label: 'ที่อยู่/เลขที่', inputMode: 'text' },
        ],
      },
      {
        key: 'HSS_PROFESSIONAL',
        name: 'ข้อมูลผู้ประกอบโรคศิลปะ',
        description: 'ค้นบุคคล หนังสือเดินทาง และใบอนุญาต ภายใต้สิทธิ์ของบัญชี',
        automationMode: 'LOCAL_SEARCH',
        searchFields: [
          { key: 'CITIZEN_ID', label: 'เลขประจำตัวประชาชน', inputMode: 'numeric' },
          { key: 'PASSPORT', label: 'เลขหนังสือเดินทาง', inputMode: 'text' },
          { key: 'PERSON_NAME', label: 'ชื่อ-นามสกุล', inputMode: 'text' },
          { key: 'FORMER_NAME', label: 'ชื่อ-นามสกุลเดิม', inputMode: 'text' },
          { key: 'PROFESSIONAL_LICENSE', label: 'เลขใบอนุญาตประกอบโรคศิลปะ', inputMode: 'text' },
          { key: 'BUSINESS_LICENSE', label: 'เลขใบอนุญาตประกอบกิจการ', inputMode: 'text' },
          { key: 'OPERATION_LICENSE', label: 'เลขใบอนุญาตดำเนินการ', inputMode: 'text' },
        ],
      },
    ],
  },
  {
    key: 'HSS_ESTA2',
    name: 'ESTA2 สบส.',
    authority: 'กองสถานประกอบการเพื่อสุขภาพ กรมสนับสนุนบริการสุขภาพ กระทรวงสาธารณสุข',
    coverage: 'สถานประกอบการเพื่อสุขภาพที่ได้รับอนุญาต รวมร้านนวดเพื่อสุขภาพ ตามสิทธิ์และจังหวัดที่บัญชีรับผิดชอบ',
    authMode: 'LEGACY_CREDENTIAL',
    accessMode: 'LOCAL_AUTO_LOGIN',
    transport: 'HTTPS',
    launchUrl: 'https://esta2.hss.moph.go.th/business/approved',
    companionSetupUrl: 'lawirisk-recon://setup?source=HSS_ESTA2',
    verifiedAt: '2026-08-28',
    guidance: [
      'ตั้งบัญชี ESTA2 ครั้งแรกใน Recon Companion บนเครื่อง Windows; รหัสผ่านถูกเข้ารหัสด้วย DPAPI และไม่ส่งขึ้น Cloudflare/Supabase',
      'Companion เข้าระบบผ่าน HTTPS แล้วเปิดเฉพาะหน้า /business/approved ที่ตรวจ allowlist แล้ว',
      'ค้นชื่อสถานประกอบการแบบหลายระดับอย่างจำกัด: ชื่อเต็ม ชื่อแกน และคำสำคัญแรก โดยหยุดเมื่อพบผล',
      'ผลค้นบันทึก PDF พร้อม SHA-256, วิธีค้น และจำนวนครั้งไว้บนเครื่องในสถานะรอนำเข้าและรอมนุษย์ตรวจ',
    ],
    limitation: 'ระบบค้นเฉพาะข้อมูลที่บัญชี ESTA2 ได้รับสิทธิ์และจังหวัดที่รับผิดชอบ ชื่อสถานประกอบการจะลองคำค้นสำรองไม่เกิน 3 ระดับ แต่ผล “ไม่พบ” ยังไม่ใช่ข้อยืนยันว่าไม่มีใบอนุญาต และ Companion จะไม่กดแก้ไข ยกเลิก พิมพ์ใบอนุญาต หรือทำรายการเปลี่ยนสถานะ',
    services: [
      {
        key: 'HSS_HEALTH_BUSINESS_APPROVED',
        name: 'สถานประกอบการที่ได้รับอนุญาตแล้ว',
        description: 'ค้นชื่อร้านนวด/สถานประกอบการแบบหลายระดับ หรือค้นข้อมูลระบุตรง ในรายการที่ได้รับอนุญาตตามสิทธิ์ของบัญชี',
        automationMode: 'LOCAL_SEARCH',
        searchFields: [
          { key: 'FACILITY_NAME', label: 'ชื่อสถานประกอบการ (ภาษาไทย)', inputMode: 'text' },
          { key: 'APPLICANT_NAME', label: 'ชื่อผู้ยื่นคำร้อง', inputMode: 'text' },
          { key: 'APPLICANT_ID', label: 'เลขบัตรประชาชนผู้ยื่น', inputMode: 'numeric' },
          { key: 'FACILITY_NAME_ENGLISH', label: 'ชื่อสถานประกอบการ (ภาษาอังกฤษ)', inputMode: 'text' },
          { key: 'LICENSE_NUMBER', label: 'เลขที่ใบอนุญาต', inputMode: 'text' },
        ],
      },
    ],
  },
] as const;

for (const source of EXTERNAL_SOURCES) externalSourceSchema.parse(source);

export function findExternalSource(value: string) {
  const parsed = externalSourceKeySchema.safeParse(value);
  return parsed.success ? EXTERNAL_SOURCES.find((source) => source.key === parsed.data) : undefined;
}

export function isLaunchableSource(source: ExternalSource) {
  if (source.transport !== 'HTTPS' || !source.launchUrl) return false;
  return new URL(source.launchUrl).protocol === 'https:';
}

export const companionLaunchRequestSchema = z.object({
  case_id: z.string().trim().min(1).max(100).optional(),
  service: reconServiceKeySchema.optional(),
  intent: z.enum(['OPEN_FORM', 'LOCAL_SEARCH']).optional().default('OPEN_FORM'),
  acknowledge_insecure_transport: z.boolean().optional().default(false),
}).strict();

export function buildReconCompanionUri(
  source: ExternalSource,
  options: { caseId?: string; service?: ReconServiceKey; acknowledgeInsecureTransport?: boolean } = {},
) {
  if (source.accessMode === 'LOCAL_AUTO_LOGIN_RISK_ACK_REQUIRED' && !options.acknowledgeInsecureTransport) {
    throw new Error('INSECURE_TRANSPORT_ACK_REQUIRED');
  }
  const uri = new URL('lawirisk-recon://launch');
  uri.searchParams.set('source', source.key);
  if (options.caseId) uri.searchParams.set('case_id', options.caseId);
  if (options.service) {
    if (!source.services.some((service) => service.key === options.service)) {
      throw new Error('SERVICE_NOT_ALLOWED');
    }
    uri.searchParams.set('service', options.service);
  }
  if (options.acknowledgeInsecureTransport) uri.searchParams.set('allow_insecure_http', '1');
  return uri.toString();
}
