import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { authError } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { createRegistrationOptions, type StoredWebAuthnCredential } from '@/lib/webauthn-server';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ต้องเข้าสู่ระบบก่อนลงทะเบียน Passkey');

  if (auth.identity.mode === 'demo') {
    return NextResponse.json({
      data: {
        challenge: 'demo-registration-challenge-' + Date.now(),
        rp: { name: 'LawiRisk SSK Demo', id: 'localhost' },
        user: { id: auth.identity.id, name: auth.identity.name, displayName: auth.identity.name },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
        timeout: 60000,
        mode: 'demo',
      },
    });
  }

  const supabase = await createServer();
  const { data: existingCreds } = await supabase
    .from('webauthn_credentials')
    .select('credential_id, public_key, counter, transports')
    .eq('profile_id', auth.identity.id);

  const mappedCreds: StoredWebAuthnCredential[] = (existingCreds || []).map((c) => ({
    id: c.credential_id,
    publicKey: c.public_key,
    counter: Number(c.counter),
    transports: c.transports as StoredWebAuthnCredential['transports'],
  }));

  const origin = request.headers.get('origin') || undefined;
  const options = await createRegistrationOptions({
    userId: auth.identity.id,
    userEmail: `${auth.identity.name.replace(/\s+/g, '.').toLowerCase()}@lawirisk.ssk.gov.th`,
    userName: auth.identity.name,
    existingCredentials: mappedCreds,
    requestOrigin: origin,
  });

  // Save challenge to webauthn_challenges table with 2-minute expiry
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  await supabase.from('webauthn_challenges').insert({
    profile_id: auth.identity.id,
    challenge: options.challenge,
    type: 'REGISTRATION',
    expires_at: expiresAt,
  });

  return NextResponse.json({ data: options });
}
