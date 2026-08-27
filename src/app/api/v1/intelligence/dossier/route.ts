import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { buildVerifiedDossierDocuments, caseIntelligenceRequestSchema } from '@/lib/case-intelligence';
import { addAuditLog, getCases, getEntities, getEvidence, getRelationships } from '@/lib/demo-data';
import { isEvidenceUsable } from '@/lib/evidence-file-status';
import { consumeRateLimit } from '@/lib/rate-limit';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { createServer } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์สร้างร่างแฟ้มสืบสวน');
  if (!hasTrustedBrowserOrigin(request)) {
    return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  }
  const parsed = caseIntelligenceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'รหัสสำนวนคดีไม่ถูกต้อง', 400);

  if (auth.identity.mode === 'demo') {
    const caseRecord = getCases().find((item) => item.id === parsed.data.case_id);
    if (!caseRecord) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
    const documents = buildVerifiedDossierDocuments({
      caseNumber: caseRecord.number,
      caseTitle: caseRecord.title,
      description: caseRecord.description,
      evidence: getEvidence()
        .filter((item) => item.case_id === caseRecord.id && isEvidenceUsable(item.upload_state, item.malware_scan_status))
        .map((item) => ({ filename: item.filename, sha256: item.sha256 })),
      verifiedFacts: getEntities().filter((item) => item.case_id === caseRecord.id).map((item) => `${item.type}: ${item.value}`),
      verifiedRelationships: getRelationships().filter((item) => item.case_id === caseRecord.id && item.status === 'VERIFIED').map((item) => item.type),
    });
    addAuditLog(auth.identity.name, 'CASE_DOSSIER_DRAFT_CREATE', `สร้างร่าง dossier สำนวน ${caseRecord.number}`);
    return NextResponse.json({ data: { documents } }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const supabase = await createServer();
  const limit = await consumeRateLimit({
    client: supabase,
    key: `case-dossier:${auth.identity.id}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'สร้างร่างเอกสารถี่เกินไป กรุณารอสักครู่' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!z.string().uuid().safeParse(parsed.data.case_id).success) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
  const caseId = parsed.data.case_id;
  const [caseResult, evidenceResult, entitiesResult, relationshipsResult] = await Promise.all([
    supabase.from('cases').select('id,number,title,description').eq('id', caseId).maybeSingle(),
    supabase.from('evidence_files').select('filename,sha256').eq('case_id', caseId).eq('upload_state', 'STORED').in('malware_scan_status', ['CLEAN', 'NOT_SCANNED']).order('created_at'),
    supabase.from('extracted_entities').select('id,type,value').eq('case_id', caseId).order('created_at'),
    supabase.from('entity_relationships').select('id,type').eq('case_id', caseId).eq('status', 'VERIFIED').order('created_at'),
  ]);
  if (caseResult.error || !caseResult.data) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404);
  if (evidenceResult.error || entitiesResult.error || relationshipsResult.error) {
    return apiError('DOSSIER_DATA_FAILED', 'รวบรวมข้อมูลสำหรับร่างแฟ้มไม่สำเร็จ', 503);
  }

  const entityIds = (entitiesResult.data || []).map((item) => item.id);
  const mentionsResult = entityIds.length
    ? await supabase.from('entity_mentions').select('entity_id').in('entity_id', entityIds)
    : { data: [], error: null };
  if (mentionsResult.error) return apiError('DOSSIER_SOURCE_FAILED', 'ตรวจแหล่งอ้างอิงของข้อเท็จจริงไม่สำเร็จ', 503);
  const sourcedEntityIds = new Set((mentionsResult.data || []).map((item) => item.entity_id));
  const documents = buildVerifiedDossierDocuments({
    caseNumber: caseResult.data.number,
    caseTitle: caseResult.data.title,
    description: caseResult.data.description,
    evidence: evidenceResult.data || [],
    verifiedFacts: (entitiesResult.data || [])
      .filter((item) => sourcedEntityIds.has(item.id))
      .map((item) => `${item.type}: ${item.value}`),
    verifiedRelationships: (relationshipsResult.data || []).map((item) => item.type),
  });
  const audit = await supabase.from('audit_logs').insert({
    profile_id: auth.identity.id,
    action: 'CASE_DOSSIER_DRAFT_CREATE',
    details: { case_id: caseId, document_count: documents.length, draft_only: true },
  });
  if (audit.error) return apiError('AUDIT_WRITE_FAILED', 'บันทึกการสร้างร่างแฟ้มไม่สำเร็จ', 503);
  return NextResponse.json({ data: { documents } }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}
