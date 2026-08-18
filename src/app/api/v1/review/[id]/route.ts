import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { reviewSuggestionSchema } from '@/lib/workflow-contracts';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, REVIEW_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ตัดสินข้อเสนอ');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') return apiError('DEMO_WRITE_UNAVAILABLE', 'โหมดสาธิตไม่บันทึกผลตรวจทานลงฐานข้อมูล', 409);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบข้อเสนอ', 404);
  const parsed = reviewSuggestionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'กรุณาระบุผลตรวจทานและเหตุผล', 400, undefined, parsed.error.flatten().fieldErrors);
  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `review-decision:${auth.identity.id}`, limit: 60, windowSeconds: 60 });
  if (!limit.allowed) return apiError('RATE_LIMITED', 'บันทึกผลตรวจทานถี่เกินไป', 429);
  const { data, error } = await supabase.rpc('review_extraction_suggestion', {
    p_suggestion_id: id,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason,
    p_edited_value: parsed.data.edited_value ?? null,
  });
  if (error) {
    const messages: Record<string, string> = {
      SUGGESTION_SOURCE_NOT_CLEAN: 'ยังยืนยันไม่ได้จนกว่าหลักฐานต้นทางจะสแกนเป็น CLEAN',
      SUGGESTION_NOT_REVIEWABLE: 'ข้อเสนอนี้ถูกตรวจทานแล้วหรือคุณไม่มีสิทธิ์เข้าถึง',
    };
    return apiError(error.message, messages[error.message] || 'บันทึกผลตรวจทานไม่สำเร็จ', 409);
  }
  return NextResponse.json({ data });
}
