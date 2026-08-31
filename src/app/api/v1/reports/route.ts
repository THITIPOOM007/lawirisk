import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { addAuditLog, getCases, getEntities, getEvidence, getRelationships } from '@/lib/demo-data';
import { consumeRateLimit } from '@/lib/rate-limit';
import { buildCaseReport, buildPredictionFormReport } from '@/lib/report-builder';
import { buildAutomaticAdvice, type EvidenceScreeningClassification, type EvidenceScreeningStatus } from '@/lib/evidence-screening';
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
    const reportInput = {
      caseRecord,
      evidence: getEvidence().filter((item) => item.case_id === payload.case_id),
      sourcedEntities: getEntities().filter((item) => item.case_id === payload.case_id),
      sourcedRelationships: getRelationships().filter((item) => item.case_id === payload.case_id && item.status === 'VERIFIED'),
    };
    const demoAutomaticAdvice = buildAutomaticAdvice({
      caseRecord,
      assessments: reportInput.evidence.map((item) => ({
        evidenceId: item.id, filename: item.filename, classification: 'DIRECT' as const,
        summary: 'หลักฐานสาธิตอยู่ในขอบเขตคดีและพร้อมใช้จัดลำดับงาน',
        reason: 'ข้อมูลสาธิตที่มี source trace แบบ deterministic', confidence: 0.82,
        status: 'SUGGESTED' as const, sourceCount: 1,
      })),
      entities: reportInput.sourcedEntities,
    });
    const content = payload.report_type === 'PREDICTION_FORM'
      ? JSON.stringify(buildPredictionFormReport({ ...reportInput, automaticAdvice: demoAutomaticAdvice }))
      : buildCaseReport({ ...reportInput, reportType: payload.report_type });
    addAuditLog(auth.identity.name, 'REPORT_GENERATE', `สร้างรายงานสาธิตสำหรับคดี ${caseRecord.number}`);
    return NextResponse.json({ data: { id: `demo-report-${Date.now()}`, title: payload.title || `รายงาน ${caseRecord.number}`, report_type: payload.report_type, content, source_snapshot: [], snapshot_sha256: null } }, { status: 201 });
  }

  if (!z.string().uuid().safeParse(payload.case_id).success) return apiError('NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `report-create:${auth.identity.id}`, limit: 10, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'สร้างรายงานถี่เกินไป' } }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });

  const [caseResult, evidenceResult, entitiesResult, relationshipsResult, screeningsResult] = await Promise.all([
    supabase.from('cases').select('id,number,title,description,status,jurisdiction_region,jurisdiction_agency,created_at').eq('id', payload.case_id).maybeSingle(),
    supabase.from('evidence_files').select('id,filename,sha256,malware_scan_status').eq('case_id', payload.case_id).eq('upload_state', 'STORED').in('malware_scan_status', ['CLEAN', 'NOT_SCANNED']).order('created_at'),
    supabase.from('extracted_entities').select('id,type,value').eq('case_id', payload.case_id),
    supabase.from('entity_relationships').select('id,type,status').eq('case_id', payload.case_id).eq('status', 'VERIFIED'),
    payload.report_type === 'PREDICTION_FORM'
      ? supabase.from('evidence_screenings').select('evidence_id,classification,summary,reason,confidence,source_trace,status').eq('case_id', payload.case_id).neq('status', 'REJECTED')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (caseResult.error || !caseResult.data) return apiError('NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404);
  if (evidenceResult.error || entitiesResult.error || relationshipsResult.error || screeningsResult.error) return apiError('REPORT_DATA_FAILED', 'โหลดข้อมูลสำหรับรายงานไม่สำเร็จ', 503);

  const entityIds = (entitiesResult.data || []).map((item) => item.id);
  const relationshipIds = (relationshipsResult.data || []).map((item) => item.id);
  const [mentions, references] = await Promise.all([
    entityIds.length ? supabase.from('entity_mentions').select('entity_id').in('entity_id', entityIds) : Promise.resolve({ data: [], error: null }),
    relationshipIds.length ? supabase.from('relationship_references').select('relationship_id').in('relationship_id', relationshipIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (mentions.error || references.error) return apiError('REPORT_SOURCE_FAILED', 'ตรวจสอบแหล่งอ้างอิงสำหรับรายงานไม่สำเร็จ', 503);
  const sourcedEntityIds = new Set((mentions.data || []).map((item) => item.entity_id));
  const sourcedRelationshipIds = new Set((references.data || []).map((item) => item.relationship_id));
  const sourcedEntities = (entitiesResult.data || []).filter((item) => sourcedEntityIds.has(item.id));
  const sourcedRelationships = (relationshipsResult.data || []).filter((item) => sourcedRelationshipIds.has(item.id));
  const evidenceById = new Map((evidenceResult.data || []).map((item) => [item.id, item]));
  const screeningAssessments = (screeningsResult.data || []).flatMap((item) => {
    const evidence = evidenceById.get(item.evidence_id);
    if (!evidence) return [];
    const trace = item.source_trace && typeof item.source_trace === 'object' && !Array.isArray(item.source_trace)
      ? item.source_trace as Record<string, unknown>
      : {};
    const entityTrace = Array.isArray(trace.entities) ? trace.entities.length : 0;
    const countSignal = (key: string) => typeof trace[key] === 'number' ? Number(trace[key]) : 0;
    return [{
      evidenceId: item.evidence_id,
      filename: evidence.filename,
      classification: item.classification as EvidenceScreeningClassification,
      summary: item.summary,
      reason: item.reason,
      confidence: item.confidence,
      status: item.status as EvidenceScreeningStatus,
      sourceCount: Math.max(entityTrace, countSignal('confirmed_mentions') + countSignal('verified_relationship_references')),
    }];
  });
  const automaticAdvice = payload.report_type === 'PREDICTION_FORM'
    ? buildAutomaticAdvice({ caseRecord: caseResult.data, assessments: screeningAssessments, entities: sourcedEntities })
    : [];
  const content = payload.report_type === 'PREDICTION_FORM'
    ? JSON.stringify(buildPredictionFormReport({
      caseRecord: caseResult.data,
      evidence: evidenceResult.data || [],
      sourcedEntities,
      sourcedRelationships,
      screenings: screeningAssessments.map((item) => ({ filename: item.filename, classification: item.classification, summary: item.summary, status: item.status })),
      automaticAdvice,
    }))
    : buildCaseReport({ caseRecord: caseResult.data, reportType: payload.report_type, evidence: evidenceResult.data || [], sourcedEntities, sourcedRelationships });
  const defaultTitle = payload.report_type === 'SUMMARY' ? 'รายงานสรุป' : payload.report_type === 'OVERLAP' ? 'รายงานจุดทับซ้อน' : 'ฟอร์มกำหนดคาดการณ์';
  const title = payload.title || `${defaultTitle} ${caseResult.data.number}`;
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
  return NextResponse.json({ data: { id: reportId, title, report_type: payload.report_type, content } }, { status: 201 });
}
