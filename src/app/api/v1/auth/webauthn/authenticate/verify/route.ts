import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { verifyAuthentication } from '@/lib/webauthn-server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  const body = await request.json().catch(() => null);

  if (!body || !body.response) {
    return apiError('INVALID_REQUEST', 'ข้อมูลยืนยันตัวตน Passkey ไม่ครบถ้วน', 400);
  }

  const response = body.response as AuthenticationResponseJSON;

  if (auth.ok && auth.identity.mode === 'demo') {
    return NextResponse.json({
      data: {
        verified: true,
        credentialId: response.id || 'demo-auth-cred',
        mode: 'demo',
        token: 'demo-stepup-token-' + Date.now(),
      },
    });
  }

  const supabase = await createServer();

  // Find stored credential by credential ID
  const { data: dbCred, error: credErr } = await supabase
    .from('webauthn_credentials')
    .select('id, profile_id, credential_id, public_key, counter, transports')
    .eq('credential_id', response.id)
    .maybeSingle();

  if (credErr || !dbCred) {
    return apiError('CREDENTIAL_NOT_FOUND', 'ไม่พบกุญแจความปลอดภัยนี้ในระบบ', 404);
  }

  // Retrieve matching active challenge
  const { data: challengeRecord, error: challengeErr } = await supabase
    .from('webauthn_challenges')
    .select('id, challenge, expires_at')
    .eq('type', 'AUTHENTICATION')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (challengeErr || !challengeRecord) {
    return apiError('CHALLENGE_EXPIRED', 'Challenge หมดอายุ กรุณาสแกนยืนยันตัวตนใหม่อีกครั้ง', 400);
  }

  const origin = request.headers.get('origin') || undefined;
  const publicKeyBuffer = Buffer.from(dbCred.public_key, 'base64url');

  const verification = await verifyAuthentication({
    response,
    expectedChallenge: challengeRecord.challenge,
    credential: {
      id: dbCred.credential_id,
      publicKey: publicKeyBuffer,
      counter: Number(dbCred.counter),
      transports: dbCred.transports as unknown as undefined,
    },
    requestOrigin: origin,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    return apiError('VERIFICATION_FAILED', 'ลายเซ็นดิจิทัลของ Passkey ไม่ถูกต้อง', 401);
  }

  const { newCounter } = verification.authenticationInfo;

  // Update credential counter & last_used_at to prevent replay attacks
  await supabase
    .from('webauthn_credentials')
    .update({
      counter: newCounter,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dbCred.id);

  // Clean up used challenge
  await supabase.from('webauthn_challenges').delete().eq('id', challengeRecord.id);

  // Log audit event
  await supabase.from('audit_logs').insert({
    profile_id: dbCred.profile_id,
    action: 'WEBAUTHN_AUTHENTICATION_VERIFIED',
    details: {
      credential_id: dbCred.credential_id,
      verified_at: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    data: {
      verified: true,
      credentialId: dbCred.credential_id,
      profileId: dbCred.profile_id,
    },
  });
}
