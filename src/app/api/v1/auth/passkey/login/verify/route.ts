import { createServerClient } from '@supabase/ssr';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { isSupabaseServiceConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyAuthentication } from '@/lib/webauthn-server';

const schema = z.object({
  flowId: z.string().uuid(),
  response: z.object({ id: z.string().min(1).max(2048) }).passthrough(),
});

function clientAddress(request: NextRequest) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

const invalidCredential = () => apiError('PASSKEY_LOGIN_FAILED', 'ไม่สามารถยืนยัน Passkey สำหรับบัญชีนี้ได้', 401);

export async function POST(request: NextRequest) {
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'ข้อมูลยืนยัน Passkey ไม่ครบถ้วน', 400);
  if (!isSupabaseServiceConfigured()) return apiError('AUTH_NOT_CONFIGURED', 'ระบบ Passkey ยังไม่ได้เชื่อมต่อฐานข้อมูลจริง', 503);

  const service = createServiceClient();
  const address = clientAddress(request);
  const limit = await consumeRateLimit({ client: service, key: `passkey-login-verify:${address}`, limit: 12, windowSeconds: 300 });
  if (!limit.allowed) return apiError('RATE_LIMITED', 'ยืนยันตัวตนถี่เกินไป กรุณารอสักครู่', 429);

  const { data: challenge } = await service
    .from('webauthn_challenges')
    .select('id, profile_id, challenge, expires_at')
    .eq('id', parsed.data.flowId)
    .eq('type', 'LOGIN')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!challenge?.profile_id) return invalidCredential();

  const { data: credential } = await service
    .from('webauthn_credentials')
    .select('id, profile_id, credential_id, public_key, counter, transports')
    .eq('credential_id', parsed.data.response.id)
    .eq('profile_id', challenge.profile_id)
    .maybeSingle();
  if (!credential) return invalidCredential();

  const verification = await verifyAuthentication({
    response: parsed.data.response as unknown as AuthenticationResponseJSON,
    expectedChallenge: challenge.challenge,
    credential: {
      id: credential.credential_id,
      publicKey: Buffer.from(credential.public_key, 'base64url'),
      counter: Number(credential.counter),
      transports: credential.transports,
    },
    requestOrigin: request.headers.get('origin') || undefined,
  }).catch(() => null);
  if (!verification?.verified || !verification.authenticationInfo) return invalidCredential();

  const { data: committed, error: commitError } = await service.rpc('complete_webauthn_login', {
    p_profile_id: challenge.profile_id,
    p_credential_id: credential.id,
    p_challenge_id: challenge.id,
    p_expected_counter: Number(credential.counter),
    p_new_counter: verification.authenticationInfo.newCounter,
    p_ip_address: address,
  });
  if (commitError || committed !== true) return apiError('PASSKEY_STATE_COMMIT_FAILED', 'บันทึกผลการยืนยัน Passkey ไม่สำเร็จ กรุณาลองใหม่', 503);

  const { data: profile, error: profileError } = await service.from('profiles').select('email').eq('id', challenge.profile_id).single();
  if (profileError || !profile?.email) return apiError('SESSION_ISSUE_FAILED', 'สร้างเซสชันผู้ใช้ไม่สำเร็จ', 503);
  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: 'magiclink', email: profile.email });
  if (linkError || !link.properties.hashed_token) return apiError('SESSION_ISSUE_FAILED', 'สร้างเซสชันผู้ใช้ไม่สำเร็จ', 503);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();
  const result = NextResponse.json({ data: { verified: true } });
  const sessionClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options);
        result.cookies.set(name, value, options);
      }),
    },
  });
  const { error: sessionError } = await sessionClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessionError) return apiError('SESSION_ISSUE_FAILED', 'ยืนยัน Passkey สำเร็จแต่สร้างเซสชันไม่สำเร็จ', 503);
  return result;
}
