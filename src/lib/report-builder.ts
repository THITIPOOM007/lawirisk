export type ReportCase = {
  number: string;
  title: string;
  description?: string | null;
  status: string;
  jurisdiction_region?: string | null;
  jurisdiction_agency?: string | null;
  created_at: string;
};

export type ReportEvidence = {
  filename: string;
  sha256: string;
  malware_scan_status?: string | null;
};

export type ReportEntity = { type: string; value: string };
export type ReportRelationship = { type: string };

export function buildCaseReport(input: {
  caseRecord: ReportCase;
  reportType: 'SUMMARY' | 'OVERLAP';
  evidence: ReportEvidence[];
  sourcedEntities: ReportEntity[];
  sourcedRelationships: ReportRelationship[];
  generatedAt?: Date;
}) {
  const generatedAt = input.generatedAt || new Date();
  const typeTitle = input.reportType === 'SUMMARY'
    ? 'รายงานสรุปข้อมูลคดีจากแหล่งอ้างอิงที่ยืนยันแล้ว'
    : 'รายงานจุดทับซ้อนเพื่อการตรวจสอบโดยเจ้าหน้าที่';
  const evidenceLines = input.evidence.length
    ? input.evidence.map((item) => `- ${item.filename} | SHA-256 ${item.sha256} | สถานะไฟล์ ${item.malware_scan_status || 'ไม่ทราบ'}`).join('\n')
    : '- ไม่มีหลักฐานที่เข้าถึงได้';
  const entityLines = input.sourcedEntities.length
    ? input.sourcedEntities.map((item) => `- ${item.type}: ${item.value}`).join('\n')
    : '- ไม่มีเอนทิตีที่มี source mention ยืนยัน';
  const relationshipLines = input.sourcedRelationships.length
    ? input.sourcedRelationships.map((item) => `- ความสัมพันธ์ประเภท ${item.type} (ตรวจ source reference แล้ว)`).join('\n')
    : '- ไม่มีความสัมพันธ์ที่ผ่านการยืนยันพร้อม source reference';

  return `${typeTitle}

เลขคดี: ${input.caseRecord.number}
ชื่อคดี: ${input.caseRecord.title}
สถานะ: ${input.caseRecord.status}
หน่วยงาน: ${input.caseRecord.jurisdiction_agency || '-'}
พื้นที่: ${input.caseRecord.jurisdiction_region || '-'}
วันที่สร้างรายงาน: ${generatedAt.toISOString()}

ขอบเขต
รายงานนี้เป็นเครื่องมือช่วยจัดระเบียบหลักฐาน ไม่ใช่ข้อวินิจฉัยความผิด ตัวตน เจตนา ความเป็นเจ้าของ หรือความรับผิด

รายละเอียดคดี
${input.caseRecord.description || 'ไม่มีรายละเอียด'}

หลักฐานต้นฉบับที่อยู่ในขอบเขต
${evidenceLines}

เอนทิตีที่มีแหล่งอ้างอิง
${entityLines}

ความสัมพันธ์ที่มนุษย์ยืนยันและมีแหล่งอ้างอิง
${relationshipLines}

หมายเหตุ
ระบบเก็บ snapshot ของ evidence ID, page และ SHA-256 แยกจากข้อความนี้ การแก้ไขข้อมูลภายหลังจะไม่เปลี่ยนรายงานฉบับนี้โดยอัตโนมัติ`;
}
