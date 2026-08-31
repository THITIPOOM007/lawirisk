import { describe, expect, it } from 'vitest';
import { buildLegalResearchPlan } from './evidence-screening';

describe('source-bound legal research plan', () => {
  it('routes medicine complaints to FDA law sources without adding massage law', () => {
    const plan = buildLegalResearchPlan('ร้องเรียนร้านขายยาและทะเบียนยาไม่ตรงฉลาก');
    expect(plan.topics).toContain('พระราชบัญญัติยาและเงื่อนไขใบอนุญาตด้านยา');
    expect(plan.topics).not.toContain('ใบอนุญาตสถานประกอบการเพื่อสุขภาพและผู้ให้บริการ');
    expect(plan.sources.some((source) => source.url === 'https://laws.fda.moph.go.th/laws/category/act/')).toBe(true);
  });

  it('routes clinic complaints to HSS and includes the staff-only Kouprey legal index', () => {
    const plan = buildLegalResearchPlan('คลินิกทันตกรรมไม่มีใบอนุญาตสถานพยาบาล');
    expect(plan.topics).toContain('ใบอนุญาตสถานพยาบาลและผู้ประกอบวิชาชีพ');
    expect(plan.sources.some((source) => source.authority.includes('กรมสนับสนุนบริการสุขภาพ'))).toBe(true);
    expect(plan.sources.find((source) => source.url.includes('koupreyplus'))?.access).toBe('STAFF');
  });
});
