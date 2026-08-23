import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getIntakeEnvelopes, getIntakeMessages } from '@/lib/demo-data';
import { isDemoServerEnabled, isSupabaseServiceConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';
import { consumeRateLimit } from '@/lib/rate-limit';

const trackingTokenSchema = z.string().regex(/^TRK-\d{4}-[A-F0-9]{6,24}$/);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token).trim().toUpperCase();

  if (!trackingTokenSchema.safeParse(decodedToken).success) {
    return NextResponse.json(
      { success: false, error: 'รหัสติดตามเรื่องไม่ถูกต้อง' },
      { status: 400 },
    );
  }

  const hasSupabase = isSupabaseServiceConfigured();
  if (!hasSupabase && !isDemoServerEnabled()) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'ระบบติดตามเรื่องยังไม่พร้อมใช้งาน' } },
      { status: 503 },
    );
  }
  const service = hasSupabase ? createServiceClient() : undefined;
  const clientAddress = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  let rateLimit: Awaited<ReturnType<typeof consumeRateLimit>>;
  try {
    rateLimit = await consumeRateLimit({
      client: service,
      key: `public-track:${clientAddress}:${request.headers.get('user-agent') || 'unknown'}`,
      limit: 30,
      windowSeconds: 60,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'ระบบติดตามเรื่องไม่พร้อมใช้งานชั่วคราว' } },
      { status: 503 },
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_LIMITED', message: 'ตรวจสอบรหัสถี่เกินไป กรุณารอสักครู่' } },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    );
  }

  let status = 'TRIAGE_PENDING';
  let createdAt = new Date().toISOString();
  let updatedAt = createdAt;
  let jurisdiction = 'ส่วนกลาง';
  let found = false;

  if (!hasSupabase) {
    const messages = getIntakeMessages();
    const matchedMessage = messages.find((m) => m.message_id === decodedToken);

    if (!matchedMessage) {
      return NextResponse.json(
        { success: false, error: 'ไม่พบข้อมูลคำร้องจากรหัสติดตามนี้ กรุณาตรวจสอบรหัสอีกครั้ง' },
        { status: 404 },
      );
    }

    const envelopes = getIntakeEnvelopes();
    const envelope = envelopes.find((e) => e.id === matchedMessage.envelope_id);
    if (envelope) {
      status = envelope.status;
      createdAt = envelope.created_at;
      updatedAt = envelope.updated_at;
      jurisdiction = envelope.jurisdiction_region || 'ส่วนกลาง';
      found = true;
    }
  } else {
    const supabase = service!;
    const { data: msgData, error: messageError } = await supabase
      .from('intake_messages')
      .select('envelope_id')
      .eq('message_id', decodedToken)
      .maybeSingle();

    if (messageError) {
      return NextResponse.json(
        { success: false, error: { code: 'TRACKING_LOOKUP_FAILED', message: 'ตรวจสอบสถานะไม่สำเร็จ กรุณาลองใหม่' } },
        { status: 503 },
      );
    }
    if (!msgData) {
      return NextResponse.json(
        { success: false, error: 'ไม่พบข้อมูลคำร้องจากรหัสติดตามนี้ กรุณาตรวจสอบรหัสอีกครั้ง' },
        { status: 404 },
      );
    }

    const { data: envData, error: envelopeError } = await supabase
      .from('intake_envelopes')
      .select('status, created_at, updated_at, jurisdiction_region')
      .eq('id', msgData.envelope_id)
      .maybeSingle();

    if (envelopeError) {
      return NextResponse.json(
        { success: false, error: { code: 'TRACKING_LOOKUP_FAILED', message: 'ตรวจสอบสถานะไม่สำเร็จ กรุณาลองใหม่' } },
        { status: 503 },
      );
    }
    if (envData) {
      status = envData.status;
      createdAt = envData.created_at;
      updatedAt = envData.updated_at;
      jurisdiction = envData.jurisdiction_region || 'ส่วนกลาง';
      found = true;
    }
  }

  if (!found) {
    return NextResponse.json(
      { success: false, error: 'ไม่พบรายละเอียดคำร้องจากรหัสติดตามนี้' },
      { status: 404 },
    );
  }

  let statusLabel = 'รอดำเนินการคัดกรอง';
  let progressStep = 1;

  if (status === 'PROMOTED') {
    statusLabel = 'อนุมัติเปิดสำนวนสืบสวนแล้ว';
    progressStep = 3;
  } else if (status === 'MERGED') {
    statusLabel = 'รวบรวมเข้าสำนวนคดีหลักที่เกี่ยวข้อง';
    progressStep = 3;
  } else if (status === 'QUARANTINED') {
    statusLabel = 'อยู่ระหว่างตรวจสอบความปลอดภัยของไฟล์พยานหลักฐาน';
    progressStep = 2;
  } else if (status === 'REJECTED') {
    statusLabel = 'ยุติการดำเนินการ (ข้อมูลไม่เพียงพอหรือไม่เข้าข่าย)';
    progressStep = 4;
  }

  return NextResponse.json({
    success: true,
    data: {
      trackingToken: decodedToken,
      receivedAt: createdAt,
      updatedAt: updatedAt,
      status: status,
      statusLabel,
      progressStep,
      jurisdiction,
    },
  });
}
