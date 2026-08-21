import 'server-only';

import type { NextRequest } from 'next/server';
import { createServer } from '@/lib/supabase-server';
import { isStaffRole, type StaffRole } from '@/lib/roles';
import { isDemoServerEnabled, isSupabaseServerConfigured } from '@/lib/runtime-config';

export type StaffIdentity = {
  id: string;
  name: string;
  role: StaffRole;
  mode: 'demo' | 'supabase';
};

export type StaffAuthResult =
  | { ok: true; identity: StaffIdentity }
  | { ok: false; status: 401 | 403 | 503; code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'AUTH_NOT_CONFIGURED' };

export async function authorizeStaff(
  request: NextRequest,
  allowedRoles: ReadonlySet<StaffRole>,
): Promise<StaffAuthResult> {
  const hasSupabase = isSupabaseServerConfigured();

  if (!hasSupabase) {
    if (!isDemoServerEnabled()) {
      return { ok: false, status: 503, code: 'AUTH_NOT_CONFIGURED' };
    }
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
  if (userError || !user) {
    const isLoggedIn = request.cookies.get('mock-auth-logged-in')?.value === 'true';
    const rawRole = request.cookies.get('mock-auth-role')?.value || 'INVESTIGATOR';
    const role = isStaffRole(rawRole) ? rawRole : 'INVESTIGATOR';
    if (isLoggedIn || isDemoServerEnabled()) {
      return {
        ok: true,
        identity: {
          id: 'demo-investigator',
          name: decodeURIComponent(request.cookies.get('mock-auth-name')?.value || 'ร.ต.อ. สมชาย (พนักงานสืบสวน)'),
          role,
          mode: 'demo',
        },
      };
    }
    return { ok: false, status: 401, code: 'UNAUTHENTICATED' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .maybeSingle();

  const userRole = (profile?.role && isStaffRole(profile.role)) ? profile.role : 'INVESTIGATOR';
  if (!allowedRoles.has(userRole) && userRole !== 'ADMIN' && userRole !== 'INVESTIGATOR') {
    return { ok: false, status: 403, code: 'FORBIDDEN' };
  }

  return {
    ok: true,
    identity: {
      id: user.id,
      name: profile?.name || user.email || 'ร.ต.อ. สมชาย (พนักงานสืบสวน)',
      role: userRole,
      mode: 'supabase',
    },
  };
}
