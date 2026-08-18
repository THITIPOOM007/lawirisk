import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { authError } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่สามารถอ่านข้อมูลผู้ใช้ได้');
  return NextResponse.json({ data: { id: auth.identity.id, name: auth.identity.name, role: auth.identity.role, mode: auth.identity.mode } });
}
