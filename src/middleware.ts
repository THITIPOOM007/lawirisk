import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  
  // Detect if Supabase environment variables are set
  const hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // If not in production Supabase mode, fallback to demo mode auth logic
  if (!hasSupabase) {
    const isMockLoggedIn = request.cookies.get('mock-auth-logged-in')?.value === 'true';
    const mockRole = request.cookies.get('mock-auth-role')?.value || 'VIEWER';

    // Protect administrative routes
    if (url.pathname.startsWith('/admin')) {
      if (!isMockLoggedIn || !['ADMIN', 'PLATFORM_ADMIN', 'ORG_ADMIN'].includes(mockRole)) {
        url.pathname = '/login';
        return NextResponse.redirect(url);
      }
    }

    // Protect general application routes
    const isProtectedRoute = 
      url.pathname.startsWith('/intake') ||
      url.pathname.startsWith('/cases') ||
      url.pathname.startsWith('/evidence') ||
      url.pathname.startsWith('/review') ||
      url.pathname.startsWith('/entities') ||
      url.pathname.startsWith('/matches') ||
      url.pathname.startsWith('/reports') ||
      url.pathname.startsWith('/audit');

    if (isProtectedRoute && !isMockLoggedIn) {
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  // Real Supabase Auth mode
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isProtectedRoute = 
    url.pathname.startsWith('/intake') ||
    url.pathname.startsWith('/cases') ||
    url.pathname.startsWith('/evidence') ||
    url.pathname.startsWith('/review') ||
    url.pathname.startsWith('/entities') ||
    url.pathname.startsWith('/matches') ||
    url.pathname.startsWith('/reports') ||
    url.pathname.startsWith('/audit') ||
    url.pathname.startsWith('/admin');

  if (isProtectedRoute && !user) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Check admin rights for admin routes
  if (url.pathname.startsWith('/admin') && user) {
    // Fetch profile role from database
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['ADMIN', 'PLATFORM_ADMIN', 'ORG_ADMIN'].includes(profile.role)) {
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

// Matching paths
export const config = {
  matcher: [
    '/intake/:path*',
    '/cases/:path*',
    '/evidence/:path*',
    '/review/:path*',
    '/entities/:path*',
    '/matches/:path*',
    '/reports/:path*',
    '/audit/:path*',
    '/admin/:path*',
  ],
};
