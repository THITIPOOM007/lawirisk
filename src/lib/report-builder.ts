import type { AutomaticAdvice } from './evidence-screening';
import type { ReportIntakeContext } from './report-context';

export type ReportCase = { number: string; title: string; description?: string | null; status: string; jurisdiction_region?: string | null; jurisdiction_agency?: string | null; created_at: string };
export type ReportEvidence = { filename: string; sha256: string; malware_scan_status?: string | null; mime_type?: string | null; file_size?: number | null; created_at?: string | null };
export type ReportEntity = { type: string; value: string };
export type ReportRelationship = { type: string };
export type PredictionFormSection = { number: number; title: string; content: string };
export type PredictionFormReport = {
  schemaVersion: 'lawirisk-prediction-form-v1' | 'lawirisk-prediction-form-v2'; title: string; caseNumber: string; caseTitle: string; generatedAt: string;
  sections: PredictionFormSection[];
  dataQuality?: { status: 'COMPLETE' | 'PARTIAL'; score: number; missingFields: string[]; sourceCount: number };
  automationSummary?: { status: 'AUTO_ADVICE_READY' | 'DATA_REQUIRED'; summary: string; officialGate: string };
  automatedAdvice?: AutomaticAdvice[];
  sourceSummary?: {
    caseStatus: string; intake?: Array<{ label: string; value: string; source: string }>;
    officialChecks?: Array<{ source: string; sourceUrl?: string; query: string; status: string; summary: string; checkedAt: string }>;
    evidence: Array<{ filename: string; sha256: string; status: string; detail?: string }>;
    entities: Array<{ type: string; value: string }>; relationships: Array<{ type: string }>;
    screenings: Array<{ filename: string; classification: string; summary: string; status: string }>;
  };
  legalAppendix: Array<{ law: string; penalty: string; settlement: string }>; reviewNotice: string;
};

const missing = 'ยังไม่มีข้อมูลจากต้นทางใน snapshot ฉบับนี้';
const present = (value?: string | null) => value?.trim() || '';
const thaiDate = (value?: string | null) => value ? new Date(value).toLocaleString('th-TH') : missing;

function participantLines(context: ReportIntakeContext | undefined, role: string) {
  const rows = (context?.participants || []).filter((item) => item.role === role);
  if (!rows.length) return context?.complainantMode === 'ANONYMOUS' && role === 'COMPLAINANT' ? 'ผู้ร้องไม่ประสงค์ออกนาม' : missing;
  return rows.map((item, index) => [
    `${index + 1}. ${present(item.name) || 'ไม่ระบุชื่อ'}`, present(item.phone) && `โทรศัพท์ ${item.phone}`,
    present(item.email) && `อีเมล ${item.email}`, present(item.address) && `ที่อยู่ ${item.address}`,
  ].filter(Boolean).join(' · ')).join('\n');
}

function recommendedCollection(category?: string | null) {
  const common = ['ภาพถ่าย/วิดีโอ ณ จุดตรวจพร้อมวันเวลาและผู้เก็บ', 'สำเนาใบอนุญาต ฉลาก และเอกสารการซื้อขาย', 'บันทึกคำให้การและบัญชีรายการที่เก็บ/ยึด/อายัด', 'สำเนาหน้าเว็บต้นทางพร้อม URL วันเวลา และค่าแฮช'];
  if (category === 'HEALTH_HAZARD') return ['ตัวอย่างผลิตภัณฑ์และบรรจุภัณฑ์แต่ละรุ่นผลิต', 'ฉลาก เลขสารบบ/ทะเบียน เลขรุ่นผลิต และวันหมดอายุ', 'สภาพสถานที่ผลิต อุปกรณ์ วัตถุดิบ และการจัดเก็บ', ...common];
  if (category === 'ILLEGAL_CLINIC') return ['ใบอนุญาตสถานพยาบาลและผู้ดำเนินการ', 'รายชื่อผู้ประกอบวิชาชีพ เวชระเบียน และป้ายโฆษณา', ...common];
  if (category === 'ONLINE_FRAUD') return ['บทสนทนา ลิงก์บัญชี/เพจ และภาพหน้าจอแบบเต็มหน้า', 'หลักฐานการชำระเงิน เลขบัญชี และวันเวลา', ...common];
  return common;
}

