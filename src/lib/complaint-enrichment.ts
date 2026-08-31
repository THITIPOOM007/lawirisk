import 'server-only';

import {
  searchOfficialFdaProducts,
  searchOfficialHssClinics,
  searchOfficialHssSpaBusinesses,
  type SmartSearchResult,
} from './fda-smart-resolver';
import { classifyCaseSourceScope, type CaseSourceCategory } from './case-source-scope';

export type IntakeEnrichmentSource = 'FDA_PUBLIC' | 'HSS_PUBLIC_CLINIC' | 'HSS_PUBLIC_HEALTH_BUSINESS';
export type IntakeEnrichmentStatus = 'FOUND' | 'NOT_FOUND' | 'UNAVAILABLE';

export type ComplaintEnrichmentPlanItem = {
  sourceKey: IntakeEnrichmentSource;
  sourceLabel: string;
  sourceUrl: string;
  query: string;
  queryKind: 'PRODUCT_OR_LICENSE' | 'CLINIC_OR_LICENSE' | 'HEALTH_BUSINESS_OR_LICENSE';
  category: CaseSourceCategory;
  reason: string;
};

export type ComplaintEnrichmentRecord = ComplaintEnrichmentPlanItem & {
  status: IntakeEnrichmentStatus;
  resultCount: number;
  summary: string;
  results: SmartSearchResult[];
  checkedAt: string;
  classification: 'SUGGESTED';
};

type ComplaintInput = {
  topic: string;
  description: string;
  category: 'HEALTH_HAZARD' | 'ONLINE_FRAUD' | 'ILLEGAL_CLINIC' | 'OTHER';
};

type EnrichmentDependencies = {
  searchFda?: (query: string) => Promise<SmartSearchResult[]>;
  searchClinics?: (query: string) => Promise<SmartSearchResult[]>;
  searchHealthBusinesses?: (query: string) => Promise<SmartSearchResult[]>;
  now?: () => Date;
};

const FDA_URL = 'https://porta.fda.moph.go.th/fda_search_center_new/';
const HSS_CLINIC_URL = 'https://privatehospital.hss.moph.go.th/s_view_hospital.php';
const HSS_HEALTH_BUSINESS_URL = 'https://spa-services.hss.moph.go.th/permit/spa/establishment';

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function unique(values: string[]) {
  return [...new Set(values.map(compact).filter(Boolean))];
}

/** Extract only bounded, search-safe identifiers. The complaint narrative itself is never sent wholesale. */
export function extractComplaintSearchTerms(input: ComplaintInput) {
  const context = compact(`${input.topic} ${input.description}`);
  const numericTerms = context.match(/(?<!\d)\d(?:[\d\s\-/.]{7,28}\d)(?!\d)/g) || [];
  const identifiers = unique(numericTerms
    .map((value) => value.replace(/\s+/g, ''))
    .filter((value) => {
      const digitCount = value.replace(/\D/g, '').length;
      return digitCount >= 8 && digitCount <= 18;
    }))
    .slice(0, 3);

  const topic = compact(input.topic).slice(0, 200);
  return { context, identifiers, topic };
}

export function planComplaintEnrichment(input: ComplaintInput): ComplaintEnrichmentPlanItem[] {
  const terms = extractComplaintSearchTerms(input);
  let category = classifyCaseSourceScope(terms.context);
  if (input.category === 'ILLEGAL_CLINIC' && category === 'GENERAL') category = 'HEALTHCARE';

  const query = terms.identifiers[0] || terms.topic;
  if (!query || query.length < 2) return [];

  if (category === 'HEALTHCARE') {
    return [{
      sourceKey: 'HSS_PUBLIC_CLINIC',
      sourceLabel: 'ทะเบียนสถานพยาบาล กรมสนับสนุนบริการสุขภาพ (สบส.)',
      sourceUrl: HSS_CLINIC_URL,
      query,
      queryKind: 'CLINIC_OR_LICENSE',
      category,
      reason: 'ข้อความร้องเรียนกล่าวถึงคลินิก โรงพยาบาล หรือสถานพยาบาล จึงตรวจฐาน สบส. โดยตรง',
    }];
  }

  if (category === 'HEALTH_BUSINESS') {
    return [{
      sourceKey: 'HSS_PUBLIC_HEALTH_BUSINESS',
      sourceLabel: 'ทะเบียนสถานประกอบการเพื่อสุขภาพ กรมสนับสนุนบริการสุขภาพ (สบส.)',
      sourceUrl: HSS_HEALTH_BUSINESS_URL,
      query,
      queryKind: 'HEALTH_BUSINESS_OR_LICENSE',
      category,
      reason: 'ข้อความร้องเรียนกล่าวถึงร้านนวดหรือสถานประกอบการเพื่อสุขภาพ จึงตรวจฐาน สบส. ที่ตรงประเภท',
    }];
  }

  const fdaCategories = new Set<CaseSourceCategory>(['DRUG', 'FOOD', 'HAZARDOUS', 'COSMETIC', 'HERBAL', 'MEDICAL_DEVICE']);
  if (fdaCategories.has(category) || terms.identifiers.length > 0 || input.category === 'HEALTH_HAZARD') {
    return [{
      sourceKey: 'FDA_PUBLIC',
      sourceLabel: 'ศูนย์ตรวจสอบการอนุญาต สำนักงานคณะกรรมการอาหารและยา',
      sourceUrl: FDA_URL,
      query,
      queryKind: 'PRODUCT_OR_LICENSE',
      category,
      reason: terms.identifiers.length > 0
        ? 'พบเลขผลิตภัณฑ์หรือเลขใบอนุญาตในคำร้อง จึงตรวจฐาน อย. อัตโนมัติ'
        : 'เนื้อหาอยู่ในขอบเขตผลิตภัณฑ์สุขภาพ จึงตรวจฐาน อย. ที่ตรงประเภท',
    }];
  }

  return [];
}

