import 'server-only';

import type { NextRequest } from 'next/server';
import { createServer } from '@/lib/supabase-server';
import { isStaffRole, type StaffRole } from '@/lib/roles';

export type StaffIdentity = {
  id: string;
  name: string;
  role: StaffRole;
  mode: 'demo' | 'supabase';
};

export type StaffAuthResult =
  | { ok: true; identity: StaffIdentity }
  | { ok: false; status: 401 | 403; code: 'UNAUTHENTICATED' | 'FORBIDDEN' };

export async function authorizeStaff(
  request: NextRequest,
  allowedRoles: ReadonlySet<StaffRole>,
): Promise<StaffAuthResult> {
  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!hasSupabase) {
    const isLoggedIn = request.cookies.get('mock-auth-logged-in')?.value === 'true';
    if (!isLoggedIn) return { ok: false, status: 401, code: 'UNAUTHENTICATED' };
    const rawRole = request.cookies.get('mock-auth-role')?.value || 'VIEWER';
    const role = isStaffRole(rawRole) ? rawRole : 'VIEWER';
    if (!allowedRoles.has(role)) return { ok: false, status: 403, code: 'FORBIDDEN' };
    return {
      ok: true,
      identity: {
        id: 'demo-user',
        name: decodeURIComponent(request.cookies.get('mock-auth-name')?.value || 'เจ้าหน้าที่สาธิต'),
        role,
        mode: 'demo',
      },
    };
  }

  const supabase = await createServer();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, status: 401, code: 'UNAUTHENTICATED' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !isStaffRole(profile.role) || !allowedRoles.has(profile.role)) {
    return { ok: false, status: 403, code: 'FORBIDDEN' };
  }

  return {
    ok: true,
    identity: {
      id: user.id,
      name: profile.name || user.email || 'เจ้าหน้าที่',
      role: profile.role,
      mode: 'supabase',
    },
  };
}