function calculateQuality(intake: ReportIntakeContext | undefined, evidenceCount: number, sourceCount: number, entities: ReportEntity[]) {
  const hasEntity = (type: string) => entities.some((item) => item.type === type && present(item.value));
  const fields = [
    ['ผู้ร้องเรียน', intake?.complainantMode === 'ANONYMOUS' || (intake?.participants || []).some((p) => p.role === 'COMPLAINANT')],
    ['ประเด็นร้องเรียน', Boolean(present(intake?.topic) || present(intake?.description))],
    ['วันหรือเวลาที่เกิดเหตุ', Boolean(present(intake?.incidentDate) || present(intake?.incidentTime))],
    ['สถานที่เกิดเหตุ/เป้าหมาย', Boolean(present(intake?.incidentLocation) || present(intake?.businessAddress) || present(intake?.region) || hasEntity('LOCATION'))],
    ['ชื่อผลิตภัณฑ์/กิจการ', Boolean(present(intake?.productName) || present(intake?.businessName) || hasEntity('ORGANIZATION'))],
    ['เลขทะเบียน/ใบอนุญาต', Boolean(present(intake?.registrationNumber) || (intake?.officialChecks || []).some((item) => present(item.query)))], ['หลักฐานต้นฉบับ', evidenceCount > 0],
    ['ผลตรวจฐานข้อมูลทางการ', (intake?.officialChecks || []).length > 0],
  ] as const;
  const missingFields = fields.filter(([, ok]) => !ok).map(([label]) => label);
  return { status: missingFields.length ? 'PARTIAL' as const : 'COMPLETE' as const, score: Math.round(((fields.length - missingFields.length) / fields.length) * 100), missingFields, sourceCount };
}

