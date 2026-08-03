import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getIntakeEnvelopes, saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant, addAuditLog } from '@/lib/demo-data';

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('X-Kouprey-Signature');
    const timestamp = request.headers.get('X-Kouprey-Timestamp');
    const nonce = request.headers.get('X-Kouprey-Nonce');
    const idempotencyKey = request.headers.get('Idempotency-Key');

    const bodyText = await request.text();

    if (!signature || !timestamp || !nonce) {
      return NextResponse.json(
        { error: 'ข้อมูลยืนยันตัวตน webhook ไม่ครบถ้วน (X-Kouprey headers missing)' },
        { status: 401 }
      );
    }

    // Enforce Webhook signature validation (HMAC SHA256)
    const secret = process.env.KOUPREY_SECRET_KEY || 'mock-secret-kouprey-key-12345';
    const message = `${timestamp}.${nonce}.${bodyText}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    // Check time drift (e.g., must be within 5 minutes / 300 seconds)
    const currentTime = Math.floor(Date.now() / 1000);
    const sentTime = parseInt(timestamp, 10);
    if (isNaN(sentTime) || Math.abs(currentTime - sentTime) > 300) {
      return NextResponse.json(
        { error: 'คำขอหมดอายุ (Timestamp expired or drifted too far)' },
        { status: 400 }
      );
    }

    // Verify HMAC signature
    if (signature !== expectedSignature) {
      return NextResponse.json(
        { error: 'ข้อมูลความปลอดภัย webhook ล้มเหลว (HMAC Signature Mismatch)' },
        { status: 403 }
      );
    }

    // Enforce Idempotency Key check
    if (idempotencyKey) {
      const existing = getIntakeEnvelopes().find(e => e.idempotency_key === idempotencyKey);
      if (existing) {
        return NextResponse.json(
          { error: 'คำขอซ้ำซ้อน (Duplicate Idempotency-Key detected)', envelopeId: existing.id },
          { status: 409 }
        );
      }
    }

    // Parse payload
    const payload = JSON.parse(bodyText);

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
      malware_scan_status: 'CLEAN',
      privacy_risk_status: 'LOW',
      idempotency_key: idempotencyKey || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Save raw payload message
    saveIntakeMessage({
      id: `msg-${Date.now()}`,
      envelope_id: envelopeId,
      headers: {
        timestamp,
        nonce,
        signature
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'เกิดข้อผิดพลาดในการประมวลผลคำร้อง' },
      { status: 500 }
    );
  }
}
