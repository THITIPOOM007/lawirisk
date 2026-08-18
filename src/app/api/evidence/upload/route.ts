import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { scanEvidenceFile } from '@/lib/malware-scanner';
import { consumeRateLimit } from '@/lib/rate-limit';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { createServer, createServiceClient } from '@/lib/supabase-server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const caseIdSchema = z.string().trim().min(1).max(100);
const allowedTypes = {
  pdf: { mime: 'application/pdf', magic: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '25504446' },
  png: { mime: 'image/png', magic: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '89504e47' },
  jpg: { mime: 'image/jpeg', magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
  jpeg: { mime: 'image/jpeg', magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
} as const;

export async function POST(request: NextRequest) {
  const traceId = requestId();
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'คุณไม่มีสิทธิ์เพิ่มหลักฐาน');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);

  try {
    const supabase = auth.identity.mode === 'supabase' ? await createServer() : undefined;
    const rateLimit = await consumeRateLimit({
      client: supabase,
      key: `evidence-upload:${auth.identity.id}`,
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
    const parsedCaseId = caseIdSchema.safeParse(formData.get('case_id'));
    if (!(file instanceof File) || !parsedCaseId.success) {
      return apiError('INVALID_REQUEST', 'กรุณาเลือกไฟล์และสำนวนคดีให้ครบถ้วน', 400, traceId);
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE || file.name.length > 255) {
      return apiError('INVALID_FILE_SIZE', 'ไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 20 MB', 400, traceId);
    }

    const caseId = parsedCaseId.data;
    if (auth.identity.mode === 'supabase' && !z.string().uuid().safeParse(caseId).success) {
      return apiError('INVALID_CASE_ID', 'รูปแบบรหัสสำนวนคดีไม่ถูกต้อง', 400, traceId);
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
    const scan = await scanEvidenceFile(file);

    if (auth.identity.mode === 'demo') {
      return NextResponse.json({
        success: true,
        message: scan.status === 'CLEAN'
          ? 'รับไฟล์ในโหมดสาธิตและสแกนแล้ว'
          : 'รับไฟล์ในโหมดสาธิตแล้ว แต่ยังไม่ถือว่าปลอดภัย',
        data: {
          id: `ev-${crypto.randomUUID()}`,
          case_id: caseId,
          filename: file.name,
          file_size: file.size,
          mime_type: rule.mime,
          sha256,
          status: scan.status === 'INFECTED' ? 'FAILED' : 'PENDING',
          upload_state: 'STORED',
          malware_scan_status: scan.status,
          created_by: auth.identity.name,
          created_at: new Date().toISOString(),
        },
      }, { status: 201, headers: { 'X-Request-ID': traceId } });
    }

    if (!supabase) return apiError('AUTH_NOT_CONFIGURED', 'ระบบจัดเก็บยังไม่พร้อมใช้งาน', 503, traceId);
    const { data: accessibleCase } = await supabase.from('cases').select('id').eq('id', caseId).maybeSingle();
    if (!accessibleCase) {
      return apiError('CASE_NOT_ACCESSIBLE', 'ไม่พบสำนวนคดีหรือคุณไม่มีสิทธิ์เข้าถึง', 404, traceId);
    }

    const bucketName = process.env.PRIVATE_EVIDENCE_BUCKET || 'evidence-vault';
    const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension;
    const storagePath = `${caseId}/${crypto.randomUUID()}.${normalizedExtension}`;
    const { data: evidenceId, error: reserveError } = await supabase.rpc('reserve_evidence_upload', {
      p_case_id: caseId,
      p_filename: file.name,
      p_file_path: storagePath,
      p_file_size: file.size,
      p_mime_type: rule.mime,
      p_sha256: sha256,
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

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, buffer, {
      contentType: rule.mime,
      upsert: false,
    });
    if (uploadError) {
      await supabase.rpc('cancel_evidence_reservation', { p_evidence_id: evidenceId, p_reason: 'STORAGE_UPLOAD_FAILED' });
      console.error('Evidence storage upload failed', { traceId, caseId, code: uploadError.name });
      return apiError('STORAGE_UNAVAILABLE', 'จัดเก็บไฟล์ไม่สำเร็จ กรุณาลองใหม่', 503, traceId);
    }

    const { data: record, error: finalizeError } = await supabase.rpc('finalize_evidence_upload', {
      p_evidence_id: evidenceId,
    });
    if (finalizeError || !record) {
      await supabase.storage.from(bucketName).remove([storagePath]);
      await supabase.rpc('cancel_evidence_reservation', { p_evidence_id: evidenceId, p_reason: 'FINALIZE_FAILED' });
      console.error('Evidence finalize failed', { traceId, evidenceId, code: finalizeError?.code });
      return apiError('METADATA_WRITE_FAILED', 'บันทึกข้อมูลหลักฐานไม่สำเร็จ กรุณาลองใหม่', 503, traceId);
    }

    try {
      const service = createServiceClient();
      const scanDetails = 'reason' in scan
        ? { reason: scan.reason }
        : { scanner: scan.scanner, signature_version: scan.signatureVersion };
      await service.from('evidence_files').update({
        malware_scan_status: scan.status,
        malware_scan_details: scanDetails,
        malware_scanned_at: new Date().toISOString(),
        ...(scan.status === 'INFECTED' ? { status: 'FAILED' } : {}),
      }).eq('id', evidenceId);
      await service.from('audit_logs').insert({
        profile_id: auth.identity.id,
        action: 'EVIDENCE_MALWARE_SCAN',
        details: { evidence_id: evidenceId, case_id: caseId, verdict: scan.status },
      });
    } catch (error: unknown) {
      console.error('Evidence scan status persistence failed', {
        traceId,
        evidenceId,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    }

    const safeRecord = record as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      message: scan.status === 'CLEAN'
        ? 'จัดเก็บและสแกนหลักฐานแล้ว'
        : scan.status === 'INFECTED'
          ? 'จัดเก็บหลักฐานในพื้นที่ส่วนตัวและตรวจพบความเสี่ยง ห้ามนำไปประมวลผล'
          : 'จัดเก็บหลักฐานแล้ว แต่ผลสแกนยังไม่พร้อม จึงยังห้ามนำไปประมวลผล',
      data: {
        id: safeRecord.id,
        case_id: safeRecord.case_id,
        filename: safeRecord.filename,
        file_size: safeRecord.file_size,
        mime_type: safeRecord.mime_type,
        sha256: safeRecord.sha256,
        status: scan.status === 'INFECTED' ? 'FAILED' : safeRecord.status,
        upload_state: safeRecord.upload_state,
        malware_scan_status: scan.status,
        created_at: safeRecord.created_at,
      },
    }, { status: 201, headers: { 'X-Request-ID': traceId } });
  } catch (error: unknown) {
    console.error('Unhandled evidence upload error', { traceId, error: error instanceof Error ? error.name : 'UnknownError' });
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่', 500, traceId);
  }
}
