import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { parseIntakeCsv } from '@/lib/csv-intake';
import { addAuditLog, saveIntakeEnvelope, saveIntakeMessage } from '@/lib/demo-data';
import { consumeRateLimit } from '@/lib/rate-limit';
import { INTAKE_WRITE_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

const MAX_FILE_SIZE = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const traceId = requestId();
  const auth = await authorizeStaff(request, INTAKE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์นำเข้าข้อมูล');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);

  try {
    const supabase = auth.identity.mode === 'supabase' ? await createServer() : undefined;
    const limit = await consumeRateLimit({ client: supabase, key: `intake-import:${auth.identity.id}`, limit: 5, windowSeconds: 60 });
    if (!limit.allowed) return apiError('RATE_LIMITED', 'นำเข้าไฟล์ถี่เกินไป กรุณารอสักครู่', 429, traceId);

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_FILE_SIZE + 128 * 1024) return apiError('FILE_TOO_LARGE', 'ไฟล์ CSV ต้องไม่เกิน 2 MB', 413, traceId);
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return apiError('FILE_REQUIRED', 'กรุณาเลือกไฟล์ CSV', 400, traceId);
    if (!file.name.toLowerCase().endsWith('.csv') || !['text/csv', 'application/vnd.ms-excel'].includes(file.type)) {
      return apiError('UNSUPPORTED_FILE', 'รองรับเฉพาะไฟล์ .csv ชนิด text/csv', 400, traceId);
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE || file.name.length > 255) {
      return apiError('INVALID_FILE_SIZE', 'ไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 2 MB', 400, traceId);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.includes(0) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
      return apiError('FILE_SIGNATURE_MISMATCH', 'ไฟล์ไม่ใช่ CSV แบบข้อความ', 400, traceId);
    }
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return apiError('ENCODING_INVALID', 'ไฟล์ CSV ต้องเข้ารหัส UTF-8', 400, traceId); }

    let parsed: ReturnType<typeof parseIntakeCsv>;
    try { parsed = parseIntakeCsv(text); }
    catch (caught: unknown) {
      const code = caught instanceof Error ? caught.message : 'CSV_INVALID';
      const messages: Record<string, string> = {
        CSV_EMPTY: 'ไฟล์ CSV ไม่มีแถวข้อมูล', CSV_HEADERS_INVALID: 'ชื่อคอลัมน์ CSV ไม่ถูกต้องหรือซ้ำกัน',
        CSV_HEADERS_REQUIRED: 'CSV ต้องมี complainant_mode, urgency และ urgency_reason', CSV_TOO_MANY_ROWS: 'รองรับไม่เกิน 1,000 แถวต่อไฟล์',
        CSV_QUOTE_NOT_CLOSED: 'เครื่องหมายคำพูดใน CSV ปิดไม่ครบ',
      };
      return apiError(code, messages[code] || 'รูปแบบ CSV ไม่ถูกต้อง', 400, traceId);
    }

    if (auth.identity.mode === 'demo') {
      const batchId = `batch-${crypto.randomUUID()}`;
      for (const row of parsed.rows) {
        const now = new Date().toISOString();
        const envelopeId = `env-${crypto.randomUUID()}`;
        saveIntakeEnvelope({
          id: envelopeId, channel_id: 'ch-import', status: 'TRIAGE_PENDING', complainant_mode: row.complainant_mode,
          urgency: row.urgency, urgency_reason: row.urgency_reason, jurisdiction_region: row.region,
          jurisdiction_agency: row.agency, malware_scan_status: 'NOT_SCANNED', privacy_risk_status: 'PENDING', created_at: now, updated_at: now,
        });
        saveIntakeMessage({ id: `msg-${crypto.randomUUID()}`, envelope_id: envelopeId, raw_payload: JSON.stringify({ batch_id: batchId, row_index: row.row_index, document_ref: row.document_ref }) });
      }
      addAuditLog(auth.identity.name, 'INTAKE_IMPORT_BATCH', `นำเข้า CSV ${file.name}: สำเร็จ ${parsed.rows.length}, ไม่ผ่าน ${parsed.errors.length}`);
      return NextResponse.json({ success: true, data: { batch_id: batchId, total_rows: parsed.totalRows, success_rows: parsed.rows.length, failed_rows: parsed.errors.length, errors: parsed.errors } }, { status: 201, headers: { 'X-Request-ID': traceId } });
    }

    if (!supabase) return apiError('AUTH_NOT_CONFIGURED', 'ฐานข้อมูลยังไม่พร้อมใช้งาน', 503, traceId);
    const { data, error } = await supabase.rpc('create_csv_intake_batch', { p_filename: file.name, p_rows: parsed.rows, p_failures: parsed.errors });
    if (error || !data) {
      console.error('CSV intake import failed', { traceId, code: error?.code });
      return apiError(error?.message || 'INTAKE_IMPORT_FAILED', 'บันทึกชุดนำเข้าไม่สำเร็จ ระบบไม่ได้บันทึกข้อมูลบางส่วน', 503, traceId);
    }
    return NextResponse.json({ success: true, data: { ...(data as Record<string, unknown>), errors: parsed.errors } }, { status: 201, headers: { 'X-Request-ID': traceId } });
  } catch (caught: unknown) {
    console.error('Unhandled CSV intake import error', { traceId, error: caught instanceof Error ? caught.name : 'UnknownError' });
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดในการนำเข้าไฟล์', 500, traceId);
  }
}
