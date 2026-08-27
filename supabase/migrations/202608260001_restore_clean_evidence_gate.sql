-- Restore the fail-closed evidence boundary. Files validated only for size/MIME/
-- magic bytes remain NOT_SCANNED and cannot be promoted, processed, downloaded,
-- or included in reports until an approved scanner records CLEAN.

DO $$
DECLARE
  target RECORD;
  definition TEXT;
BEGIN
  FOR target IN
    SELECT procedure.oid
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prosrc LIKE '%malware_scan_status%'
      AND procedure.proname NOT IN (
        'finalize_evidence_upload',
        'finalize_intake_attachment_upload',
        'protect_evidence_original_metadata',
        'protect_intake_attachment_metadata'
      )
  LOOP
    definition := pg_get_functiondef(target.oid);
    definition := replace(
      definition,
      'malware_scan_status IN (''CLEAN'', ''NOT_SCANNED'')',
      'malware_scan_status = ''CLEAN'''
    );
    definition := replace(
      definition,
      'malware_scan_status NOT IN (''CLEAN'', ''NOT_SCANNED'')',
      'malware_scan_status <> ''CLEAN'''
    );
    EXECUTE definition;
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.evidence_files.malware_scan_status IS
  'Only CLEAN evidence may be opened or processed; NOT_SCANNED remains quarantined.';
COMMENT ON COLUMN public.intake_attachments.malware_scan_status IS
  'Only CLEAN attachments may be promoted; NOT_SCANNED remains quarantined.';
