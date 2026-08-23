import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { isSupabaseServiceConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';
import { createAuthenticationOptions, type StoredWebAuthnCredential } from '@/lib/webauthn-server';

const schema = z.object({ email: z.string().trim().email().max(254) });

function clientAddress(request: NextRequest) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function POST(request: NextRequest) {
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'กรุณากรอกอีเมลผู้ใช้งานให้ถูกต้อง', 400);
  if (!isSupabaseServiceConfigured()) return apiError('AUTH_NOT_CONFIGURED', 'ระบบ Passkey ยังไม่ได้เชื่อมต่อฐานข้อมูลจริง', 503);

  const email = parsed.data.email.toLowerCase();
  const service = createServiceClient();
  const limit = await consumeRateLimit({
    client: service,
    key: `passkey-login-options:${clientAddress(request)}:${email}`,
    limit: 8,
    windowSeconds: 300,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'เริ่มสแกนถี่เกินไป กรุณารอสักครู่' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const { data: profile } = await service.from('profiles').select('id').eq('email', email).maybeSingle();
  const { data: rows } = profile
    ? await service.from('webauthn_credentials').select('credential_id, public_key, counter, transports').eq('profile_id', profile.id)
    : { data: null };
  const credentials: StoredWebAuthnCredential[] = (rows || []).map((item) => ({
    id: item.credential_id,
    publicKey: item.public_key,
    counter: Number(item.counter),
    transports: item.transports as StoredWebAuthnCredential['transports'],
  }));
  // Keep the response shape indistinguishable for unknown users. A random
  // allow-list ID cannot authenticate, while valid users receive their keys.
  const allowCredentials = credentials.length > 0 ? credentials : [{
    id: crypto.randomBytes(32).toString('base64url'),
    publicKey: '',
    counter: 0,
    transports: [],
  }];
  const options = await createAuthenticationOptions({
    allowCredentials,
    requestOrigin: request.headers.get('origin') || undefined,
  });
  const { data: challenge, error } = await service.from('webauthn_challenges').insert({
    profile_id: profile?.id || null,
    challenge: options.challenge,
    type: 'LOGIN',
    expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
  }).select('id').single();
  if (error || !challenge) return apiError('CHALLENGE_STORAGE_FAILED', 'เริ่มการสแกน Passkey ไม่สำเร็จ', 503);

  return NextResponse.json({ data: { flowId: challenge.id, options } });
}
