import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError } from '@/lib/api-errors';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeStaff(request, new Set(['INVESTIGATOR', 'REVIEWER', 'ADMIN', 'VIEWER']));
  if (!auth.ok) return apiError('UNAUTHORIZED', 'ไม่มีสิทธิ์เข้าถึงข้อมูลคดี', 401);

  const supabase = await createServer();
  const { data, error } = await supabase
    .from('investigation_tasks')
    .select('*, extracted_entities(candidate_value, entity_type)')
    .eq('case_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return apiError('DATABASE_ERROR', 'ดึงข้อมูลงานสืบสวนไม่สำเร็จ', 500);
  }

  return NextResponse.json({ data });
}
