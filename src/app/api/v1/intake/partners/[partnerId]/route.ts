import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant, addAuditLog } from '@/lib/demo-data';
import { externalIntakeSchema } from '@/lib/intake-contracts';
import { createServiceClient } from '@/lib/supabase-server';
import { consumeRateLimit } from '@/lib/rate-limit';
import { isDemoServerEnabled, isSupabaseServerConfigured } from '@/lib/runtime-config';

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  try {
    const { partnerId } = await params;
    const configuredKeys = process.env.PARTNER_API_KEYS;
    if (!configuredKeys) {
      return NextResponse.json({ error: 'ช่องทางพันธมิตรยังไม่พร้อมใช้งาน' }, { status: 503 });
    }
    let partnerKeys: Record<string, string>;
    try {
      partnerKeys = JSON.parse(configuredKeys) as Record<string, string>;
    } catch {
      return NextResponse.json({ error: 'การตั้งค่าช่องทางพันธมิตรไม่ถูกต้อง' }, { status: 503 });
    }
    const expectedKey = partnerKeys[partnerId];
    const suppliedKey = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!expectedKey || !suppliedKey || !safeEqual(suppliedKey, expectedKey)) {
      return NextResponse.json({ error: 'หน่วยงานพันธมิตรไม่ได้รับอนุญาต' }, { status: 401 });
    }

    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return NextResponse.json({ error: 'ต้องระบุ Idempotency-Key ที่ถูกต้อง' }, { status: 400 });
    }

    const bodyText = await request.text();
    if (Buffer.byteLength(bodyText, 'utf8') > 1024 * 1024) {
      return NextResponse.json({ error: 'ขนาดข้อมูลเกินกำหนด' }, { status: 413 });
    }
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
        const limit = await consumeRateLimit({ client: supabase, key: `external:partner:${partnerId}`, limit: 120, windowSeconds: 60 });
        if (!limit.allowed) return NextResponse.json({ error: 'ส่งคำขอถี่เกินไป' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
        const { data: envelopeId, error } = await supabase.rpc('create_external_intake', {
          p_channel_code: 'PARTNER_API',
          p_payload: { ...payload, partner_id: partnerId },
          p_idempotency_key: `partner:${partnerId}:${idempotencyKey}`,
          p_source_label: `Partner: ${partnerId}`,
        });
        if (error || !envelopeId) {
          const duplicate = error?.code === '23505';
          return NextResponse.json({ error: duplicate ? 'คำขอซ้ำซ้อน' : 'บันทึกข้อมูลจากหน่วยงานไม่สำเร็จ' }, { status: duplicate ? 409 : 503 });
        }
        return NextResponse.json({ success: true, message: 'รับข้อมูลจากหน่วยงานร่วมเรียบร้อยแล้ว', envelopeId }, { status: 201 });
      } catch {
        return NextResponse.json({ error: 'ระบบจัดเก็บคำร้องภายนอกยังตั้งค่าไม่ครบ' }, { status: 503 });
      }
    }

    if (!isDemoServerEnabled()) return NextResponse.json({ error: 'ระบบจัดเก็บคำร้องภายนอกยังตั้งค่าไม่ครบ' }, { status: 503 });
    const demoLimit = await consumeRateLimit({ key: `external:partner:${partnerId}`, limit: 120, windowSeconds: 60 });
    if (!demoLimit.allowed) return NextResponse.json({ error: 'ส่งคำขอถี่เกินไป' }, { status: 429, headers: { 'Retry-After': String(demoLimit.retryAfterSeconds) } });

    const envelopeId = `env-pr-${Date.now()}`;
    saveIntakeEnvelope({
      id: envelopeId,
      channel_id: 'ch-partner',
      status: 'TRIAGE_PENDING',
      complainant_mode: payload.complainant_mode || 'IDENTIFIED',
      urgency: payload.urgency || 'NORMAL',
      urgency_reason: payload.urgency_reason || `นำเข้ารายการร้องเรียนจากหน่วยงาน ${partnerId}`,
      jurisdiction_region: payload.region || 'เขตสุขภาพที่ 10',
      jurisdiction_agency: payload.agency || `สสจ.${partnerId.split('-')[1]}`,
      malware_scan_status: 'PENDING',
      privacy_risk_status: 'PENDING',
      idempotency_key: `partner:${partnerId}:${idempotencyKey}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    saveIntakeMessage({
      id: `msg-${Date.now()}`,
      envelope_id: envelopeId,
      raw_payload: bodyText,
      message_id: payload.external_case_id || `PARTNER-${Date.now()}`
    });

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

    addAuditLog(`Partner: ${partnerId}`, 'INTAKE_RECEIVE', `นำเข้าผ่าน API พันธมิตรสำเร็จ หมายเลขรับเรื่อง: ${envelopeId}`);

    return NextResponse.json({
      success: true,
      message: 'รับข้อมูลจากหน่วยงานร่วมเรียบร้อยแล้ว',
      envelopeId
    });
  } catch (error: unknown) {
    console.error('Partner intake failed', { error: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการรับเรื่องจากพันธมิตร' },
      { status: 500 }
    );
  }
}
