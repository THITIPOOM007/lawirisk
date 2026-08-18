import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { matchReviewSchema } from '@/lib/workflow-contracts';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, REVIEW_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ตรวจทานความเชื่อมโยง');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') return apiError('DEMO_WRITE_UNAVAILABLE', 'โหมดสาธิตไม่บันทึกผลเชื่อมโยงลงฐานข้อมูล', 409);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบรายการเชื่อมโยง', 404);
  const parsed = matchReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'กรุณาระบุผลตรวจทานและเหตุผล', 400, undefined, parsed.error.flatten().fieldErrors);
  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `match-decision:${auth.identity.id}`, limit: 60, windowSeconds: 60 });
  if (!limit.allowed) return apiError('RATE_LIMITED', 'บันทึกผลตรวจทานถี่เกินไป', 429);
  const { data, error } = await supabase.rpc('review_match_candidate', {
    p_match_id: id,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const messages: Record<string, string> = {
      MATCH_SOURCE_REQUIRED: 'ยืนยันไม่ได้เพราะยังไม่มีแหล่งอ้างอิงจากหลักฐานที่สแกนเป็น CLEAN',
      PERSON_NAME_ONLY_MATCH_FORBIDDEN: 'ห้ามยืนยันจากชื่อบุคคลเพียงอย่างเดียว ต้องมีสัญญาณสมทบ',
      MATCH_NOT_REVIEWABLE: 'รายการนี้ถูกตรวจทานแล้วหรือคุณไม่มีสิทธิ์เข้าถึง',
    };
    return apiError(error.message, messages[error.message] || 'บันทึกผลตรวจทานไม่สำเร็จ', 409);
  }
  return NextResponse.json({ data });
}
