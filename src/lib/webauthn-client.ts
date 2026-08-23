'use client';

import {
  startRegistration,
  startAuthentication,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

export interface BiometricVerificationResult {
  success: boolean;
  method: 'WINDOWS_HELLO' | 'TOUCH_ID' | 'FACE_ID' | 'SECURITY_KEY' | 'SIMULATED_PASSKEY';
  verifiedAt: string;
  credentialId?: string;
  error?: string;
}

export interface PasskeyRegistrationResult {
  success: boolean;
  credentialId?: string;
  nickname?: string;
  error?: string;
}

export interface PasskeyLoginResult {
  success: boolean;
  error?: string;
}

export async function loginWithPasskey(email: string): Promise<PasskeyLoginResult> {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      throw new Error('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ Passkey');
    }
    const optionsResponse = await fetch('/api/v1/auth/passkey/login/options', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const optionsBody = await optionsResponse.json().catch(() => null);
    if (!optionsResponse.ok || !optionsBody?.data?.options || !optionsBody?.data?.flowId) {
      throw new Error(optionsBody?.error?.message || 'เริ่มการสแกน Passkey ไม่สำเร็จ');
    }
    const assertion = await startAuthentication({ optionsJSON: optionsBody.data.options });
    const verifyResponse = await fetch('/api/v1/auth/passkey/login/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flowId: optionsBody.data.flowId, response: assertion }),
    });
    const verifyBody = await verifyResponse.json().catch(() => null);
    if (!verifyResponse.ok || !verifyBody?.data?.verified) {
      throw new Error(verifyBody?.error?.message || 'ยืนยัน Passkey ไม่สำเร็จ');
    }
    return { success: true };
  } catch (caught: unknown) {
    return { success: false, error: caught instanceof Error ? caught.message : 'ยืนยัน Passkey ไม่สำเร็จ' };
  }
}

/**
 * Check if the current browser and platform supports WebAuthn Biometrics
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Register a new FIDO2 Passkey / Hardware Biometric with the server
 */
export async function registerPasskey(nickname = 'Officer Hardware Passkey'): Promise<PasskeyRegistrationResult> {
  try {
    // 1. Get creation options from server
    const optionsRes = await fetch('/api/v1/auth/webauthn/register/options', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
    const optionsBody = await optionsRes.json();
    if (!optionsRes.ok || !optionsBody.data) {
      throw new Error(optionsBody.error?.message || 'ขอข้อมูลลงทะเบียน Passkey ไม่สำเร็จ');
    }

    if (optionsBody.data.mode === 'demo') {
      return {
        success: true,
        credentialId: 'demo-registered-passkey',
        nickname,
      };
    }

    // 2. Trigger native platform authenticator (Windows Hello, Touch ID, Face ID, YubiKey)
    const optionsJSON: PublicKeyCredentialCreationOptionsJSON = optionsBody.data;
    const attestationResponse = await startRegistration({ optionsJSON });

    // 3. Send response to server for cryptographic signature verification & persistence
    const verifyRes = await fetch('/api/v1/auth/webauthn/register/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: attestationResponse, nickname }),
    });

    const verifyBody = await verifyRes.json();
    if (!verifyRes.ok || !verifyBody.data?.verified) {
      throw new Error(verifyBody.error?.message || 'การตรวจสอบ Passkey บนเซิร์ฟเวอร์ล้มเหลว');
    }

    return {
      success: true,
      credentialId: verifyBody.data.credentialId,
      nickname,
    };
  } catch (err: unknown) {
    console.warn('FIDO2 Passkey registration failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'ลงทะเบียน Passkey ไม่สำเร็จ',
    };
  }
}

/**
 * Trigger Biometric Step-Up authentication (FIDO2 Server-Verified / Windows Hello / Face ID)
 */
export async function verifyBiometricPasskey(
  reason?: string,
): Promise<BiometricVerificationResult> {
  void reason;
  const verifiedAt = new Date().toISOString();

  // If WebAuthn is supported on the client
  if (typeof window !== 'undefined' && window.PublicKeyCredential) {
    try {
      // 1. Fetch challenge from server
      const optionsRes = await fetch('/api/v1/auth/webauthn/authenticate/options', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });

      if (optionsRes.ok) {
        const optionsBody = await optionsRes.json();
        const optionsData = optionsBody.data;

        if (optionsData?.mode === 'demo') {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return {
            success: true,
            method: 'SIMULATED_PASSKEY',
            verifiedAt,
            credentialId: 'demo-passkey-' + Date.now(),
          };
        }

        if (optionsData?.challenge) {
          const optionsJSON: PublicKeyCredentialRequestOptionsJSON = optionsData;
          // 2. Perform native device biometric authentication
          const assertionResponse = await startAuthentication({ optionsJSON });

          // 3. Verify cryptographic proof on the server
          const verifyRes = await fetch('/api/v1/auth/webauthn/authenticate/verify', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: assertionResponse }),
          });

          const verifyBody = await verifyRes.json();
          if (verifyRes.ok && verifyBody.data?.verified) {
            return {
              success: true,
              method: 'WINDOWS_HELLO',
              verifiedAt,
              credentialId: verifyBody.data.credentialId,
            };
          }
        }
      }
    } catch (err: unknown) {
      return {
        success: false,
        method: 'WINDOWS_HELLO',
        verifiedAt,
        error: err instanceof Error ? err.message : 'การตรวจสอบ Passkey ไม่สำเร็จ',
      };
    }
  }

  return {
    success: false,
    method: 'WINDOWS_HELLO',
    verifiedAt,
    error: 'อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ WebAuthn Passkey',
  };
}
