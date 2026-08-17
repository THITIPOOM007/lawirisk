import { describe, expect, it } from 'vitest';
import { createCaseSchema, externalIntakeSchema, manualIntakeSchema, triageIntakeSchema } from './intake-contracts';

describe('intake API contracts', () => {
  it('requires complainant details for an identified manual intake', () => {
    const result = manualIntakeSchema.safeParse({
      channel_id: 'ch-walkin',
      complainant_mode: 'IDENTIFIED',
      urgency: 'NORMAL',
      urgency_reason: 'รับเรื่องหน้าเคาน์เตอร์',
    });
    expect(result.success).toBe(false);
  });

  it('allows anonymous manual intake without synthesizing a person', () => {
    const result = manualIntakeSchema.safeParse({
      channel_id: 'ch-phone',
      complainant_mode: 'ANONYMOUS',
      urgency: 'LOW',
      urgency_reason: 'ผู้แจ้งไม่ประสงค์ออกนาม',
    });
    expect(result.success).toBe(true);
    expect(result.data?.complainant).toBeUndefined();
  });

  it('requires a destination for merge and case fields for promotion', () => {
    expect(triageIntakeSchema.safeParse({ action: 'MERGE_INTAKE', reason: 'เรื่องเดียวกัน' }).success).toBe(false);
    expect(triageIntakeSchema.safeParse({ action: 'CREATE_CASE', reason: 'เข้าเกณฑ์เปิดสำนวน' }).success).toBe(false);
  });

  it('rejects client-controlled unknown fields for case creation', () => {
    expect(createCaseSchema.safeParse({ number: 'ค.1/2569', title: 'คดีทดสอบ', created_by: 'attacker' }).success).toBe(false);
  });

  it('normalizes safe external defaults while preserving source metadata', () => {
    const result = externalIntakeSchema.safeParse({ ref_no: 'KP-001', source_version: '2' });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ complainant_mode: 'IDENTIFIED', urgency: 'NORMAL', source_version: '2' });
  });
});
