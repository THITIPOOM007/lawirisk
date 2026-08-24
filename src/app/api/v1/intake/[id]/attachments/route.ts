import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { UNSCANNED_EVIDENCE_STATUS } from '@/lib/evidence-file-status';
import { consumeRateLimit } from '@/lib/rate-limit';
import { INTAKE_WRITE_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const allowedTypes = {
  pdf: { mime: 'application/pdf', magic: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '25504446' },
  png: { mime: 'image/png', magic: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '89504e47' },
  jpg: { mime: 'image/jpeg', magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
  jpeg: { mime: 'image/jpeg', magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const traceId = requestId();
  const auth = await authorizeStaff(request, INTAKE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'คุณไม่มีสิทธิ์แนบไฟล์นำเข้า');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);

  const { id: envelopeId } = await params;

  try {
    const supabase = auth.identity.mode === 'supabase' ? await createServer() : undefined;
    const rateLimit = await consumeRateLimit({
      client: supabase,
      key: `intake-attachment-upload:${auth.identity.id}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'อัปโหลดถี่เกินไป กรุณารอสักครู่', request_id: traceId } },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds), 'X-Request-ID': traceId } },
      );
    }

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_FILE_SIZE + 1024 * 1024) {
      return apiError('FILE_TOO_LARGE', 'ขนาดไฟล์เกินกำหนด 20 MB', 413, traceId);
    }
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return apiError('INVALID_REQUEST', 'กรุณาเลือกไฟล์ให้ครบถ้วน', 400, traceId);
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE || file.name.length > 255) {
      return apiError('INVALID_FILE_SIZE', 'ไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 20 MB', 400, traceId);
    }

    if (auth.identity.mode === 'supabase' && !z.string().uuid().safeParse(envelopeId).success) {
      return apiError('INVALID_ENVELOPE_ID', 'รูปแบบรหัสซองนำเข้าไม่ถูกต้อง', 400, traceId);
    }
    const extension = file.name.split('.').pop()?.toLowerCase() as keyof typeof allowedTypes | undefined;
    const rule = extension ? allowedTypes[extension] : undefined;
    if (!extension || !rule || file.type !== rule.mime) {
      return apiError('UNSUPPORTED_FILE', 'รองรับเฉพาะ PDF, PNG และ JPEG ที่ชนิดไฟล์ตรงกัน', 400, traceId);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!rule.magic(buffer)) {
      return apiError('FILE_SIGNATURE_MISMATCH', 'โครงสร้างไฟล์ไม่ตรงกับชนิดที่ระบุ', 400, traceId);
    }
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    if (auth.identity.mode === 'demo') {
      return NextResponse.json({
        success: true,
        message: 'รับไฟล์ในโหมดสาธิตและตรวจรูปแบบไฟล์แล้ว',
        data: {
          id: `att-${crypto.randomUUID()}`,
          envelope_id: envelopeId,
          filename: file.name,
          file_size: file.size,
          mime_type: rule.mime,
          sha256,
          status: 'PENDING',
          upload_state: 'STORED',
          malware_scan_status: UNSCANNED_EVIDENCE_STATUS,
          created_by: auth.identity.name,
          created_at: new Date().toISOString(),
        },
      }, { status: 201, headers: { 'X-Request-ID': traceId } });
    }

    if (!supabase) return apiError('AUTH_NOT_CONFIGURED', 'ระบบจัดเก็บยังไม่พร้อมใช้งาน', 503, traceId);
    const { data: accessibleEnvelope } = await supabase.from('intake_envelopes').select('id, status').eq('id', envelopeId).maybeSingle();
    if (!accessibleEnvelope) {
      return apiError('ENVELOPE_NOT_ACCESSIBLE', 'ไม่พบซองนำเข้าหรือคุณไม่มีสิทธิ์เข้าถึง', 404, traceId);
    }
    const attachableStatuses = ['RECEIVED', 'NORMALIZING', 'TRIAGE_PENDING', 'NEEDS_INFO'];
    if (!attachableStatuses.includes(accessibleEnvelope.status)) {
       return apiError('ENVELOPE_NOT_ATTACHABLE', 'สถานะซองนำเข้าไม่สามารถแนบไฟล์ได้', 409, traceId);
    }

    const bucketName = process.env.PRIVATE_EVIDENCE_BUCKET || 'evidence-vault';
    const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension;
    const storagePath = `intake/${envelopeId}/${crypto.randomUUID()}.${normalizedExtension}`;
    
    const { data: attachmentId, error: reserveError } = await supabase.rpc('reserve_intake_attachment_upload', {
      p_envelope_id: envelopeId,
      p_filename: file.name,
      p_storage_path: storagePath,
      p_file_size: file.size,
      p_mime_type: rule.mime,
      p_sha256: sha256,
    });
    if (reserveError || !attachmentId) {
      const duplicate = reserveError?.code === '23505';
      return apiError(
        duplicate ? 'DUPLICATE_ATTACHMENT' : 'ATTACHMENT_RESERVATION_FAILED',
        duplicate ? 'ไฟล์เดียวกันมีอยู่ในซองนำเข้านี้แล้ว' : 'สำรองทะเบียนไฟล์แนบไม่สำเร็จ กรุณาลองใหม่',
        duplicate ? 409 : 503,
        traceId,
      );
    }

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, buffer, {
      contentType: rule.mime,
      upsert: false,
    });
    if (uploadError) {
      await supabase.rpc('cancel_intake_attachment_reservation', { p_attachment_id: attachmentId, p_reason: 'STORAGE_UPLOAD_FAILED' });
      console.error('Intake attachment storage upload failed', { traceId, envelopeId, code: uploadError.name });
      return apiError('STORAGE_UNAVAILABLE', 'จัดเก็บไฟล์ไม่สำเร็จ กรุณาลองใหม่', 503, traceId);
    }

    const { error: finalizeError } = await supabase.rpc('finalize_intake_attachment_upload', {
      p_attachment_id: attachmentId,
    });
    if (finalizeError) {
      await supabase.storage.from(bucketName).remove([storagePath]);
      await supabase.rpc('cancel_intake_attachment_reservation', { p_attachment_id: attachmentId, p_reason: 'FINALIZE_FAILED' });
      console.error('Intake attachment finalize failed', { traceId, attachmentId, code: finalizeError?.code });
      return apiError('METADATA_WRITE_FAILED', 'บันทึกข้อมูลไฟล์แนบไม่สำเร็จ กรุณาลองใหม่', 503, traceId);
    }


    // Fetch the updated record since the RPC returns VOID
    const { data: record } = await supabase.from('intake_attachments').select('*').eq('id', attachmentId).single();
    
    const safeRecord = record as Record<string, unknown> || {};
    return NextResponse.json({
      success: true,
      message: 'จัดเก็บและตรวจรูปแบบไฟล์แนบแล้ว พร้อมใช้งานในขั้นตอนถัดไป',
      data: {
        id: safeRecord.id || attachmentId,
        envelope_id: safeRecord.envelope_id || envelopeId,
        filename: safeRecord.filename || file.name,
        file_size: safeRecord.file_size || file.size,
        mime_type: safeRecord.mime_type || rule.mime,
        sha256: safeRecord.sha256 || sha256,
        status: safeRecord.status || 'PENDING',
        upload_state: safeRecord.upload_state || 'STORED',
        malware_scan_status: UNSCANNED_EVIDENCE_STATUS,
        created_at: safeRecord.created_at || new Date().toISOString(),
      },
    }, { status: 201, headers: { 'X-Request-ID': traceId } });
  } catch (error: unknown) {
    console.error('Unhandled intake attachment upload error', { traceId, error: error instanceof Error ? error.name : 'UnknownError' });
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่', 500, traceId);
  }
}
