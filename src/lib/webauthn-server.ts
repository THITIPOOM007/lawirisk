import 'server-only';

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';

export const RP_NAME = 'LawiRisk SSK Smart EvidenceVerse';

export function getRpId(requestOrigin?: string): string {
  if (process.env.WEBAUTHN_RP_ID) {
    return process.env.WEBAUTHN_RP_ID;
  }
  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      return url.hostname;
    } catch {
      // fallback
    }
  }
  const appOrigin = process.env.APP_ORIGIN;
  if (appOrigin) {
    try {
      return new URL(appOrigin).hostname;
    } catch {
      // fallback
    }
  }
  return 'localhost';
}

export function getExpectedOrigin(requestOrigin?: string): string {
  if (requestOrigin) {
    try {
      return new URL(requestOrigin).origin;
    } catch {
      // fallback
    }
  }
  return process.env.APP_ORIGIN || 'http://localhost:3000';
}

export interface StoredWebAuthnCredential {
  id: string;
  publicKey: Uint8Array | string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
}

/**
 * Generate Registration Options for user's biometric / security key enrollment
 */
export async function createRegistrationOptions(params: {
  userId: string;
  userEmail: string;
  userName: string;
  existingCredentials?: StoredWebAuthnCredential[];
  requestOrigin?: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const rpID = getRpId(params.requestOrigin);

  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(params.userId),
    userName: params.userEmail,
    userDisplayName: params.userName || params.userEmail,
    attestationType: 'none',
    excludeCredentials: params.existingCredentials?.map((cred) => ({
      id: cred.id,
      transports: cred.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
    timeout: 60000,
  });
}

/**
 * Verify Registration Response returned by the browser authenticator
 */
export async function verifyRegistration(params: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  requestOrigin?: string;
}): Promise<VerifiedRegistrationResponse> {
  const rpID = getRpId(params.requestOrigin);
  const expectedOrigin = getExpectedOrigin(params.requestOrigin);

  return verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
}

/**
 * Generate Authentication Options for Step-Up or Login verification
 */
export async function createAuthenticationOptions(params: {
  allowCredentials?: StoredWebAuthnCredential[];
  requestOrigin?: string;
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const rpID = getRpId(params.requestOrigin);

  return generateAuthenticationOptions({
    rpID,
    timeout: 60000,
    allowCredentials: params.allowCredentials?.map((cred) => ({
      id: cred.id,
      transports: cred.transports,
    })),
    userVerification: 'required',
  });
}

/**
 * Verify Authentication Response (Signature proof) against stored public key
 */
export async function verifyAuthentication(params: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: {
    id: string;
    publicKey: Uint8Array;
    counter: number;
    transports?: AuthenticatorTransportFuture[];
  };
  requestOrigin?: string;
}): Promise<VerifiedAuthenticationResponse> {
  const rpID = getRpId(params.requestOrigin);
  const expectedOrigin = getExpectedOrigin(params.requestOrigin);

  return verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    credential: {
      id: params.credential.id,
      publicKey: new Uint8Array(params.credential.publicKey) as unknown as Uint8Array<ArrayBuffer>,
      counter: params.credential.counter,
      transports: params.credential.transports,
    },
    requireUserVerification: true,
  });
}
