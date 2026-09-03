-- Preserve automatic cross-case mapping as an evidence-backed proposal.
-- This never confirms a match; review_match_candidate remains the only
-- transition to VERIFIED and still requires a clean source reference.

CREATE OR REPLACE FUNCTION public.sync_match_candidate_sources()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.source_evidence_id IS NOT NULL
     AND NEW.source_page_number IS NOT NULL AND NEW.source_page_number > 0
     AND NEW.source_text IS NOT NULL AND length(trim(NEW.source_text)) BETWEEN 1 AND 4000 THEN
    INSERT INTO public.match_candidate_sources (match_candidate_id, evidence_id, page_number, source_text)
    SELECT NEW.id, evidence.id, NEW.source_page_number, trim(NEW.source_text)
    FROM public.evidence_files evidence
    WHERE evidence.id = NEW.source_evidence_id AND evidence.upload_state = 'STORED'
    ON CONFLICT (match_candidate_id, evidence_id, page_number, source_text) DO NOTHING;
  END IF;

  IF NEW.target_evidence_id IS NOT NULL
     AND NEW.target_page_number IS NOT NULL AND NEW.target_page_number > 0
     AND NEW.target_text IS NOT NULL AND length(trim(NEW.target_text)) BETWEEN 1 AND 4000 THEN
    INSERT INTO public.match_candidate_sources (match_candidate_id, evidence_id, page_number, source_text)
    SELECT NEW.id, evidence.id, NEW.target_page_number, trim(NEW.target_text)
    FROM public.evidence_files evidence
    WHERE evidence.id = NEW.target_evidence_id AND evidence.upload_state = 'STORED'
    ON CONFLICT (match_candidate_id, evidence_id, page_number, source_text) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_match_candidate_sources_after_write ON public.match_candidates;
CREATE TRIGGER sync_match_candidate_sources_after_write
  AFTER INSERT OR UPDATE OF source_evidence_id, source_page_number, source_text, target_evidence_id, target_page_number, target_text
  ON public.match_candidates
  FOR EACH ROW EXECUTE FUNCTION public.sync_match_candidate_sources();

-- Backfill candidates created before the automatic source-sync trigger.
INSERT INTO public.match_candidate_sources (match_candidate_id, evidence_id, page_number, source_text)
SELECT candidate.id, candidate.source_evidence_id, candidate.source_page_number, trim(candidate.source_text)
FROM public.match_candidates candidate
JOIN public.evidence_files evidence ON evidence.id = candidate.source_evidence_id AND evidence.upload_state = 'STORED'
WHERE candidate.source_evidence_id IS NOT NULL
  AND candidate.source_page_number IS NOT NULL AND candidate.source_page_number > 0
  AND candidate.source_text IS NOT NULL AND length(trim(candidate.source_text)) BETWEEN 1 AND 4000
UNION
SELECT candidate.id, candidate.target_evidence_id, candidate.target_page_number, trim(candidate.target_text)
FROM public.match_candidates candidate
JOIN public.evidence_files evidence ON evidence.id = candidate.target_evidence_id AND evidence.upload_state = 'STORED'
WHERE candidate.target_evidence_id IS NOT NULL
  AND candidate.target_page_number IS NOT NULL AND candidate.target_page_number > 0
  AND candidate.target_text IS NOT NULL AND length(trim(candidate.target_text)) BETWEEN 1 AND 4000
ON CONFLICT (match_candidate_id, evidence_id, page_number, source_text) DO NOTHING;

REVOKE ALL ON FUNCTION public.sync_match_candidate_sources() FROM PUBLIC, anon, authenticated;
