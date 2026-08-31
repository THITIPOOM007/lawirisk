export type ReconQueryBasisStatus = 'CONFIRMED' | 'SUGGESTED' | 'UNCERTAIN';

export type ReconQueryCandidate = {
  id: string;
  type: string;
  value: string;
  basisStatus: ReconQueryBasisStatus;
  evidenceId: string;
  filename: string;
  pageNumber: number;
  confidence?: number | null;
};

export type ReconAutomationPlanItem = {
  id: string;
  source: 'FDA_PUBLIC' | 'FDA_SKYNET' | 'HSS_ESTA2';
  sourceLabel: string;
  service: 'DBD' | 'DOPA' | 'HSS_HEALTH_BUSINESS_APPROVED'
    | 'FDA_DRUG_REGISTRY' | 'FDA_FOOD_REGISTRY' | 'FDA_HAZARDOUS_REGISTRY'
    | 'FDA_COSMETIC_REGISTRY' | 'FDA_HERBAL_REGISTRY' | 'FDA_MEDICAL_DEVICE_REGISTRY';
  serviceLabel: string;
  field: 'JURISTIC_ID' | 'CITIZEN_ID' | 'FACILITY_NAME' | 'APPLICANT_NAME' | 'APPLICANT_ID'
    | 'FACILITY_TERM' | 'PRODUCT_TERM';
  fieldLabel: string;
  value: string;
  displayValue: string;
  purpose: string;
  basisStatus: ReconQueryBasisStatus;
  basisLabel: string;
  evidenceId: string;
  filename: string;
  pageNumber: number;
  confidence?: number | null;
  resultRequiresHumanReview: true;
};

export type ReconBlockedAutomation = {
  id: string;
  source: 'HSS_OSS';
  sourceLabel: string;
  fieldLabel: string;
  displayValue: string;
  reason: string;
};

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function masked(value: string, type: string) {
  if (type === 'CITIZEN_ID' || /^\d{13}$/.test(value)) return `${value.slice(0, 3)}•••••••${value.slice(-3)}`;
  if (type === 'PHONE') return `${value.slice(0, 3)}•••${value.slice(-3)}`;
  return value.length > 64 ? `${value.slice(0, 61)}…` : value;
}

function basisLabel(status: ReconQueryBasisStatus) {
  if (status === 'CONFIRMED') return 'ข้อเท็จจริงที่เจ้าหน้าที่ตรวจทานแล้ว';
  if (status === 'UNCERTAIN') return 'ข้อเสนอที่เจ้าหน้าที่ระบุว่ายังไม่แน่นอน';
  return 'ข้อเสนอจากการสกัดข้อมูล รอเจ้าหน้าที่ตรวจทาน';
}

const FDA_CATEGORY_SERVICE: Partial<Record<CaseSourceCategory, ReconAutomationPlanItem['service']>> = {
  DRUG: 'FDA_DRUG_REGISTRY',
  FOOD: 'FDA_FOOD_REGISTRY',
  HAZARDOUS: 'FDA_HAZARDOUS_REGISTRY',
  COSMETIC: 'FDA_COSMETIC_REGISTRY',
  HERBAL: 'FDA_HERBAL_REGISTRY',
  MEDICAL_DEVICE: 'FDA_MEDICAL_DEVICE_REGISTRY',
};

const FDA_CATEGORY_LABEL: Partial<Record<CaseSourceCategory, string>> = {
  DRUG: 'ยาและสถานที่ด้านยา',
  FOOD: 'อาหารและสถานที่อาหาร',
  HAZARDOUS: 'วัตถุอันตราย',
  COSMETIC: 'เครื่องสำอาง',
  HERBAL: 'สมุนไพรและสถานที่สมุนไพร',
  MEDICAL_DEVICE: 'เครื่องมือแพทย์และสถานที่',
};

