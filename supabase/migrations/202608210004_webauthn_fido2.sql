-- Phase 11: FIDO2 WebAuthn Passkey Server-Side Architecture
-- Strictly ensures Zero Facial/Biometric Image Retention on Server
-- Server only stores cryptographic public keys and counters

CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL DEFAULT 'single_device',
  backed_up BOOLEAN NOT NULL DEFAULT false,
  transports TEXT[] NOT NULL DEFAULT '{}',
  aaguid TEXT,
  nickname TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_profile ON public.webauthn_credentials(profile_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_cred_id ON public.webauthn_credentials(credential_id);

CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('REGISTRATION', 'AUTHENTICATION', 'STEP_UP')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_challenge ON public.webauthn_challenges(challenge);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expiry ON public.webauthn_challenges(expires_at);

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own WebAuthn credentials"
  ON public.webauthn_credentials
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Service role can manage challenges"
  ON public.webauthn_challenges
  FOR ALL
  USING (true)
  WITH CHECK (true);
