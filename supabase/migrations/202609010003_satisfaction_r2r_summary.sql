-- Extend the staff-only aggregate with transparent R2R research indicators.
-- Raw response rows remain unreadable to browser roles. The first 30 valid
-- responses form the initial baseline because no comparable pre-system data
-- exists; confidence intervals and internal-consistency statistics are not
-- reported before that threshold.
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
      SELECT
        count(*)::integer AS total,
        coalesce(round(avg(overall_rating)::numeric, 1), 0) AS average,
        coalesce(round(avg(overall_rating)::numeric / 5 * 100), 0) AS percent,
        coalesce(round(count(*) FILTER (WHERE overall_rating >= 4)::numeric / nullif(count(*), 0) * 100), 0) AS positive_percent,
        stddev_samp(overall_rating)::numeric AS standard_deviation,
        min(created_at) AS period_from,
        max(created_at) AS period_to,
        count(*) FILTER (WHERE overall_rating = 1)::integer AS rating_1,
        count(*) FILTER (WHERE overall_rating = 2)::integer AS rating_2,
        count(*) FILTER (WHERE overall_rating = 3)::integer AS rating_3,
        count(*) FILTER (WHERE overall_rating = 4)::integer AS rating_4,
        count(*) FILTER (WHERE overall_rating = 5)::integer AS rating_5
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
    ),
    weakest_dimension AS (
      SELECT candidate.dimension
      FROM dimension_stats,
      LATERAL (VALUES
        ('convenience', dimension_stats.convenience_average),
        ('speed', dimension_stats.speed_average),
        ('accuracy', dimension_stats.accuracy_average)
      ) AS candidate(dimension, rating)
      ORDER BY candidate.rating, candidate.dimension
      LIMIT 1
    ),
    reliability_stats AS (
      SELECT
        count(*)::integer AS total,
        var_samp(convenience_rating)::numeric AS convenience_variance,
        var_samp(speed_rating)::numeric AS speed_variance,
        var_samp(accuracy_rating)::numeric AS accuracy_variance,
        var_samp(overall_rating)::numeric AS overall_variance,
        var_samp(convenience_rating + speed_rating + accuracy_rating + overall_rating)::numeric AS total_score_variance
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
      ), '[]'::jsonb),
      'research', jsonb_build_object(
        'generatedAt', to_char(timezone('utc'::text, now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'collectionPeriod', jsonb_build_object(
          'from', CASE WHEN overall_stats.period_from IS NULL THEN NULL ELSE to_char(overall_stats.period_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
          'to', CASE WHEN overall_stats.period_to IS NULL THEN NULL ELSE to_char(overall_stats.period_to AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
        ),
        'targetSampleSize', 30,
        'baselineStatus', CASE WHEN overall_stats.total >= 30 THEN 'READY' ELSE 'FORMING' END,
        'positiveResponsePercent', overall_stats.positive_percent,
        'ratingDistribution', jsonb_build_object(
          '1', overall_stats.rating_1,
          '2', overall_stats.rating_2,
          '3', overall_stats.rating_3,
          '4', overall_stats.rating_4,
          '5', overall_stats.rating_5
        ),
        'confidence95', CASE
          WHEN overall_stats.total >= 30 AND overall_stats.standard_deviation IS NOT NULL THEN jsonb_build_object(
            'lower', round(greatest(1, overall_stats.average - (1.96 * overall_stats.standard_deviation / sqrt(overall_stats.total)))::numeric, 2),
            'upper', round(least(5, overall_stats.average + (1.96 * overall_stats.standard_deviation / sqrt(overall_stats.total)))::numeric, 2)
          )
          ELSE NULL
        END,
        'cronbachAlpha', CASE
          WHEN reliability_stats.total >= 30 AND reliability_stats.total_score_variance > 0 THEN
            round(greatest(-1, least(1,
              (4.0 / 3.0) * (1 - (
                coalesce(reliability_stats.convenience_variance, 0)
                + coalesce(reliability_stats.speed_variance, 0)
                + coalesce(reliability_stats.accuracy_variance, 0)
                + coalesce(reliability_stats.overall_variance, 0)
              ) / reliability_stats.total_score_variance)
            ))::numeric, 2)
          ELSE NULL
        END,
        'weakestDimension', CASE WHEN overall_stats.total = 0 THEN NULL ELSE (SELECT dimension FROM weakest_dimension) END
      )
    )
    FROM overall_stats CROSS JOIN dimension_stats CROSS JOIN reliability_stats
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_satisfaction_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_satisfaction_summary() TO authenticated;
