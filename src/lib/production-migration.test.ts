import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608180001_production_readiness.sql'), 'utf8');

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
});
