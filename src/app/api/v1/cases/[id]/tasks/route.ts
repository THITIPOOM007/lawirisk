import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError } from '@/lib/api-errors';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeStaff(request, new Set(['INVESTIGATOR', 'REVIEWER', 'ADMIN', 'VIEWER']));
  if (!auth.ok) return apiError('UNAUTHORIZED', 'ไม่มีสิทธิ์เข้าถึงข้อมูลคดี', 401);

  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ data: [] });
  }

  try {
    const { createServiceClient } = await import('@/lib/supabase-server');
    const service = createServiceClient();
    const { data, error } = await service
      .from('investigation_tasks')
      .select('*')
      .eq('case_id', id)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return NextResponse.json({ data: [] });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
