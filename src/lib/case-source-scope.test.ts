import { describe, expect, it } from 'vitest';
import { classifyCaseSourceScope, recommendCaseSources } from './case-source-scope';

describe('case-scoped official source routing', () => {
  it.each([
    ['ตรวจสอบร้านขายยาไม่มีใบอนุญาต', 'DRUG', 'medicina.fda.moph.go.th'],
    ['น้ำดื่มแสดงฉลากอาหารไม่ถูกต้อง', 'FOOD', 'alimentum.fda.moph.go.th'],
    ['ผลิตภัณฑ์วัตถุอันตราย', 'HAZARDOUS', 'excercitium.fda.moph.go.th'],
    ['ครีมเครื่องสำอางไม่มีเลขจดแจ้ง', 'COSMETIC', 'cosmetica.fda.moph.go.th'],
    ['สถานที่ผลิตสมุนไพร', 'HERBAL', 'meshlog.fda.moph.go.th'],
    ['สถานที่เครื่องมือแพทย์', 'MEDICAL_DEVICE', 'medeva.fda.moph.go.th'],
    ['คลินิกเวชกรรมเอกชน', 'HEALTHCARE', 'hosp.hss.moph.go.th'],
    ['ร้านนวดเพื่อสุขภาพ', 'HEALTH_BUSINESS', 'spa-services.hss.moph.go.th'],
  ])('routes %s to the matching FDA category', (context, category, host) => {
    expect(classifyCaseSourceScope(context)).toBe(category);
    expect(recommendCaseSources(context).some((item) => new URL(item.url).hostname === host)).toBe(true);
  });

  it('routes a clinic case to HSS and never to the massage registry', () => {
    const sources = recommendCaseSources('ตรวจสอบใบอนุญาตคลินิกเวชกรรม');
    expect(sources[0]?.category).toBe('HEALTHCARE');
    expect(sources[0]?.url).toContain('hosp.hss.moph.go.th');
    expect(JSON.stringify(sources)).not.toMatch(/spa-services|ร้านนวด/i);
  });

  it('does not suggest massage sources for a drug-store case', () => {
    const sources = recommendCaseSources('ตรวจร้านยาและเภสัชกร');
    expect(sources[0]?.category).toBe('DRUG');
    expect(JSON.stringify(sources)).not.toMatch(/นวด|esta2/i);
  });

  it('includes all three staff URLs supplied for herbal-place checks', () => {
    const sources = recommendCaseSources('ตรวจสถานที่ผลิตสมุนไพร');
    expect(sources.map((item) => item.url)).toContain('https://meshlog.fda.moph.go.th/FDA_DRUG_HERB/LCN_STAFF/FRM_STAFF_LCN_SEARCH.aspx');
  });

  it('always includes official FDA and HSS public-warning channels for deep search', () => {
    const urls = recommendCaseSources('ตรวจสอบผลิตภัณฑ์ต้องสงสัย').map((item) => item.url);
    expect(urls).toContain('https://oryor.com/media/newsUpdate');
    expect(urls).toContain('https://hss.moph.go.th/s_show_topic2.php?id_form=1');
  });
});
