BEGIN;

SELECT plan(10);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'profiles', 'cases', 'case_members', 'evidence_files', 'evidence_pages',
        'extracted_entities', 'entity_relationships', 'reports', 'audit_logs'
      )
      AND NOT relation.relrowsecurity
  ),
  'RLS is enabled on every core sensitive table'
);

SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'evidence-vault'),
  false,
  'evidence-vault is private'
);

SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'evidence-vault'),
  209715200::bigint,
  'evidence-vault enforces the configured 200 MiB limit'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname NOT IN (
        'finalize_evidence_upload',
        'finalize_intake_attachment_upload',
        'protect_evidence_original_metadata',
        'protect_intake_attachment_metadata'
      )
      AND procedure.prosrc LIKE '%malware_scan_status%'
      AND procedure.prosrc LIKE '%malware_scan_status = ''CLEAN''%'
  ),
  'application database functions do not retain a scanner-only CLEAN gate'
);

SELECT ok(
  to_regprocedure('public.finalize_scanned_evidence_upload(uuid,uuid,text,text,text,text,bigint,text)') IS NULL,
  'scanner finalization RPC is absent'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cases' AND cmd = 'SELECT'),
  'cases has an explicit read policy'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evidence_files' AND cmd = 'SELECT'),
  'evidence metadata has an explicit read policy'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND cmd IN ('UPDATE', 'DELETE')
  ),
  'audit log exposes no update or delete policy'
);

SET LOCAL ROLE anon;
SELECT is((SELECT count(*) FROM public.cases), 0::bigint, 'anonymous users cannot read cases');
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"ffffffff-ffff-4fff-8fff-ffffffffffff","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.cases), 0::bigint, 'unassigned authenticated users cannot read cases');
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
