-- Confirm several extraction suggestions in one atomic reviewer action.
CREATE OR REPLACE FUNCTION public.review_extraction_suggestions_batch(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  item_result JSONB;
  results JSONB := '[]'::JSONB;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BATCH_REVIEW_INVALID';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF NOT (item ? 'id') OR NOT (item ? 'reason') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BATCH_REVIEW_INVALID';
    END IF;
    item_result := public.review_extraction_suggestion(
      (item->>'id')::UUID,
      'CONFIRMED',
      item->>'reason',
      nullif(item->>'edited_value', '')
    );
    results := results || jsonb_build_array(jsonb_build_object(
      'id', item->>'id',
      'status', item_result->>'status',
      'entity_id', item_result->>'entity_id'
    ));
  END LOOP;
  RETURN results;
END;
$$;

REVOKE ALL ON FUNCTION public.review_extraction_suggestions_batch(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_extraction_suggestions_batch(JSONB) TO authenticated;
