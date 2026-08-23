import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError } from '@/lib/api-errors';
import { createServer } from '@/lib/supabase-server';
import { STAFF_READ_ROLES } from '@/lib/roles';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return apiError(auth.code, 'ไม่มีสิทธิ์เข้าถึงข้อมูลคดี', auth.status);

  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ data: [] });
  }

  if (!z.string().uuid().safeParse(id).success) {
    return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดีหรือคุณไม่มีสิทธิ์เข้าถึง', 404);
  }

  try {
    const supabase = await createServer();
    const { data: accessibleCase, error: caseError } = await supabase
      .from('cases')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (caseError) return apiError('CASE_LOOKUP_FAILED', 'ตรวจสอบสิทธิ์สำนวนคดีไม่สำเร็จ', 503);
    if (!accessibleCase) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดีหรือคุณไม่มีสิทธิ์เข้าถึง', 404);

    const { data, error } = await supabase
      .from('investigation_tasks')
      .select('*')
      .eq('case_id', id)
      .order('created_at', { ascending: false });

    if (error) return apiError('TASKS_LOOKUP_FAILED', 'โหลดรายการงานสืบสวนไม่สำเร็จ', 503);
    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Investigation tasks lookup failed', { error: error instanceof Error ? error.name : 'UnknownError' });
    return apiError('TASKS_LOOKUP_FAILED', 'โหลดรายการงานสืบสวนไม่สำเร็จ', 503);
  }
}
