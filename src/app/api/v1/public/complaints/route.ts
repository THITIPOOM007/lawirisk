import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant } from '@/lib/demo-data';

const publicComplaintSchema = z.object({
  topic: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(4000),
  category: z.enum(['HEALTH_HAZARD', 'ONLINE_FRAUD', 'ILLEGAL_CLINIC', 'OTHER']),
  region: z.string().trim().max(100).optional(),
  complainantName: z.string().trim().max(200).optional(),
  complainantContact: z.string().trim().max(200).optional(),
  isAnonymous: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = publicComplaintSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'ข้อมูลคำร้องไม่ครบถ้วน กรุณากรอกหัวข้อและรายละเอียดให้ชัดเจน',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { topic, description, category, region, complainantName, complainantContact, isAnonymous } = parsed.data;

    // Generate Public Tracking Token (e.g. TRK-2026-AB12CD)
    const randomCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const trackingToken = `TRK-${new Date().getFullYear()}-${randomCode}`;
    const envelopeId = `env-pub-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Map urgency based on category
    const urgency = category === 'HEALTH_HAZARD' || category === 'ONLINE_FRAUD' ? 'HIGH' : 'NORMAL';

    saveIntakeEnvelope({
      id: envelopeId,
      channel_id: 'ch-kouprey',
      status: 'TRIAGE_PENDING',
      complainant_mode: isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
      urgency,
      urgency_reason: `[ประชาชนแจ้งเรื่อง: ${trackingToken}] ${topic}: ${description.slice(0, 200)}`,
      jurisdiction_region: region || 'ส่วนกลาง',
      malware_scan_status: 'PENDING',
      privacy_risk_status: isAnonymous ? 'LOW' : 'MEDIUM',
      created_at: now,
      updated_at: now,
    });

    saveIntakeMessage({
      id: `msg-${crypto.randomUUID()}`,
      envelope_id: envelopeId,
      raw_payload: JSON.stringify({
        trackingToken,
        topic,
        description,
        category,
        region,
        complainantName: isAnonymous ? 'ไม่ประสงค์ออกนาม' : complainantName,
        complainantContact: isAnonymous ? '-' : complainantContact,
        source: 'CITIZEN_PUBLIC_PORTAL',
      }),
      message_id: trackingToken,
    });

    if (!isAnonymous && (complainantName || complainantContact)) {
      saveIntakeParticipant({
        id: `part-${crypto.randomUUID()}`,
        envelope_id: envelopeId,
        role: 'COMPLAINANT',
        name: complainantName,
        phone: complainantContact,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          trackingToken,
          message: 'บันทึกเรื่องร้องเรียนเรียบร้อยแล้ว เจ้าหน้าที่จะดำเนินการคัดกรองความปลอดภัยต่อไป',
          receivedAt: now,
          status: 'TRIAGE_PENDING',
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error('Public complaint submission error:', error);
    return NextResponse.json(
      { success: false, error: 'เกิดข้อผิดพลาดในการบันทึกคำร้อง กรุณาลองใหม่อีกครั้ง' },
      { status: 500 },
    );
  }
}
