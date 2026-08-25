-- Release legacy intake envelopes that were quarantined only because the
-- external malware scanner was unavailable. Confirmed infected records stay
-- quarantined and immutable.

WITH recovered_attachments AS (
  UPDATE public.intake_attachments attachment
  SET upload_state = 'STORED',
      malware_scan_status = CASE
        WHEN attachment.malware_scan_status IN ('PENDING', 'UNAVAILABLE', 'ERROR') THEN 'NOT_SCANNED'
        ELSE attachment.malware_scan_status
      END,
      file_validation_details = coalesce(attachment.file_validation_details, jsonb_build_object(
        'mode', 'FILE_VALIDATION_ONLY',
        'source', 'LEGACY_STORED_OBJECT',
        'sha256_source', 'SERVER_COMPUTED'
      )),
      file_validated_at = coalesce(attachment.file_validated_at, attachment.created_at)
  WHERE attachment.upload_state = 'RESERVED'
    AND attachment.malware_scan_status <> 'INFECTED'
    AND EXISTS (
      SELECT 1
      FROM storage.objects object
      WHERE object.bucket_id = 'evidence-vault'
        AND object.name = attachment.storage_path
    )
  RETURNING attachment.id
),
released_envelopes AS (
  UPDATE public.intake_envelopes envelope
  SET status = 'TRIAGE_PENDING',
      malware_scan_status = CASE
        WHEN envelope.malware_scan_status IN ('PENDING', 'UNAVAILABLE', 'ERROR') THEN 'NOT_SCANNED'
        ELSE envelope.malware_scan_status
      END,
      updated_at = timezone('utc'::text, now())
  WHERE envelope.status = 'QUARANTINED'
    AND envelope.malware_scan_status <> 'INFECTED'
    AND NOT EXISTS (
      SELECT 1
      FROM public.intake_attachments attachment
      WHERE attachment.envelope_id = envelope.id
        AND attachment.malware_scan_status = 'INFECTED'
    )
  RETURNING envelope.id
)
INSERT INTO public.audit_logs (profile_id, action, details)
SELECT NULL, 'FALSE_SCANNER_QUARANTINE_RELEASED', jsonb_build_object(
  'recovered_attachment_count', (SELECT count(*) FROM recovered_attachments),
  'released_envelope_count', (SELECT count(*) FROM released_envelopes),
  'confirmed_infected_preserved', true,
  'changed_at', timezone('utc'::text, now())
);
