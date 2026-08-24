import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

const SCAN_ROLES = new Set([...REVIEW_ROLES, 'INVESTIGATOR'] as const);
const scanSchema = z.object({ case_id: z.string().uuid().nullable().optional() }).strict();

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, SCAN_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์สั่งสแกนความเชื่อมโยงข้ามคดี');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);

  const parsed = scanSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'รูปแบบขอบเขตการสแกนไม่ถูกต้อง', 400, undefined, parsed.error.flatten().fieldErrors);

  const supabase = auth.identity.mode === 'supabase' ? await createServer() : undefined;
  const limit = await consumeRateLimit({ client: supabase, key: `match-scan:${auth.identity.id}`, limit: 5, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'สั่งสแกนถี่เกินไป กรุณารอสักครู่' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (auth.identity.mode === 'demo') {
    // In demo mode, simulate scanning results gracefully
    return NextResponse.json({
      data: {
        scanned_entities: 14,
        exact_matches_found: 3,
        fuzzy_matches_found: 2,
        total_matches: 5,
        mode: 'demo',
        message: 'จำลองการสแกนความเชื่อมโยงสำเร็จ (Demo Mode)',
      },
    });
  }

  if (!supabase) return apiError('AUTH_NOT_CONFIGURED', 'ฐานข้อมูลยังไม่พร้อมใช้งาน', 503);
  const { data, error } = await supabase.rpc('scan_cross_case_matches', {
    p_case_id: parsed.data.case_id || null,
  });

  if (error) {
    return apiError('MATCH_SCAN_FAILED', 'การสแกนความเชื่อมโยงล้มเหลว กรุณาลองใหม่', 503);
  }

  return NextResponse.json({
    data: {
      ...(data as Record<string, unknown>),
      mode: 'production',
    },
  });
}
