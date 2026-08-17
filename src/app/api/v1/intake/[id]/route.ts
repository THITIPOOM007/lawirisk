import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { triageIntakeSchema } from '@/lib/intake-contracts';
import { INTAKE_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import {
  getCases,
  getDuplicateCandidates,
  getIntakeAttachments,
  getIntakeEnvelopes,
  getIntakeMessages,
  getIntakeParticipants,
  saveCase,
  saveTriageDecision,
  updateIntakeEnvelopeStatus,
} from '@/lib/demo-data';

function demoDetail(id: string) {
  return {
    envelope: getIntakeEnvelopes().find((item) => item.id === id) ?? null,
    message: getIntakeMessages().find((item) => item.envelope_id === id) ?? null,
    participants: getIntakeParticipants().filter((item) => item.envelope_id === id),
    attachments: getIntakeAttachments().filter((item) => item.envelope_id === id),
    duplicates: getDuplicateCandidates().filter((item) => item.source_envelope_id === id),
    cases: getCases(),
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, INTAKE_READ_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: 'ไม่มีสิทธิ์ดูรายละเอียดคำร้อง' } }, { status: auth.status });
  const { id } = await context.params;
  if (auth.identity.mode === 'demo') {
    const data = demoDetail(id);
    return data.envelope ? NextResponse.json({ data }) : NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้อง' } }, { status: 404 });
  }
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้อง' } }, { status: 404 });

  const supabase = await createServer();
  const [envelope, message, participants, attachments, duplicates, cases] = await Promise.all([
    supabase.from('intake_envelopes').select('*').eq('id', id).maybeSingle(),
    supabase.from('intake_messages').select('*').eq('envelope_id', id).order('created_at').limit(1).maybeSingle(),
    supabase.from('intake_participants').select('*').eq('envelope_id', id).order('created_at'),
    supabase.from('intake_attachments').select('*').eq('envelope_id', id).order('created_at'),
    supabase.from('intake_duplicate_candidates').select('*').eq('source_envelope_id', id).order('duplicate_score', { ascending: false }),
    supabase.from('cases').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  if (envelope.error || !envelope.data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้องหรือไม่มีสิทธิ์เข้าถึง' } }, { status: 404 });
  const dependencyError = message.error || participants.error || attachments.error || duplicates.error || cases.error;
  if (dependencyError) return NextResponse.json({ error: { code: 'INTAKE_DETAIL_FAILED', message: 'โหลดรายละเอียดคำร้องไม่สำเร็จ' } }, { status: 503 });
  return NextResponse.json({ data: { envelope: envelope.data, message: message.data, participants: participants.data, attachments: attachments.data, duplicates: duplicates.data, cases: cases.data } });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, INTAKE_READ_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: 'ไม่มีสิทธิ์คัดกรองคำร้อง' } }, { status: auth.status });
  const { id } = await context.params;
  const parsed = triageIntakeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'ข้อมูลการคัดกรองไม่ครบถ้วน', fields: parsed.error.flatten().fieldErrors } }, { status: 400 });
  const payload = parsed.data;

  if (auth.identity.mode === 'demo') {
    const data = demoDetail(id);
    if (!data.envelope) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้อง' } }, { status: 404 });
    if (['CREATE_CASE', 'MERGE_INTAKE'].includes(payload.action) && data.envelope.malware_scan_status !== 'CLEAN') {
      return NextResponse.json({ error: { code: 'SCAN_NOT_CLEAN', message: 'ยังเปิดหรือผนวกคดีไม่ได้จนกว่าผลสแกนจะเป็น CLEAN' } }, { status: 409 });
    }
    let destinationCaseId = payload.destination_case_id;
    if (payload.action === 'CREATE_CASE') {
      destinationCaseId = crypto.randomUUID();
      const now = new Date().toISOString();
      saveCase({ id: destinationCaseId, number: payload.new_case_number!, title: payload.new_case_title!, description: `สร้างจากคำร้อง ${id}: ${payload.reason}`, status: 'ACTIVE', jurisdiction_region: data.envelope.jurisdiction_region, jurisdiction_agency: data.envelope.jurisdiction_agency, created_by: auth.identity.name, created_at: now, updated_at: now });
    }
    const status = payload.action === 'CREATE_CASE' ? 'PROMOTED' : payload.action === 'MERGE_INTAKE' ? 'MERGED' : payload.action === 'REQUEST_MORE_INFO' ? 'NEEDS_INFO' : 'REJECTED';
    updateIntakeEnvelopeStatus(id, status);
    saveTriageDecision({ id: crypto.randomUUID(), envelope_id: id, action: payload.action, reason: payload.reason, destination_case_id: destinationCaseId, created_by: auth.identity.name, created_at: new Date().toISOString() });
    return NextResponse.json({ data: { status, destination_case_id: destinationCaseId } });
  }

  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้อง' } }, { status: 404 });
  const supabase = await createServer();
  const { data, error } = await supabase.rpc('triage_intake', {
    p_envelope_id: id,
    p_action: payload.action,
    p_reason: payload.reason,
    p_destination_case_id: payload.destination_case_id ?? null,
    p_new_case_number: payload.new_case_number ?? null,
    p_new_case_title: payload.new_case_title ?? null,
  });
  if (error) {
    const messageByCode: Record<string, string> = {
      INTAKE_SCAN_NOT_CLEAN: 'ยังเปิดหรือผนวกคดีไม่ได้จนกว่าผลสแกนจะเป็น CLEAN',
      INTAKE_ALREADY_TRIAGED: 'คำร้องนี้ถูกคัดกรองไปแล้ว',
      DESTINATION_CASE_FORBIDDEN: 'ไม่มีสิทธิ์เข้าถึงสำนวนปลายทาง',
    };
    return NextResponse.json({ error: { code: error.message, message: messageByCode[error.message] || 'บันทึกผลคัดกรองไม่สำเร็จ' } }, { status: error.message === 'INTAKE_SCAN_NOT_CLEAN' ? 409 : 503 });
  }
  return NextResponse.json({ data });
}
