import { describe, expect, it } from 'vitest';
import { buildReconAutomationPlan } from './recon-automation';

const base = {
  evidenceId: 'evidence-1',
  filename: 'complaint.pdf',
  pageNumber: 1,
  basisStatus: 'CONFIRMED' as const,
};

describe('recon automation plan', () => {
  it('maps sourced case values into allow-listed official search fields', () => {
    const result = buildReconAutomationPlan({
      caseNumber: 'INV-2569-001',
      caseContext: 'ตรวจสอบร้านนวดเพื่อสุขภาพ',
      candidates: [
        { ...base, id: 'citizen', type: 'CITIZEN_ID', value: '1-2345-67890-12-3' },
        { ...base, id: 'org', type: 'ORGANIZATION', value: 'ร้านนวดตัวอย่าง' },
      ],
    });
    expect(result.plan).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'FDA_SKYNET', service: 'DOPA', field: 'CITIZEN_ID', value: '1234567890123' }),
      expect.objectContaining({ source: 'HSS_ESTA2', field: 'FACILITY_NAME', value: 'ร้านนวดตัวอย่าง' }),
    ]));
    expect(result.plan.every((item) => item.resultRequiresHumanReview)).toBe(true);
  });

  it('uses only high-confidence unreviewed suggestions and labels them as proposals', () => {
    const result = buildReconAutomationPlan({
      caseNumber: 'INV-1',
      caseContext: 'ตรวจสอบร้านนวดเพื่อสุขภาพ',
      candidates: [
        { ...base, id: 'high', type: 'ORGANIZATION', value: 'ร้านนวดตัวอย่าง', basisStatus: 'SUGGESTED', confidence: 0.91 },
        { ...base, id: 'low', type: 'PERSON', value: 'บุคคล ความเชื่อมั่นต่ำ', basisStatus: 'SUGGESTED', confidence: 0.4 },
      ],
    });
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0]).toMatchObject({ basisStatus: 'SUGGESTED', field: 'FACILITY_NAME' });
    expect(result.plan[0].basisLabel).toContain('รอเจ้าหน้าที่ตรวจทาน');
  });

  it('does not silently run the HTTP-only HSS search', () => {
    const result = buildReconAutomationPlan({
      caseNumber: 'INV-1',
      caseContext: 'ตรวจสอบร้านนวดเพื่อสุขภาพ',
      candidates: [{ ...base, id: 'phone', type: 'PHONE', value: '0800000000' }],
    });
    expect(result.plan).toHaveLength(0);
    expect(result.blocked[0]).toMatchObject({ source: 'HSS_OSS', fieldLabel: 'เบอร์โทรศัพท์' });
  });

  it('never routes a drug-store case to the massage establishment registry', () => {
    const result = buildReconAutomationPlan({
      caseNumber: 'DRUG-1',
      caseContext: 'ตรวจสอบร้านขายยาและใบอนุญาตด้านยา',
      candidates: [
        { ...base, id: 'drug-store', type: 'ORGANIZATION', value: 'ร้านยาตัวอย่าง', confidence: 0.95 },
        { ...base, id: 'citizen', type: 'CITIZEN_ID', value: '1234567890123', confidence: 0.95 },
        { ...base, id: 'phone', type: 'PHONE', value: '0800000000', confidence: 0.95 },
      ],
    });
    expect(result.plan.some((item) => item.source === 'HSS_ESTA2')).toBe(false);
    expect(result.blocked.some((item) => item.source === 'HSS_OSS')).toBe(false);
    expect(result.plan).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'FDA_PUBLIC', service: 'FDA_DRUG_REGISTRY', field: 'FACILITY_TERM', value: 'ร้านยาตัวอย่าง' }),
      expect.objectContaining({ source: 'FDA_SKYNET', service: 'DOPA', field: 'CITIZEN_ID' }),
    ]));
  });

  it('classifies clinic entities for HSS OSS without silently sending credentials over HTTP', () => {
    const result = buildReconAutomationPlan({
      caseNumber: 'CLINIC-1',
      caseContext: 'ตรวจสอบคลินิกเวชกรรมและใบอนุญาตสถานพยาบาล',
      candidates: [{ ...base, id: 'clinic', type: 'ORGANIZATION', value: 'คลินิกเวชกรรมตัวอย่าง', confidence: 0.95 }],
    });
    expect(result.plan.some((item) => item.source === 'HSS_ESTA2')).toBe(false);
    expect(result.blocked[0]).toMatchObject({ source: 'HSS_OSS', fieldLabel: 'ชื่อสถานพยาบาล' });
    expect(result.blocked[0].reason).toContain('HTTP');
  });

  it.each([
    ['ผลิตภัณฑ์อาหารผิดกฎหมาย', 'FDA_FOOD_REGISTRY'],
    ['วัตถุอันตรายไม่มีทะเบียน', 'FDA_HAZARDOUS_REGISTRY'],
    ['เครื่องสำอางไม่มีเลขจดแจ้ง', 'FDA_COSMETIC_REGISTRY'],
    ['ผลิตภัณฑ์สมุนไพรเถื่อน', 'FDA_HERBAL_REGISTRY'],
    ['เครื่องมือแพทย์ไม่ได้รับอนุญาต', 'FDA_MEDICAL_DEVICE_REGISTRY'],
  ])('routes %s only to the matching FDA public registry', (caseContext, service) => {
    const result = buildReconAutomationPlan({
      caseNumber: 'FDA-1', caseContext,
      candidates: [{ ...base, id: 'org', type: 'ORGANIZATION', value: 'บริษัท ตัวอย่าง จำกัด', confidence: 0.95 }],
    });
    expect(result.plan.some((item) => item.service === service)).toBe(true);
    expect(result.plan.some((item) => item.source === 'HSS_ESTA2')).toBe(false);
  });
});
