import { describe, expect, it, vi } from 'vitest';
import { lookupProductRegistration } from './public-product-registry-lookup';
import type { ProductScanResult } from './public-product-scan-contract';
import type { SmartSearchResult } from './fda-smart-resolver';

function scanResult(overrides: Partial<ProductScanResult> = {}): ProductScanResult {
  return {
    summary: 'ผลสแกนตัวอย่าง',
    productName: 'ผลิตภัณฑ์ตัวอย่าง',
    brand: null,
    productCategory: 'อาหาร',
    visibleText: [],
    identifiers: [],
    generalInformation: [],
    concernLevel: 'UNDETERMINED',
    concernSignals: [],
    positiveSignals: [],
    recommendedActions: ['ตรวจทะเบียน'],
    confidence: 0.7,
    limitations: ['เป็นผลจากภาพ'],
    ...overrides,
  };
}

function registryResult(status: SmartSearchResult['status']): SmartSearchResult {
  return {
    id: 'official-1',
    title: 'ผลิตภัณฑ์ตัวอย่าง',
    category: 'HEALTH_PRODUCTS',
    productCategoryLabel: 'อาหาร',
    snippet: 'เลขสารบบอาหาร 10-1-12345-5-0001',
    source: 'สำนักงานคณะกรรมการอาหารและยา (อย.)',
    sourceUrl: 'https://porta.fda.moph.go.th/fda_search_center_new/',
    publishedDate: '2026-09-01',
    confidenceScore: 1,
    status,
  };
}

describe('automatic product registry lookup', () => {
  it('prioritizes a visible FDA number and returns official matches', async () => {
    const resolver = vi.fn().mockResolvedValue([registryResult('SAFE')]);
    const lookup = await lookupProductRegistration(scanResult({
      identifiers: [
        { type: 'BARCODE', value: '8850000000000' },
        { type: 'FDA_NUMBER', value: '10-1-12345-5-0001' },
      ],
    }), resolver);

    expect(resolver).toHaveBeenCalledWith('10-1-12345-5-0001', { category: 'HEALTH_PRODUCTS' });
    expect(lookup).toMatchObject({ performed: true, queryType: 'FDA_NUMBER', status: 'MATCHED' });
    expect(lookup.results).toHaveLength(1);
  });

  it('falls back to the product name and labels results as candidates', async () => {
    const resolver = vi.fn().mockResolvedValue([registryResult('WARNING')]);
    const lookup = await lookupProductRegistration(scanResult(), resolver);
    expect(lookup.queryType).toBe('PRODUCT_NAME');
    expect(lookup.summary).toContain('อาจตรงกับชื่อผลิตภัณฑ์');
  });

  it('does not turn registry unavailability into a not-found conclusion', async () => {
    const resolver = vi.fn().mockRejectedValue(new Error('source offline'));
    const lookup = await lookupProductRegistration(scanResult(), resolver);
    expect(lookup.status).toBe('UNAVAILABLE');
    expect(lookup.summary).not.toContain('ไม่พบทะเบียน');
  });

  it('skips lookup when no usable identifier or product name is visible', async () => {
    const resolver = vi.fn();
    const lookup = await lookupProductRegistration(scanResult({ productName: null }), resolver);
    expect(lookup).toMatchObject({ performed: false, queryType: 'NONE', status: 'SKIPPED' });
    expect(resolver).not.toHaveBeenCalled();
  });
});
