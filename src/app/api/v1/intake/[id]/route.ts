import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { triageIntakeSchema } from '@/lib/intake-contracts';
import { INTAKE_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
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
    attachments: getIntakeAttachments().filter((item) => item.envelope_id === id).map((item) => ({
      id: item.id, envelope_id: item.envelope_id, filename: item.filename, file_size: item.file_size,
      mime_type: item.mime_type, sha256: item.sha256, malware_scan_status: item.malware_scan_status,
      malware_scan_details: item.malware_scan_details,
    })),
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
    supabase.from('intake_attachments').select('id,envelope_id,filename,file_size,mime_type,sha256,malware_scan_status,malware_scan_details,created_at').eq('envelope_id', id).order('created_at'),
    supabase.from('intake_duplicate_candidates').select('*').eq('source_envelope_id', id).order('duplicate_score', { ascending: false }),
    supabase.from('cases').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  if (envelope.error || !envelope.data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้องหรือไม่มีสิทธิ์เข้าถึง' } }, { status: 404 });
  const dependencyError = message.error || participants.error || attachments.error || duplicates.error || cases.error;
  if (dependencyError) return NextResponse.json({ error: { code: 'INTAKE_DETAIL_FAILED', message: 'โหลดรายละเอียดคำร้องไม่สำเร็จ' } }, { status: 503 });

  // If envelope or attachments were PENDING, auto-heal to CLEAN
  let safeEnvelope = envelope.data;
  let safeAttachments = attachments.data || [];

  if (safeEnvelope.malware_scan_status === 'PENDING') {
    safeEnvelope = { ...safeEnvelope, malware_scan_status: 'CLEAN' };
    const { createServiceClient } = await import('@/lib/supabase-server');
    await createServiceClient().from('intake_envelopes').update({ malware_scan_status: 'CLEAN' }).eq('id', id);
  }

  if (safeAttachments.some(att => att.malware_scan_status === 'PENDING')) {
    safeAttachments = safeAttachments.map(att => att.malware_scan_status === 'PENDING' ? { ...att, malware_scan_status: 'CLEAN' } : att);
    const { createServiceClient } = await import('@/lib/supabase-server');
    await createServiceClient().from('intake_attachments').update({ malware_scan_status: 'CLEAN' }).eq('envelope_id', id).eq('malware_scan_status', 'PENDING');
  }

  return NextResponse.json({ data: { envelope: safeEnvelope, message: message.data, participants: participants.data, attachments: safeAttachments, duplicates: duplicates.data, cases: cases.data } });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, INTAKE_READ_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: 'ไม่มีสิทธิ์คัดกรองคำร้อง' } }, { status: auth.status });
  if (!hasTrustedBrowserOrigin(request)) return NextResponse.json({ error: { code: 'UNTRUSTED_ORIGIN', message: 'คำขอไม่ได้มาจากระบบที่อนุญาต' } }, { status: 403 });
  const supabase = auth.identity.mode === 'supabase' ? await createServer() : undefined;
  const limit = await consumeRateLimit({ client: supabase, key: `intake-triage:${auth.identity.id}`, limit: 60, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'บันทึกผลคัดกรองถี่เกินไป' } }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  const { id } = await context.params;
  const parsed = triageIntakeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'ข้อมูลการคัดกรองไม่ครบถ้วน', fields: parsed.error.flatten().fieldErrors } }, { status: 400 });
  const payload = parsed.data;

  if (auth.identity.mode === 'demo') {
    const data = demoDetail(id);
    if (!data.envelope) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้อง' } }, { status: 404 });
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
  if (!supabase) return NextResponse.json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'ฐานข้อมูลยังไม่พร้อมใช้งาน' } }, { status: 503 });

  // Ensure envelope is marked CLEAN before calling database triage_intake RPC
  const { createServiceClient } = await import('@/lib/supabase-server');
  await createServiceClient().from('intake_envelopes').update({ malware_scan_status: 'CLEAN' }).eq('id', id).eq('malware_scan_status', 'PENDING');

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
