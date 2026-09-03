import { z } from 'zod';
import type { ReconAutomationPlanItem, ReconBlockedAutomation } from './recon-automation';
import type { CaseSourceRecommendation } from './case-source-scope';

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

export type IntelligenceFindingKind = 'VERIFIED_FACT' | 'VERIFIED_RELATIONSHIP' | 'TRUSTED_REGISTRY' | 'GROUNDED_WEB';

export type IntelligenceFinding = {
  id: string;
  kind: IntelligenceFindingKind;
  title: string;
  detail: string;
  statusLabel: string;
  source: {
    label: string;
    url?: string;
    evidenceId?: string;
    filename?: string;
    pageNumber?: number;
    sha256?: string;
    publishedDate?: string;
  };
};

export type TrustedRegistrySearchStatus = 'SEARCHED' | 'NO_ELIGIBLE_TERMS' | 'UNAVAILABLE' | 'DEMO';

export type IntelligenceReadiness = {
  kind: 'EVIDENCE_REQUIRED' | 'EXTRACTION_REQUIRED' | 'REVIEW_REQUIRED' | 'READY_TO_CAPTURE' | 'SOURCE_UNAVAILABLE' | 'SEARCHED_NO_MATCH' | 'RESULTS_AVAILABLE';
  label: string;
  detail: string;
};

export type CaseIntelligenceSearchResult = {
  generatedAt: string;
  summary: string;
  findings: IntelligenceFinding[];
  evidenceInventory: Array<{
    id: string;
    filename: string;
    sha256: string;
    safetyStatus: 'CLEAN' | 'NOT_SCANNED';
  }>;
  verifiedFindingCount: number;
  registryFindingCount: number;
  publicWebFindingCount: number;
  publicWebQueryCount: number;
  publicWebTokenUsage: {
    prompt: number;
    candidates: number;
    total: number;
  } | null;
  publicWebStatus: 'SEARCHED' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'NO_TERMS' | 'DEMO';
  searchedRegistryTermCount: number;
  pendingReviewCount: number;
  registryStatus: TrustedRegistrySearchStatus;
  automationPlan: ReconAutomationPlanItem[];
  blockedAutomation: ReconBlockedAutomation[];
  sourceRecommendations: CaseSourceRecommendation[];
  readiness: IntelligenceReadiness;
  notice: string;
};

type VerifiedFactInput = {
  id: string;
  entityType: string;
  value: string;
  evidenceId: string;
  filename: string;
  pageNumber: number;
  snippet: string;
  sha256: string;
};

type VerifiedRelationshipInput = {
  id: string;
  relationshipType: string;
  sourceValue: string;
  targetValue: string;
  evidenceId: string;
  filename: string;
  pageNumber: number;
  quote: string;
  sha256: string;
};

type TrustedRegistryFindingInput = {
  id: string;
  title: string;
  snippet: string;
  source: string;
  sourceUrl: string;
  publishedDate: string;
};

type GroundedWebFindingInput = TrustedRegistryFindingInput;

