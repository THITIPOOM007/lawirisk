import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { authError } from '@/lib/api-errors';
import { getCases, getEntities } from '@/lib/demo-data';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูทะเบียนข้อมูล');
  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ data: { entities: getEntities(), cases: getCases() } });
  }
  const supabase = await createServer();
  const [entities, cases] = await Promise.all([
    supabase.from('extracted_entities').select('id,case_id,type,value,created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('cases').select('id,number,title,status,created_at').order('created_at', { ascending: false }).limit(200),
  ]);
  if (entities.error || cases.error) {
    return NextResponse.json({ error: { code: 'ENTITY_LIST_FAILED', message: 'โหลดทะเบียนข้อมูลไม่สำเร็จ' } }, { status: 503 });
  }
  return NextResponse.json({ data: { entities: entities.data, cases: cases.data } });
}
