import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { authError } from '@/lib/api-errors';
import { getEvidence } from '@/lib/demo-data';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูทะเบียนหลักฐาน');
  if (auth.identity.mode === 'demo') return NextResponse.json({ data: getEvidence().map((item) => ({
    id: item.id, case_id: item.case_id, filename: item.filename, file_size: item.file_size,
    mime_type: item.mime_type, sha256: item.sha256, status: item.status, upload_state: item.upload_state,
    malware_scan_status: item.malware_scan_status, created_by: item.created_by, created_at: item.created_at,
  })) });

  const supabase = await createServer();
  const { data, error } = await supabase
    .from('evidence_files')
    .select('id,case_id,filename,file_size,mime_type,sha256,status,upload_state,malware_scan_status,created_by,created_at,uploaded_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: { code: 'EVIDENCE_LIST_FAILED', message: 'โหลดทะเบียนหลักฐานไม่สำเร็จ' } }, { status: 503 });
  return NextResponse.json({ data });
}
