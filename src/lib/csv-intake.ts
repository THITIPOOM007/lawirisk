import { z } from 'zod';

const MAX_ROWS = 1_000;
const allowedHeaders = [
  'complainant_mode', 'urgency', 'urgency_reason', 'region', 'agency', 'document_ref',
  'complainant_name', 'complainant_phone', 'complainant_email', 'complainant_address',
  'accused_name', 'accused_phone', 'accused_email', 'accused_address',
] as const;

const rowSchema = z.object({
  complainant_mode: z.enum(['IDENTIFIED', 'INCOMPLETE', 'ANONYMOUS']),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']),
  urgency_reason: z.string().trim().min(1).max(2_000),
  region: z.string().trim().max(200).optional(),
  agency: z.string().trim().max(200).optional(),
  document_ref: z.string().trim().max(200).optional(),
  complainant_name: z.string().trim().max(200).optional(),
  complainant_phone: z.string().trim().max(30).optional(),
  complainant_email: z.union([z.literal(''), z.string().email().max(254)]).optional(),
  complainant_address: z.string().trim().max(1_000).optional(),
  accused_name: z.string().trim().max(200).optional(),
  accused_phone: z.string().trim().max(30).optional(),
  accused_email: z.union([z.literal(''), z.string().email().max(254)]).optional(),
  accused_address: z.string().trim().max(1_000).optional(),
}).strict().superRefine((value, context) => {
  if (value.complainant_mode === 'IDENTIFIED' && !value.complainant_name?.trim()) {
    context.addIssue({ code: 'custom', path: ['complainant_name'], message: 'ต้องระบุชื่อผู้ร้องเมื่อ complainant_mode เป็น IDENTIFIED' });
  }
});

export type CsvIntakeRow = z.infer<typeof rowSchema>;
export type CsvRowError = { row: number; error: string };

function parseCells(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"' && cell.length === 0) { quoted = true; continue; }
    if (character === ',') { row.push(cell); cell = ''; continue; }
    if (character === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (character !== '\r') cell += character;
  }
  if (quoted) throw new Error('CSV_QUOTE_NOT_CLOSED');
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function parseIntakeCsv(input: string): { rows: Array<CsvIntakeRow & { row_index: number }>; errors: CsvRowError[]; totalRows: number } {
  const records = parseCells(input.replace(/^\uFEFF/, ''));
  if (records.length < 2) throw new Error('CSV_EMPTY');
  const headers = records[0].map((value) => value.trim());
  if (new Set(headers).size !== headers.length || headers.some((value) => !allowedHeaders.includes(value as typeof allowedHeaders[number]))) {
    throw new Error('CSV_HEADERS_INVALID');
  }
  for (const required of ['complainant_mode', 'urgency', 'urgency_reason']) {
    if (!headers.includes(required)) throw new Error('CSV_HEADERS_REQUIRED');
  }
  const dataRows = records.slice(1).filter((cells) => cells.some((cell) => cell.trim() !== ''));
  if (dataRows.length > MAX_ROWS) throw new Error('CSV_TOO_MANY_ROWS');
  const rows: Array<CsvIntakeRow & { row_index: number }> = [];
  const errors: CsvRowError[] = [];
  dataRows.forEach((cells, offset) => {
    const rowNumber = offset + 2;
    if (cells.length !== headers.length) { errors.push({ row: rowNumber, error: 'จำนวนคอลัมน์ไม่ตรงกับ header' }); return; }
    const candidate = Object.fromEntries(headers.map((header, index) => [header, cells[index].trim()]));
    const parsed = rowSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ row: rowNumber, error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
      return;
    }
    rows.push({ ...parsed.data, row_index: rowNumber });
  });
  return { rows, errors, totalRows: dataRows.length };
}