export function buildReconAutomationPlan(input: {
  caseNumber: string;
  caseContext?: string;
  candidates: ReconQueryCandidate[];
  maxQueries?: number;
}): { plan: ReconAutomationPlanItem[]; blocked: ReconBlockedAutomation[] } {
  const maxQueries = Math.max(1, Math.min(input.maxQueries ?? 6, 10));
  const purpose = `ตรวจสอบข้อมูลประกอบสำนวน ${compact(input.caseNumber).slice(0, 120)} ตามหน้าที่ของผู้รับผิดชอบสำนวน`;
  const sourceCategory = classifyCaseSourceScope(compact(input.caseContext || ''));
  const healthBusiness = sourceCategory === 'HEALTH_BUSINESS';
  const fdaService = FDA_CATEGORY_SERVICE[sourceCategory];
  const plan: ReconAutomationPlanItem[] = [];
  const blocked: ReconBlockedAutomation[] = [];
  const seen = new Set<string>();

  const add = (
    candidate: ReconQueryCandidate,
    target: Pick<ReconAutomationPlanItem, 'source' | 'sourceLabel' | 'service' | 'serviceLabel' | 'field' | 'fieldLabel'>,
    value: string,
  ) => {
    const key = `${target.source}:${target.service}:${target.field}:${value.toLocaleLowerCase('th-TH')}`;
    if (seen.has(key) || plan.length >= maxQueries) return;
    seen.add(key);
    plan.push({
      id: `${candidate.id}:${target.source}:${target.service}:${target.field}`,
      ...target,
      value,
      displayValue: masked(value, candidate.type),
      purpose,
      basisStatus: candidate.basisStatus,
      basisLabel: basisLabel(candidate.basisStatus),
      evidenceId: candidate.evidenceId,
      filename: candidate.filename,
      pageNumber: candidate.pageNumber,
      confidence: candidate.confidence,
      resultRequiresHumanReview: true,
    });
  };

  const eligible = input.candidates
    .filter((candidate) => candidate.basisStatus === 'CONFIRMED' || (candidate.confidence ?? 0) >= 0.8)
    .sort((left, right) => {
      const statusWeight = (value: ReconQueryBasisStatus) => value === 'CONFIRMED' ? 2 : value === 'UNCERTAIN' ? 1 : 0;
      return statusWeight(right.basisStatus) - statusWeight(left.basisStatus)
        || (right.confidence ?? 0) - (left.confidence ?? 0);
    });

  for (const candidate of eligible) {
    const value = compact(candidate.value);
    if (candidate.type === 'CITIZEN_ID') {
      const id = digits(value);
      if (id.length !== 13) continue;
      add(candidate, {
        source: 'FDA_SKYNET', sourceLabel: 'SKYNET / DOPA', service: 'DOPA', serviceLabel: 'ทะเบียนบุคคล',
        field: 'CITIZEN_ID', fieldLabel: 'เลขบัตรประชาชน 13 หลัก',
      }, id);
      if (healthBusiness) {
        add(candidate, {
          source: 'HSS_ESTA2', sourceLabel: 'ESTA2 สบส.', service: 'HSS_HEALTH_BUSINESS_APPROVED', serviceLabel: 'สถานประกอบการที่ได้รับอนุญาต',
          field: 'APPLICANT_ID', fieldLabel: 'เลขบัตรประชาชนผู้ยื่น',
        }, id);
      }
      continue;
    }
    if (candidate.type === 'ORGANIZATION') {
      const possibleId = digits(value);
      if (possibleId.length === 13 && possibleId === value.replace(/[- ]/g, '')) {
        add(candidate, {
          source: 'FDA_SKYNET', sourceLabel: 'SKYNET / DBD', service: 'DBD', serviceLabel: 'ทะเบียนนิติบุคคล',
          field: 'JURISTIC_ID', fieldLabel: 'เลขนิติบุคคล 13 หลัก',
        }, possibleId);
      }
      else if (healthBusiness && value.length >= 2 && value.length <= 200) {
        add(candidate, {
          source: 'HSS_ESTA2', sourceLabel: 'ESTA2 สบส.', service: 'HSS_HEALTH_BUSINESS_APPROVED', serviceLabel: 'สถานประกอบการที่ได้รับอนุญาต',
          field: 'FACILITY_NAME', fieldLabel: 'ชื่อสถานประกอบการ',
        }, value);
      }
      else if (fdaService && value.length >= 2 && value.length <= 200) {
        add(candidate, {
          source: 'FDA_PUBLIC', sourceLabel: 'ศูนย์ตรวจสอบการอนุญาต อย.', service: fdaService,
          serviceLabel: FDA_CATEGORY_LABEL[sourceCategory] || 'ทะเบียนผลิตภัณฑ์สุขภาพ',
          field: sourceCategory === 'COSMETIC' ? 'PRODUCT_TERM' : 'FACILITY_TERM',
          fieldLabel: sourceCategory === 'COSMETIC' ? 'ชื่อผู้ประกอบการ/ผลิตภัณฑ์/เลขจดแจ้ง' : 'ชื่อหรือเลขใบอนุญาตสถานที่',
        }, value);
      }
      continue;
    }
    if (fdaService && ['PRODUCT_NAME', 'REGISTRATION_NUMBER'].includes(candidate.type)
      && value.length >= 2 && value.length <= 200) {
      add(candidate, {
        source: 'FDA_PUBLIC', sourceLabel: 'ศูนย์ตรวจสอบการอนุญาต อย.', service: fdaService,
        serviceLabel: FDA_CATEGORY_LABEL[sourceCategory] || 'ทะเบียนผลิตภัณฑ์สุขภาพ',
        field: 'PRODUCT_TERM', fieldLabel: 'ชื่อหรือเลขทะเบียนผลิตภัณฑ์',
      }, value);
      continue;
    }
    if (fdaService && candidate.type === 'LICENSE_NUMBER' && value.length >= 2 && value.length <= 200) {
      add(candidate, {
        source: 'FDA_PUBLIC', sourceLabel: 'ศูนย์ตรวจสอบการอนุญาต อย.', service: fdaService,
        serviceLabel: FDA_CATEGORY_LABEL[sourceCategory] || 'ทะเบียนสถานที่ผลิตภัณฑ์สุขภาพ',
        field: sourceCategory === 'COSMETIC' ? 'PRODUCT_TERM' : 'FACILITY_TERM',
        fieldLabel: sourceCategory === 'COSMETIC' ? 'เลขจดแจ้งผลิตภัณฑ์' : 'เลขใบอนุญาตสถานที่',
      }, value);
      continue;
    }
    if (healthBusiness && candidate.type === 'PERSON' && value.length >= 4 && value.length <= 200) {
      add(candidate, {
        source: 'HSS_ESTA2', sourceLabel: 'ESTA2 สบส.', service: 'HSS_HEALTH_BUSINESS_APPROVED', serviceLabel: 'สถานประกอบการที่ได้รับอนุญาต',
        field: 'APPLICANT_NAME', fieldLabel: 'ชื่อผู้ยื่นคำร้อง',
      }, value);
      continue;
    }
    if (healthBusiness && candidate.type === 'PHONE' && value.length >= 9) {
      const key = `HSS_OSS:PHONE:${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        blocked.push({
          id: `${candidate.id}:HSS_OSS:PHONE`,
          source: 'HSS_OSS',
          sourceLabel: 'OSS สบส.',
          fieldLabel: 'เบอร์โทรศัพท์',
          displayValue: masked(value, candidate.type),
          reason: 'พักการค้นอัตโนมัติไว้ เพราะระบบต้นทางใช้ HTTP และต้องให้เจ้าหน้าที่ยืนยันความเสี่ยงแยกต่างหาก',
        });
      }
    }
  }

  return { plan, blocked };
}
import { classifyCaseSourceScope, type CaseSourceCategory } from './case-source-scope';
