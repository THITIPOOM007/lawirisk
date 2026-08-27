import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { addAuditLog, getCases, getEntities, getEvidence, getRelationships } from '@/lib/demo-data';
import { consumeRateLimit } from '@/lib/rate-limit';
import { buildCaseReport } from '@/lib/report-builder';
import { CASE_WRITE_ROLES, STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { createReportSchema } from '@/lib/workflow-contracts';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูรายงาน');
  if (auth.identity.mode === 'demo') return NextResponse.json({ data: [] });
  const supabase = await createServer();
  const { data, error } = await supabase
    .from('reports')
    .select('id,case_id,title,report_type,content,source_snapshot,snapshot_sha256,created_by,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return apiError('REPORT_LIST_FAILED', 'โหลดรายงานไม่สำเร็จ', 503);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์สร้างรายงาน');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const parsed = createReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'กรุณาเลือกคดีและประเภทรายงาน', 400, undefined, parsed.error.flatten().fieldErrors);
  const payload = parsed.data;

  if (auth.identity.mode === 'demo') {
    const caseRecord = getCases().find((item) => item.id === payload.case_id);
    if (!caseRecord) return apiError('NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
    const content = buildCaseReport({
      caseRecord,
      reportType: payload.report_type,
      evidence: getEvidence().filter((item) => item.case_id === payload.case_id),
      sourcedEntities: getEntities().filter((item) => item.case_id === payload.case_id),
      sourcedRelationships: getRelationships().filter((item) => item.case_id === payload.case_id && item.status === 'VERIFIED'),
    });
    addAuditLog(auth.identity.name, 'REPORT_GENERATE', `สร้างรายงานสาธิตสำหรับคดี ${caseRecord.number}`);
    return NextResponse.json({ data: { id: `demo-report-${Date.now()}`, title: payload.title || `รายงาน ${caseRecord.number}`, content, source_snapshot: [], snapshot_sha256: null } }, { status: 201 });
  }

  if (!z.string().uuid().safeParse(payload.case_id).success) return apiError('NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `report-create:${auth.identity.id}`, limit: 10, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'สร้างรายงานถี่เกินไป' } }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });

  const [caseResult, evidenceResult, entitiesResult, relationshipsResult] = await Promise.all([
    supabase.from('cases').select('id,number,title,description,status,jurisdiction_region,jurisdiction_agency,created_at').eq('id', payload.case_id).maybeSingle(),
    supabase.from('evidence_files').select('id,filename,sha256,malware_scan_status').eq('case_id', payload.case_id).eq('upload_state', 'STORED').in('malware_scan_status', ['CLEAN', 'NOT_SCANNED']).order('created_at'),
    supabase.from('extracted_entities').select('id,type,value').eq('case_id', payload.case_id),
    supabase.from('entity_relationships').select('id,type,status').eq('case_id', payload.case_id).eq('status', 'VERIFIED'),
  ]);
  if (caseResult.error || !caseResult.data) return apiError('NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404);
  if (evidenceResult.error || entitiesResult.error || relationshipsResult.error) return apiError('REPORT_DATA_FAILED', 'โหลดข้อมูลสำหรับรายงานไม่สำเร็จ', 503);

  const entityIds = (entitiesResult.data || []).map((item) => item.id);
  const relationshipIds = (relationshipsResult.data || []).map((item) => item.id);
  const [mentions, references] = await Promise.all([
    entityIds.length ? supabase.from('entity_mentions').select('entity_id').in('entity_id', entityIds) : Promise.resolve({ data: [], error: null }),
    relationshipIds.length ? supabase.from('relationship_references').select('relationship_id').in('relationship_id', relationshipIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (mentions.error || references.error) return apiError('REPORT_SOURCE_FAILED', 'ตรวจสอบแหล่งอ้างอิงสำหรับรายงานไม่สำเร็จ', 503);
  const sourcedEntityIds = new Set((mentions.data || []).map((item) => item.entity_id));
  const sourcedRelationshipIds = new Set((references.data || []).map((item) => item.relationship_id));
  const content = buildCaseReport({
    caseRecord: caseResult.data,
    reportType: payload.report_type,
    evidence: evidenceResult.data || [],
    sourcedEntities: (entitiesResult.data || []).filter((item) => sourcedEntityIds.has(item.id)),
    sourcedRelationships: (relationshipsResult.data || []).filter((item) => sourcedRelationshipIds.has(item.id)),
  });
  const title = payload.title || `${payload.report_type === 'SUMMARY' ? 'รายงานสรุป' : 'รายงานจุดทับซ้อน'} ${caseResult.data.number}`;
  const { data: reportId, error } = await supabase.rpc('create_report_snapshot', {
    p_case_id: payload.case_id,
    p_title: title,
    p_report_type: payload.report_type,
    p_content: content,
  });
  if (error || !reportId) {
    const message = error?.message === 'REPORT_SOURCE_REQUIRED'
      ? 'ยังสร้างรายงานไม่ได้ เพราะไม่มี source mention หรือ relationship reference ที่ยืนยันแล้ว'
      : 'สร้างรายงานไม่สำเร็จ';
    return apiError(error?.message || 'REPORT_CREATE_FAILED', message, error?.message === 'REPORT_SOURCE_REQUIRED' ? 409 : 503);
  }
  return NextResponse.json({ data: { id: reportId, title, content } }, { status: 201 });
}
