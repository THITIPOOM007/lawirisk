import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { verifyAuthentication } from '@/lib/webauthn-server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ต้องเข้าสู่ระบบก่อนใช้ Passkey');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const body = await request.json().catch(() => null);

  if (!body || !body.response) {
    return apiError('INVALID_REQUEST', 'ข้อมูลยืนยันตัวตน Passkey ไม่ครบถ้วน', 400);
  }

  const response = body.response as AuthenticationResponseJSON;

  if (auth.identity.mode === 'demo') {
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
    .eq('profile_id', auth.identity.id)
    .maybeSingle();

  if (credErr || !dbCred) {
    return apiError('CREDENTIAL_NOT_FOUND', 'ไม่พบกุญแจความปลอดภัยนี้ในระบบ', 404);
  }

  // Retrieve matching active challenge
  const { data: challengeRecord, error: challengeErr } = await supabase
    .from('webauthn_challenges')
    .select('id, challenge, expires_at')
    .eq('profile_id', auth.identity.id)
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

  const stepUpToken = crypto.randomBytes(32).toString('base64url');
  const stepUpHash = crypto.createHash('sha256').update(stepUpToken).digest('hex');
  const { data: completed, error: completeError } = await supabase.rpc('complete_webauthn_authentication', {
    p_credential_id: dbCred.id,
    p_challenge_id: challengeRecord.id,
    p_expected_counter: Number(dbCred.counter),
    p_new_counter: newCounter,
    p_token_hash: stepUpHash,
    p_purpose: 'REVIEW_CONFIRMATION',
  });
  if (completeError || completed !== true) {
    return apiError('WEBAUTHN_STATE_COMMIT_FAILED', 'ยืนยันลายเซ็นแล้วแต่บันทึกสถานะความปลอดภัยไม่สำเร็จ กรุณาลองใหม่', 503);
  }

  const result = NextResponse.json({
    data: {
      verified: true,
      credentialId: dbCred.credential_id,
      profileId: dbCred.profile_id,
    },
  });
  result.cookies.set('lawirisk-step-up', stepUpToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/review',
    maxAge: 5 * 60,
  });
  return result;
}
