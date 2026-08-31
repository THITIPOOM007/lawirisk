import { describe, expect, it } from 'vitest';
import { buildPredictionFormReport } from './report-builder';
import { formatReportForClipboard, parsePredictionFormContent } from './report-presentation';

function buildV2Content() {
  return JSON.stringify(buildPredictionFormReport({
    caseRecord: {
      number: 'ค.715/2569',
      title: 'โฆษณาอาหารเกินจริง',
      description: 'รายละเอียดข้อร้องเรียน',
      status: 'ACTIVE',
      created_at: '2026-08-31T10:00:00.000Z',
    },
    evidence: [{ filename: 'หลักฐาน.pdf', sha256: 'a'.repeat(64), malware_scan_status: 'NOT_SCANNED' }],
    sourcedEntities: [{ type: 'ORGANIZATION', value: 'บริษัทตัวอย่าง จำกัด' }],
    sourcedRelationships: [],
  }));
}

describe('report presentation parser', () => {
  it('renders the current v2 prediction report instead of exposing raw JSON', () => {
    const report = parsePredictionFormContent(buildV2Content());
    expect(report?.schemaVersion).toBe('lawirisk-prediction-form-v2');
    expect(report?.caseNumber).toBe('ค.715/2569');
    expect(report?.sections).toHaveLength(10);
  });

  it('keeps historical v1 reports readable', () => {
    const v2 = JSON.parse(buildV2Content()) as Record<string, unknown>;
    v2.schemaVersion = 'lawirisk-prediction-form-v1';
    expect(parsePredictionFormContent(JSON.stringify(v2))?.schemaVersion).toBe('lawirisk-prediction-form-v1');
  });

  it('fails safely for malformed or unsupported structured content', () => {
    expect(parsePredictionFormContent('{"schemaVersion":"unknown"}')).toBeNull();
    expect(parsePredictionFormContent('{invalid')).toBeNull();
  });

  it('copies a readable Thai report rather than serialized JSON', () => {
    const text = formatReportForClipboard(buildV2Content());
    expect(text).toContain('ฟอร์มกำหนดคาดการณ์และติดตามเรื่องร้องเรียน');
    expect(text).toContain('01 ผู้ร้องเรียน');
    expect(text.trimStart().startsWith('{')).toBe(false);
  });
});
