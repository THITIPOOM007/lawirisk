import { describe, expect, it } from 'vitest';
import { buildCaseReport } from './report-builder';

describe('deterministic report builder', () => {
  it('includes source-backed facts and an explicit non-adjudication boundary', () => {
    const report = buildCaseReport({
      caseRecord: { number: 'ค.1/2569', title: 'กรณีทดสอบ', description: 'รายละเอียด', status: 'ACTIVE', created_at: '2026-08-18T00:00:00.000Z' },
      reportType: 'SUMMARY',
      evidence: [{ filename: 'source.pdf', sha256: 'a'.repeat(64), malware_scan_status: 'CLEAN' }],
      sourcedEntities: [{ type: 'PHONE', value: '0800000000' }],
      sourcedRelationships: [{ type: 'CONTACTED' }],
      generatedAt: new Date('2026-08-18T01:00:00.000Z'),
    });
    expect(report).toContain('SHA-256');
    expect(report).toContain('PHONE: 0800000000');
    expect(report).toContain('ไม่ใช่ข้อวินิจฉัยความผิด');
    expect(report).toContain('2026-08-18T01:00:00.000Z');
  });
});
