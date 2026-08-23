-- Release hardening: close permissive policies introduced by optional feature migrations.

DROP POLICY IF EXISTS "Users can modify tasks in their cases" ON public.investigation_tasks;
CREATE POLICY "Investigators modify tasks in their cases"
  ON public.investigation_tasks
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    OR (
      public.current_user_role() = 'INVESTIGATOR'
      AND public.is_case_member(case_id)
    )
  )
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    OR (
      public.current_user_role() = 'INVESTIGATOR'
      AND public.is_case_member(case_id)
    )
  );

DROP POLICY IF EXISTS "Service role can manage challenges" ON public.webauthn_challenges;
CREATE POLICY "Users manage their own WebAuthn challenges"
  ON public.webauthn_challenges
  FOR ALL
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

REVOKE ALL ON public.webauthn_challenges FROM anon;
REVOKE ALL ON public.webauthn_credentials FROM anon;

INSERT INTO public.intake_channels (id, code, name, type)
VALUES ('00000000-0000-4000-8000-000000000107', 'PUBLIC_PORTAL', 'Public Citizen Portal', 'MANUAL_POST')
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  updated_at = timezone('utc'::text, now());

CREATE OR REPLACE FUNCTION public.generate_investigation_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.entity_type = 'BANK_ACCOUNT' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority, created_by)
    VALUES
      (NEW.case_id, NEW.id, 'ตรวจสอบสถานะบัญชีม้า (AOC 1441)', 'นำเลขบัญชีไปตรวจสอบความเสี่ยงในระบบ AOC 1441', 'HIGH', auth.uid()),
      (NEW.case_id, NEW.id, 'ขอรายการเดินบัญชี (Statement)', 'จัดทำคำขอรายการเดินบัญชีตามขั้นตอนที่ได้รับอนุมัติ', 'MEDIUM', auth.uid());
  ELSIF NEW.entity_type = 'PHONE' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority, created_by)
    VALUES (NEW.case_id, NEW.id, 'ตรวจสอบการลงทะเบียนซิม (NBTC)', 'ตรวจสอบผู้จดทะเบียนผ่านช่องทางที่ได้รับอนุญาต', 'HIGH', auth.uid());
  ELSIF NEW.entity_type = 'PERSON' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority, created_by)
    VALUES (NEW.case_id, NEW.id, 'ตรวจสอบทะเบียนราษฎร์', 'ตรวจสอบข้อมูลผ่านช่องทางที่ได้รับอนุญาตและบันทึกแหล่งอ้างอิง', 'MEDIUM', auth.uid());
  ELSIF NEW.entity_type = 'ORGANIZATION' THEN
    INSERT INTO public.investigation_tasks (case_id, entity_id, title, description, priority, created_by)
    VALUES (NEW.case_id, NEW.id, 'ตรวจสอบการจดทะเบียนนิติบุคคล', 'ตรวจสอบข้อมูลนิติบุคคลผ่านช่องทางที่ได้รับอนุญาต', 'MEDIUM', auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_trusted_sources(search_query TEXT, max_results INT DEFAULT 10)
RETURNS SETOF public.trusted_sources_registry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF search_query IS NULL OR length(trim(search_query)) NOT BETWEEN 2 AND 200
     OR max_results NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRUSTED_SOURCE_SEARCH_INVALID';
  END IF;

  RETURN QUERY
  SELECT registry.*
  FROM public.trusted_sources_registry AS registry
  WHERE registry.search_vector @@ plainto_tsquery('simple', trim(search_query))
     OR registry.title ILIKE '%' || trim(search_query) || '%'
     OR registry.snippet ILIKE '%' || trim(search_query) || '%'
  ORDER BY ts_rank(registry.search_vector, plainto_tsquery('simple', trim(search_query))) DESC,
           registry.id ASC
  LIMIT max_results;
END;
$$;

REVOKE ALL ON FUNCTION public.search_trusted_sources(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_trusted_sources(TEXT, INT) TO anon, authenticated, service_role;

-- Server-verified WebAuthn step-up sessions. Raw tokens only live in an
-- HttpOnly cookie; PostgreSQL stores a SHA-256 digest and consumes it once.
CREATE TABLE IF NOT EXISTS public.webauthn_step_up_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  purpose TEXT NOT NULL CHECK (purpose IN ('REVIEW_CONFIRMATION')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS webauthn_step_up_profile_expiry_idx
  ON public.webauthn_step_up_sessions (profile_id, expires_at DESC);
ALTER TABLE public.webauthn_step_up_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webauthn_step_up_sessions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_webauthn_registration(
  p_challenge_id UUID,
  p_credential_id TEXT,
  p_public_key TEXT,
  p_counter BIGINT,
  p_device_type TEXT,
  p_backed_up BOOLEAN,
  p_transports TEXT[],
  p_aaguid TEXT,
  p_nickname TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  challenge_record public.webauthn_challenges%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR p_credential_id IS NULL OR length(p_credential_id) > 2048
     OR p_public_key IS NULL OR length(p_public_key) > 8192
     OR p_counter < 0 OR length(coalesce(p_nickname, '')) > 200 THEN
    RETURN false;
  END IF;
  SELECT * INTO challenge_record
  FROM public.webauthn_challenges
  WHERE id = p_challenge_id AND profile_id = actor_id
    AND type = 'REGISTRATION' AND expires_at > timezone('utc'::text, now())
  FOR UPDATE;
  IF challenge_record.id IS NULL THEN RETURN false; END IF;

  INSERT INTO public.webauthn_credentials (
    profile_id, credential_id, public_key, counter, device_type,
    backed_up, transports, aaguid, nickname
  ) VALUES (
    actor_id, p_credential_id, p_public_key, p_counter, p_device_type,
    p_backed_up, coalesce(p_transports, '{}'), p_aaguid, p_nickname
  );
  DELETE FROM public.webauthn_challenges WHERE id = challenge_record.id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'WEBAUTHN_CREDENTIAL_REGISTERED', jsonb_build_object(
    'credential_id', p_credential_id,
    'device_type', p_device_type,
    'nickname', p_nickname
  ));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_webauthn_authentication(
  p_credential_id UUID,
  p_challenge_id UUID,
  p_expected_counter BIGINT,
  p_new_counter BIGINT,
  p_token_hash TEXT,
  p_purpose TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  credential_record public.webauthn_credentials%ROWTYPE;
  challenge_record public.webauthn_challenges%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_purpose <> 'REVIEW_CONFIRMATION' THEN
    RETURN false;
  END IF;

  SELECT * INTO credential_record
  FROM public.webauthn_credentials
  WHERE id = p_credential_id AND profile_id = actor_id
  FOR UPDATE;
  SELECT * INTO challenge_record
  FROM public.webauthn_challenges
  WHERE id = p_challenge_id AND profile_id = actor_id
    AND type = 'AUTHENTICATION' AND expires_at > timezone('utc'::text, now())
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
  DELETE FROM public.webauthn_step_up_sessions
  WHERE profile_id = actor_id
    AND (expires_at <= timezone('utc'::text, now()) OR consumed_at IS NOT NULL);
  INSERT INTO public.webauthn_step_up_sessions (profile_id, token_hash, purpose, expires_at)
  VALUES (actor_id, p_token_hash, p_purpose, timezone('utc'::text, now()) + interval '5 minutes');
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'WEBAUTHN_AUTHENTICATION_VERIFIED', jsonb_build_object(
    'credential_id', credential_record.credential_id,
    'purpose', p_purpose
  ));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_webauthn_step_up(
  p_token_hash TEXT,
  p_purpose TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := auth.uid();
  session_record public.webauthn_step_up_sessions%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_purpose <> 'REVIEW_CONFIRMATION' THEN
    RETURN false;
  END IF;
  SELECT * INTO session_record
  FROM public.webauthn_step_up_sessions
  WHERE profile_id = actor_id AND token_hash = p_token_hash AND purpose = p_purpose
    AND consumed_at IS NULL AND expires_at > timezone('utc'::text, now())
  FOR UPDATE;
  IF session_record.id IS NULL THEN RETURN false; END IF;

  UPDATE public.webauthn_step_up_sessions
  SET consumed_at = timezone('utc'::text, now())
  WHERE id = session_record.id;
  INSERT INTO public.audit_logs (profile_id, action, details)
  VALUES (actor_id, 'WEBAUTHN_STEP_UP_CONSUMED', jsonb_build_object(
    'session_id', session_record.id,
    'purpose', p_purpose
  ));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_webauthn_authentication(UUID, UUID, BIGINT, BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_webauthn_registration(UUID, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_webauthn_step_up(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_webauthn_authentication(UUID, UUID, BIGINT, BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_webauthn_registration(UUID, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, TEXT[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_webauthn_step_up(TEXT, TEXT) TO authenticated;
