import { describe, expect, it } from 'vitest';
import { parseIntakeCsv } from './csv-intake';

describe('CSV intake parser', () => {
  it('parses quoted Thai text and preserves physical row numbers', () => {
    const result = parseIntakeCsv('complainant_mode,urgency,urgency_reason,complainant_name\nIDENTIFIED,HIGH,"ข้อความ, มี comma",สมหญิง');
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ row_index: 2, urgency: 'HIGH', urgency_reason: 'ข้อความ, มี comma', complainant_name: 'สมหญิง' });
  });

  it('reports invalid rows without accepting them', () => {
    const result = parseIntakeCsv('complainant_mode,urgency,urgency_reason\nIDENTIFIED,NORMAL,ทดสอบ\nANONYMOUS,INVALID,ทดสอบ');
    expect(result.rows).toHaveLength(0);
    expect(result.errors.map((item) => item.row)).toEqual([2, 3]);
  });

  it('rejects unknown headers and malformed quotes', () => {
    expect(() => parseIntakeCsv('complainant_mode,urgency,urgency_reason,admin\nANONYMOUS,LOW,x,true')).toThrow('CSV_HEADERS_INVALID');
    expect(() => parseIntakeCsv('complainant_mode,urgency,urgency_reason\nANONYMOUS,LOW,"unfinished')).toThrow('CSV_QUOTE_NOT_CLOSED');
  });
});
