import { z } from 'zod';

export const caseIntelligenceRequestSchema = z.object({
  case_id: z.string().trim().min(1).max(100),
}).strict();

export type ReconDimensionStatus = 'AVAILABLE' | 'LOCAL_AUTO_LOGIN' | 'REVIEW_REQUIRED' | 'RISK_ACK_REQUIRED';

export type ReconDimension = {
  key:
    | 'IDENTITY_BUSINESS'
    | 'FACILITY'
    | 'PRODUCT_REGISTRY'
    | 'PROFESSIONAL'
    | 'PERSON_CONTACT'
    | 'PHOTO_IMAGE'
    | 'LOCATION'
    | 'CROSS_CASE'
    | 'CIRCUMSTANTIAL'
    | 'LEGAL_REVIEW';
  label: string;
  status: ReconDimensionStatus;
  summary: string;
  source: string;
  actionHref?: string;
};

export type CaseReconSummary = {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  generatedAt: string;
  evidenceCount: number;
  entityCount: number;
  verifiedRelationshipCount: number;
  crossCaseMatchCount: number;
  dimensions: ReconDimension[];
  notice: string;
};

export type DossierDocument = {
  id: string;
  title: string;
  purpose: string;
  plainText: string;
};

export function buildCaseReconSummary(input: {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  evidenceCount: number;
  entityCount: number;
  verifiedRelationshipCount: number;
  crossCaseMatchCount: number;
}): CaseReconSummary {
  return {
    ...input,
    generatedAt: new Date().toISOString(),
    dimensions: [
      {
        key: 'IDENTITY_BUSINESS',
        label: 'ทะเบียนบุคคลและนิติบุคคล',
        status: 'REVIEW_REQUIRED',
        summary: 'เตรียมตรวจชื่อ เลขประจำตัว และนิติบุคคลจาก DOPA/DBD; ยังต้องเพิ่ม adapter ของระบบที่บัญชีเจ้าหน้าที่ได้รับสิทธิ์ก่อนค้นอัตโนมัติ',
        source: 'DOPA / DBD',
      },
      {
        key: 'FACILITY',
        label: 'ทะเบียนสถานพยาบาล',
        status: 'RISK_ACK_REQUIRED',
        summary: 'Recon Companion กรอกบัญชีและกดเข้าสู่ OSS สบส. ได้บนเครื่อง แต่ปลายทางเป็น HTTP จึงต้องยืนยันความเสี่ยงทุกครั้ง',
        source: 'กรมสนับสนุนบริการสุขภาพ',
        actionHref: '/sources',
      },
      {
        key: 'PRODUCT_REGISTRY',
        label: 'ผลิตภัณฑ์และทะเบียน อย.',
        status: 'LOCAL_AUTO_LOGIN',
        summary: 'Recon Companion เปิด SKYNET ผ่าน DGA OIDC/PKCE ใหม่และล็อกอินให้อัตโนมัติ; OTP/MFA/CAPTCHA ยังต้องให้เจ้าหน้าที่ดำเนินการ',
        source: 'FDA SKYNET / DGA Digital ID',
        actionHref: '/sources',
      },
      {
        key: 'PROFESSIONAL',
        label: 'ใบประกอบวิชาชีพ',
        status: 'REVIEW_REQUIRED',
        summary: 'ต้องตรวจผ่านระบบทางการของสภาวิชาชีพและเก็บเลขอ้างอิง/วันเวลาของผลตรวจ',
        source: 'แพทยสภา / ทันตแพทยสภา / สภาวิชาชีพ',
      },
      {
        key: 'PERSON_CONTACT',
        label: 'ชื่อ เบอร์โทร และช่องทางติดต่อ',
        status: 'AVAILABLE',
        summary: `พร้อมค้น exact/normalized จากข้อเท็จจริงภายใน ${input.entityCount} รายการและ match candidate ${input.crossCaseMatchCount} รายการ; ผลภายนอกต้องผูก URL/วันเวลาและให้คนยืนยัน`,
        source: 'LAW-i-RISK entities / matches / approved public sources',
        actionHref: '/entities',
      },
      {
        key: 'PHOTO_IMAGE',
        label: 'ภาพถ่ายและภาพเชื่อมโยง',
        status: 'REVIEW_REQUIRED',
        summary: 'รองรับจัดเก็บภาพต้นฉบับและ hash แล้ว แต่ reverse-image/face search ภายนอกต้องเลือกผู้ให้บริการที่ได้รับอนุญาตและยืนยันก่อนส่งภาพบุคคลออกนอกระบบ',
        source: 'Private evidence / approved image-search provider',
        actionHref: '/evidence',
      },
      {
        key: 'LOCATION',
        label: 'พิกัดและสถานที่',
        status: 'REVIEW_REQUIRED',
        summary: 'เตรียมตรวจที่อยู่ พิกัด สภาพแวดล้อม และภาพสถานที่ โดยเก็บ URL/วันเวลา/ภาพอ้างอิงและไม่ถือว่าพิกัดที่ยังไม่ยืนยันเป็นข้อเท็จจริง',
        source: 'Google Maps / official address records',
        actionHref: 'https://www.google.com/maps',
      },
      {
        key: 'CIRCUMSTANTIAL',
        label: 'พยานแวดล้อมและลำดับเหตุการณ์',
        status: 'AVAILABLE',
        summary: `รวบรวมหลักฐาน ${input.evidenceCount} รายการ ข้อเท็จจริง ${input.entityCount} รายการ และความสัมพันธ์ที่ยืนยันแล้ว ${input.verifiedRelationshipCount} รายการ เพื่อจัด timeline และตรวจความสอดคล้อง`,
        source: 'LAW-i-RISK evidence / graph / audit trail',
        actionHref: '/universe',
      },
      {
        key: 'CROSS_CASE',
        label: 'ความเชื่อมโยงข้ามคดี',
        status: 'AVAILABLE',
        summary: `พบ match candidate ${input.crossCaseMatchCount} รายการ และความสัมพันธ์ที่รับรองแล้ว ${input.verifiedRelationshipCount} รายการในฐานข้อมูลภายใน`,
        source: 'LAW-i-RISK internal evidence graph',
        actionHref: '/matches',
      },
      {
        key: 'LEGAL_REVIEW',
        label: 'ประเด็นกฎหมาย',
        status: 'REVIEW_REQUIRED',
        summary: 'ระบบจัดชุดข้อเท็จจริงและแหล่งอ้างอิงให้ตรวจ แต่ไม่ฟันธงความผิดหรือโทษอัตโนมัติ',
        source: 'เจ้าหน้าที่กฎหมาย/ผู้มีอำนาจตรวจทาน',
      },
    ],
    notice: 'ผลนี้เป็น workspace สำหรับรวบรวมและตรวจสอบ ไม่ใช่ผลยืนยันตัวบุคคล ใบอนุญาต ความผิด หรือคำสั่งทางราชการ',
  };
}

