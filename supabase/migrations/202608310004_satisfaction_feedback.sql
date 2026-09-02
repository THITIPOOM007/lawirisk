-- Anonymous and staff satisfaction responses are intentionally separate from
-- evidence, complaints, and audit records. The table stores no IP address,
-- search query, complainant identity, or other direct personal identifier.
CREATE TABLE public.satisfaction_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience TEXT NOT NULL CHECK (audience IN ('PUBLIC', 'STAFF')),
  response_context TEXT NOT NULL CHECK (response_context IN ('PUBLIC_SEARCH', 'PUBLIC_COMPLAINT', 'STAFF_SESSION')),
  interaction_id UUID NOT NULL,
  staff_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  convenience_rating SMALLINT NOT NULL CHECK (convenience_rating BETWEEN 1 AND 5),
  speed_rating SMALLINT NOT NULL CHECK (speed_rating BETWEEN 1 AND 5),
  accuracy_rating SMALLINT NOT NULL CHECK (accuracy_rating BETWEEN 1 AND 5),
  overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  suggestion TEXT CHECK (suggestion IS NULL OR char_length(suggestion) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT satisfaction_context_matches_audience CHECK (
    (audience = 'PUBLIC' AND response_context IN ('PUBLIC_SEARCH', 'PUBLIC_COMPLAINT') AND staff_user_id IS NULL)
    OR (audience = 'STAFF' AND response_context = 'STAFF_SESSION' AND staff_user_id IS NOT NULL)
  ),
  CONSTRAINT satisfaction_one_response_per_interaction UNIQUE (audience, interaction_id)
);

CREATE INDEX satisfaction_responses_created_at_idx
  ON public.satisfaction_responses (created_at DESC);
CREATE INDEX satisfaction_responses_audience_created_at_idx
  ON public.satisfaction_responses (audience, created_at DESC);

ALTER TABLE public.satisfaction_responses ENABLE ROW LEVEL SECURITY;

-- Direct read access is deliberately absent for every browser role. Public
-- submissions pass through the same-origin, validated, rate-limited route;
-- staff read only the minimized aggregate returned by the protected RPC.
CREATE POLICY "Staff submit own satisfaction response"
  ON public.satisfaction_responses
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.current_user_role() IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER', 'VIEWER')
    AND audience = 'STAFF'
    AND response_context = 'STAFF_SESSION'
    AND staff_user_id = auth.uid()
  );

REVOKE ALL ON public.satisfaction_responses FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.satisfaction_responses TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.satisfaction_responses TO service_role;

CREATE OR REPLACE FUNCTION public.get_satisfaction_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER', 'VIEWER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SATISFACTION_SUMMARY_FORBIDDEN';
  END IF;

  RETURN (
    WITH base AS (
      SELECT * FROM public.satisfaction_responses
    ),
    overall_stats AS (
      SELECT count(*)::integer AS total,
        coalesce(round(avg(overall_rating)::numeric, 1), 0) AS average,
        coalesce(round(avg(overall_rating)::numeric / 5 * 100), 0) AS percent
      FROM base
    ),
    audience_stats AS (
      SELECT audience, count(*)::integer AS total,
        coalesce(round(avg(overall_rating)::numeric, 1), 0) AS average,
        coalesce(round(avg(overall_rating)::numeric / 5 * 100), 0) AS percent
      FROM base GROUP BY audience
    ),
    context_stats AS (
      SELECT response_context, count(*)::integer AS total,
        coalesce(round(avg(overall_rating)::numeric, 1), 0) AS average,
        coalesce(round(avg(overall_rating)::numeric / 5 * 100), 0) AS percent
      FROM base GROUP BY response_context
    ),
    dimension_stats AS (
      SELECT
        coalesce(round(avg(convenience_rating)::numeric, 1), 0) AS convenience_average,
        coalesce(round(avg(convenience_rating)::numeric / 5 * 100), 0) AS convenience_percent,
        coalesce(round(avg(speed_rating)::numeric, 1), 0) AS speed_average,
        coalesce(round(avg(speed_rating)::numeric / 5 * 100), 0) AS speed_percent,
        coalesce(round(avg(accuracy_rating)::numeric, 1), 0) AS accuracy_average,
        coalesce(round(avg(accuracy_rating)::numeric / 5 * 100), 0) AS accuracy_percent,
        coalesce(round(avg(overall_rating)::numeric, 1), 0) AS overall_average,
        coalesce(round(avg(overall_rating)::numeric / 5 * 100), 0) AS overall_percent
      FROM base
    )
    SELECT jsonb_build_object(
      'totalResponses', overall_stats.total,
      'averageRating', overall_stats.average,
      'satisfactionPercent', overall_stats.percent,
      'audiences', jsonb_build_object(
        'PUBLIC', coalesce((SELECT jsonb_build_object('totalResponses', total, 'averageRating', average, 'satisfactionPercent', percent) FROM audience_stats WHERE audience = 'PUBLIC'), jsonb_build_object('totalResponses', 0, 'averageRating', 0, 'satisfactionPercent', 0)),
        'STAFF', coalesce((SELECT jsonb_build_object('totalResponses', total, 'averageRating', average, 'satisfactionPercent', percent) FROM audience_stats WHERE audience = 'STAFF'), jsonb_build_object('totalResponses', 0, 'averageRating', 0, 'satisfactionPercent', 0))
      ),
      'dimensions', jsonb_build_object(
        'convenience', jsonb_build_object('averageRating', dimension_stats.convenience_average, 'satisfactionPercent', dimension_stats.convenience_percent),
        'speed', jsonb_build_object('averageRating', dimension_stats.speed_average, 'satisfactionPercent', dimension_stats.speed_percent),
        'accuracy', jsonb_build_object('averageRating', dimension_stats.accuracy_average, 'satisfactionPercent', dimension_stats.accuracy_percent),
        'overall', jsonb_build_object('averageRating', dimension_stats.overall_average, 'satisfactionPercent', dimension_stats.overall_percent)
      ),
      'contexts', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'context', response_context,
          'totalResponses', total,
          'averageRating', average,
          'satisfactionPercent', percent
        ) ORDER BY response_context) FROM context_stats
      ), '[]'::jsonb),
      'recentSuggestions', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', recent.id,
          'audience', recent.audience,
          'context', recent.response_context,
          'suggestion', recent.suggestion,
          'createdAt', to_char(recent.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ) ORDER BY recent.created_at DESC)
        FROM (
          SELECT id, audience, response_context, suggestion, created_at
          FROM base
          WHERE suggestion IS NOT NULL AND length(trim(suggestion)) > 0
          ORDER BY created_at DESC
          LIMIT 8
        ) recent
      ), '[]'::jsonb)
    )
    FROM overall_stats CROSS JOIN dimension_stats
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_satisfaction_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_satisfaction_summary() TO authenticated;