function deriveStatus(results: SmartSearchResult[]): IntakeEnrichmentStatus {
  if (results.some((item) => item.status === 'SAFE' || item.status === 'WARNING' || item.status === 'REVOKED')) return 'FOUND';
  if (results.some((item) => item.status === 'UNAVAILABLE')) return 'UNAVAILABLE';
  return 'NOT_FOUND';
}

function boundedResult(result: SmartSearchResult): SmartSearchResult {
  const metadata = result.metadata
    ? Object.fromEntries(Object.entries(result.metadata).slice(0, 30).map(([key, value]) => [key.slice(0, 100), value.slice(0, 1_000)]))
    : undefined;
  return {
    ...result,
    id: result.id.slice(0, 300),
    title: result.title.slice(0, 300),
    productCategoryLabel: result.productCategoryLabel.slice(0, 200),
    snippet: result.snippet.slice(0, 2_000),
    source: result.source.slice(0, 200),
    sourceUrl: result.sourceUrl.slice(0, 1_000),
    publishedDate: result.publishedDate.slice(0, 100),
    metadata,
  };
}

function buildSummary(plan: ComplaintEnrichmentPlanItem, status: IntakeEnrichmentStatus, resultCount: number) {
  if (status === 'FOUND') return `พบข้อมูลจาก ${plan.sourceLabel} ${resultCount} รายการที่สัมพันธ์กับคำค้น “${plan.query}” และส่งให้เจ้าหน้าที่ตรวจทานแล้ว`;
  if (status === 'UNAVAILABLE') return `${plan.sourceLabel} ไม่ตอบกลับในเวลาที่กำหนด ระบบบันทึกสถานะไว้ให้เจ้าหน้าที่ลองค้นซ้ำ โดยยังไม่สรุปว่า “พบ” หรือ “ไม่พบ”`;
  return `ไม่พบรายการตรงกันจากผลที่ ${plan.sourceLabel} ส่งกลับสำหรับ “${plan.query}” การไม่พบครั้งนี้ไม่ใช่ข้อยืนยันว่าไม่มีใบอนุญาต`;
}

export async function executeComplaintEnrichmentPlan(
  plan: ComplaintEnrichmentPlanItem[],
  dependencies: EnrichmentDependencies = {},
): Promise<ComplaintEnrichmentRecord[]> {
  const now = dependencies.now || (() => new Date());
  const searchFda = dependencies.searchFda || searchOfficialFdaProducts;
  const searchClinics = dependencies.searchClinics || searchOfficialHssClinics;
  const searchHealthBusinesses = dependencies.searchHealthBusinesses || searchOfficialHssSpaBusinesses;

  return Promise.all(plan.slice(0, 3).map(async (item) => {
    const results = (item.sourceKey === 'FDA_PUBLIC'
      ? await searchFda(item.query)
      : item.sourceKey === 'HSS_PUBLIC_CLINIC'
        ? await searchClinics(item.query)
        : await searchHealthBusinesses(item.query)).slice(0, 10).map(boundedResult);
    const status = deriveStatus(results);
    const verifiedCount = status === 'FOUND'
      ? results.filter((result) => result.status === 'SAFE' || result.status === 'WARNING' || result.status === 'REVOKED').length
      : 0;
    return {
      ...item,
      status,
      resultCount: verifiedCount,
      summary: buildSummary(item, status, verifiedCount),
      results,
      checkedAt: now().toISOString(),
      classification: 'SUGGESTED' as const,
    };
  }));
}

export async function enrichPublicComplaint(input: ComplaintInput, dependencies: EnrichmentDependencies = {}) {
  return executeComplaintEnrichmentPlan(planComplaintEnrichment(input), dependencies);
}