function lines(values: string[], empty: string) {
  return values.length ? values.map((value, index) => `${index + 1}. ${value}`).join('\n') : empty;
}

export function buildVerifiedDossierDocuments(input: {
  caseNumber: string;
  caseTitle: string;
  description?: string | null;
  evidence: Array<{ filename: string; sha256: string }>;
  verifiedFacts: string[];
  verifiedRelationships: string[];
}): DossierDocument[] {
  const generated = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const evidenceLines = lines(
    input.evidence.map((item) => `${item.filename} — SHA-256 ${item.sha256}`),
    'ยังไม่มีหลักฐานที่จัดเก็บและตรวจโครงสร้างแล้ว',
  );
  const factLines = lines(input.verifiedFacts, 'ยังไม่มีข้อเท็จจริงที่ผ่านการตรวจทาน');
  const relationshipLines = lines(input.verifiedRelationships, 'ยังไม่มีความสัมพันธ์ที่ผ่านการรับรอง');
  const header = `สำนวน ${input.caseNumber}\n${input.caseTitle}\nจัดทำเมื่อ ${generated}`;
  const disclaimer = 'สถานะเอกสาร: ร่างเพื่อการตรวจทาน ห้ามใช้เป็นข้อยืนยันความผิด หมายจับ หรือคำสั่งปฏิบัติการจนกว่าผู้มีอำนาจจะตรวจและลงนาม';

  return [
    {
      id: 'preliminary-brief',
      title: 'ร่างสรุปข้อมูลสืบสวนเบื้องต้น',
      purpose: 'รวบรวมข้อเท็จจริงและหลักฐานที่ตรวจย้อนกลับได้',
      plainText: `${header}\n\n${disclaimer}\n\nพฤติการณ์ที่บันทึกในสำนวน\n${input.description || 'ไม่ได้ระบุ'}\n\nหลักฐานต้นฉบับ\n${evidenceLines}\n\nข้อเท็จจริงที่ผ่านการตรวจทาน\n${factLines}\n\nความเชื่อมโยงที่รับรองแล้ว\n${relationshipLines}\n\nรายการที่ยังต้องตรวจจากหน่วยงานเจ้าของข้อมูล\n1. ตัวบุคคล/นิติบุคคลจาก DOPA/DBD\n2. สถานพยาบาลจากกรม สบส.\n3. ใบประกอบวิชาชีพจากสภาที่เกี่ยวข้อง\n4. ตำแหน่งและสภาพสถานที่จริง\n5. ประเด็นกฎหมายและอำนาจดำเนินการ`,
    },
    {
      id: 'verification-checklist',
      title: 'เช็กลิสต์ขอตรวจสอบข้อมูลทางการ',
      purpose: 'ใช้ควบคุมการตรวจแหล่งภายนอกโดยเจ้าหน้าที่',
      plainText: `${header}\n\n${disclaimer}\n\n□ ระบุวัตถุประสงค์และฐานอำนาจก่อนค้น\n□ ใช้บัญชีเจ้าหน้าที่ในระบบของหน่วยงานเจ้าของข้อมูลโดยตรง\n□ บันทึกเลขอ้างอิง แหล่งที่มา และวันเวลา\n□ ส่งออกเฉพาะข้อมูลขั้นต่ำที่จำเป็น\n□ นำ PDF/ภาพผลทางการเข้าคลังหลักฐานของสำนวน\n□ ผูกข้อเท็จจริงกับหน้า/ช่วงข้อความของหลักฐาน\n□ ให้ผู้มีอำนาจตรวจทานก่อนยืนยัน\n□ ห้ามคัดลอกรหัสผ่าน token หรือข้อมูลลับลงหมายเหตุ/URL/log`,
    },
    {
      id: 'field-checklist',
      title: 'ร่างเช็กลิสต์เตรียมลงพื้นที่',
      purpose: 'รายการเตรียมงานทั่วไปที่ต้องปรับตามคำสั่งและฐานอำนาจจริง',
      plainText: `${header}\n\n${disclaimer}\n\n□ ตรวจคำสั่ง/หนังสือมอบหมายและขอบเขตอำนาจ\n□ ยืนยันสถานที่ วันเวลา ทีม และผู้ประสานงาน\n□ ทบทวนความเสี่ยงด้านความปลอดภัยและข้อมูลส่วนบุคคล\n□ เตรียมแบบบันทึกภาพ/วิดีโอและ chain of custody\n□ เตรียมหมายเลขถุง/ฉลาก/รายการทรัพย์หรือเอกสาร\n□ บันทึกผู้เก็บ ผู้รับ เวลา และ hash ของหลักฐานดิจิทัล\n□ แยกข้อสังเกตออกจากข้อเท็จจริงที่ยืนยันแล้ว\n□ ส่งร่างให้ผู้บังคับบัญชาและฝ่ายกฎหมายตรวจทาน`,
    },
  ];
}
