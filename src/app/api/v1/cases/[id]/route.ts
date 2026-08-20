import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { CASE_WRITE_ROLES, STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { getCases, getEvidence } from '@/lib/demo-data';
import { apiError } from '@/lib/api-errors';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: 'ไม่มีสิทธิ์ดูสำนวนคดี' } }, { status: auth.status });
  const { id } = await context.params;
  if (auth.identity.mode === 'demo') {
    const caseRecord = getCases().find((item) => item.id === id);
    if (!caseRecord) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบสำนวนคดี' } }, { status: 404 });
    const evidence = getEvidence().filter((item) => item.case_id === id).map((item) => ({
      id: item.id, case_id: item.case_id, filename: item.filename, file_size: item.file_size,
      mime_type: item.mime_type, sha256: item.sha256, status: item.status, upload_state: item.upload_state,
      malware_scan_status: item.malware_scan_status, created_by: item.created_by, created_at: item.created_at,
    }));
    return NextResponse.json({ data: { case: caseRecord, evidence } });
  }
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบสำนวนคดี' } }, { status: 404 });

  const supabase = await createServer();
  const [caseResult, evidenceResult] = await Promise.all([
    supabase.from('cases').select('*').eq('id', id).maybeSingle(),
    supabase.from('evidence_files').select('id,case_id,filename,file_size,mime_type,sha256,status,upload_state,malware_scan_status,created_by,created_at').eq('case_id', id).order('created_at', { ascending: false }),
  ]);
  if (caseResult.error || !caseResult.data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง' } }, { status: 404 });
  if (evidenceResult.error) return NextResponse.json({ error: { code: 'CASE_DETAIL_FAILED', message: 'โหลดบัญชีหลักฐานไม่สำเร็จ' } }, { status: 503 });
  return NextResponse.json({ data: { case: caseResult.data, evidence: evidenceResult.data } });
}

const updateCaseSchema = z.object({
  title: z.string().trim().min(5).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  jurisdiction_region: z.string().trim().max(100).optional(),
  jurisdiction_agency: z.string().trim().max(100).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: 'ไม่มีสิทธิ์แก้ไขสำนวนคดี' } }, { status: auth.status });
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') return apiError('DEMO_WRITE_UNAVAILABLE', 'โหมดสาธิตไม่บันทึกการแก้ไข', 409);
  
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบสำนวนคดี', 404);

  const parsed = updateCaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'ข้อมูลไม่ถูกต้อง', 400, undefined, parsed.error.flatten().fieldErrors);
  if (Object.keys(parsed.data).length === 0) return apiError('INVALID_REQUEST', 'ไม่ได้ระบุข้อมูลที่ต้องการแก้ไข', 400);

  const supabase = await createServer();
  
  // Note: For simplicity, assuming RLS allows update if they are member or admin.
  // The update will fail if RLS rejects it.
  const { data, error } = await supabase
    .from('cases')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !data) {
    return apiError('UPDATE_FAILED', 'แก้ไขสำนวนคดีไม่สำเร็จ (อาจไม่มีสิทธิ์หรือคดีถูกปิดแล้ว)', 403);
  }

  return NextResponse.json({ data });
}
