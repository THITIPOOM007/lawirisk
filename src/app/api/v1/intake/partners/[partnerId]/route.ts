import { NextRequest, NextResponse } from 'next/server';
import { getIntakeEnvelopes, saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant, addAuditLog } from '@/lib/demo-data';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  try {
    const { partnerId } = await params;
    const bodyText = await request.text();
    const payload = JSON.parse(bodyText);

    // Validate partner identity (simulate checks)
    const allowedPartners = ['ssj-sisaket', 'ssj-ubon', 'fda-central'];
    if (!allowedPartners.includes(partnerId)) {
      return NextResponse.json(
        { error: 'รหัสหน่วยงานพันธมิตรไม่ถูกต้องหรือไม่ได้รับอนุญาต' },
        { status: 403 }
      );
    }

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
      malware_scan_status: 'CLEAN',
      privacy_risk_status: 'LOW',
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'เกิดข้อผิดพลาดในการรับเรื่องจากพันธมิตร' },
      { status: 500 }
    );
  }
}
