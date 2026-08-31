import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { batchReviewSuggestionsSchema } from '@/lib/workflow-contracts';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, REVIEW_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์รับรองข้อเสนอแบบกลุ่ม');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const parsed = batchReviewSuggestionsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'กรุณาเลือก 2-50 รายการและระบุเหตุผลการรับรอง', 400, undefined, parsed.error.flatten().fieldErrors);

  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ data: parsed.data.items.map((item) => ({ id: item.id, status: 'CONFIRMED', entity_id: null, persisted: false })) });
  }
  if (parsed.data.items.some((item) => !z.string().uuid().safeParse(item.id).success)) {
    return apiError('INVALID_REQUEST', 'รหัสข้อเสนอบางรายการไม่ถูกต้อง', 400);
  }

  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `review-batch:${auth.identity.id}`, limit: 10, windowSeconds: 60 });
  if (!limit.allowed) return apiError('RATE_LIMITED', 'รับรองรายการแบบกลุ่มถี่เกินไป', 429);

  const stepUpToken = request.cookies.get('lawirisk-step-up')?.value || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(stepUpToken)) return apiError('STEP_UP_REQUIRED', 'ต้องยืนยันตัวตนด้วย Passkey ก่อนลงนามรับรอง', 403);
  const tokenHash = crypto.createHash('sha256').update(stepUpToken).digest('hex');
  const { data: consumed, error: consumeError } = await supabase.rpc('consume_webauthn_step_up', {
    p_token_hash: tokenHash,
    p_purpose: 'REVIEW_CONFIRMATION',
  });
  if (consumeError || consumed !== true) {
    const response = apiError('STEP_UP_INVALID', 'การยืนยัน Passkey หมดอายุหรือถูกใช้แล้ว กรุณายืนยันใหม่', 403);
    response.cookies.delete({ name: 'lawirisk-step-up', path: '/api/v1/review' });
    return response;
  }

  const { data, error } = await supabase.rpc('review_extraction_suggestions_batch', { p_items: parsed.data.items });
  if (error) {
    const messages: Record<string, string> = {
      SUGGESTION_SOURCE_NOT_CLEAN: 'บางรายการมีหลักฐานต้นทางที่ยังไม่พร้อมรับรอง',
      SUGGESTION_NOT_REVIEWABLE: 'บางรายการถูกตรวจทานแล้วหรือไม่มีสิทธิ์เข้าถึง ระบบยังไม่บันทึกรายการใด',
      BATCH_REVIEW_INVALID: 'ชุดรายการรับรองไม่ถูกต้อง',
    };
    const response = apiError(error.message, messages[error.message] || 'รับรองรายการแบบกลุ่มไม่สำเร็จ ระบบยังไม่บันทึกรายการใด', 409);
    response.cookies.delete({ name: 'lawirisk-step-up', path: '/api/v1/review' });
    return response;
  }

  for (const result of Array.isArray(data) ? data : []) {
    if (result?.entity_id) {
      try { await supabase.rpc('create_exact_match_candidates', { p_entity_id: result.entity_id }); }
      catch { /* Non-fatal derived match generation. */ }
    }
  }
  const response = NextResponse.json({ data });
  response.cookies.delete({ name: 'lawirisk-step-up', path: '/api/v1/review' });
  return response;
}
