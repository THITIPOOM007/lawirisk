import { z } from 'zod';

export const externalSourceKeySchema = z.enum(['FDA_SKYNET', 'HSS_OSS']);
export type ExternalSourceKey = z.infer<typeof externalSourceKeySchema>;

export const reconServiceKeySchema = z.enum([
  'DBD',
  'DOPA',
  'FDA_PLACE_DRUG',
  'HSS_FACILITY',
  'HSS_PROFESSIONAL',
]);
export type ReconServiceKey = z.infer<typeof reconServiceKeySchema>;

const reconServiceSchema = z.object({
  key: reconServiceKeySchema,
  name: z.string().min(1),
  description: z.string().min(1),
}).strict();

export const externalSourceSchema = z.object({
  key: externalSourceKeySchema,
  name: z.string().min(1),
  authority: z.string().min(1),
  coverage: z.string().min(1),
  authMode: z.enum(['EGOV_OIDC', 'LEGACY_CREDENTIAL']),
  accessMode: z.enum(['LOCAL_AUTO_LOGIN', 'LOCAL_AUTO_LOGIN_RISK_ACK_REQUIRED']),
  transport: z.enum(['HTTPS', 'HTTP_ONLY']),
  launchUrl: z.string().url().nullable(),
  companionSetupUrl: z.string().url(),
  verifiedAt: z.string().date(),
  guidance: z.array(z.string().min(1)).min(1),
  limitation: z.string().min(1),
  services: z.array(reconServiceSchema).min(1),
}).strict();

export type ExternalSource = z.infer<typeof externalSourceSchema>;

export const EXTERNAL_SOURCES: readonly ExternalSource[] = [
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
    verifiedAt: '2026-08-18',
    guidance: [
      'ตั้งบัญชีครั้งแรกใน Recon Companion บนเครื่อง Windows; รหัสผ่านถูกเข้ารหัสด้วย DPAPI ของผู้ใช้ Windows',
      'Companion เริ่มจากหน้า SKYNET คงที่เพื่อสร้าง OIDC/PKCE state และ nonce ใหม่ทุกครั้ง ก่อนกรอกบัญชีและกดเข้าสู่ระบบอัตโนมัติ',
      'หาก DGA ขอ OTP, QR, MFA หรือ CAPTCHA ระบบจะหยุดรอให้เจ้าหน้าที่ดำเนินการเอง',
      'ค้นเฉพาะวัตถุประสงค์และขอบเขตที่หน่วยงานอนุญาต',
      'ส่งออกผลทางการเป็น PDF หรือภาพหน้าจอที่มีเลขอ้างอิงและวันเวลา',
      'นำไฟล์กลับเข้าคลังหลักฐานเพื่อคำนวณ hash ตรวจรูปแบบ และผูกกับคดี',
    ],
    limitation: 'ทำ auto-login และเปิดหน้าค้นที่เลือกผ่านโปรแกรมบนเครื่องเท่านั้น LAW-i-RISK บน Cloudflare/Supabase ไม่รับรหัสผ่านหรือ session; เจ้าหน้าที่ต้องตรวจคำค้นและกดค้นในระบบต้นทางตามสิทธิ์ของบัญชี',
    services: [
      { key: 'DBD', name: 'ทะเบียนนิติบุคคล (DBD)', description: 'เปิดหน้าค้นหาข้อมูลนิติบุคคลที่บัญชีได้รับสิทธิ์' },
      { key: 'DOPA', name: 'ทะเบียนบุคคล (DOPA)', description: 'เปิดหน้าค้นหาบุคคลของกรมการปกครองที่บัญชีได้รับสิทธิ์' },
      { key: 'FDA_PLACE_DRUG', name: 'สถานที่และทะเบียนยา', description: 'เปิดระบบค้นหาสถานที่และทะเบียนผลิตภัณฑ์ยา' },
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
      { key: 'HSS_FACILITY', name: 'ข้อมูลสถานพยาบาล', description: 'เปิดรายการข้อมูลสถานพยาบาลภายใต้สิทธิ์ของบัญชี' },
      { key: 'HSS_PROFESSIONAL', name: 'ข้อมูลผู้ประกอบโรคศิลปะ', description: 'เปิดระบบข้อมูลบุคคลและผู้ประกอบโรคศิลปะภายใต้สิทธิ์ของบัญชี' },
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
