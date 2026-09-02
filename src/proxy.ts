import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isDemoServerEnabled, isSupabaseServerConfigured } from '@/lib/runtime-config';

const protectedPrefixes = [
  '/intake',
  '/cases',
  '/evidence',
  '/review',
  '/entities',
  '/matches',
  '/reports',
  '/audit',
  '/automation',
  '/sources',
  '/universe',
  '/security',
  '/guide',
  '/satisfaction',
  '/admin',
];

const isProtectedPath = (pathname: string) =>
  pathname === '/' || protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSupabase = isSupabaseServerConfigured();

  if (!hasSupabase) {
    if (!isDemoServerEnabled()) {
      if (pathname !== '/login') {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('configuration', 'missing');
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.next();
    }
    const isDemoLoggedIn = request.cookies.get('mock-auth-logged-in')?.value === 'true';
    if (isProtectedPath(pathname) && !isDemoLoggedIn) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (pathname === '/login' && isDemoLoggedIn) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (isProtectedPath(pathname) && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return response;
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/intake/:path*',
    '/cases/:path*',
    '/evidence/:path*',
    '/review/:path*',
    '/entities/:path*',
    '/matches/:path*',
    '/reports/:path*',
    '/audit/:path*',
    '/automation/:path*',
    '/sources/:path*',
    '/universe/:path*',
    '/security/:path*',
    '/guide/:path*',
    '/satisfaction/:path*',
    '/admin/:path*',
  ],
};
