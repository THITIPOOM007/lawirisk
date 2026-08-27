import { describe, expect, it, vi } from 'vitest';
import { resolveMultiChannelSearch } from './fda-smart-resolver';

vi.mock('server-only', () => ({}));

describe('FDA public search fallback', () => {
  it('treats a plausible registration number as unverified guidance', async () => {
    const [result] = await resolveMultiChannelSearch('10-1-6500012345', false);
    expect(result.category).toBe('HEALTH_PRODUCTS');
    expect(result.status).toBe('UNREGISTERED');
    expect(result.confidenceScore).toBe(0);
    expect(result.productCategoryLabel).toContain('ไม่ใช่ผลรับรอง');
  });

  it('classifies an advertisement-license-shaped query without claiming validity', async () => {
    const [result] = await resolveMultiChannelSearch('ฆพ. 1234/2565', false);
    expect(result.category).toBe('LICENSES');
    expect(result.status).toBe('UNREGISTERED');
  });

  it('classifies a company query without fabricating a registry match', async () => {
    const [result] = await resolveMultiChannelSearch('บริษัท ตัวอย่าง', false);
    expect(result.category).toBe('COMPANIES');
    expect(result.status).toBe('UNREGISTERED');
    expect(result.snippet).toContain('ยังไม่ได้ยืนยัน');
  });

  it('does not turn suspicious marketing text into an official finding', async () => {
    const [result] = await resolveMultiChannelSearch('อาหารเสริม ลดน้ำหนัก ทันใจ', false);
    expect(result.status).toBe('UNREGISTERED');
    expect(result.confidenceScore).toBe(0);
  });

  it('does not return a hard-coded product record for a generic term', async () => {
    const [result] = await resolveMultiChannelSearch('พาราเซตามอล', false);
    expect(result.id).toContain('unverified-');
    expect(result.sourceUrl).toMatch(/^https:\/\//);
  });
});
