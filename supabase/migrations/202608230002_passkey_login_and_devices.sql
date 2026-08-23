-- Passwordless WebAuthn login and self-service credential management.
-- Biometric templates remain inside the platform authenticator; the database
-- stores only public keys, counters, and device metadata.

ALTER TABLE public.webauthn_challenges
  DROP CONSTRAINT IF EXISTS webauthn_challenges_type_check;
ALTER TABLE public.webauthn_challenges
  ADD CONSTRAINT webauthn_challenges_type_check
  CHECK (type IN ('REGISTRATION', 'AUTHENTICATION', 'STEP_UP', 'LOGIN'));

CREATE OR REPLACE FUNCTION public.complete_webauthn_login(
  p_profile_id UUID,
  p_credential_id UUID,
  p_challenge_id UUID,
  p_expected_counter BIGINT,
  p_new_counter BIGINT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  credential_record public.webauthn_credentials%ROWTYPE;
  challenge_record public.webauthn_challenges%ROWTYPE;
BEGIN
  IF p_profile_id IS NULL OR length(coalesce(p_ip_address, '')) > 200 THEN
    RETURN false;
  END IF;
  SELECT * INTO credential_record
  FROM public.webauthn_credentials
  WHERE id = p_credential_id AND profile_id = p_profile_id
  FOR UPDATE;
  SELECT * INTO challenge_record
  FROM public.webauthn_challenges
  WHERE id = p_challenge_id AND profile_id = p_profile_id
    AND type = 'LOGIN' AND expires_at > timezone('utc'::text, now())
  FOR UPDATE;
  IF credential_record.id IS NULL OR challenge_record.id IS NULL
     OR credential_record.counter <> p_expected_counter
     OR NOT (p_new_counter > p_expected_counter OR (p_new_counter = 0 AND p_expected_counter = 0)) THEN
    RETURN false;
  END IF;

  UPDATE public.webauthn_credentials
  SET counter = p_new_counter,
      last_used_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = credential_record.id;
  DELETE FROM public.webauthn_challenges WHERE id = challenge_record.id;
  INSERT INTO public.audit_logs (profile_id, action, details, ip_address)
  VALUES (p_profile_id, 'WEBAUTHN_PASSWORDLESS_LOGIN_VERIFIED', jsonb_build_object(
    'credential_id', credential_record.credential_id,
    'nickname', credential_record.nickname
  ), nullif(p_ip_address, ''));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_own_webauthn_credential(p_credential_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  credential_record public.webauthn_credentials%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO credential_record
  FROM public.webauthn_credentials
  WHERE id = p_credential_id AND profile_id = actor_id
  FOR UPDATE;
  IF credential_record.id IS NULL THEN RETURN false; END IF;

  DELETE FROM public.webauthn_credentials WHERE id = credential_record.id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'WEBAUTHN_CREDENTIAL_REMOVED', jsonb_build_object(
    'credential_id', credential_record.credential_id,
    'nickname', credential_record.nickname
  ));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_webauthn_login(UUID, UUID, UUID, BIGINT, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_own_webauthn_credential(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_webauthn_login(UUID, UUID, UUID, BIGINT, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_own_webauthn_credential(UUID) TO authenticated;
