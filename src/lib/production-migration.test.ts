import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608180001_production_readiness.sql'), 'utf8');
const geminiMigration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608190001_gemini_extraction.sql'), 'utf8');
const automationMigration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608190002_n8n_automation.sql'), 'utf8');
const manualIntakeMigration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608240001_manual_intake_scan_readiness.sql'), 'utf8');
const largeEvidenceMigration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608240002_evidence_upload_200mb.sql'), 'utf8');
const scannerRemovalMigration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608240003_remove_scanner_dependency.sql'), 'utf8');

describe('production migration invariants', () => {
  it('makes evidence originals and audit history immutable', () => {
    expect(migration).toContain('protect_evidence_original_metadata');
    expect(migration).toContain('prevent_stored_evidence_delete');
    expect(migration).toContain('prevent_audit_update_or_delete');
  });

  it('forces sensitive writes through reviewed RPC boundaries', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Investigators or Admins can add evidence"');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.reserve_evidence_upload');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.review_extraction_suggestion');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_report_snapshot');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_csv_intake_batch');
  });

  it('requires source references and clean evidence before confirmation', () => {
    expect(migration).toContain('SUGGESTION_SOURCE_NOT_CLEAN');
    expect(migration).toContain('MATCH_SOURCE_REQUIRED');
    expect(migration).toContain('PERSON_NAME_ONLY_MATCH_FORBIDDEN');
    expect(migration).toContain('REPORT_SOURCE_REQUIRED');
  });

  it('persists AI output as reviewed suggestions behind a clean-source RPC', () => {
    expect(geminiMigration).toContain('CREATE OR REPLACE FUNCTION public.create_ai_extraction_suggestions');
    expect(geminiMigration).toContain("ef.malware_scan_status = 'CLEAN'");
    expect(geminiMigration).toContain("trim(p_prompt_schema_version), 'SUGGESTED'");
    expect(geminiMigration).toContain("'AI_EXTRACTION_SUGGESTIONS_CREATE'");
    expect(geminiMigration).toContain('REVOKE ALL ON FUNCTION public.create_ai_extraction_suggestions');
  });

  it('keeps n8n orchestration identifier-only, idempotent, and human-reviewed', () => {
    expect(automationMigration).toContain('CREATE TABLE IF NOT EXISTS public.automation_jobs');
    expect(automationMigration).toContain('CREATE TABLE IF NOT EXISTS public.automation_job_inputs');
    expect(automationMigration).toContain('REVOKE ALL ON public.automation_job_inputs FROM anon, authenticated');
    expect(automationMigration).toContain('UNIQUE (requested_by, idempotency_key)');
    expect(automationMigration).toContain("ef.malware_scan_status = 'CLEAN'");
    expect(automationMigration).toContain("'SUGGESTED', job.requested_by");
    expect(automationMigration).toContain('DELETE FROM public.automation_job_inputs WHERE job_id = job.id');
    expect(automationMigration).toContain("auth.role() <> 'service_role'");
    expect(automationMigration).toContain('GRANT EXECUTE ON FUNCTION public.claim_automation_job');
  });

  it('lets text-only manual intake reach triage without bypassing attachment scanning', () => {
    expect(manualIntakeMigration).toContain('CREATE OR REPLACE FUNCTION public.create_manual_intake');
    expect(manualIntakeMigration).toContain("'CLEAN', 'PENDING'");
    expect(manualIntakeMigration).toContain('FROM public.intake_attachments AS attachment');
    expect(manualIntakeMigration).toContain('WHERE attachment.envelope_id = envelope.id');
    expect(manualIntakeMigration).toContain('REVOKE ALL ON FUNCTION public.create_manual_intake');
  });

  it('raises only the private evidence lifecycle to 200 MB and preserves audited reservation boundaries', () => {
    expect(largeEvidenceMigration).toContain('SET file_size_limit = 209715200');
    expect(largeEvidenceMigration).toContain('p_file_size NOT BETWEEN 1 AND 209715200');
    expect(largeEvidenceMigration).toContain("record.upload_state <> 'RESERVED'");
    expect(largeEvidenceMigration).toContain("'EVIDENCE_UPLOAD_CANCELLED'");
    expect(largeEvidenceMigration).toContain('REVOKE ALL ON FUNCTION public.finalize_evidence_upload');
  });

  it('removes the scanner dependency without claiming new files are clean', () => {
    expect(scannerRemovalMigration).toContain("malware_scan_status = 'NOT_SCANNED'");
    expect(scannerRemovalMigration).toContain('FILE_VALIDATION_ONLY');
    expect(scannerRemovalMigration).toContain('validate');
    expect(scannerRemovalMigration).toContain("legacy_infected_files_preserved', true");
    expect(scannerRemovalMigration).toContain("IN ('CLEAN', 'NOT_SCANNED')");
    expect(scannerRemovalMigration).not.toContain("SET malware_scan_status = 'CLEAN'");
  });
});
