import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { authError, apiError } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { createAuthenticationOptions, type StoredWebAuthnCredential } from '@/lib/webauthn-server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ต้องเข้าสู่ระบบก่อนใช้ Passkey');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const origin = request.headers.get('origin') || undefined;

  if (auth.identity.mode === 'demo') {
    return NextResponse.json({
      data: {
        challenge: 'demo-auth-challenge-' + Date.now(),
        timeout: 60000,
        rpId: 'localhost',
        userVerification: 'required',
        mode: 'demo',
      },
    });
  }

  const supabase = await createServer();
  const { data: dbCreds, error: credentialError } = await supabase
    .from('webauthn_credentials')
    .select('credential_id, public_key, counter, transports')
    .eq('profile_id', auth.identity.id);
  if (credentialError) return apiError('WEBAUTHN_LOOKUP_FAILED', 'โหลดข้อมูล Passkey ไม่สำเร็จ', 503);

  const userCreds: StoredWebAuthnCredential[] = (dbCreds || []).map((c) => ({
    id: c.credential_id,
    publicKey: c.public_key,
    counter: Number(c.counter),
    transports: c.transports as StoredWebAuthnCredential['transports'],
  }));

  const options = await createAuthenticationOptions({
    allowCredentials: userCreds.length > 0 ? userCreds : undefined,
    requestOrigin: origin,
  });

  // Save challenge with 2-minute expiry
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const { error: challengeError } = await supabase.from('webauthn_challenges').insert({
    profile_id: auth.identity.id,
    challenge: options.challenge,
    type: 'AUTHENTICATION',
    expires_at: expiresAt,
  });
  if (challengeError) return apiError('CHALLENGE_STORAGE_FAILED', 'เริ่มการยืนยัน Passkey ไม่สำเร็จ', 503);

  return NextResponse.json({ data: options });
}
