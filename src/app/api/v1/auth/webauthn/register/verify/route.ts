import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { verifyRegistration } from '@/lib/webauthn-server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ต้องเข้าสู่ระบบก่อนยืนยันการลงทะเบียน Passkey');

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

  const { error: insertErr } = await supabase.from('webauthn_credentials').insert({
    profile_id: auth.identity.id,
    credential_id: credential.id,
    public_key: pubKeyBase64,
    counter: credential.counter,
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    transports: credential.transports || [],
    aaguid: aaguid || null,
    nickname,
  });

  if (insertErr) {
    return apiError('STORAGE_ERROR', 'บันทึกข้อมูลกุญแจความปลอดภัยไม่สำเร็จ', 500);
  }

  // Delete consumed challenge
  await supabase.from('webauthn_challenges').delete().eq('id', challengeRecord.id);

  // Log audit event
  await supabase.from('audit_logs').insert({
    profile_id: auth.identity.id,
    action: 'WEBAUTHN_CREDENTIAL_REGISTERED',
    details: {
      credential_id: credential.id,
      device_type: credentialDeviceType,
      nickname,
    },
  });

  return NextResponse.json({
    data: {
      verified: true,
      credentialId: credential.id,
      nickname,
    },
  });
}
