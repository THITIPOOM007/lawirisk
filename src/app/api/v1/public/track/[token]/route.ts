import { NextRequest, NextResponse } from 'next/server';
import { getIntakeEnvelopes, getIntakeMessages } from '@/lib/demo-data';
import { isSupabaseServerConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';

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

  let status = 'TRIAGE_PENDING';
  let createdAt = new Date().toISOString();
  let updatedAt = createdAt;
  let jurisdiction = 'ส่วนกลาง';
  let found = false;

  if (!isSupabaseServerConfigured()) {
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
    const supabase = createServiceClient();
    const { data: msgData } = await supabase
      .from('intake_messages')
      .select('envelope_id')
      .eq('message_id', decodedToken)
      .maybeSingle();

    if (!msgData) {
      return NextResponse.json(
        { success: false, error: 'ไม่พบข้อมูลคำร้องจากรหัสติดตามนี้ กรุณาตรวจสอบรหัสอีกครั้ง' },
        { status: 404 },
      );
    }

    const { data: envData } = await supabase
      .from('intake_envelopes')
      .select('status, created_at, updated_at, jurisdiction_region')
      .eq('id', msgData.envelope_id)
      .maybeSingle();

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
