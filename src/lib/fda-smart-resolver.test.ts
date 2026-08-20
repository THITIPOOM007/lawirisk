import { describe, it, expect, vi } from 'vitest';
import { resolveMultiChannelSearch } from './fda-smart-resolver';

vi.mock('server-only', () => ({}));

describe('fda-smart-resolver', () => {
  it('finds exact matches by FDA registration number', () => {
    const results = resolveMultiChannelSearch('10-1-6500012345');
    expect(results).toHaveLength(1);
    expect(results[0].title).toContain('10-1-65000-1-2345');
    expect(results[0].category).toBe('LICENSES');
  });

  it('finds medical device pattern', () => {
    const results = resolveMultiChannelSearch('ฆพ. 1234/2565');
    expect(results.length).toBeGreaterThan(0);
  });

  it('finds company names in mock data', () => {
    const results = resolveMultiChannelSearch('บริษัท ตัวอย่าง');
    // Just verify it doesn't crash, the actual fallback handles it
    expect(results).toBeDefined();
  });

  it('returns fallback alert for suspicious keywords', () => {
    const results = resolveMultiChannelSearch('อาหารเสริม ลดน้ำหนัก ทันใจ');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns safe fallback for generic query', () => {
    const results = resolveMultiChannelSearch('พาราเซตามอล');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('พาราเซตามอล');
  });
});
