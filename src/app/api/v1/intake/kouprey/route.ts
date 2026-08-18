import { NextRequest, NextResponse } from 'next/server';
import { getIntakeEnvelopes, saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant, addAuditLog } from '@/lib/demo-data';
import { verifySignedWebhook } from '@/lib/webhook-security';
import { externalIntakeSchema } from '@/lib/intake-contracts';
import { createServiceClient } from '@/lib/supabase-server';
import { consumeRateLimit } from '@/lib/rate-limit';
import { isDemoServerEnabled, isSupabaseServerConfigured } from '@/lib/runtime-config';

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('X-Kouprey-Signature');
    const timestamp = request.headers.get('X-Kouprey-Timestamp');
    const nonce = request.headers.get('X-Kouprey-Nonce');
    const idempotencyKey = request.headers.get('Idempotency-Key');

    const bodyText = await request.text();

    if (Buffer.byteLength(bodyText, 'utf8') > 1024 * 1024) {
      return NextResponse.json({ error: 'ขนาดข้อมูล webhook เกินกำหนด' }, { status: 413 });
    }

    if (!signature || !timestamp || !nonce) {
      return NextResponse.json(
        { error: 'ข้อมูลยืนยันตัวตน webhook ไม่ครบถ้วน (X-Kouprey headers missing)' },
        { status: 401 }
      );
    }

    const secret = process.env.KOUPREY_SECRET_KEY;
    if (!secret) {
      return NextResponse.json(
        { error: 'ช่องทาง Kouprey ยังไม่ได้ตั้งค่าคีย์ความปลอดภัย' },
        { status: 503 }
      );
    }
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return NextResponse.json(
        { error: 'ต้องระบุ Idempotency-Key ที่ถูกต้อง' },
        { status: 400 }
      );
    }

    const verification = verifySignedWebhook({ secret, timestamp, nonce, payload: bodyText, signature });
    if (!verification.ok && ['INVALID_TIMESTAMP', 'EXPIRED'].includes(verification.reason)) {
      return NextResponse.json(
        { error: 'คำขอหมดอายุ (Timestamp expired or drifted too far)' },
        { status: 400 }
      );
    }
    if (!verification.ok) {
      return NextResponse.json(
        { error: 'ข้อมูลความปลอดภัย webhook ล้มเหลว (HMAC Signature Mismatch)' },
        { status: 403 }
      );
    }

    // Parse payload
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: 'ข้อมูลต้องเป็น JSON ที่ถูกต้อง' }, { status: 400 });
    }
    const parsedPayload = externalIntakeSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลคำร้องไม่ถูกต้อง' }, { status: 400 });
    }
    const payload = parsedPayload.data;

    if (isSupabaseServerConfigured()) {
      try {
        const supabase = createServiceClient();
        const limit = await consumeRateLimit({ client: supabase, key: 'external:kouprey', limit: 120, windowSeconds: 60 });
        if (!limit.allowed) return NextResponse.json({ error: 'ส่งคำขอถี่เกินไป' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
        const { data: envelopeId, error } = await supabase.rpc('create_external_intake', {
          p_channel_code: 'KOUPREY_PLUS',
          p_payload: payload,
          p_idempotency_key: idempotencyKey,
          p_source_label: 'Kouprey Plus',
        });
        if (error || !envelopeId) {
          const duplicate = error?.code === '23505';
          return NextResponse.json({ error: duplicate ? 'คำขอซ้ำซ้อน' : 'บันทึกคำร้องไม่สำเร็จ' }, { status: duplicate ? 409 : 503 });
        }
        return NextResponse.json({ success: true, message: 'รับเรื่องนำเข้าระบบเรียบร้อยแล้ว', envelopeId }, { status: 201 });
      } catch {
        return NextResponse.json({ error: 'ระบบจัดเก็บคำร้องภายนอกยังตั้งค่าไม่ครบ' }, { status: 503 });
      }
    }

    if (!isDemoServerEnabled()) {
      return NextResponse.json({ error: 'ระบบจัดเก็บคำร้องภายนอกยังตั้งค่าไม่ครบ' }, { status: 503 });
    }
    const demoLimit = await consumeRateLimit({ key: 'external:kouprey', limit: 120, windowSeconds: 60 });
    if (!demoLimit.allowed) return NextResponse.json({ error: 'ส่งคำขอถี่เกินไป' }, { status: 429, headers: { 'Retry-After': String(demoLimit.retryAfterSeconds) } });
    const existing = getIntakeEnvelopes().find(e => e.idempotency_key === idempotencyKey);
    if (existing) return NextResponse.json({ error: 'คำขอซ้ำซ้อน', envelopeId: existing.id }, { status: 409 });

    // Save Intake Envelope in Mock DB (Demo Mode fallback)
    const envelopeId = `env-kp-${Date.now()}`;
    saveIntakeEnvelope({
      id: envelopeId,
      channel_id: 'ch-kouprey',
      status: 'TRIAGE_PENDING',
      complainant_mode: payload.complainant_mode || 'IDENTIFIED',
      urgency: payload.urgency || 'NORMAL',
      urgency_reason: payload.urgency_reason || 'นำเข้าจากระบบ Kouprey Plus',
      jurisdiction_region: payload.region || 'เขตสุขภาพที่ 10',
      jurisdiction_agency: payload.agency || 'สสจ.ศรีสะเกษ',
      malware_scan_status: 'PENDING',
      privacy_risk_status: 'PENDING',
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Save raw payload message
    saveIntakeMessage({
      id: `msg-${Date.now()}`,
      envelope_id: envelopeId,
      headers: {
        timestamp,
        nonce
      },
      raw_payload: bodyText,
      message_id: payload.ref_no || `KP-${Date.now()}`
    });

    // Save Accused Participant if available
    if (payload.accused) {
      saveIntakeParticipant({
        id: `part-${Date.now()}-accused`,
        envelope_id: envelopeId,
        role: 'ACCUSED',
        name: payload.accused.name,
        phone: payload.accused.phone,
        address: payload.accused.address
      });
    }

    // Save Complainant if not anonymous
    if (payload.complainant_mode !== 'ANONYMOUS' && payload.complainant) {
      saveIntakeParticipant({
        id: `part-${Date.now()}-comp`,
        envelope_id: envelopeId,
        role: 'COMPLAINANT',
        name: payload.complainant.name,
        phone: payload.complainant.phone,
        email: payload.complainant.email
      });
    }

    addAuditLog('System Webhook', 'INTAKE_RECEIVE', `รับเรื่องร้องเรียนสำเร็จจาก Kouprey Plus หมายเลขรับเรื่อง: ${envelopeId}`);

    return NextResponse.json({
      success: true,
      message: 'รับเรื่องนำเข้าระบบเรียบร้อยแล้ว',
      envelopeId
    });
  } catch (error: unknown) {
    console.error('Kouprey intake failed', { error: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการประมวลผลคำร้อง' },
      { status: 500 }
    );
  }
}
