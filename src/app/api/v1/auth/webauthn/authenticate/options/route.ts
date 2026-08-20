import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { createAuthenticationOptions, type StoredWebAuthnCredential } from '@/lib/webauthn-server';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  const origin = request.headers.get('origin') || undefined;

  if (auth.ok && auth.identity.mode === 'demo') {
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
  let userCreds: StoredWebAuthnCredential[] = [];

  if (auth.ok) {
    const { data: dbCreds } = await supabase
      .from('webauthn_credentials')
      .select('credential_id, public_key, counter, transports')
      .eq('profile_id', auth.identity.id);

    userCreds = (dbCreds || []).map((c) => ({
      id: c.credential_id,
      publicKey: c.public_key,
      counter: Number(c.counter),
      transports: c.transports as StoredWebAuthnCredential['transports'],
    }));
  }

  const options = await createAuthenticationOptions({
    allowCredentials: userCreds.length > 0 ? userCreds : undefined,
    requestOrigin: origin,
  });

  // Save challenge with 2-minute expiry
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  await supabase.from('webauthn_challenges').insert({
    profile_id: auth.ok ? auth.identity.id : null,
    challenge: options.challenge,
    type: 'AUTHENTICATION',
    expires_at: expiresAt,
  });

  return NextResponse.json({ data: options });
}
