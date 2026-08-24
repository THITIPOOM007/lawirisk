import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { scanEvidenceReference } from '@/lib/malware-scanner';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { CASE_WRITE_ROLES } from '@/lib/roles';
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
  if (auth.identity.mode !== 'supabase') return apiError('SCAN_UNAVAILABLE', 'ระบบสแกนไฟล์จริงยังไม่พร้อมในโหมดสาธิต', 503, traceId);

  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) return apiError('INVALID_EVIDENCE_ID', 'รหัสหลักฐานไม่ถูกต้อง', 400, traceId);

  try {
    const supabase = await createServer();
    const rateLimit = await consumeRateLimit({
      client: supabase,
      key: `evidence-scan-complete:${auth.identity.id}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'ส่งคำขอสแกนถี่เกินไป กรุณารอสักครู่', request_id: traceId } },
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
    if (evidence.upload_state === 'STORED' && (evidence.malware_scan_status === 'CLEAN' || evidence.malware_scan_status === 'INFECTED')) {
      return NextResponse.json({
        success: true,
        message: evidence.malware_scan_status === 'CLEAN' ? 'หลักฐานนี้สแกนผ่านแล้ว' : 'หลักฐานนี้ถูกกักกันหลังตรวจพบความเสี่ยง',
        data: {
          id: evidence.id,
          case_id: evidence.case_id,
          filename: evidence.filename,
          file_size: evidence.file_size,
          mime_type: evidence.mime_type,
          sha256: evidence.sha256,
          status: evidence.status,
          upload_state: evidence.upload_state,
          malware_scan_status: evidence.malware_scan_status,
          created_by: evidence.created_by,
          created_at: evidence.created_at,
        },
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

    const scan = await scanEvidenceReference({
      sourceUrl: signedSource.signedUrl,
      expectedSize: evidence.file_size,
      expectedSha256: evidence.sha256,
      expectedMime: evidence.mime_type,
    });

    if (!('sha256' in scan)) {
      if (scan.status === 'UNAVAILABLE' || scan.status === 'ERROR') {
        await service.from('evidence_files').update({
          malware_scan_status: scan.status,
          malware_scan_details: { reason: scan.reason, transport: 'SIGNED_PRIVATE_URL' },
          malware_scanned_at: new Date().toISOString(),
        }).eq('id', evidence.id).eq('upload_state', 'RESERVED').neq('malware_scan_status', 'CLEAN');
        await service.from('audit_logs').insert({
          profile_id: auth.identity.id,
          action: 'EVIDENCE_MALWARE_SCAN_DEFERRED',
          details: { evidence_id: evidence.id, case_id: evidence.case_id, status: scan.status, reason: scan.reason },
        });
        return NextResponse.json({
          success: true,
          message: 'อัปโหลดครบแล้ว แต่เครื่องสแกนยังไม่พร้อม ไฟล์ยังถูกกักกันและนำไปใช้งานไม่ได้',
          data: { evidence_id: evidence.id, upload_state: evidence.upload_state, malware_scan_status: scan.status, retryable: true },
        }, { status: 202, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': traceId } });
      }

      if (evidence.upload_state === 'RESERVED') {
        const { error: removeError } = await service.storage.from(bucket).remove([evidence.file_path]);
        if (!removeError) {
          await supabase.rpc('cancel_evidence_reservation', { p_evidence_id: evidence.id, p_reason: scan.reason });
        }
      }
      await service.from('audit_logs').insert({
        profile_id: auth.identity.id,
        action: 'EVIDENCE_UPLOAD_REJECTED',
        details: { evidence_id: evidence.id, case_id: evidence.case_id, reason: scan.reason },
      });
      return apiError('EVIDENCE_INTEGRITY_REJECTED', 'ไฟล์ที่จัดเก็บไม่ตรงกับข้อมูลต้นฉบับ ระบบจึงปฏิเสธและไม่นำไปใช้งาน', 422, traceId);
    }

    const integrityMismatch = scan.sha256 !== evidence.sha256
      || scan.sizeBytes !== evidence.file_size
      || scan.detectedMime !== evidence.mime_type;
    if (integrityMismatch) {
      const reason = 'SCANNER_INTEGRITY_MISMATCH';
      if (evidence.upload_state === 'RESERVED') {
        const { error: removeError } = await service.storage.from(bucket).remove([evidence.file_path]);
        if (!removeError) {
          await supabase.rpc('cancel_evidence_reservation', { p_evidence_id: evidence.id, p_reason: reason });
        }
      }
      await service.from('audit_logs').insert({
        profile_id: auth.identity.id,
        action: 'EVIDENCE_UPLOAD_REJECTED',
        details: { evidence_id: evidence.id, case_id: evidence.case_id, reason },
      });
      return apiError('EVIDENCE_INTEGRITY_REJECTED', 'ไฟล์ที่จัดเก็บไม่ตรงกับข้อมูลต้นฉบับ ระบบจึงปฏิเสธและไม่นำไปใช้งาน', 422, traceId);
    }

    let finalized = evidence;
    if (evidence.upload_state === 'RESERVED') {
      const { data: finalizedData, error: finalizeError } = await supabase.rpc('finalize_evidence_upload', { p_evidence_id: evidence.id });
      if (finalizeError || !finalizedData) {
        console.error('Evidence direct upload finalize failed', { traceId, evidenceId: evidence.id, code: finalizeError?.code });
        return apiError('METADATA_WRITE_FAILED', 'ยืนยันทะเบียนหลักฐานไม่สำเร็จ ไฟล์ยังถูกกักกัน', 503, traceId);
      }
      finalized = finalizedData as EvidenceRecord;
    }

    const { error: scanUpdateError } = await service.from('evidence_files').update({
      malware_scan_status: scan.status,
      malware_scan_details: {
        scanner: scan.scanner,
        signature_version: scan.signatureVersion,
        verified_sha256: scan.sha256,
        verified_size: scan.sizeBytes,
        detected_mime: scan.detectedMime,
        transport: 'SIGNED_PRIVATE_URL',
      },
      malware_scanned_at: new Date().toISOString(),
      ...(scan.status === 'INFECTED' ? { status: 'FAILED' } : {}),
    }).eq('id', evidence.id);
    if (scanUpdateError) {
      console.error('Evidence direct scan persistence failed', { traceId, evidenceId: evidence.id, code: scanUpdateError.code });
      return apiError('SCAN_RESULT_WRITE_FAILED', 'บันทึกผลสแกนไม่สำเร็จ หลักฐานยังไม่ถือว่าปลอดภัย', 503, traceId);
    }
    await service.from('audit_logs').insert({
      profile_id: auth.identity.id,
      action: 'EVIDENCE_MALWARE_SCAN',
      details: { evidence_id: evidence.id, case_id: evidence.case_id, verdict: scan.status, sha256_verified: true },
    });

    return NextResponse.json({
      success: true,
      message: scan.status === 'CLEAN'
        ? 'อัปโหลดครบ ตรวจความถูกต้อง และสแกนความปลอดภัยแล้ว'
        : 'จัดเก็บต้นฉบับในพื้นที่กักกันและตรวจพบความเสี่ยง ห้ามนำไปประมวลผล',
      data: {
        id: finalized.id,
        case_id: finalized.case_id,
        filename: finalized.filename,
        file_size: finalized.file_size,
        mime_type: finalized.mime_type,
        sha256: finalized.sha256,
        status: scan.status === 'INFECTED' ? 'FAILED' : finalized.status,
        upload_state: 'STORED',
        malware_scan_status: scan.status,
        created_by: finalized.created_by,
        created_at: finalized.created_at,
      },
    }, { status: scan.status === 'CLEAN' ? 201 : 202, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': traceId } });
  } catch (error: unknown) {
    console.error('Evidence upload completion error', { traceId, error: error instanceof Error ? error.name : 'UnknownError' });
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่', 500, traceId);
  }
}
