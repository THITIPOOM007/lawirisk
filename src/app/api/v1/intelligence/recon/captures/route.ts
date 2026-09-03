import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { findExternalSource } from '@/lib/external-sources';
import { consumeRateLimit } from '@/lib/rate-limit';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { createServer } from '@/lib/supabase-server';

const captureSchema = z.object({
  case_id: z.string().uuid(),
  evidence_id: z.string().uuid(),
  preview_evidence_id: z.string().uuid().optional(),
  source: z.enum(['FDA_PUBLIC', 'FDA_SKYNET', 'HSS_ESTA2']),
  service: z.string().trim().min(1).max(80),
  search_field: z.string().trim().min(1).max(80),
  pdf_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  screenshot_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  result_row_count: z.number().int().min(0).max(10_000),
  captured_at: z.string().datetime(),
  source_url: z.string().url().max(300),
  adapter_version: z.string().trim().min(1).max(100),
  search_strategy: z.string().trim().min(1).max(40),
  search_attempt_count: z.number().int().min(1).max(10),
  basis_status: z.enum(['CONFIRMED', 'SUGGESTED', 'UNCERTAIN']),
}).strict().superRefine((value, context) => {
  if (Boolean(value.preview_evidence_id) !== Boolean(value.screenshot_sha256)) {
    context.addIssue({ code: 'custom', message: 'ต้องส่งภาพตัวอย่างและ SHA-256 มาคู่กัน' });
  }
});

export async function POST(request: NextRequest) {
  const traceId = requestId();
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ลงทะเบียนผลค้นเป็นหลักฐาน');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);
  if (auth.identity.mode !== 'supabase') return apiError('CAPTURE_IMPORT_UNAVAILABLE', 'การนำเข้าผลค้นจริงไม่พร้อมในโหมดสาธิต', 503, traceId);

  const parsed = captureSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_CAPTURE', 'ข้อมูลผลค้นสำหรับลงทะเบียนไม่ถูกต้อง', 400, traceId);
  const payload = parsed.data;
  const source = findExternalSource(payload.source);
  const service = source?.services.find((item) => item.key === payload.service);
  if (!source || !service || service.automationMode !== 'LOCAL_SEARCH'
    || !service.searchFields.some((field) => field.key === payload.search_field)) {
    return apiError('CAPTURE_SOURCE_NOT_ALLOWED', 'แหล่ง บริการ หรือช่องค้นไม่อยู่ในรายการที่อนุญาต', 400, traceId);
  }
  const capturedUrl = new URL(payload.source_url);
  const expectedHost = payload.source === 'FDA_PUBLIC'
    ? 'meshlog.fda.moph.go.th'
    : payload.source === 'FDA_SKYNET'
      ? 'help.fda.moph.go.th'
      : 'esta2.hss.moph.go.th';
  if (capturedUrl.protocol !== 'https:' || capturedUrl.hostname !== expectedHost
    || capturedUrl.username || capturedUrl.password) {
    return apiError('CAPTURE_SOURCE_NOT_ALLOWED', 'URL ของผลค้นไม่ตรงกับระบบต้นทางที่อนุญาต', 400, traceId);
  }

  const supabase = await createServer();
  const limit = await consumeRateLimit({
    client: supabase,
    key: `recon-capture:${auth.identity.id}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_LIMITED', message: 'ลงทะเบียนผลค้นถี่เกินไป กรุณารอสักครู่', request_id: traceId } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'X-Request-ID': traceId } },
    );
  }

  const evidenceResult = await supabase.from('evidence_files')
    .select('id,case_id,sha256,upload_state,malware_scan_status')
    .eq('id', payload.evidence_id)
    .eq('case_id', payload.case_id)
    .maybeSingle();
  if (evidenceResult.error || !evidenceResult.data) {
    return apiError('EVIDENCE_NOT_FOUND', 'ไม่พบไฟล์ผลค้นในสำนวนหรือไม่มีสิทธิ์เข้าถึง', 404, traceId);
  }
  if (evidenceResult.data.upload_state !== 'STORED' || evidenceResult.data.sha256 !== payload.pdf_sha256) {
    return apiError('CAPTURE_INTEGRITY_MISMATCH', 'ไฟล์ผลค้นยังจัดเก็บไม่สมบูรณ์หรือค่า SHA-256 ไม่ตรงกัน', 409, traceId);
  }
  if (payload.preview_evidence_id && payload.screenshot_sha256) {
    const previewResult = await supabase.from('evidence_files')
      .select('id,case_id,sha256,mime_type,upload_state')
      .eq('id', payload.preview_evidence_id)
      .eq('case_id', payload.case_id)
      .maybeSingle();
    if (previewResult.error || !previewResult.data || previewResult.data.upload_state !== 'STORED'
      || previewResult.data.mime_type !== 'image/png' || previewResult.data.sha256 !== payload.screenshot_sha256) {
      return apiError('CAPTURE_PREVIEW_INTEGRITY_MISMATCH', 'ภาพหน้าผลค้นยังจัดเก็บไม่สมบูรณ์หรือค่า SHA-256 ไม่ตรงกัน', 409, traceId);
    }
  }

  const audit = await supabase.from('audit_logs').insert({
    profile_id: auth.identity.id,
    action: 'RECON_RESULT_IMPORTED',
    details: {
      case_id: payload.case_id,
      evidence_id: payload.evidence_id,
      preview_evidence_id: payload.preview_evidence_id || null,
      source_key: payload.source,
      service: payload.service,
      search_field: payload.search_field,
      pdf_sha256: payload.pdf_sha256,
      screenshot_sha256: payload.screenshot_sha256 || null,
      result_row_count: payload.result_row_count,
      captured_at: payload.captured_at,
      source_url: payload.source_url,
      adapter_version: payload.adapter_version,
      search_strategy: payload.search_strategy,
      search_attempt_count: payload.search_attempt_count,
      basis_status: payload.basis_status,
      result_status: 'SUGGESTED_PENDING_HUMAN_REVIEW',
      raw_query_received_by_server: false,
      raw_provider_rows_received_by_server: false,
    },
  });
  if (audit.error) return apiError('CAPTURE_AUDIT_FAILED', 'บันทึกสายการครอบครองผลค้นไม่สำเร็จ', 503, traceId);

  return NextResponse.json({
    success: true,
    data: {
      evidence_id: payload.evidence_id,
      status: 'IMPORTED_PENDING_HUMAN_REVIEW',
      malware_scan_status: evidenceResult.data.malware_scan_status,
    },
  }, { status: 201, headers: { 'Cache-Control': 'private, no-store', 'X-Request-ID': traceId } });
}
