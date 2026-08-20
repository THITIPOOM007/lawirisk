import { describe, expect, it, vi } from 'vitest';
import { resolveMultiChannelSearch } from './fda-smart-resolver';

vi.mock('server-only', () => ({}));

describe('FDA Smart Resolver (Multi-Channel)', () => {
  it('identifies valid 13-digit cosmetic license correctly', async () => {
    // searchDb = false for tests
    const results = await resolveMultiChannelSearch('10-1-6500012345', false);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe('LICENSES');
    expect(results[0].productCategoryLabel).toContain('ผลิตภัณฑ์อาหารและสุขภาพ');
  });

  it('identifies medical advertisement license', async () => {
    const results = await resolveMultiChannelSearch('ฆพ. 1234/2565', false);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe('LICENSES');
  });

  it('identifies company registration keywords', async () => {
    const results = await resolveMultiChannelSearch('บริษัท ตัวอย่าง', false);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe('COMPANIES');
  });

  it('detects high-risk exaggerated keywords', async () => {
    const results = await resolveMultiChannelSearch('อาหารเสริม ลดน้ำหนัก ทันใจ', false);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].status).toBe('WARNING');
  });

  it('provides fallback context for generic health terms', async () => {
    const results = await resolveMultiChannelSearch('พาราเซตามอล', false);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toContain('reg-1A1/65');
  });
});
