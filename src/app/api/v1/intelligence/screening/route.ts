import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { buildEvidenceScreeningProjection } from '@/lib/evidence-screening';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { CASE_WRITE_ROLES, REVIEW_ROLES, STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { evidenceScreeningRequestSchema } from '@/lib/workflow-contracts';

async function loadScreening(caseId: string, role: string) {
  const supabase = await createServer();
  const [caseResult, screeningResult, evidenceResult, entityResult] = await Promise.all([
    supabase.from('cases').select('id,number,title').eq('id', caseId).maybeSingle(),
    supabase.from('evidence_screenings')
      .select('id,evidence_id,classification,summary,reason,confidence,source_trace,provider,model,status,reviewed_at,updated_at')
      .eq('case_id', caseId)
      .order('updated_at', { ascending: false }),
    supabase.from('evidence_files')
      .select('id,filename,sha256')
      .eq('case_id', caseId)
      .eq('upload_state', 'STORED')
      .in('malware_scan_status', ['CLEAN', 'NOT_SCANNED']),
    supabase.from('extracted_entities').select('id,type,value').eq('case_id', caseId).limit(500),
  ]);
  if (caseResult.error || !caseResult.data) return { error: apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404) };
  if (screeningResult.error || evidenceResult.error || entityResult.error) {
    return { error: apiError('SCREENING_LOAD_FAILED', 'โหลดผลสกรีนนิ่งไม่สำเร็จ', 503) };
  }
  return {
    data: buildEvidenceScreeningProjection({
      caseRecord: caseResult.data,
      screenings: (screeningResult.data || []) as Parameters<typeof buildEvidenceScreeningProjection>[0]['screenings'],
      evidence: evidenceResult.data || [],
      entities: entityResult.data || [],
      canReview: REVIEW_ROLES.has(role as 'ADMIN' | 'INVESTIGATOR' | 'REVIEWER' | 'VIEWER'),
      canRefresh: new Set([...CASE_WRITE_ROLES, 'REVIEWER']).has(role as 'ADMIN' | 'INVESTIGATOR' | 'REVIEWER'),
    }),
  };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูผลสกรีนนิ่ง');
  const parsed = evidenceScreeningRequestSchema.safeParse({ case_id: request.nextUrl.searchParams.get('case_id') });
  if (!parsed.success) return apiError('INVALID_REQUEST', 'รหัสคดีไม่ถูกต้อง', 400);
  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ data: buildEvidenceScreeningProjection({
      caseRecord: { id: parsed.data.case_id, number: 'ค.123/2569', title: 'คดีสาธิต' },
      evidence: [{ id: 'demo-evidence', filename: 'หลักฐานตัวอย่าง.pdf', sha256: 'demo-sha256' }],
      entities: [],
      screenings: [{
        id: 'demo-screening', evidence_id: 'demo-evidence', classification: 'REVIEW_REQUIRED',
        summary: 'พบข้อเสนอที่ยังรอเจ้าหน้าที่ตรวจทาน', reason: 'ข้อมูลสาธิตสำหรับแสดงขั้นตอนการทำงาน',
        confidence: 0.6, source_trace: {}, provider: 'LAWIRISK_RULE_ENGINE', model: 'source-trace-v1',
        status: 'SUGGESTED', reviewed_at: null, updated_at: new Date().toISOString(),
      }],
      canReview: REVIEW_ROLES.has(auth.identity.role),
      canRefresh: new Set([...CASE_WRITE_ROLES, 'REVIEWER']).has(auth.identity.role as 'ADMIN' | 'INVESTIGATOR' | 'REVIEWER'),
    }) });
  }
  if (!z.string().uuid().safeParse(parsed.data.case_id).success) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
  const result = await loadScreening(parsed.data.case_id, auth.identity.role);
  if ('error' in result) return result.error;
  return NextResponse.json({ data: result.data }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, new Set([...CASE_WRITE_ROLES, 'REVIEWER']));
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์สั่งสกรีนนิ่งหลักฐาน');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const parsed = evidenceScreeningRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'รหัสคดีไม่ถูกต้อง', 400);
  if (auth.identity.mode === 'demo') {
    const demoUrl = new URL(request.url);
    demoUrl.searchParams.set('case_id', parsed.data.case_id);
    return GET(new NextRequest(demoUrl, { headers: request.headers }));
  }
  if (!z.string().uuid().safeParse(parsed.data.case_id).success) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
  const supabase = await createServer();
  const refreshed = await supabase.rpc('refresh_evidence_screenings', { p_case_id: parsed.data.case_id });
  if (refreshed.error) return apiError(refreshed.error.message || 'SCREENING_REFRESH_FAILED', 'สกรีนนิ่งหลักฐานไม่สำเร็จ', 503);
  const result = await loadScreening(parsed.data.case_id, auth.identity.role);
  if ('error' in result) return result.error;
  return NextResponse.json({ data: result.data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
