import { NextRequest, NextResponse } from 'next/server';
import { getIntakeEnvelopes, getIntakeMessages } from '@/lib/demo-data';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token).trim().toUpperCase();

  if (!decodedToken || decodedToken.length < 5) {
    return NextResponse.json(
      { success: false, error: 'รหัสติดตามเรื่องไม่ถูกต้อง' },
      { status: 400 },
    );
  }

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

  let statusLabel = 'รอดำเนินการคัดกรอง';
  let progressStep = 1;

  if (envelope) {
    if (envelope.status === 'PROMOTED') {
      statusLabel = 'อนุมัติเปิดสำนวนสืบสวนแล้ว';
      progressStep = 3;
    } else if (envelope.status === 'MERGED') {
      statusLabel = 'รวบรวมเข้าสำนวนคดีหลักที่เกี่ยวข้อง';
      progressStep = 3;
    } else if (envelope.status === 'QUARANTINED') {
      statusLabel = 'อยู่ระหว่างตรวจสอบความปลอดภัยของไฟล์พยานหลักฐาน';
      progressStep = 2;
    } else if (envelope.status === 'REJECTED') {
      statusLabel = 'ยุติการดำเนินการ (ข้อมูลไม่เพียงพอหรือไม่เข้าข่าย)';
      progressStep = 4;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      trackingToken: decodedToken,
      receivedAt: envelope?.created_at || new Date().toISOString(),
      updatedAt: envelope?.updated_at || envelope?.created_at || new Date().toISOString(),
      status: envelope?.status || 'TRIAGE_PENDING',
      statusLabel,
      progressStep,
      jurisdiction: envelope?.jurisdiction_region || 'ส่วนกลาง',
    },
  });
}