export function buildPredictionFormReport(input: {
  caseRecord: ReportCase; evidence: ReportEvidence[]; sourcedEntities: ReportEntity[]; sourcedRelationships: ReportRelationship[];
  screenings?: Array<{ filename: string; classification: string; summary: string; status: string }>;
  automaticAdvice?: AutomaticAdvice[]; intakeContexts?: ReportIntakeContext[]; generatedAt?: Date;
}): PredictionFormReport {
  const generatedAt = input.generatedAt || new Date();
  const intake = input.intakeContexts?.[0];
  const automaticAdvice = input.automaticAdvice || [];
  const officialChecks = intake?.officialChecks || [];
  const verifiedLocations = input.sourcedEntities.filter((item) => item.type === 'LOCATION').map((item) => item.value);
  const verifiedOrganizations = input.sourcedEntities.filter((item) => item.type === 'ORGANIZATION').map((item) => item.value);
  const evidenceList = input.evidence.length ? input.evidence.map((item, index) => {
    const detail = [item.mime_type, typeof item.file_size === 'number' ? `${item.file_size.toLocaleString('th-TH')} ไบต์` : '', item.created_at ? `รับเข้า ${thaiDate(item.created_at)}` : ''].filter(Boolean).join(' · ');
    return `${index + 1}. ${item.filename}\nSHA-256: ${item.sha256}${detail ? `\n${detail}` : ''}`;
  }).join('\n') : missing;
  const verifiedSignals = input.sourcedEntities.length ? input.sourcedEntities.map((item) => `• ${item.type}: ${item.value}`).join('\n') : missing;
  const screeningLines = (input.screenings || []).length ? (input.screenings || []).map((item) => `• ${item.filename}: ${item.summary} [${item.classification}/${item.status}]`).join('\n') : missing;
  const adviceLines = automaticAdvice.length ? automaticAdvice.map((item, index) => `${index + 1}. [${item.priority}] ${item.title}\nคำแนะนำ: ${item.recommendation}\nเหตุผล: ${item.rationale}\nความเชื่อมั่น: ${Math.round(item.confidence * 100)}% · แหล่งอ้างอิง ${item.sourceCount}`).join('\n\n') : 'ระบบยังไม่มีคำแนะนำอัตโนมัติที่มีข้อมูลรองรับเพียงพอ';
  const legalAdvice = automaticAdvice.filter((item) => item.category === 'LEGAL_RESEARCH');
  const priorityAdvice = automaticAdvice.filter((item) => ['EVIDENCE_PRIORITY', 'CONFLICT_CHECK'].includes(item.category));
  const officialLines = officialChecks.length ? officialChecks.map((check, index) => {
    const results = check.results.length ? check.results.map((result, resultIndex) => {
      const metadata = result.metadata ? Object.entries(result.metadata).map(([key, value]) => `${key}: ${value}`).join(' · ') : '';
      return `  ${resultIndex + 1}) ${result.title}${result.snippet ? ` — ${result.snippet}` : ''}${metadata ? `\n     ${metadata}` : ''}`;
    }).join('\n') : '  ไม่มีรายการผลลัพธ์ที่บันทึกไว้';
    return `${index + 1}. ${check.sourceLabel}\nคำค้น: ${check.query}\nผล: ${check.status} (${check.resultCount} รายการ) · ${check.summary}\nรายการที่พบ:\n${results}\nตรวจเมื่อ: ${thaiDate(check.checkedAt)}\nต้นทาง: ${check.sourceUrl}`;
  }).join('\n\n') : missing;
  const issue = [present(intake?.topic), present(intake?.description), present(intake?.purchaseDetails) && `รายละเอียดการซื้อ/พบเหตุ: ${intake?.purchaseDetails}`].filter(Boolean).join('\n') || input.caseRecord.description || input.caseRecord.title;
  const target = [`ชื่อกิจการ/เป้าหมาย: ${present(intake?.businessName) || verifiedOrganizations.join(', ') || missing}`, `ที่อยู่: ${present(intake?.businessAddress) || verifiedLocations.join(', ') || missing}`, present(intake?.productName) && `ผลิตภัณฑ์: ${intake?.productName}`, present(intake?.registrationNumber) && `ทะเบียน/ใบอนุญาต: ${intake?.registrationNumber}`, `พื้นที่รับผิดชอบ: ${present(intake?.region) || present(input.caseRecord.jurisdiction_region) || verifiedLocations.join(', ') || missing}`, `ผลตรวจฐานทางการ:\n${officialLines}`, `ข้อมูลที่ยืนยันพร้อม source trace:\n${verifiedSignals}`].filter(Boolean).join('\n');
  const collection = recommendedCollection(intake?.category).map((item, index) => `${index + 1}. ${item}`).join('\n');
  const sourceCount = input.evidence.length + input.sourcedEntities.length + input.sourcedRelationships.length + officialChecks.length + (intake ? 1 : 0);
  const quality = calculateQuality(intake, input.evidence.length, sourceCount, input.sourcedEntities);
  return {
    schemaVersion: 'lawirisk-prediction-form-v2', title: 'ฟอร์มกำหนดคาดการณ์และติดตามเรื่องร้องเรียน', caseNumber: input.caseRecord.number,
    caseTitle: input.caseRecord.title, generatedAt: generatedAt.toISOString(), dataQuality: quality,
    automationSummary: { status: automaticAdvice.length || officialChecks.length ? 'AUTO_ADVICE_READY' : 'DATA_REQUIRED', summary: `ระบบรวบรวมแหล่งข้อมูล ${sourceCount} รายการ ผลตรวจทะเบียนทางการ ${officialChecks.length} รายการ และคำแนะนำอัตโนมัติ ${automaticAdvice.length} ข้อ`, officialGate: 'ใช้ผลอัตโนมัติเพื่อจัดลำดับงานได้ทันที แต่ข้อเท็จจริง ข้อหา และข้อกฎหมายต้องอ้างต้นทางและผ่านอำนาจของพนักงานเจ้าหน้าที่' },
    automatedAdvice: automaticAdvice,
    sourceSummary: {
      caseStatus: input.caseRecord.status,
      intake: [
        ['เลขติดตาม', present(intake?.trackingToken)], ['วันที่รับเรื่อง', intake?.receivedAt ? thaiDate(intake.receivedAt) : ''], ['ประเด็นร้องเรียน', present(intake?.topic)],
        ['ผลิตภัณฑ์', present(intake?.productName)], ['ทะเบียน/ใบอนุญาต', present(intake?.registrationNumber)], ['กิจการ/เป้าหมาย', present(intake?.businessName)],
        ['สถานที่', present(intake?.incidentLocation) || present(intake?.businessAddress)], ['เหตุผลคัดกรอง', present(intake?.triageReason)],
      ].filter((entry) => entry[1]).map(([label, value]) => ({ label, value, source: 'รายการรับเรื่องและการคัดกรองที่เชื่อมกับคดี' })),
      officialChecks: officialChecks.map((check) => ({
        source: check.sourceLabel, sourceUrl: check.sourceUrl, query: check.query, status: `${check.status} / ${check.classification}`,
        summary: check.summary,
        checkedAt: check.checkedAt,
      })),
      evidence: input.evidence.map((item) => ({ filename: item.filename, sha256: item.sha256, status: item.malware_scan_status || 'ไม่ทราบ', detail: [item.mime_type, item.created_at].filter(Boolean).join(' · ') })),
      entities: input.sourcedEntities, relationships: input.sourcedRelationships, screenings: input.screenings || [],
    },
    sections: [
      { number: 1, title: 'ผู้ร้องเรียน', content: participantLines(intake, 'COMPLAINANT') },
      { number: 2, title: 'ประเด็นที่ผู้ร้องเรียนระบุ', content: `สถานะข้อมูล: ข้อกล่าวอ้างจากผู้ร้อง ยังไม่ใช่ข้อเท็จจริงที่รับรอง\n${issue}` },
      { number: 3, title: 'วัน เวลา และสถานที่เกิดเหตุร้องเรียนโดยสรุป', content: `วันที่รับเรื่อง: ${intake?.receivedAt ? thaiDate(intake.receivedAt) : missing}\nวันที่เกิดเหตุ: ${present(intake?.incidentDate) || missing}\nเวลาเกิดเหตุ: ${present(intake?.incidentTime) || missing}\nสถานที่เกิดเหตุ: ${present(intake?.incidentLocation) || present(intake?.businessAddress) || verifiedLocations.join(', ') || missing}\nพื้นที่: ${present(intake?.region) || present(input.caseRecord.jurisdiction_region) || verifiedLocations.join(', ') || missing}` },
      { number: 4, title: 'เป้าหมายและผลตรวจข้อมูลเบื้องต้น', content: target },
      { number: 5, title: 'ประเด็นข้อเท็จจริงและความเสี่ยงที่ระบบแนะนำให้ตรวจ', content: `${priorityAdvice.length ? priorityAdvice.map((item) => `• ${item.title}: ${item.recommendation} (${Math.round(item.confidence * 100)}%)`).join('\n') : screeningLines}\n\nระบบแนะนำประเด็นตรวจโดยอัตโนมัติและไม่วินิจฉัยข้อหาหรือความผิดแทนเจ้าหน้าที่` },
      { number: 6, title: 'หัวข้อกฎหมายที่ระบบแนะนำให้สืบค้นต่อ', content: `${legalAdvice.length ? legalAdvice.map((item) => `• ${item.recommendation}\nเหตุผล: ${item.rationale}`).join('\n\n') : 'ตรวจฐานกฎหมายทางการตามประเภทผลิตภัณฑ์/กิจการ ใบอนุญาต ฉลาก การโฆษณา และอำนาจหน้าที่'}\n\nหัวข้อนี้ไม่ใช่การยืนยันข้อกฎหมาย และยังไม่ใส่มาตรา โทษ หรือยอดเปรียบเทียบปรับจนกว่าจะมีแหล่งกฎหมายทางการใน snapshot` },
      { number: 7, title: 'รายการที่ระบบแนะนำให้เก็บ ยึด หรืออายัด', content: `คำแนะนำตามประเภทเรื่อง:\n${collection}\n\nหลักฐานดิจิทัลที่มีอยู่แล้ว:\n${evidenceList}` },
      { number: 8, title: 'ผู้ร่วมปฏิบัติการลงตรวจสอบเรื่องร้องเรียน', content: `หน่วยงานเจ้าของสำนวน: ${present(input.caseRecord.jurisdiction_agency) || missing}\nรายชื่อผู้ปฏิบัติ: ${missing}\nต้องดึงจากทะเบียนสมาชิกคดีก่อนลงนาม` },
      { number: 9, title: 'เอกสารและหลักฐานที่ใช้', content: evidenceList },
      { number: 10, title: 'แนวทางดำเนินการและคำแนะนำอัตโนมัติ', content: `${adviceLines}\n\nผลสกรีนนิ่ง:\n${screeningLines}\n\nการดำเนินการที่ผู้ร้องต้องการ: ${present(intake?.desiredAction) || missing}\nข้อมูลขาด ${quality.missingFields.length} หัวข้อ: ${quality.missingFields.join(', ') || 'ไม่มี'}` },
    ],
    legalAppendix: [], reviewNotice: 'เอกสารนี้แยกข้อกล่าวอ้าง ผลค้นอัตโนมัติ และข้อมูลที่มี source trace ออกจากกัน ผลอัตโนมัติใช้ช่วยวางแผนได้ แต่ไม่ใช่คำวินิจฉัยความผิดหรือการรับรองสถานะทางกฎหมาย ต้องเปิดต้นทาง ตรวจวันเวลา และตรวจ SHA-256 ก่อนใช้เป็นข้อเท็จจริงทางการ',
  };
}

