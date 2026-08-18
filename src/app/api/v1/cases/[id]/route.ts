import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { getCases, getEvidence } from '@/lib/demo-data';

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
