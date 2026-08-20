import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { CASE_WRITE_ROLES, STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูความสัมพันธ์');
  
  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get('case_id');
  if (!caseId || !z.string().uuid().safeParse(caseId).success) {
    return apiError('INVALID_REQUEST', 'กรุณาระบุรหัสคดี (case_id)', 400);
  }

  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ data: [] });
  }

  const supabase = await createServer();
  const { data, error } = await supabase
    .from('entity_relationships')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) return apiError('FETCH_FAILED', 'โหลดความสัมพันธ์ไม่สำเร็จ', 503);
  return NextResponse.json({ data });
}

const relationshipSchema = z.object({
  case_id: z.string().uuid(),
  source_entity_id: z.string().uuid(),
  target_entity_id: z.string().uuid(),
  relationship_type: z.string().min(1).max(50),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CONFIRMED']),
});

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์สร้างความสัมพันธ์');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') return apiError('DEMO_WRITE_UNAVAILABLE', 'โหมดสาธิตไม่บันทึกความสัมพันธ์', 409);

  const parsed = relationshipSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'ข้อมูลความสัมพันธ์ไม่ถูกต้อง', 400, undefined, parsed.error.flatten().fieldErrors);

  const supabase = await createServer();
  const { data, error } = await supabase
    .from('entity_relationships')
    .insert({
      case_id: parsed.data.case_id,
      source_entity_id: parsed.data.source_entity_id,
      target_entity_id: parsed.data.target_entity_id,
      relationship_type: parsed.data.relationship_type,
      confidence: parsed.data.confidence,
      status: 'PROPOSED',
    })
    .select()
    .single();

  if (error || !data) {
    return apiError('INSERT_FAILED', 'สร้างความสัมพันธ์ไม่สำเร็จ', 403);
  }

  return NextResponse.json({ data }, { status: 201 });
}