export function buildCaseReport(input: { caseRecord: ReportCase; reportType: 'SUMMARY' | 'OVERLAP'; evidence: ReportEvidence[]; sourcedEntities: ReportEntity[]; sourcedRelationships: ReportRelationship[]; intakeContexts?: ReportIntakeContext[]; generatedAt?: Date }) {
  const generatedAt = input.generatedAt || new Date();
  const intake = input.intakeContexts?.[0];
  const title = input.reportType === 'SUMMARY' ? 'รายงานสรุปข้อมูลคดีจากแหล่งอ้างอิง' : 'รายงานจุดทับซ้อนเพื่อการตรวจสอบ';
  const evidence = input.evidence.length ? input.evidence.map((item) => `- ${item.filename} | SHA-256 ${item.sha256} | ${item.malware_scan_status || 'ไม่ทราบ'}`).join('\n') : `- ${missing}`;
  const entities = input.sourcedEntities.length ? input.sourcedEntities.map((item) => `- ${item.type}: ${item.value}`).join('\n') : `- ${missing}`;
  const relationships = input.sourcedRelationships.length ? input.sourcedRelationships.map((item) => `- ${item.type} (มี source reference)`).join('\n') : `- ${missing}`;
  const checks = (intake?.officialChecks || []).length ? intake!.officialChecks.map((item) => `- ${item.sourceLabel} | คำค้น ${item.query} | ${item.status} | ${item.summary}`).join('\n') : `- ${missing}`;
  return `${title}\n\nข้อมูลคดี\nเลขคดี: ${input.caseRecord.number}\nชื่อคดี: ${input.caseRecord.title}\nสถานะ: ${input.caseRecord.status}\nหน่วยงาน: ${input.caseRecord.jurisdiction_agency || '-'}\nพื้นที่: ${input.caseRecord.jurisdiction_region || '-'}\nวันที่สร้างรายงาน: ${generatedAt.toISOString()}\n\nข้อมูลรับเรื่อง\nเลขติดตาม: ${present(intake?.trackingToken) || missing}\nหัวข้อ: ${present(intake?.topic) || missing}\nรายละเอียด (ข้อกล่าวอ้าง): ${present(intake?.description) || input.caseRecord.description || missing}\nผลิตภัณฑ์/กิจการ: ${present(intake?.productName) || present(intake?.businessName) || missing}\nทะเบียน/ใบอนุญาต: ${present(intake?.registrationNumber) || missing}\nสถานที่: ${present(intake?.incidentLocation) || present(intake?.businessAddress) || missing}\n\nผลตรวจฐานข้อมูลทางการ (SUGGESTED)\n${checks}\n\nหลักฐานต้นฉบับใน snapshot\n${evidence}\n\nข้อมูลที่มี source trace\n${entities}\n\nความสัมพันธ์ที่รับรองและมีแหล่งอ้างอิง\n${relationships}\n\nขอบเขต\nรายงานนี้ช่วยจัดระเบียบหลักฐาน ไม่ใช่ข้อวินิจฉัยความผิด ตัวตน เจตนา ความเป็นเจ้าของ หรือความรับผิด และไม่เติมข้อมูลที่ไม่ปรากฏในต้นทาง`;
}
