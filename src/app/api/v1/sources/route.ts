import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { authError } from '@/lib/api-errors';
import { EXTERNAL_SOURCES } from '@/lib/external-sources';
import { INTAKE_READ_ROLES } from '@/lib/roles';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, INTAKE_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูแหล่งสืบค้นภายนอก');
  return NextResponse.json(
    { data: EXTERNAL_SOURCES },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
