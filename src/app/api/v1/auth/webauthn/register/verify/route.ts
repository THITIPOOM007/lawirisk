import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { verifyRegistration } from '@/lib/webauthn-server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ต้องเข้าสู่ระบบก่อนยืนยันการลงทะเบียน Passkey');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);

  const body = await request.json().catch(() => null);
  if (!body || !body.response) {
    return apiError('INVALID_REQUEST', 'ข้อมูลการลงทะเบียน Passkey ไม่ครบถ้วน', 400);
  }

  if (auth.identity.mode === 'demo') {
    return NextResponse.json({
      data: {
        verified: true,
        credentialId: 'demo-cred-' + Date.now(),
        mode: 'demo',
        message: 'จำลองการลงทะเบียน Passkey สำเร็จ (Demo Mode)',
      },
    });
  }

  const supabase = await createServer();
  const response = body.response as RegistrationResponseJSON;
  const nickname = typeof body.nickname === 'string' ? body.nickname : 'Hardware Authenticator';

  // Retrieve matching active challenge
  const { data: challengeRecord, error: challengeErr } = await supabase
    .from('webauthn_challenges')
    .select('id, challenge, expires_at')
    .eq('profile_id', auth.identity.id)
    .eq('type', 'REGISTRATION')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (challengeErr || !challengeRecord) {
    return apiError('CHALLENGE_EXPIRED', 'Challenge หมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง', 400);
  }

  const origin = request.headers.get('origin') || undefined;
  const verification = await verifyRegistration({
    response,
    expectedChallenge: challengeRecord.challenge,
    requestOrigin: origin,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return apiError('VERIFICATION_FAILED', 'การตรวจสอบกุญแจฮาร์ดแวร์ล้มเหลว', 400);
  }

  const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;

  // Store Base64-encoded public key and credential metadata
  const pubKeyBase64 = Buffer.from(credential.publicKey).toString('base64url');

  const { data: completed, error: completeError } = await supabase.rpc('complete_webauthn_registration', {
    p_challenge_id: challengeRecord.id,
    p_credential_id: credential.id,
    p_public_key: pubKeyBase64,
    p_counter: credential.counter,
    p_device_type: credentialDeviceType,
    p_backed_up: credentialBackedUp,
    p_transports: credential.transports || [],
    p_aaguid: aaguid || null,
    p_nickname: nickname,
  });
  if (completeError || completed !== true) {
    return apiError('STORAGE_ERROR', 'บันทึกข้อมูลกุญแจความปลอดภัยไม่สำเร็จ', 503);
  }

  return NextResponse.json({
    data: {
      verified: true,
      credentialId: credential.id,
      nickname,
    },
  });
}
