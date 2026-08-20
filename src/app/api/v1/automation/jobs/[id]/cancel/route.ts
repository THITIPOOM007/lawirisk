import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { ADMIN_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, ADMIN_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ยกเลิกงานอัตโนมัติ');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') return apiError('DEMO_WRITE_UNAVAILABLE', 'โหมดสาธิตไม่สามารถยกเลิกงานอัตโนมัติได้', 409);

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบงานอัตโนมัติ', 404);

  const supabase = await createServer();
  const { data, error } = await supabase.rpc('cancel_automation_job', {
    p_job_id: id,
  });

  if (error) {
    return apiError('CANCEL_FAILED', error.message || 'ยกเลิกงานไม่สำเร็จ', 409);
  }

  return NextResponse.json({ success: true, data });
}
