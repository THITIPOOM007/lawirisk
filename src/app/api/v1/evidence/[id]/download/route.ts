import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { isEvidenceUsable } from '@/lib/evidence-file-status';
import { consumeRateLimit } from '@/lib/rate-limit';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์เปิดหลักฐาน');
  const { id } = await params;
  if (auth.identity.mode === 'demo') return apiError('DEMO_DOWNLOAD_UNAVAILABLE', 'โหมดสาธิตไม่มีไฟล์ต้นฉบับ', 409);
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบหลักฐาน', 404);

  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `evidence-download:${auth.identity.id}`, limit: 60, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'เปิดหลักฐานถี่เกินไป กรุณารอสักครู่' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }
  const { data: evidence } = await supabase
    .from('evidence_files')
    .select('id,file_path,upload_state,malware_scan_status')
    .eq('id', id)
    .maybeSingle();
  if (!evidence) return apiError('NOT_FOUND', 'ไม่พบหลักฐานหรือไม่มีสิทธิ์เข้าถึง', 404);
  if (!isEvidenceUsable(evidence.upload_state, evidence.malware_scan_status)) {
    return apiError('EVIDENCE_NOT_READY_TO_OPEN', 'ไฟล์ยังจัดเก็บหรือตรวจรูปแบบไม่สมบูรณ์', 409);
  }
  if (evidence.file_path.startsWith('synthetic-demo/')) {
    const syntheticUrl = new URL(`/api/v1/evidence/${id}/synthetic`, request.url);
    return NextResponse.json({ data: { url: syntheticUrl.toString(), expires_in: 60, synthetic_test_data: true } }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const bucket = process.env.PRIVATE_EVIDENCE_BUCKET || 'evidence-vault';
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(evidence.file_path, 60);
  if (error || !data?.signedUrl) return apiError('SIGNED_URL_FAILED', 'สร้างลิงก์เปิดหลักฐานไม่สำเร็จ', 503);
  return NextResponse.json({ data: { url: data.signedUrl, expires_in: 60 } });
}
