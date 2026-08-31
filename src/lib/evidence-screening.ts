export type EvidenceScreeningClassification =
  | 'DIRECT'
  | 'CORROBORATIVE'
  | 'CONTRADICTORY'
  | 'CONTEXTUAL'
  | 'DUPLICATE'
  | 'LOW_RELEVANCE'
  | 'REVIEW_REQUIRED';

export type EvidenceScreeningStatus = 'SUGGESTED' | 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN';

export type AutomaticAdvice = {
  id: string;
  status: 'AUTO_ADVICE';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'EVIDENCE_PRIORITY' | 'CONFLICT_CHECK' | 'SOURCE_EXPANSION' | 'DATA_GAP' | 'LEGAL_RESEARCH';
  title: string;
  recommendation: string;
  rationale: string;
  confidence: number;
  sourceEvidenceIds: string[];
  sourceCount: number;
  officialConfirmationRequired: boolean;
  sources?: Array<{
    label: string;
    authority: string;
    url: string;
    scope: string;
    access: 'PUBLIC' | 'STAFF';
  }>;
};

type ScreeningRow = {
  id: string;
  evidence_id: string;
  classification: EvidenceScreeningClassification;
  summary: string;
  reason: string;
  confidence: number;
  source_trace: unknown;
  provider: string;
  model: string;
  status: EvidenceScreeningStatus;
  reviewed_at?: string | null;
  updated_at: string;
};

type EvidenceRow = { id: string; filename: string; sha256: string };
type EntityRow = { id: string; type: string; value: string };

