import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServer } from '@/lib/supabase-server';

const adminRoles = new Set(['ADMIN']);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!hasSupabase) {
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
