import { NextRequest, NextResponse } from 'next/server';
import { saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant, addAuditLog } from '@/lib/demo-data';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const envelopeId = `env-man-${Date.now()}`;
    saveIntakeEnvelope({
      id: envelopeId,
      channel_id: payload.channel_id || 'ch-walkin',
      status: 'TRIAGE_PENDING',
      complainant_mode: payload.complainant_mode || 'IDENTIFIED',
      urgency: payload.urgency || 'NORMAL',
      urgency_reason: payload.urgency_reason || 'บันทึกด้วยเจ้าหน้าที่ (Manual)',
      jurisdiction_region: payload.region || 'เขตสุขภาพที่ 10',
      jurisdiction_agency: payload.agency || 'สสจ.ศรีสะเกษ',
      malware_scan_status: 'CLEAN',
      privacy_risk_status: 'LOW',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    saveIntakeMessage({
      id: `msg-${Date.now()}`,
      envelope_id: envelopeId,
      raw_payload: JSON.stringify(payload),
      message_id: payload.document_ref || `MANUAL-${Date.now()}`
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

    const creator = payload.created_by || 'เจ้าหน้าที่บันทึก';
    addAuditLog(creator, 'INTAKE_MANUAL_CREATE', `บันทึกคำร้องร้องเรียนด้วยตนเองสำเร็จ: ${envelopeId}`);

    return NextResponse.json({
      success: true,
      message: 'บันทึกคำร้องด้วยเจ้าหน้าที่สำเร็จ',
      envelopeId
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'เกิดข้อผิดพลาดในการบันทึกคำร้อง' },
      { status: 500 }
    );
  }
}
