import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

const updateRelationshipSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, REVIEW_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์อนุมัติความสัมพันธ์');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') return apiError('DEMO_WRITE_UNAVAILABLE', 'โหมดสาธิตไม่บันทึกความสัมพันธ์', 409);

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบความสัมพันธ์', 404);

  const parsed = updateRelationshipSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'ข้อมูลไม่ถูกต้อง', 400, undefined, parsed.error.flatten().fieldErrors);

  const supabase = await createServer();
  const { data, error } = await supabase
    .from('entity_relationships')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !data) {
    return apiError('UPDATE_FAILED', 'อัพเดตสถานะความสัมพันธ์ไม่สำเร็จ', 403);
  }

  return NextResponse.json({ data });
}