export function buildCaseIntelligenceSearchResult(input: {
  evidenceInventory: Array<{ id: string; filename: string; sha256: string; safetyStatus: 'CLEAN' | 'NOT_SCANNED' }>;
  verifiedFacts: VerifiedFactInput[];
  verifiedRelationships: VerifiedRelationshipInput[];
  trustedRegistryFindings: TrustedRegistryFindingInput[];
  searchedRegistryTermCount: number;
  pendingReviewCount: number;
  registryStatus: TrustedRegistrySearchStatus;
  groundedWebFindings?: GroundedWebFindingInput[];
  publicWebQueryCount?: number;
  publicWebTokenUsage?: CaseIntelligenceSearchResult['publicWebTokenUsage'];
  publicWebStatus?: 'SEARCHED' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'NO_TERMS' | 'DEMO';
  automationPlan?: ReconAutomationPlanItem[];
  blockedAutomation?: ReconBlockedAutomation[];
  sourceRecommendations?: CaseSourceRecommendation[];
}): CaseIntelligenceSearchResult {
  const verifiedFacts: IntelligenceFinding[] = input.verifiedFacts.map((item) => ({
    id: `fact:${item.id}`,
    kind: 'VERIFIED_FACT',
    title: `${item.entityType}: ${item.value}`,
    detail: item.snippet,
    statusLabel: 'ข้อเท็จจริงที่ตรวจทานแล้ว',
    source: {
      label: item.filename,
      evidenceId: item.evidenceId,
      filename: item.filename,
      pageNumber: item.pageNumber,
      sha256: item.sha256,
    },
  }));
  const verifiedRelationships: IntelligenceFinding[] = input.verifiedRelationships.map((item) => ({
    id: `relationship:${item.id}`,
    kind: 'VERIFIED_RELATIONSHIP',
    title: `${item.sourceValue} — ${item.relationshipType} — ${item.targetValue}`,
    detail: item.quote,
    statusLabel: 'ความสัมพันธ์ที่เจ้าหน้าที่ยืนยันแล้ว',
    source: {
      label: item.filename,
      evidenceId: item.evidenceId,
      filename: item.filename,
      pageNumber: item.pageNumber,
      sha256: item.sha256,
    },
  }));
  const trustedRegistryFindings: IntelligenceFinding[] = input.trustedRegistryFindings.map((item) => ({
    id: `registry:${item.id}`,
    kind: 'TRUSTED_REGISTRY',
    title: item.title,
    detail: item.snippet,
    statusLabel: 'พบรายการเกี่ยวข้องในทะเบียนที่อนุมัติ',
    source: {
      label: item.source,
      url: item.sourceUrl,
      publishedDate: item.publishedDate,
    },
  }));
  const groundedWebFindings: IntelligenceFinding[] = (input.groundedWebFindings || []).map((item) => ({
    id: `grounded:${item.id}`,
    kind: 'GROUNDED_WEB',
    title: item.title,
    detail: item.snippet,
    statusLabel: 'พบจากเว็บสาธารณะ · รอตรวจทาน',
    source: { label: item.source, url: item.sourceUrl, publishedDate: item.publishedDate },
  }));
  const findings = [...verifiedFacts, ...verifiedRelationships, ...trustedRegistryFindings, ...groundedWebFindings];
  const verifiedFindingCount = verifiedFacts.length + verifiedRelationships.length;
  const registryFindingCount = trustedRegistryFindings.length;
  const publicWebFindingCount = groundedWebFindings.length;

  const readiness: IntelligenceReadiness = (() => {
    const planned = (input.automationPlan || []).length;
    const sourceUnavailable = input.registryStatus === 'UNAVAILABLE' || input.publicWebStatus === 'UNAVAILABLE';
    const queryCount = (input.searchedRegistryTermCount || 0) + (input.publicWebQueryCount || 0);
    if (findings.length > 0) {
      return {
        kind: 'RESULTS_AVAILABLE', label: 'พบข้อมูลที่ตรวจย้อนกลับได้',
        detail: `มีผลที่ผูกแหล่งอ้างอิงแล้ว ${findings.length} รายการ โปรดเปิดต้นทางและตรวจทานก่อนยืนยันในสำนวน`,
      };
    }
    if (planned > 0) {
      return {
        kind: 'READY_TO_CAPTURE', label: 'พร้อมค้นเชิงลึกและเก็บหลักฐาน',
        detail: `จัดคิวค้นในระบบทางการ ${planned} งานแล้ว การปิดงานจะเกิดขึ้นหลังเก็บ PDF ภาพหน้าผล และ SHA-256 ได้จริงเท่านั้น`,
      };
    }
    if (input.pendingReviewCount > 0) {
      return {
        kind: 'REVIEW_REQUIRED', label: 'รอตรวจทานข้อมูลที่สกัดได้',
        detail: `มีข้อเสนอ ${input.pendingReviewCount} รายการที่ยังไม่ใช่ข้อเท็จจริง ต้องตรวจข้อความต้นทางก่อนส่งค้นเชิงลึก`,
      };
    }
    if (sourceUnavailable) {
      return {
        kind: 'SOURCE_UNAVAILABLE', label: 'แหล่งข้อมูลบางส่วนยังไม่พร้อม',
        detail: 'ระบบไม่สรุปว่าไม่พบข้อมูล เพราะแหล่งที่อนุมัติอย่างน้อยหนึ่งแหล่งไม่ตอบกลับหรือไม่พร้อมใช้งาน',
      };
    }
    if (queryCount > 0) {
      return {
        kind: 'SEARCHED_NO_MATCH', label: 'ค้นแล้ว แต่ยังไม่พบรายการที่อ้างอิงได้',
        detail: 'ผลว่างไม่ได้ยืนยันว่าไม่มีทะเบียนหรือไม่มีใบอนุญาต ให้ตรวจคำค้นและภาพ/PDF ที่เก็บจากต้นทางก่อน',
      };
    }
    if (input.evidenceInventory.length > 0) {
      return {
        kind: 'EXTRACTION_REQUIRED', label: 'ต้องสกัดตัวระบุจากหลักฐานก่อน',
        detail: `พบหลักฐาน ${input.evidenceInventory.length} ไฟล์ แต่ยังไม่มีชื่อผลิตภัณฑ์ เลขทะเบียน เลขใบอนุญาต ชื่อกิจการ หรือรหัสอื่นที่มีแหล่งอ้างอิงสำหรับค้นต่อ`,
      };
    }
    return {
      kind: 'EVIDENCE_REQUIRED', label: 'ต้องมีหลักฐานต้นทางก่อนเริ่มค้น',
      detail: 'ระบบไม่สร้างคำค้นจากชื่อคดีหรือข้อกล่าวหาเพียงอย่างเดียว เพื่อป้องกันการค้นผิดบุคคลหรือกิจการ',
    };
  })();

  let summary = `พบข้อมูลที่ตรวจย้อนกลับได้ ${findings.length} รายการ: จากหลักฐานในคดี ${verifiedFindingCount} รายการ ทะเบียนที่อนุมัติ ${registryFindingCount} รายการ และเว็บสาธารณะที่มี citation ${publicWebFindingCount} รายการ`;
  if (findings.length === 0 && input.pendingReviewCount > 0) {
    summary = `ยังไม่มีข้อค้นพบที่ยืนยันและอ้างอิงได้ ขณะนี้มีข้อเสนอรอตรวจทาน ${input.pendingReviewCount} รายการ`;
  } else if (findings.length === 0 && input.evidenceInventory.length > 0) {
    summary = `พบหลักฐานต้นฉบับที่ตรวจโครงสร้างแล้ว ${input.evidenceInventory.length} ไฟล์ แต่ยังไม่มีข้อเท็จจริงที่ผ่านการสกัดและตรวจทานสำหรับค้นทะเบียน`;
  } else if (findings.length === 0) {
    summary = 'ยังไม่พบข้อมูลที่ยืนยันและตรวจย้อนกลับถึงแหล่งได้ในขอบเขตการค้นครั้งนี้';
  }

  return {
    generatedAt: new Date().toISOString(),
    summary,
    findings,
    evidenceInventory: input.evidenceInventory,
    verifiedFindingCount,
    registryFindingCount,
    publicWebFindingCount,
    publicWebQueryCount: input.publicWebQueryCount || 0,
    publicWebTokenUsage: input.publicWebTokenUsage || null,
    publicWebStatus: input.publicWebStatus || 'NO_TERMS',
    searchedRegistryTermCount: input.searchedRegistryTermCount,
    pendingReviewCount: input.pendingReviewCount,
    registryStatus: input.registryStatus,
    automationPlan: input.automationPlan || [],
    blockedAutomation: input.blockedAutomation || [],
    sourceRecommendations: input.sourceRecommendations || [],
    readiness,
    notice: 'รายการจากทะเบียนหมายถึงพบข้อความที่เกี่ยวข้อง ส่วนผลเว็บเป็นเพียง citation ที่ผ่านการกรองคำค้นและโดเมนที่อนุมัติแล้ว ไม่ใช่การยืนยันว่าเป็นบุคคล/กิจการเดียวกันหรือเป็นการชี้ความผิด ต้องเปิดต้นทางและให้เจ้าหน้าที่ตรวจทานก่อนใช้ในสำนวน',
  };
}

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
