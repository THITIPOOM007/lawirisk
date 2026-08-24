import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import {
  evidenceMimeMatchesFilename,
  normalizedEvidenceExtension,
  reserveEvidenceUploadSchema,
} from '@/lib/evidence-upload-contract';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { createServer, createServiceClient } from '@/lib/supabase-server';

const MAX_CONTROL_REQUEST_BYTES = 8 * 1024;

function resumableStorageEndpoint(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'https:') return null;
    const projectRef = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i)?.[1];
    const origin = projectRef ? `https://${projectRef}.storage.supabase.co` : url.origin;
    return `${origin}/storage/v1/upload/resumable`;
  } catch {
    return null;
  }
}
export async function POST(request: NextRequest) {
  const traceId = requestId();
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'คุณไม่มีสิทธิ์เพิ่มหลักฐาน');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);
  if (auth.identity.mode !== 'supabase') {
    return apiError('DIRECT_UPLOAD_UNAVAILABLE', 'การอัปโหลดไฟล์ขนาดใหญ่ใช้ได้เมื่อเชื่อมต่อระบบจัดเก็บจริง', 503, traceId);
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > MAX_CONTROL_REQUEST_BYTES) {
    return apiError('REQUEST_TOO_LARGE', 'ข้อมูลคำขอมีขนาดเกินกำหนด', 413, traceId);
  }

  try {
    const parsed = reserveEvidenceUploadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !evidenceMimeMatchesFilename(parsed.data.filename, parsed.data.mime_type)) {
      return apiError('INVALID_UPLOAD_METADATA', 'ข้อมูลไฟล์ไม่ถูกต้องหรือชนิดไฟล์ไม่ตรงกับนามสกุล', 400, traceId);
    }

    const supabase = await createServer();
    const rateLimit = await consumeRateLimit({
      client: supabase,
      key: `evidence-upload-reserve:${auth.identity.id}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'สร้างคำขออัปโหลดถี่เกินไป กรุณารอสักครู่', request_id: traceId } },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds), 'X-Request-ID': traceId } },
      );
    }

    const { data: accessibleCase } = await supabase.from('cases').select('id').eq('id', parsed.data.case_id).maybeSingle();
    if (!accessibleCase) return apiError('CASE_NOT_ACCESSIBLE', 'ไม่พบสำนวนคดีหรือคุณไม่มีสิทธิ์เข้าถึง', 404, traceId);

    const extension = normalizedEvidenceExtension(parsed.data.filename);
    if (!extension) return apiError('UNSUPPORTED_FILE', 'รองรับเฉพาะ PDF, PNG และ JPEG', 400, traceId);
    const objectPath = `${parsed.data.case_id}/${crypto.randomUUID()}.${extension}`;
    const { data: evidenceId, error: reserveError } = await supabase.rpc('reserve_evidence_upload', {
      p_case_id: parsed.data.case_id,
      p_filename: parsed.data.filename,
      p_file_path: objectPath,
      p_file_size: parsed.data.file_size,
      p_mime_type: parsed.data.mime_type,
      p_sha256: parsed.data.sha256,
    });
    if (reserveError || !evidenceId) {
      const duplicate = reserveError?.code === '23505';
      return apiError(
        duplicate ? 'DUPLICATE_EVIDENCE' : 'EVIDENCE_RESERVATION_FAILED',
        duplicate ? 'หลักฐานไฟล์เดียวกันมีอยู่ในสำนวนนี้แล้ว' : 'สำรองทะเบียนหลักฐานไม่สำเร็จ กรุณาลองใหม่',
        duplicate ? 409 : 503,
        traceId,
      );
    }

    const bucket = process.env.PRIVATE_EVIDENCE_BUCKET || 'evidence-vault';
    const endpoint = resumableStorageEndpoint();
    if (!endpoint) {
      await supabase.rpc('cancel_evidence_reservation', { p_evidence_id: evidenceId, p_reason: 'STORAGE_ENDPOINT_INVALID' });
      return apiError('STORAGE_NOT_CONFIGURED', 'ระบบจัดเก็บไฟล์ขนาดใหญ่ยังไม่พร้อมใช้งาน', 503, traceId);
    }

    const service = createServiceClient();
    const { data: signedUpload, error: signedUploadError } = await service.storage
      .from(bucket)
      .createSignedUploadUrl(objectPath, { upsert: false });
    if (signedUploadError || !signedUpload?.token) {
      await supabase.rpc('cancel_evidence_reservation', { p_evidence_id: evidenceId, p_reason: 'SIGNED_UPLOAD_GRANT_FAILED' });
      console.error('Evidence signed upload grant failed', { traceId, evidenceId, code: signedUploadError?.name });
      return apiError('STORAGE_UNAVAILABLE', 'ไม่สามารถเริ่มการอัปโหลดแบบต่อเนื่องได้ กรุณาลองใหม่', 503, traceId);
    }

    return NextResponse.json({
      success: true,
      data: {
        evidence_id: evidenceId,
        bucket,
        object_path: objectPath,
        upload_token: signedUpload.token,
        resumable_endpoint: endpoint,
        expires_in_seconds: 7200,
      },
    }, { status: 201, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': traceId } });
  } catch (error: unknown) {
    console.error('Evidence upload reservation error', { traceId, error: error instanceof Error ? error.name : 'UnknownError' });
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่', 500, traceId);
  }
}
