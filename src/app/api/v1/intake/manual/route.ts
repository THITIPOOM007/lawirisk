import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { addAuditLog, saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant } from '@/lib/demo-data';
import { INTAKE_WRITE_ROLES } from '@/lib/roles';
import { manualIntakeSchema } from '@/lib/intake-contracts';
import { createServer } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, INTAKE_WRITE_ROLES);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: { code: auth.code, message: auth.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'ไม่มีสิทธิ์รับเรื่อง' } }, { status: auth.status });
  }
  try {
    const parsed = manualIntakeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_REQUEST', message: 'ข้อมูลคำร้องไม่ครบหรือรูปแบบไม่ถูกต้อง', fields: parsed.error.flatten().fieldErrors } }, { status: 400 });
    }
    const payload = parsed.data;
    if (auth.identity.mode === 'supabase') {
      const supabase = await createServer();
      const { data: envelopeId, error } = await supabase.rpc('create_manual_intake', {
        p_channel_code: payload.channel_id === 'ch-phone' ? 'MANUAL_PHONE' : 'MANUAL_WALKIN',
        p_complainant_mode: payload.complainant_mode,
        p_urgency: payload.urgency,
        p_urgency_reason: payload.urgency_reason,
        p_region: payload.region ?? null,
        p_agency: payload.agency ?? null,
        p_document_ref: payload.document_ref ?? null,
        p_accused: payload.accused ?? null,
        p_complainant: payload.complainant ?? null,
      });
      if (error || !envelopeId) {
        console.error('Manual intake persistence failed', { code: error?.code });
        return NextResponse.json({ success: false, error: { code: 'PERSISTENCE_FAILED', message: 'บันทึกคำร้องไม่สำเร็จ กรุณาลองใหม่' } }, { status: 503 });
      }
      return NextResponse.json({ success: true, message: 'รับคำร้องแล้วและรอการตรวจความปลอดภัย', envelopeId }, { status: 201 });
    }

    const envelopeId = `env-man-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    saveIntakeEnvelope({
      id: envelopeId,
      channel_id: payload.channel_id,
      status: 'TRIAGE_PENDING',
      complainant_mode: payload.complainant_mode,
      urgency: payload.urgency,
      urgency_reason: payload.urgency_reason,
      jurisdiction_region: payload.region,
      jurisdiction_agency: payload.agency,
      malware_scan_status: 'PENDING',
      privacy_risk_status: 'PENDING',
      created_at: now,
      updated_at: now,
    });
    saveIntakeMessage({
      id: `msg-${crypto.randomUUID()}`,
      envelope_id: envelopeId,
      raw_payload: JSON.stringify(payload),
      message_id: payload.document_ref || `MANUAL-${crypto.randomUUID()}`,
    });
    if (payload.accused) saveIntakeParticipant({ id: `part-${crypto.randomUUID()}`, envelope_id: envelopeId, role: 'ACCUSED', ...payload.accused });
    if (payload.complainant_mode !== 'ANONYMOUS' && payload.complainant) saveIntakeParticipant({ id: `part-${crypto.randomUUID()}`, envelope_id: envelopeId, role: 'COMPLAINANT', ...payload.complainant });
    addAuditLog(auth.identity.name, 'INTAKE_MANUAL_CREATE', `บันทึกคำร้องด้วยเจ้าหน้าที่: ${envelopeId}`);
    return NextResponse.json({ success: true, message: 'รับคำร้องแล้วและรอการตรวจความปลอดภัย', envelopeId }, { status: 201 });
  } catch (error: unknown) {
    console.error('Manual intake failed', { error: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดในการบันทึกคำร้อง' } }, { status: 500 });
  }
}
