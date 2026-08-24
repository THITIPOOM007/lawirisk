import { z } from 'zod';

export const externalSourceKeySchema = z.enum(['FDA_SKYNET', 'HSS_OSS']);
export type ExternalSourceKey = z.infer<typeof externalSourceKeySchema>;

export const externalSourceSchema = z.object({
  key: externalSourceKeySchema,
  name: z.string().min(1),
  authority: z.string().min(1),
  coverage: z.string().min(1),
  authMode: z.enum(['EGOV_OIDC', 'LEGACY_CREDENTIAL']),
  accessMode: z.enum(['MANUAL_ONLY', 'BLOCKED_INSECURE_TRANSPORT']),
  transport: z.enum(['HTTPS', 'HTTP_REDIRECT']),
  launchUrl: z.string().url().nullable(),
  verifiedAt: z.string().date(),
  guidance: z.array(z.string().min(1)).min(1),
  limitation: z.string().min(1),
}).strict();

export type ExternalSource = z.infer<typeof externalSourceSchema>;

export const EXTERNAL_SOURCES: readonly ExternalSource[] = [
  {
    key: 'FDA_SKYNET',
    name: 'SKYNET / Privus อย.',
    authority: 'สำนักงานคณะกรรมการอาหารและยา กระทรวงสาธารณสุข',
    coverage: 'ผลิตภัณฑ์และบริการสุขภาพภายใต้สิทธิ์ของเจ้าหน้าที่',
    authMode: 'EGOV_OIDC',
    accessMode: 'MANUAL_ONLY',
    transport: 'HTTPS',
    launchUrl: 'https://privus.fda.moph.go.th/FDA_LOGIN2/HOME/SET_STATE?STATE=3',
    verifiedAt: '2026-08-18',
    guidance: [
      'เข้าสู่ระบบผ่าน Digital ID สำหรับเมนูเจ้าหน้าที่ สสจ. ในหน้าแยก',
      'ค้นเฉพาะวัตถุประสงค์และขอบเขตที่หน่วยงานอนุญาต',
      'ส่งออกผลทางการเป็น PDF หรือภาพหน้าจอที่มีเลขอ้างอิงและวันเวลา',
      'นำไฟล์กลับเข้าคลังหลักฐานเพื่อคำนวณ hash ตรวจรูปแบบ และผูกกับคดี',
    ],
    limitation: 'LawiRisk-SSK ไม่รับหรือเก็บรหัสผ่าน eGov/อย. และไม่ดึงข้อมูลอัตโนมัติจนมี API/ข้อตกลงอย่างเป็นทางการ',
  },
  {
    key: 'HSS_OSS',
    name: 'OSS สบส.',
    authority: 'กรมสนับสนุนบริการสุขภาพ กระทรวงสาธารณสุข',
    coverage: 'สถานพยาบาลและสถานประกอบการด้านสุขภาพภายใต้สิทธิ์ของเจ้าหน้าที่',
    authMode: 'LEGACY_CREDENTIAL',
    accessMode: 'BLOCKED_INSECURE_TRANSPORT',
    transport: 'HTTP_REDIRECT',
    launchUrl: null,
    verifiedAt: '2026-08-18',
    guidance: [
      'ขอ HTTPS endpoint หรือ API ที่ สบส. รับรองสำหรับการใช้งานระบบต่อระบบ',
      'ห้ามกรอก username/password ผ่านตัวเชื่อม LawiRisk-SSK ขณะที่ปลายทางย้อนกลับไป HTTP',
      'เมื่อได้รับช่องทางปลอดภัย ให้ทดสอบ TLS, สิทธิ์, audit และ data minimization ก่อนเปิดใช้',
    ],
    limitation: 'ตรวจพบว่า HTTPS endpoint ย้อนกลับไปหน้าเข้าสู่ระบบแบบ HTTP จึงถูกบล็อกแบบ fail closed',
  },
] as const;

for (const source of EXTERNAL_SOURCES) externalSourceSchema.parse(source);

export function findExternalSource(value: string) {
  const parsed = externalSourceKeySchema.safeParse(value);
  return parsed.success ? EXTERNAL_SOURCES.find((source) => source.key === parsed.data) : undefined;
}

export function isLaunchableSource(source: ExternalSource) {
  if (source.accessMode !== 'MANUAL_ONLY' || source.transport !== 'HTTPS' || !source.launchUrl) return false;
  return new URL(source.launchUrl).protocol === 'https:';
}
