import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { isSupabaseServiceConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(1024),
});

export async function POST(request: NextRequest) {
  try {
    if (!hasTrustedBrowserOrigin(request)) {
      return NextResponse.json(
        { success: false, error: 'คำขอไม่ได้มาจากหน้าบริการที่อนุญาต' },
        { status: 403 },
      );
    }

    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง' },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey || !isSupabaseServiceConfigured()) {
      return NextResponse.json(
        { success: false, error: 'ระบบยังไม่ได้ตั้งค่า Supabase Auth กรุณาติดต่อผู้ดูแลระบบ' },
        { status: 503 },
      );
    }

    const clientAddress = request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown';
    const limit = await consumeRateLimit({
      client: createServiceClient(),
      key: `auth-login:${clientAddress}:${email.toLowerCase()}`,
      limit: 10,
      windowSeconds: 300,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: 'พยายามเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const cookieStore = await cookies();
    const response = NextResponse.json({ success: true });
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return NextResponse.json(
        { success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง' },
        { status: 401 },
      );
    }

    return response;
  } catch (error: unknown) {
    console.error('Login route failed', { error: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json(
      { success: false, error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' },
      { status: 500 },
    );
  }
}
