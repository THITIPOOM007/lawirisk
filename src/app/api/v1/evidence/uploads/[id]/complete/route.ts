import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { isEvidenceUsable } from '@/lib/evidence-file-status';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { validateStoredFileReference } from '@/lib/stored-file-validator';
import { createServer, createServiceClient } from '@/lib/supabase-server';

const idSchema = z.string().uuid();

type EvidenceRecord = {
  id: string;
  case_id: string;
  filename: string;
  file_size: number;
  mime_type: 'application/pdf' | 'image/png' | 'image/jpeg';
  sha256: string;
  file_path: string;
  status: string;
  upload_state: 'RESERVED' | 'STORED' | 'FAILED';
  malware_scan_status: string;
  created_by: string;
  created_at: string;
};

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = requestId();
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'คุณไม่มีสิทธิ์ยืนยันหลักฐาน');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);
  if (auth.identity.mode !== 'supabase') return apiError('UPLOAD_COMPLETION_UNAVAILABLE', 'การยืนยันไฟล์จริงไม่พร้อมในโหมดสาธิต', 503, traceId);

  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) return apiError('INVALID_EVIDENCE_ID', 'รหัสหลักฐานไม่ถูกต้อง', 400, traceId);

  try {
    const supabase = await createServer();
    const rateLimit = await consumeRateLimit({
      client: supabase,
      key: `evidence-upload-complete:${auth.identity.id}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'ยืนยันการอัปโหลดถี่เกินไป กรุณารอสักครู่', request_id: traceId } },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds), 'X-Request-ID': traceId } },
      );
    }

    const { data, error } = await supabase.from('evidence_files')
      .select('id,case_id,filename,file_size,mime_type,sha256,file_path,status,upload_state,malware_scan_status,created_by,created_at')
      .eq('id', parsedId.data)
      .maybeSingle();
    const evidence = data as EvidenceRecord | null;
    if (error || !evidence) return apiError('EVIDENCE_NOT_FOUND', 'ไม่พบหลักฐานหรือคุณไม่มีสิทธิ์เข้าถึง', 404, traceId);
    if (evidence.upload_state === 'FAILED') return apiError('EVIDENCE_UPLOAD_FAILED', 'รายการอัปโหลดนี้ถูกปิดแล้ว กรุณาเริ่มใหม่', 409, traceId);
    if (isEvidenceUsable(evidence.upload_state, evidence.malware_scan_status)) {
      return NextResponse.json({
        success: true,
        message: evidence.malware_scan_status === 'CLEAN'
          ? 'หลักฐานนี้จัดเก็บและสแกนไว้แล้ว'
          : 'หลักฐานนี้จัดเก็บและตรวจรูปแบบไฟล์ไว้แล้ว',
        data: evidence,
      }, { status: 200, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': traceId } });
    }

    const service = createServiceClient();
    const bucket = process.env.PRIVATE_EVIDENCE_BUCKET || 'evidence-vault';
    const { data: signedSource, error: signedSourceError } = await service.storage
      .from(bucket)
      .createSignedUrl(evidence.file_path, 300);
    if (signedSourceError || !signedSource?.signedUrl) {
      return apiError('UPLOADED_OBJECT_NOT_FOUND', 'ยังไม่พบไฟล์ที่อัปโหลดครบ กรุณารอแล้วลองอีกครั้ง', 409, traceId);
    }

    const validation = await validateStoredFileReference({
      sourceUrl: signedSource.signedUrl,
      expectedSize: evidence.file_size,
      expectedMime: evidence.mime_type,
    });
    if (!validation.ok) {
      const retryable = validation.reason === 'STORED_OBJECT_UNAVAILABLE'
        || validation.reason === 'STORED_OBJECT_VALIDATION_TIMEOUT'
        || validation.reason === 'STORED_OBJECT_VALIDATION_FAILED';
      if (retryable) {
        return NextResponse.json({
          success: true,
          message: 'อัปโหลดครบแล้ว แต่ยังตรวจไฟล์จากพื้นที่จัดเก็บไม่ได้ กรุณาลองยืนยันอีกครั้ง',
          data: { evidence_id: evidence.id, upload_state: evidence.upload_state, malware_scan_status: evidence.malware_scan_status, retryable: true },
        }, { status: 202, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': traceId } });
      }

      const { error: removeError } = await service.storage.from(bucket).remove([evidence.file_path]);
      if (!removeError) {
        await supabase.rpc('cancel_evidence_reservation', { p_evidence_id: evidence.id, p_reason: validation.reason });
      }
      await service.from('audit_logs').insert({
        profile_id: auth.identity.id,
        action: 'EVIDENCE_UPLOAD_REJECTED',
        details: { evidence_id: evidence.id, case_id: evidence.case_id, reason: validation.reason },
      });
      return apiError('EVIDENCE_INTEGRITY_REJECTED', 'ขนาด ชนิด หรือโครงสร้างไฟล์ในพื้นที่จัดเก็บไม่ตรงกับข้อมูลที่ลงทะเบียน', 422, traceId);
    }

    const { data: finalizedData, error: finalizeError } = await supabase.rpc('finalize_evidence_upload', { p_evidence_id: evidence.id });
    if (finalizeError || !finalizedData) {
      console.error('Evidence direct upload finalize failed', { traceId, evidenceId: evidence.id, code: finalizeError?.code });
      return apiError('METADATA_WRITE_FAILED', 'ยืนยันทะเบียนหลักฐานไม่สำเร็จ กรุณาลองใหม่', 503, traceId);
    }
    const finalized = finalizedData as EvidenceRecord;

    return NextResponse.json({
      success: true,
      message: 'อัปโหลดครบและตรวจขนาด ชนิดไฟล์ และโครงสร้างแล้ว พร้อมใช้งานในขั้นตอนถัดไป',
      data: finalized,
    }, { status: 201, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': traceId } });
  } catch (error: unknown) {
    console.error('Evidence upload completion error', { traceId, error: error instanceof Error ? error.name : 'UnknownError' });
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่', 500, traceId);
  }
}
