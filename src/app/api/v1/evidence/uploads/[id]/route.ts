import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

const idSchema = z.string().uuid();

/**
 * Remove only a server-created reservation when the direct Storage upload did
 * not start. Stored originals remain immutable and cannot reach this path.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = requestId();
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'คุณไม่มีสิทธิ์ยกเลิกรายการอัปโหลด');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);
  if (auth.identity.mode !== 'supabase') return apiError('UPLOAD_CANCELLATION_UNAVAILABLE', 'ยกเลิกรายการอัปโหลดจริงไม่ได้ในโหมดสาธิต', 503, traceId);

  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) return apiError('INVALID_EVIDENCE_ID', 'รหัสหลักฐานไม่ถูกต้อง', 400, traceId);

  try {
    const supabase = await createServer();
    const { data: cancelled, error } = await supabase.rpc('cancel_evidence_reservation', {
      p_evidence_id: parsedId.data,
      p_reason: 'DIRECT_TUS_UPLOAD_NOT_STARTED',
    });
    if (error) {
      return apiError('EVIDENCE_CANCELLATION_FAILED', 'ไม่สามารถยกเลิกรายการอัปโหลดได้', error.code === '42501' ? 403 : 503, traceId);
    }

    return NextResponse.json({
      success: true,
      data: { evidence_id: parsedId.data, cancelled: Boolean(cancelled) },
    }, { status: 200, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': traceId } });
  } catch (error: unknown) {
    console.error('Evidence upload cancellation error', { traceId, error: error instanceof Error ? error.name : 'UnknownError' });
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่', 500, traceId);
  }
}
