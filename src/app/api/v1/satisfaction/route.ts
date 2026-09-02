import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { satisfactionSubmissionSchema, satisfactionSummarySchema } from '@/lib/satisfaction-contract';
import { getDemoSatisfactionSummary, saveDemoSatisfactionResponse } from '@/lib/satisfaction-service';
import { createServer, createServiceClient } from '@/lib/supabase-server';
import { isDemoServerEnabled, isSupabaseServiceConfigured } from '@/lib/runtime-config';

const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };

const requestFingerprint = (request: NextRequest) => {
  const address = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return crypto.createHash('sha256').update(`${address}|${userAgent}`).digest('hex');
};

export async function POST(request: NextRequest) {
  if (!hasTrustedBrowserOrigin(request)) {
    return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากหน้าบริการที่อนุญาต', 403);
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return apiError('PAYLOAD_TOO_LARGE', 'ข้อมูลแบบประเมินมีขนาดใหญ่เกินกำหนด', 413);
  }

  const parsed = satisfactionSubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError('INVALID_SATISFACTION', 'กรุณาให้คะแนนครบทั้ง 4 ด้าน และตรวจสอบข้อเสนอแนะอีกครั้ง', 400, undefined, parsed.error.flatten().fieldErrors);
  }

  const input = parsed.data;
  let staffUserId: string | null = null;
  let databaseClient: ReturnType<typeof createServiceClient> | Awaited<ReturnType<typeof createServer>> | undefined;

  if (input.audience === 'STAFF') {
    const auth = await authorizeStaff(request, STAFF_READ_ROLES);
    if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ส่งแบบประเมินสำหรับเจ้าหน้าที่');
    staffUserId = auth.identity.id;
    databaseClient = auth.identity.mode === 'supabase' ? await createServer() : undefined;
  } else {
    if (!isSupabaseServiceConfigured() && !isDemoServerEnabled()) {
      return apiError('SATISFACTION_UNAVAILABLE', 'ระบบบันทึกแบบประเมินยังไม่พร้อมใช้งาน', 503);
    }
    databaseClient = isSupabaseServiceConfigured() ? createServiceClient() : undefined;
  }

  try {
    const limit = await consumeRateLimit({
      client: databaseClient,
      key: input.audience === 'STAFF'
        ? `satisfaction:staff:${staffUserId}`
        : `satisfaction:public:${requestFingerprint(request)}`,
      limit: input.audience === 'STAFF' ? 10 : 20,
      windowSeconds: 3_600,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'ส่งแบบประเมินถี่เกินไป กรุณาลองใหม่ภายหลัง' } },
        { status: 429, headers: { ...noStoreHeaders, 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    if (!databaseClient) {
      const saved = saveDemoSatisfactionResponse(input, staffUserId);
      return NextResponse.json(
        { success: true, data: { accepted: true, duplicate: saved.duplicate } },
        { status: saved.duplicate ? 200 : 201, headers: noStoreHeaders },
      );
    }

    const { error } = await databaseClient.from('satisfaction_responses').insert({
      audience: input.audience,
      response_context: input.context,
      interaction_id: input.interactionId,
      staff_user_id: staffUserId,
      convenience_rating: input.convenience,
      speed_rating: input.speed,
      accuracy_rating: input.accuracy,
      overall_rating: input.overall,
      suggestion: input.suggestion || null,
    });
    if (error?.code === '23505') {
      return NextResponse.json(
        { success: true, data: { accepted: true, duplicate: true } },
        { status: 200, headers: noStoreHeaders },
      );
    }
    if (error) return apiError('SATISFACTION_SAVE_FAILED', 'บันทึกแบบประเมินไม่สำเร็จ กรุณาลองใหม่', 503);

    return NextResponse.json(
      { success: true, data: { accepted: true, duplicate: false } },
      { status: 201, headers: noStoreHeaders },
    );
  } catch {
    return apiError('SATISFACTION_UNAVAILABLE', 'ระบบบันทึกแบบประเมินไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่', 503);
  }
}

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูสถิติความพึงพอใจ');

  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ success: true, data: getDemoSatisfactionSummary() }, { headers: noStoreHeaders });
  }

  const supabase = await createServer();
  const { data, error } = await supabase.rpc('get_satisfaction_summary');
  if (error) return apiError('SATISFACTION_SUMMARY_FAILED', 'โหลดสถิติความพึงพอใจไม่สำเร็จ', 503);
  const summary = satisfactionSummarySchema.safeParse(data);
  if (!summary.success) return apiError('SATISFACTION_SUMMARY_INVALID', 'รูปแบบสถิติความพึงพอใจไม่ถูกต้อง', 503);
  return NextResponse.json({ success: true, data: summary.data }, { headers: noStoreHeaders });
}
