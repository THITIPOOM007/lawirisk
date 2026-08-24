import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
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
  const { id } = await params;
  if (auth.identity.mode === 'demo') {
    const parsedDemo = reviewSuggestionSchema.safeParse(await request.json().catch(() => null));
    if (!parsedDemo.success) return apiError('INVALID_REQUEST', 'กรุณาระบุผลตรวจทานและเหตุผล', 400);
    return NextResponse.json({ data: { id, ...parsedDemo.data, mode: 'demo', persisted: false } });
  }
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบข้อเสนอ', 404);
  const parsed = reviewSuggestionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'กรุณาระบุผลตรวจทานและเหตุผล', 400, undefined, parsed.error.flatten().fieldErrors);
  const supabase = await createServer();
  let limit: Awaited<ReturnType<typeof consumeRateLimit>>;
  try {
    limit = await consumeRateLimit({ client: supabase, key: `review-decision:${auth.identity.id}`, limit: 60, windowSeconds: 60 });
  } catch {
    return apiError('RATE_LIMIT_UNAVAILABLE', 'ระบบควบคุมความถี่ไม่พร้อมใช้งาน', 503);
  }
  if (!limit.allowed) return apiError('RATE_LIMITED', 'บันทึกผลตรวจทานถี่เกินไป', 429);
  if (parsed.data.decision === 'CONFIRMED') {
    const stepUpToken = request.cookies.get('lawirisk-step-up')?.value || '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(stepUpToken)) {
      return apiError('STEP_UP_REQUIRED', 'ต้องยืนยันตัวตนด้วย Passkey ก่อนลงนามรับรอง', 403);
    }
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
  }
  const { data, error } = await supabase.rpc('review_extraction_suggestion', {
    p_suggestion_id: id,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason,
    p_edited_value: parsed.data.edited_value ?? null,
  });
  if (error) {
    const messages: Record<string, string> = {
      SUGGESTION_SOURCE_NOT_CLEAN: 'ยังยืนยันไม่ได้จนกว่าหลักฐานต้นทางจะจัดเก็บและตรวจรูปแบบสมบูรณ์',
      SUGGESTION_NOT_REVIEWABLE: 'ข้อเสนอนี้ถูกตรวจทานแล้วหรือคุณไม่มีสิทธิ์เข้าถึง',
    };
    const response = apiError(error.message, messages[error.message] || 'บันทึกผลตรวจทานไม่สำเร็จ', 409);
    if (parsed.data.decision === 'CONFIRMED') {
      response.cookies.delete({ name: 'lawirisk-step-up', path: '/api/v1/review' });
    }
    return response;
  }

  if (parsed.data.decision === 'CONFIRMED') {
    const resultObj = data as { entity_id?: string } | null;
    if (resultObj?.entity_id) {
      try {
        await supabase.rpc('create_exact_match_candidates', { p_entity_id: resultObj.entity_id });
      } catch (matchError: unknown) {
        console.error('Exact match candidate generation non-fatal error:', matchError);
      }
    }
  }

  const response = NextResponse.json({ data });
  if (parsed.data.decision === 'CONFIRMED') {
    response.cookies.delete({ name: 'lawirisk-step-up', path: '/api/v1/review' });
  }
  return response;
}
