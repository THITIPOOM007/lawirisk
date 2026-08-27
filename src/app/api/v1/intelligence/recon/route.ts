import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { buildCaseReconSummary, caseIntelligenceRequestSchema } from '@/lib/case-intelligence';
import { addAuditLog, getCases, getEntities, getEvidence, getMatches, getRelationships } from '@/lib/demo-data';
import { consumeRateLimit } from '@/lib/rate-limit';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { createServer } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ใช้การสืบค้นข้อมูลเชิงลึก');
  if (!hasTrustedBrowserOrigin(request)) {
    return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  }
  const parsed = caseIntelligenceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'รหัสสำนวนคดีไม่ถูกต้อง', 400);

  if (auth.identity.mode === 'demo') {
    const caseRecord = getCases().find((item) => item.id === parsed.data.case_id);
    if (!caseRecord) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
    const report = buildCaseReconSummary({
      caseId: caseRecord.id,
      caseNumber: caseRecord.number,
      caseTitle: caseRecord.title,
      evidenceCount: getEvidence().filter((item) => item.case_id === caseRecord.id).length,
      entityCount: getEntities().filter((item) => item.case_id === caseRecord.id).length,
      verifiedRelationshipCount: getRelationships().filter((item) => item.case_id === caseRecord.id && item.status === 'VERIFIED').length,
      crossCaseMatchCount: getMatches().filter((item) => item.source_case_id === caseRecord.id || item.target_case_id === caseRecord.id).length,
    });
    addAuditLog(auth.identity.name, 'CASE_INTELLIGENCE_WORKSPACE_OPEN', `เปิด workspace สำนวน ${caseRecord.number}`);
    return NextResponse.json({ data: { report } }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const supabase = await createServer();
  const limit = await consumeRateLimit({
    client: supabase,
    key: `case-intelligence:${auth.identity.id}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'เรียกตรวจข้อมูลถี่เกินไป กรุณารอสักครู่' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!z.string().uuid().safeParse(parsed.data.case_id).success) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
  const caseId = parsed.data.case_id;
  const [caseResult, evidenceResult, entitiesResult, relationshipsResult, matchesResult] = await Promise.all([
    supabase.from('cases').select('id,number,title').eq('id', caseId).maybeSingle(),
    supabase.from('evidence_files').select('*', { count: 'exact', head: true }).eq('case_id', caseId).eq('upload_state', 'STORED').in('malware_scan_status', ['CLEAN', 'NOT_SCANNED']),
    supabase.from('extracted_entities').select('*', { count: 'exact', head: true }).eq('case_id', caseId),
    supabase.from('entity_relationships').select('*', { count: 'exact', head: true }).eq('case_id', caseId).eq('status', 'VERIFIED'),
    supabase.from('match_candidates').select('*', { count: 'exact', head: true }).or(`source_case_id.eq.${caseId},target_case_id.eq.${caseId}`),
  ]);
  if (caseResult.error || !caseResult.data) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404);
  if (evidenceResult.error || entitiesResult.error || relationshipsResult.error || matchesResult.error) {
    return apiError('INTELLIGENCE_WORKSPACE_FAILED', 'รวบรวมสถานะข้อมูลคดีไม่สำเร็จ', 503);
  }

  const report = buildCaseReconSummary({
    caseId: caseResult.data.id,
    caseNumber: caseResult.data.number,
    caseTitle: caseResult.data.title,
    evidenceCount: evidenceResult.count || 0,
    entityCount: entitiesResult.count || 0,
    verifiedRelationshipCount: relationshipsResult.count || 0,
    crossCaseMatchCount: matchesResult.count || 0,
  });
  const audit = await supabase.from('audit_logs').insert({
    profile_id: auth.identity.id,
    action: 'CASE_INTELLIGENCE_WORKSPACE_OPEN',
    details: { case_id: caseId, external_queries_performed: false },
  });
  if (audit.error) return apiError('AUDIT_WRITE_FAILED', 'บันทึกการเปิด workspace ไม่สำเร็จ', 503);
  return NextResponse.json({ data: { report } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
