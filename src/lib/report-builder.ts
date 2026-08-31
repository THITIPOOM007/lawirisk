import type { AutomaticAdvice } from './evidence-screening';

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

export type PredictionFormSection = { number: number; title: string; content: string };
export type PredictionFormReport = {
  schemaVersion: 'lawirisk-prediction-form-v1';
  title: string;
  caseNumber: string;
  caseTitle: string;
  generatedAt: string;
  sections: PredictionFormSection[];
  automationSummary?: { status: 'AUTO_ADVICE_READY' | 'DATA_REQUIRED'; summary: string; officialGate: string };
  automatedAdvice?: AutomaticAdvice[];
  sourceSummary?: {
    caseStatus: string;
    evidence: Array<{ filename: string; sha256: string; status: string }>;
    entities: Array<{ type: string; value: string }>;
    relationships: Array<{ type: string }>;
    screenings: Array<{ filename: string; classification: string; summary: string; status: string }>;
  };
  legalAppendix: Array<{ law: string; penalty: string; settlement: string }>;
  reviewNotice: string;
};

export function buildPredictionFormReport(input: {
  caseRecord: ReportCase;
  evidence: ReportEvidence[];
  sourcedEntities: ReportEntity[];
  sourcedRelationships: ReportRelationship[];
  screenings?: Array<{ filename: string; classification: string; summary: string; status: string }>;
  automaticAdvice?: AutomaticAdvice[];
  generatedAt?: Date;
}): PredictionFormReport {
  const generatedAt = input.generatedAt || new Date();
  const evidenceList = input.evidence.length
    ? input.evidence.map((item, index) => `${index + 1}. ${item.filename}\nSHA-256: ${item.sha256}`).join('\n')
    : 'ยังไม่มีไฟล์หลักฐานที่อยู่ในขอบเขต';
  const verifiedSignals = input.sourcedEntities.length
    ? input.sourcedEntities.map((item) => `• ${item.type}: ${item.value}`).join('\n')
    : 'ยังไม่มีข้อมูลที่ผู้ตรวจทานยืนยันพร้อมแหล่งอ้างอิง';
  const screeningLines = (input.screenings || []).length
    ? (input.screenings || []).map((item) => `• ${item.filename}: ${item.summary} [${item.classification}/${item.status}]`).join('\n')
    : 'ยังไม่มีผลสกรีนนิ่งหลักฐาน กรุณารันสกรีนนิ่งในหน้าคดี';
  const automaticAdvice = input.automaticAdvice || [];
  const adviceLines = automaticAdvice.length
    ? automaticAdvice.map((item, index) => `${index + 1}. [${item.priority}] ${item.title}\nคำแนะนำ: ${item.recommendation}\nเหตุผล: ${item.rationale}\nความเชื่อมั่น: ${Math.round(item.confidence * 100)}% · แหล่งอ้างอิง ${item.sourceCount}`).join('\n\n')
    : 'ยังไม่มีคำแนะนำอัตโนมัติ กรุณารันการค้นหาและสกรีนนิ่งจากหน้าคดี';
  const legalResearchAdvice = automaticAdvice.filter((item) => item.category === 'LEGAL_RESEARCH');
  const evidencePriorityAdvice = automaticAdvice.filter((item) => ['EVIDENCE_PRIORITY', 'CONFLICT_CHECK'].includes(item.category));

  return {
    schemaVersion: 'lawirisk-prediction-form-v1',
    title: 'ฟอร์มกำหนดคาดการณ์เรื่องร้องเรียน',
    caseNumber: input.caseRecord.number,
    caseTitle: input.caseRecord.title,
    generatedAt: generatedAt.toISOString(),
    automationSummary: {
      status: automaticAdvice.length ? 'AUTO_ADVICE_READY' : 'DATA_REQUIRED',
      summary: `ระบบสร้างคำแนะนำอัตโนมัติ ${automaticAdvice.length} ข้อ จากหลักฐาน ${input.evidence.length} รายการ`,
      officialGate: 'อ่านและใช้จัดลำดับงานได้ทันที การรับรองจำเป็นเฉพาะเมื่อนำไปบันทึกเป็นข้อเท็จจริงหรือข้อกฎหมายอย่างเป็นทางการ',
    },
    automatedAdvice: automaticAdvice,
    sourceSummary: {
      caseStatus: input.caseRecord.status,
      evidence: input.evidence.map((item) => ({ filename: item.filename, sha256: item.sha256, status: item.malware_scan_status || 'ไม่ทราบ' })),
      entities: input.sourcedEntities,
      relationships: input.sourcedRelationships,
      screenings: input.screenings || [],
    },
    sections: [
      { number: 1, title: 'ผู้ร้องเรียน', content: 'ยังไม่มีข้อมูลผู้ร้องเรียนที่ยืนยันในชุดข้อมูลคดีนี้ กรุณาตรวจจากรายการรับเรื่องและกรอกโดยเจ้าหน้าที่' },
      { number: 2, title: 'ประเด็นผู้ร้องเรียนระบุ', content: input.caseRecord.description || input.caseRecord.title },
      { number: 3, title: 'วัน เวลา และสถานที่เกิดเหตุร้องเรียน โดยสรุป', content: `วันที่สร้างสำนวน: ${new Date(input.caseRecord.created_at).toLocaleString('th-TH')}\nพื้นที่รับผิดชอบ: ${input.caseRecord.jurisdiction_region || 'ยังไม่ระบุ'}\n${input.caseRecord.description || 'ยังไม่มีรายละเอียดวัน เวลา และสถานที่ที่ยืนยัน'}` },
      { number: 4, title: 'เป้าหมายพื้นที่ลงตรวจ', content: `${input.caseRecord.jurisdiction_region || 'ยังไม่ระบุพื้นที่'}\nหน่วยงาน: ${input.caseRecord.jurisdiction_agency || 'ยังไม่ระบุหน่วยงาน'}\nข้อมูลที่ยืนยันแล้ว:\n${verifiedSignals}` },
      { number: 5, title: 'ประเด็นข้อเท็จจริงและความเสี่ยงที่ระบบแนะนำให้ตรวจ', content: `${evidencePriorityAdvice.length ? evidencePriorityAdvice.map((item) => `• ${item.title}: ${item.recommendation} (${Math.round(item.confidence * 100)}%)`).join('\n') : screeningLines}\n\nระบบแสดงประเด็นตรวจสอบโดยอัตโนมัติ แต่ไม่วินิจฉัยข้อหาหรือความผิดแทนพนักงานเจ้าหน้าที่` },
      { number: 6, title: 'หัวข้อกฎหมายที่ระบบแนะนำให้สืบค้นต่อ', content: `${legalResearchAdvice.length ? legalResearchAdvice.map((item) => `• ${item.recommendation}\nเหตุผล: ${item.rationale}`).join('\n\n') : 'ตรวจฐานกฎหมายทางการจากประเภทกิจการ ใบอนุญาต ฉลาก การโฆษณา และอำนาจหน้าที่ที่เกี่ยวข้องกับข้อเท็จจริงในคดี'}\n\nหัวข้อนี้เป็นคำแนะนำการค้นคว้า ไม่ใช่การยืนยันมาตรา ข้อหา หรือบทลงโทษ` },
      { number: 7, title: 'ของกลางที่คาดว่าจะเก็บและยึดหรืออายัด', content: `รายการหลักฐานดิจิทัลที่อยู่ในขอบเขต snapshot:\n${evidenceList}` },
      { number: 8, title: 'ผู้ร่วมปฏิบัติการลงตรวจสอบเรื่องร้องเรียน', content: `หน่วยงานเจ้าของสำนวน: ${input.caseRecord.jurisdiction_agency || 'ยังไม่ระบุ'}\nรายชื่อผู้ปฏิบัติให้ยืนยันจากทะเบียนสมาชิกคดีก่อนลงนาม` },
      { number: 9, title: 'เอกสารที่ใช้', content: evidenceList },
      { number: 10, title: 'แนวทางดำเนินการและคำแนะนำอัตโนมัติ', content: `${adviceLines}\n\nผลสกรีนนิ่ง:\n${screeningLines}\n\nความสัมพันธ์ที่ยืนยันพร้อมแหล่งอ้างอิง: ${input.sourcedRelationships.length} รายการ\nคำแนะนำข้างต้นใช้จัดลำดับงานได้ทันที ส่วนการบันทึกเป็นข้อเท็จจริงทางการต้องเปิดต้นฉบับ ตรวจ SHA-256 และบันทึกเหตุผลการรับรอง` },
    ],
    legalAppendix: [],
    reviewNotice: 'คำแนะนำอัตโนมัติในเอกสารนี้ใช้วางแผนและจัดลำดับงานได้ทันที แต่ไม่ใช่ข้อวินิจฉัยความผิดหรือคำสั่งทางปกครอง การรับรองโดยเจ้าหน้าที่ใช้เฉพาะส่วนที่จะบันทึกเป็นข้อเท็จจริง ความสัมพันธ์ ข้อหา หรือข้อกฎหมายอย่างเป็นทางการ',
  };
}

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