export function buildLegalResearchPlan(caseTitle: string) {
  const normalized = caseTitle.toLocaleLowerCase('th-TH');
  const topics = new Set<string>();
  const sources = new Map<string, NonNullable<AutomaticAdvice['sources']>[number]>();
  const addSource = (source: NonNullable<AutomaticAdvice['sources']>[number]) => sources.set(source.url, source);
  if (/น้ำดื่ม|อาหาร|ผลิตภัณฑ์|ฉลาก|โรงงาน/.test(normalized)) {
    topics.add('ใบอนุญาตผลิตและสถานที่ผลิต');
    topics.add('ฉลากและการแสดงข้อมูลต่อผู้บริโภค');
    addSource({ label: 'กองกฎหมาย อย. — พระราชบัญญัติและกฎหมายผลิตภัณฑ์สุขภาพ', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://laws.fda.moph.go.th/laws/category/act/', scope: 'ยา อาหาร เครื่องสำอาง วัตถุอันตราย สมุนไพร และเครื่องมือแพทย์', access: 'PUBLIC' });
  }
  if (/ยา|เภสัช|คลินิกยา/.test(normalized)) {
    topics.add('พระราชบัญญัติยาและเงื่อนไขใบอนุญาตด้านยา');
    addSource({ label: 'กองกฎหมาย อย. — กฎหมายด้านยา', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://laws.fda.moph.go.th/laws/category/act/', scope: 'พระราชบัญญัติยาและกฎหมายลำดับรอง', access: 'PUBLIC' });
  }
  if (/โฆษณา|ออนไลน์|ขาย/.test(normalized)) {
    topics.add('การโฆษณาและการกล่าวอ้างผลิตภัณฑ์');
    addSource({ label: 'กองกฎหมาย อย.', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://laws.fda.moph.go.th/', scope: 'ประกาศ คำสั่ง และกฎหมายเกี่ยวกับการโฆษณาผลิตภัณฑ์สุขภาพ', access: 'PUBLIC' });
  }
  if (/คลินิก|สถานพยาบาล|แพทย์|ทันต/.test(normalized)) {
    topics.add('ใบอนุญาตสถานพยาบาลและผู้ประกอบวิชาชีพ');
    addSource({ label: 'กฎหมายและระเบียบด้านบริการสุขภาพ', authority: 'กรมสนับสนุนบริการสุขภาพ', url: 'https://hss4.hss.moph.go.th/laws-regulations/', scope: 'สถานพยาบาลและบริการสุขภาพ', access: 'PUBLIC' });
  }
  if (/นวด|สถานประกอบการเพื่อสุขภาพ|สปา/.test(normalized)) {
    topics.add('ใบอนุญาตสถานประกอบการเพื่อสุขภาพและผู้ให้บริการ');
    addSource({ label: 'กฎหมายและระเบียบด้านบริการสุขภาพ', authority: 'กรมสนับสนุนบริการสุขภาพ', url: 'https://hss4.hss.moph.go.th/laws-regulations/', scope: 'สถานประกอบการเพื่อสุขภาพและผู้ให้บริการ', access: 'PUBLIC' });
  }
  if (topics.size === 0) topics.add('อำนาจหน้าที่ ใบอนุญาต และเงื่อนไขเฉพาะของกิจการที่ถูกร้องเรียน');
  addSource({ label: 'ราชกิจจานุเบกษา', authority: 'สำนักเลขาธิการคณะรัฐมนตรี', url: 'https://ratchakitcha.soc.go.th/', scope: 'ตรวจฉบับประกาศและวันที่มีผลใช้บังคับจากต้นทาง', access: 'PUBLIC' });
  addSource({ label: 'Kouprey Plus — iLAWS e-OFFICE', authority: 'สำนักงานสาธารณสุขจังหวัดศรีสะเกษ', url: 'https://koupreyplus.ssko.moph.go.th/admin/e-office', scope: 'ดัชนีและพื้นที่ช่วยค้นกฎหมายสำหรับเจ้าหน้าที่ ต้องเข้าสู่ระบบและตรวจเอกสารทางการซ้ำ', access: 'STAFF' });
  return { topics: [...topics], sources: [...sources.values()] };
}

export function buildAutomaticAdvice(input: {
  caseRecord: { id: string; number: string; title: string };
  assessments: Array<{
    evidenceId: string;
    filename: string;
    classification: EvidenceScreeningClassification;
    summary: string;
    reason: string;
    confidence: number;
    status: EvidenceScreeningStatus;
    sourceCount: number;
  }>;
  entities: EntityRow[];
}): AutomaticAdvice[] {
  const active = input.assessments.filter((item) => item.status !== 'REJECTED');
  if (active.length === 0) {
    return [{
      id: 'data-gap:no-screened-evidence', status: 'AUTO_ADVICE', priority: 'HIGH', category: 'DATA_GAP',
      title: 'ยังไม่มีหลักฐานพร้อมวิเคราะห์',
      recommendation: 'นำเข้าหลักฐานต้นฉบับที่ตรวจชนิดและโครงสร้างไฟล์แล้ว จากนั้นสั่งค้นและสกรีนนิ่งอัตโนมัติอีกครั้ง',
      rationale: 'ระบบยังไม่มี source trace ที่ใช้สร้างคำแนะนำเฉพาะคดีได้', confidence: 1,
      sourceEvidenceIds: [], sourceCount: 0, officialConfirmationRequired: false,
    }];
  }

  const advice: AutomaticAdvice[] = [];
  const priorityEvidence = active
    .filter((item) => ['DIRECT', 'CORROBORATIVE'].includes(item.classification))
    .sort((a, b) => b.confidence - a.confidence);
  if (priorityEvidence.length) {
    const selected = priorityEvidence.slice(0, 3);
    advice.push({
      id: 'evidence-priority:top', status: 'AUTO_ADVICE', priority: 'HIGH', category: 'EVIDENCE_PRIORITY',
      title: `เริ่มตรวจจากหลักฐาน ${selected.length} รายการที่เชื่อมโยงมากที่สุด`,
      recommendation: `เปิดตรวจ ${selected.map((item) => item.filename).join(', ')} ก่อน แล้วเทียบข้อความกับ source trace และ SHA-256 ที่แสดงในระบบ`,
      rationale: selected.map((item) => `${item.filename}: ${item.summary}`).join(' | '),
      confidence: Math.min(0.99, selected.reduce((sum, item) => sum + item.confidence, 0) / selected.length),
      sourceEvidenceIds: selected.map((item) => item.evidenceId),
      sourceCount: selected.reduce((sum, item) => sum + item.sourceCount, 0),
      officialConfirmationRequired: false,
    });
  }

  const conflicts = active.filter((item) => item.classification === 'CONTRADICTORY');
  if (conflicts.length) {
    advice.push({
      id: 'conflict-check:detected', status: 'AUTO_ADVICE', priority: 'HIGH', category: 'CONFLICT_CHECK',
      title: `พบ ${conflicts.length} หลักฐานที่อาจให้ข้อมูลขัดแย้ง`,
      recommendation: 'เปรียบเทียบวันเวลา ชื่อ เลขอ้างอิง และข้อความต้นทางระหว่างไฟล์ก่อนใช้สรุปข้อเท็จจริง',
      rationale: conflicts.map((item) => `${item.filename}: ${item.reason}`).join(' | '),
      confidence: Math.max(...conflicts.map((item) => item.confidence)),
      sourceEvidenceIds: conflicts.map((item) => item.evidenceId),
      sourceCount: conflicts.reduce((sum, item) => sum + item.sourceCount, 0),
      officialConfirmationRequired: true,
    });
  }

  const entityValues = input.entities.slice(0, 5).map((item) => `${item.type}: ${item.value}`);
  if (entityValues.length) {
    advice.push({
      id: 'source-expansion:entities', status: 'AUTO_ADVICE', priority: 'MEDIUM', category: 'SOURCE_EXPANSION',
      title: 'ขยายการค้นหาจากข้อมูลที่ระบบเชื่อมโยงได้',
      recommendation: `ใช้ ${entityValues.join(', ')} เป็นคำค้นใน Public Web/Open Data และแหล่งเจ้าหน้าที่ที่อนุญาต พร้อมเก็บ URL วันเวลา และสำเนาผลลัพธ์`,
      rationale: `ระบบพบข้อมูลเชื่อมโยง ${input.entities.length} รายการในขอบเขตคดี`,
      confidence: 0.82,
      sourceEvidenceIds: [...new Set(priorityEvidence.map((item) => item.evidenceId))],
      sourceCount: input.entities.length,
      officialConfirmationRequired: false,
    });
  }

  const legalPlan = buildLegalResearchPlan(input.caseRecord.title);
  advice.push({
    id: 'legal-research:topics', status: 'AUTO_ADVICE', priority: 'MEDIUM', category: 'LEGAL_RESEARCH',
    title: 'ประเด็นกฎหมายที่ควรค้นจากฐานข้อมูลทางการ',
    recommendation: `ค้นและตรวจฉบับปัจจุบันในหัวข้อ: ${legalPlan.topics.join(', ')} แล้วแนบมาตราและแหล่งทางการก่อนสรุปข้อกฎหมาย`,
    rationale: `คัดหัวข้อจากชื่อคดี “${input.caseRecord.title}” และประเภทหลักฐานที่ระบบจัดกลุ่ม ไม่ใช่การวินิจฉัยข้อหา`,
    confidence: 0.68,
    sourceEvidenceIds: [...new Set(priorityEvidence.map((item) => item.evidenceId))],
    sourceCount: priorityEvidence.reduce((sum, item) => sum + item.sourceCount, 0),
    officialConfirmationRequired: true,
    sources: legalPlan.sources,
  });

  const weak = active.filter((item) => ['LOW_RELEVANCE', 'CONTEXTUAL', 'REVIEW_REQUIRED'].includes(item.classification));
  if (weak.length) {
    advice.push({
      id: 'data-gap:weak-signals', status: 'AUTO_ADVICE', priority: 'LOW', category: 'DATA_GAP',
      title: `มี ${weak.length} รายการที่ข้อมูลเชื่อมโยงยังไม่พอ`,
      recommendation: 'ค้นเอกสารยืนยันเพิ่มโดยใช้เลขอ้างอิง ชื่อกิจการ ที่อยู่ หรือวันที่จากต้นฉบับ แทนการสรุปจากชื่อเพียงอย่างเดียว',
      rationale: weak.map((item) => `${item.filename}: ${item.summary}`).join(' | '),
      confidence: Math.max(...weak.map((item) => item.confidence)),
      sourceEvidenceIds: weak.map((item) => item.evidenceId),
      sourceCount: weak.reduce((sum, item) => sum + item.sourceCount, 0),
      officialConfirmationRequired: false,
    });
  }
  return advice;
}

function traceEntities(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const entities = (value as { entities?: unknown }).entities;
  if (!Array.isArray(entities)) return [];
  return entities.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return typeof row.entity_id === 'string'
      ? [{ entityId: row.entity_id, pageNumber: typeof row.page_number === 'number' ? row.page_number : null }]
      : [];
  });
}

export function buildEvidenceScreeningProjection(input: {
  caseRecord: { id: string; number: string; title: string };
  screenings: ScreeningRow[];
  evidence: EvidenceRow[];
  entities: EntityRow[];
  canReview: boolean;
  canRefresh: boolean;
}) {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const entityById = new Map(input.entities.map((item) => [item.id, item]));
  const entityEvidence = new Map<string, Set<string>>();
  for (const screening of input.screenings) {
    for (const trace of traceEntities(screening.source_trace)) {
      const set = entityEvidence.get(trace.entityId) || new Set<string>();
      set.add(screening.evidence_id);
      entityEvidence.set(trace.entityId, set);
    }
  }

  const assessments = input.screenings.flatMap((screening) => {
    const evidence = evidenceById.get(screening.evidence_id);
    if (!evidence) return [];
    return [{
      id: screening.id,
      evidenceId: evidence.id,
      filename: evidence.filename,
      sha256: evidence.sha256,
      classification: screening.classification,
      summary: screening.summary,
      reason: screening.reason,
      confidence: screening.confidence,
      status: screening.status,
      provider: screening.provider,
      model: screening.model,
      reviewedAt: screening.reviewed_at || null,
      updatedAt: screening.updated_at,
      canReview: input.canReview && ['SUGGESTED', 'UNCERTAIN'].includes(screening.status),
      sourceCount: traceEntities(screening.source_trace).length,
    }];
  });

  const automaticAdvice = buildAutomaticAdvice({
    caseRecord: input.caseRecord,
    assessments,
    entities: input.entities,
  });

  const nodes: Array<{ id: string; kind: 'CASE' | 'EVIDENCE' | 'ENTITY'; label: string; subtitle: string; status: string }> = [{
    id: `case:${input.caseRecord.id}`,
    kind: 'CASE',
    label: input.caseRecord.number,
    subtitle: input.caseRecord.title,
    status: 'CONFIRMED',
  }];
  const edges: Array<{ id: string; source: string; target: string; label: string; status: string }> = [];

  for (const assessment of assessments.filter((item) => item.status !== 'REJECTED')) {
    const evidenceNodeId = `evidence:${assessment.evidenceId}`;
    nodes.push({
      id: evidenceNodeId,
      kind: 'EVIDENCE',
      label: assessment.filename,
      subtitle: assessment.summary,
      status: assessment.status,
    });
    edges.push({
      id: `case-evidence:${assessment.evidenceId}`,
      source: `case:${input.caseRecord.id}`,
      target: evidenceNodeId,
      label: assessment.classification,
      status: assessment.status,
    });
  }

  for (const [entityId, evidenceIds] of entityEvidence) {
    const entity = entityById.get(entityId);
    if (!entity || evidenceIds.size === 0) continue;
    const entityNodeId = `entity:${entityId}`;
    nodes.push({ id: entityNodeId, kind: 'ENTITY', label: entity.value, subtitle: entity.type, status: 'CONFIRMED' });
    for (const evidenceId of evidenceIds) {
      if (!assessments.some((item) => item.evidenceId === evidenceId && item.status !== 'REJECTED')) continue;
      edges.push({
        id: `evidence-entity:${evidenceId}:${entityId}`,
        source: `evidence:${evidenceId}`,
        target: entityNodeId,
        label: evidenceIds.size > 1 ? `ข้อมูลร่วม ${evidenceIds.size} ไฟล์` : 'กล่าวถึง',
        status: 'CONFIRMED',
      });
    }
  }

  return {
    case: input.caseRecord,
    permissions: { canRefresh: input.canRefresh },
    generatedBy: { provider: 'LAWIRISK_RULE_ENGINE', model: 'source-trace-v1', aiRequired: false },
    notice: 'ผลสกรีนนิ่งเป็นเครื่องมือช่วยจัดลำดับหลักฐาน ไม่ใช่ข้อวินิจฉัยความผิด การยืนยันต้องทำโดยผู้ตรวจทานและย้อนกลับถึงหลักฐานต้นฉบับได้',
    counts: {
      total: assessments.length,
      confirmed: assessments.filter((item) => item.status === 'CONFIRMED').length,
      pendingReview: assessments.filter((item) => ['SUGGESTED', 'UNCERTAIN'].includes(item.status)).length,
      connectedEntities: nodes.filter((item) => item.kind === 'ENTITY').length,
    },
    automation: {
      status: assessments.length ? 'AUTO_ADVICE_READY' : 'DATA_REQUIRED',
      completedStages: assessments.length ? ['AUTO_FOUND', 'AUTO_ANALYZED', 'AUTO_ADVICE'] : [],
      summary: assessments.length
        ? `ระบบวิเคราะห์หลักฐาน ${assessments.length} รายการ และสร้างคำแนะนำพร้อมใช้ ${automaticAdvice.length} ข้อแล้ว`
        : 'ระบบยังต้องการหลักฐานที่พร้อมใช้งานก่อนเริ่มวิเคราะห์',
      officialGate: 'การรับรองใช้เฉพาะเมื่อต้องบันทึกเป็นข้อเท็จจริง ความสัมพันธ์ ข้อหา หรือข้อกฎหมายอย่างเป็นทางการ',
    },
    automaticAdvice,
    assessments,
    graph: { nodes, edges },
  };
}
