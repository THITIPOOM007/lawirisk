import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { getCases, getEntities, getRelationships } from '@/lib/demo-data';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

const caseIdSchema = z.string().uuid();

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'บัญชีนี้ไม่มีสิทธิ์สร้างรายงาน');

  const caseId = request.nextUrl.searchParams.get('case_id')?.trim() || '';
  if (!caseId) return apiError('CASE_ID_REQUIRED', 'กรุณาเลือกสำนวนคดี', 400);

  if (auth.identity.mode === 'demo') {
    if (!getCases().some((item) => item.id === caseId)) return apiError('NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
    const sourceMentionCount = getEntities().filter((item) => item.case_id === caseId).length;
    const relationshipReferenceCount = getRelationships().filter((item) => item.case_id === caseId && item.status === 'VERIFIED').length;
    return NextResponse.json({
      data: {
        eligible: true,
        code: 'READY',
        message: 'ข้อมูลสาธิตพร้อมสร้างรายงาน',
        clean_evidence_count: 1,
        source_mention_count: sourceMentionCount,
        relationship_reference_count: relationshipReferenceCount,
      },
    });
  }

  if (!caseIdSchema.safeParse(caseId).success) return apiError('NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
  const supabase = await createServer();
  const [caseResult, usableEvidenceResult, entitiesResult, relationshipsResult] = await Promise.all([
    supabase.from('cases').select('id').eq('id', caseId).maybeSingle(),
    supabase.from('evidence_files').select('*', { count: 'exact', head: true }).eq('case_id', caseId).eq('upload_state', 'STORED').in('malware_scan_status', ['CLEAN', 'NOT_SCANNED']),
    supabase.from('extracted_entities').select('id').eq('case_id', caseId),
    supabase.from('entity_relationships').select('id').eq('case_id', caseId).eq('status', 'VERIFIED'),
  ]);

  if (caseResult.error || !caseResult.data) return apiError('NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404);
  if (usableEvidenceResult.error || entitiesResult.error || relationshipsResult.error) {
    return apiError('REPORT_READINESS_FAILED', 'ตรวจความพร้อมสำหรับสร้างรายงานไม่สำเร็จ', 503);
  }

  const entityIds = (entitiesResult.data || []).map((item) => item.id);
  const relationshipIds = (relationshipsResult.data || []).map((item) => item.id);
  const [mentionsResult, referencesResult] = await Promise.all([
    entityIds.length
      ? supabase.from('entity_mentions').select('*', { count: 'exact', head: true }).in('entity_id', entityIds)
      : Promise.resolve({ count: 0, error: null }),
    relationshipIds.length
      ? supabase.from('relationship_references').select('*', { count: 'exact', head: true }).in('relationship_id', relationshipIds)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  if (mentionsResult.error || referencesResult.error) {
    return apiError('REPORT_READINESS_FAILED', 'ตรวจแหล่งอ้างอิงสำหรับรายงานไม่สำเร็จ', 503);
  }

  const usableEvidenceCount = usableEvidenceResult.count || 0;
  const sourceMentionCount = mentionsResult.count || 0;
  const relationshipReferenceCount = referencesResult.count || 0;
  const eligible = sourceMentionCount > 0 || relationshipReferenceCount > 0;
  const code = eligible
    ? 'READY'
    : usableEvidenceCount === 0
      ? 'USABLE_EVIDENCE_REQUIRED'
      : 'VERIFIED_SOURCE_REQUIRED';
  const message = eligible
    ? 'พร้อมสร้างรายงานที่ตรวจสอบย้อนกลับได้'
    : usableEvidenceCount === 0
      ? 'ต้องมีหลักฐานที่จัดเก็บและผ่านการตรวจขนาด ชนิด และโครงสร้างอย่างน้อย 1 ไฟล์ก่อน'
      : 'ต้องสกัดข้อมูลและรับรอง source mention หรือ relationship reference อย่างน้อย 1 รายการก่อน';

  return NextResponse.json({
    data: {
      eligible,
      code,
      message,
      usable_evidence_count: usableEvidenceCount,
      source_mention_count: sourceMentionCount,
      relationship_reference_count: relationshipReferenceCount,
    },
  });
}
