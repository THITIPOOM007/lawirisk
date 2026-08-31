import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { evidenceScreeningReviewSchema } from '@/lib/workflow-contracts';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, REVIEW_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ตรวจทานผลสกรีนนิ่ง');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success && auth.identity.mode !== 'demo') return apiError('NOT_FOUND', 'ไม่พบผลสกรีนนิ่ง', 404);
  const parsed = evidenceScreeningReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'กรุณาระบุคำตัดสินและเหตุผล', 400);
  if (auth.identity.mode === 'demo') return NextResponse.json({ data: { id, status: parsed.data.decision } });
  const supabase = await createServer();
  const reviewed = await supabase.rpc('review_evidence_screening', {
    p_screening_id: id,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason,
  });
  if (reviewed.error) {
    const code = reviewed.error.message || 'SCREENING_REVIEW_FAILED';
    if (code === 'SCREENING_SOURCE_NOT_CLEAN') {
      return apiError(code, 'ไฟล์ต้นทางยังจัดเก็บหรือตรวจโครงสร้างไม่สมบูรณ์ จึงยังรับรองเป็นข้อเท็จจริงไม่ได้', 409);
    }
    if (code === 'SCREENING_REVIEW_CONFLICT' || code === 'SCREENING_NOT_REVIEWABLE') {
      return apiError(code, 'รายการนี้ถูกตรวจทานไปแล้ว กรุณาโหลดผลล่าสุดก่อนเปลี่ยนคำตัดสิน', 409);
    }
    if (code === 'SCREENING_REVIEW_FORBIDDEN') return apiError(code, 'ไม่มีสิทธิ์ตรวจทานรายการนี้', 403);
    if (code === 'SCREENING_REVIEW_INVALID') return apiError(code, 'คำตัดสินหรือเหตุผลไม่ถูกต้อง', 400);
    return apiError(code, 'บันทึกผลตรวจทานไม่สำเร็จ กรุณาลองใหม่', 503);
  }
  return NextResponse.json({ data: reviewed.data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
