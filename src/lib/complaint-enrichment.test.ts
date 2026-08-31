import { describe, expect, it } from 'vitest';
import { executeComplaintEnrichmentPlan, planComplaintEnrichment } from './complaint-enrichment';
import type { SmartSearchResult } from './fda-smart-resolver';

function result(status: SmartSearchResult['status']): SmartSearchResult {
  return {
    id: `result-${status}`,
    title: 'ทะเบียนทดสอบจากต้นทาง',
    category: 'HEALTH_PRODUCTS',
    productCategoryLabel: 'อาหาร',
    snippet: 'ผลสังเคราะห์สำหรับทดสอบเท่านั้น',
    source: 'ฐานข้อมูลทางการทดสอบ',
    sourceUrl: 'https://example.go.th/source',
    publishedDate: '2026-08-31T01:00:00.000Z',
    confidenceScore: status === 'SAFE' ? 1 : 0,
    status,
  };
}

describe('automatic public complaint enrichment', () => {
  it('extracts a product identifier and routes a drug complaint only to FDA', () => {
    const plan = planComplaintEnrichment({
      topic: 'ร้องเรียนร้านขายยา',
      description: 'พบผลิตภัณฑ์ต้องสงสัย เลข 7420185960457 ขอให้ตรวจสอบ ไม่ใช่ร้านนวด',
      category: 'HEALTH_HAZARD',
    });
    expect(plan).toEqual([expect.objectContaining({
      sourceKey: 'FDA_PUBLIC', query: '7420185960457', category: 'DRUG', queryKind: 'PRODUCT_OR_LICENSE',
    })]);
    expect(JSON.stringify(plan)).not.toMatch(/HSS_PUBLIC_HEALTH_BUSINESS/);
  });

  it('routes clinics to the HSS clinic registry, not the massage registry', () => {
    const plan = planComplaintEnrichment({
      topic: 'คลินิกเวชกรรมตัวอย่าง',
      description: 'สงสัยว่าเปิดสถานพยาบาลโดยไม่ได้รับอนุญาตในพื้นที่ จึงขอให้ตรวจสอบทะเบียน',
      category: 'ILLEGAL_CLINIC',
    });
    expect(plan[0]).toMatchObject({ sourceKey: 'HSS_PUBLIC_CLINIC', category: 'HEALTHCARE' });
    expect(plan.some((item) => item.sourceKey === 'HSS_PUBLIC_HEALTH_BUSINESS')).toBe(false);
  });

  it('routes massage businesses only to the HSS health-business registry', () => {
    const plan = planComplaintEnrichment({
      topic: 'ร้านนวดเพื่อสุขภาพตัวอย่าง',
      description: 'พบการให้บริการโดยไม่แสดงใบอนุญาต ขอให้ตรวจทะเบียนสถานประกอบการเพื่อสุขภาพ',
      category: 'OTHER',
    });
    expect(plan[0]).toMatchObject({ sourceKey: 'HSS_PUBLIC_HEALTH_BUSINESS', category: 'HEALTH_BUSINESS' });
  });

  it('keeps provider output suggested and distinguishes found from unavailable', async () => {
    const fdaPlan = planComplaintEnrichment({
      topic: 'ผลิตภัณฑ์อาหาร', description: 'ตรวจสอบผลิตภัณฑ์หมายเลข 7420185960457 ว่ามีทะเบียนหรือไม่', category: 'HEALTH_HAZARD',
    });
    const found = await executeComplaintEnrichmentPlan(fdaPlan, {
      searchFda: async () => [result('SAFE')],
      now: () => new Date('2026-08-31T02:00:00.000Z'),
    });
    expect(found[0]).toMatchObject({ status: 'FOUND', resultCount: 1, classification: 'SUGGESTED', checkedAt: '2026-08-31T02:00:00.000Z' });

    const unavailable = await executeComplaintEnrichmentPlan(fdaPlan, { searchFda: async () => [result('UNAVAILABLE')] });
    expect(unavailable[0]).toMatchObject({ status: 'UNAVAILABLE', resultCount: 0, classification: 'SUGGESTED' });
    expect(unavailable[0].summary).toContain('ยังไม่สรุปว่า');
  });
});
