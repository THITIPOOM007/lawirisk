import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { requestId } from '@/lib/api-errors';
import { createServer } from '@/lib/supabase-server';
import { CASE_WRITE_ROLES } from '@/lib/roles';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const caseIdSchema = z.string().trim().min(1).max(100);
const allowedTypes = {
  pdf: { mime: 'application/pdf', magic: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '25504446' },
  png: { mime: 'image/png', magic: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '89504e47' },
  jpg: { mime: 'image/jpeg', magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
  jpeg: { mime: 'image/jpeg', magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
} as const;

function apiError(code: string, message: string, status: number, traceId: string) {
  return NextResponse.json({ success: false, error: { code, message, request_id: traceId } }, { status });
}

export async function POST(request: NextRequest) {
  const traceId = requestId();
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) {
    return apiError(auth.code, auth.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'คุณไม่มีสิทธิ์เพิ่มหลักฐาน', auth.status, traceId);
  }

  try {
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

    if (auth.identity.mode === 'demo') {
      return NextResponse.json({
        success: true,
        message: 'รับไฟล์ในโหมดสาธิตแล้ว (ยังไม่ได้สแกนมัลแวร์)',
        data: {
          id: `ev-${crypto.randomUUID()}`,
          case_id: caseId,
          filename: file.name,
          file_size: file.size,
          mime_type: rule.mime,
          sha256,
          status: 'PENDING',
          malware_scan_status: 'PENDING',
          created_by: auth.identity.name,
          created_at: new Date().toISOString(),
        },
      }, { status: 201 });
    }

    const supabase = await createServer();
    const { data: accessibleCase } = await supabase.from('cases').select('id').eq('id', caseId).maybeSingle();
    if (!accessibleCase) {
      return apiError('CASE_NOT_ACCESSIBLE', 'ไม่พบสำนวนคดีหรือคุณไม่มีสิทธิ์เข้าถึง', 404, traceId);
    }

    const { data: duplicate } = await supabase
      .from('evidence_files')
      .select('id')
      .eq('sha256', sha256)
      .eq('case_id', caseId)
      .maybeSingle();
    if (duplicate) {
      return apiError('DUPLICATE_EVIDENCE', 'หลักฐานไฟล์เดียวกันมีอยู่ในสำนวนนี้แล้ว', 409, traceId);
    }

    const bucketName = process.env.PRIVATE_EVIDENCE_BUCKET || 'evidence-vault';
    const storagePath = `${caseId}/${crypto.randomUUID()}.${extension === 'jpeg' ? 'jpg' : extension}`;
    const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, buffer, {
      contentType: rule.mime,
      upsert: false,
    });
    if (uploadError) {
      console.error('Evidence storage upload failed', { traceId, caseId, code: uploadError.name });
      return apiError('STORAGE_UNAVAILABLE', 'จัดเก็บไฟล์ไม่สำเร็จ กรุณาลองใหม่', 503, traceId);
    }

    const { data: record, error: dbError } = await supabase
      .from('evidence_files')
      .insert({
        case_id: caseId,
        filename: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: rule.mime,
        sha256,
        status: 'PENDING',
        created_by: auth.identity.id,
      })
      .select()
      .single();
    if (dbError || !record) {
      await supabase.storage.from(bucketName).remove([storagePath]);
      console.error('Evidence metadata insert failed', { traceId, caseId, code: dbError?.code });
      return apiError('METADATA_WRITE_FAILED', 'บันทึกข้อมูลหลักฐานไม่สำเร็จ กรุณาลองใหม่', 503, traceId);
    }

    const { error: auditError } = await supabase.from('audit_logs').insert({
      profile_id: auth.identity.id,
      action: 'EVIDENCE_UPLOAD',
      details: { evidence_id: record.id, case_id: caseId, sha256 },
    });
    if (auditError) {
      console.error('Evidence audit append failed', { traceId, evidenceId: record.id, code: auditError.code });
    }

    return NextResponse.json({
      success: true,
      message: 'จัดเก็บหลักฐานแล้ว และกำลังรอการสแกนความปลอดภัย',
      data: { ...record, malware_scan_status: 'PENDING' },
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('Unhandled evidence upload error', { traceId, error: error instanceof Error ? error.name : 'UnknownError' });
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่', 500, traceId);
  }
}
