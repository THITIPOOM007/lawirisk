import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServer } from '@/lib/supabase-server';
import { isDemoServerEnabled, isSupabaseServerConfigured } from '@/lib/runtime-config';

const adminRoles = new Set(['ADMIN']);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const hasSupabase = isSupabaseServerConfigured();

  if (!hasSupabase) {
    if (!isDemoServerEnabled()) redirect('/login?configuration=missing');
    const cookieStore = await cookies();
    const isLoggedIn = cookieStore.get('mock-auth-logged-in')?.value === 'true';
    const role = cookieStore.get('mock-auth-role')?.value || 'VIEWER';
    if (!isLoggedIn) redirect('/login');
    if (!adminRoles.has(role)) redirect('/');
    return children;
  }

  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !adminRoles.has(profile.role)) redirect('/');

  return children;
}
