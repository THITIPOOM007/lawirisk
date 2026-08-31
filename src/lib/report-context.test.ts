import { describe, expect, it } from 'vitest';
import { buildReportIntakeContext } from './report-context';

describe('report intake context', () => {
  it('allow-lists structured complaint fields and official source results', () => {
    const context = buildReportIntakeContext({
      envelope: { id: 'env-1', created_at: '2026-08-31T00:00:00.000Z', complainant_mode: 'IDENTIFIED', urgency: 'HIGH' },
      message: { raw_payload: JSON.stringify({ trackingToken: 'TRK-1', topic: 'ตรวจยา', registrationNumber: '2A972/29', secret: 'must-not-leak' }) },
      participants: [{ role: 'COMPLAINANT', name: 'ผู้ร้องตัวอย่าง' }],
      officialChecks: [{ source_label: 'อย.', source_url: 'https://example.go.th/', query_text: '2A 972/29', status: 'FOUND', classification: 'SUGGESTED', summary: 'พบข้อมูล', checked_at: '2026-08-31T00:01:00.000Z', result_count: 1, results: [{ title: 'ยาทดสอบ', metadata: { license: '2A972/29' } }] }],
    });
    expect(context.registrationNumber).toBe('2A972/29');
    expect(context.officialChecks[0].results[0].title).toBe('ยาทดสอบ');
    expect(JSON.stringify(context)).not.toContain('must-not-leak');
  });

  it('does not copy malformed raw intake payload into the report', () => {
    const context = buildReportIntakeContext({ envelope: { id: 'env-2', created_at: '2026-08-31T00:00:00.000Z', complainant_mode: 'ANONYMOUS' }, message: { raw_payload: '{broken' } });
    expect(context.topic).toBeUndefined();
    expect(context.complainantMode).toBe('ANONYMOUS');
  });
});
