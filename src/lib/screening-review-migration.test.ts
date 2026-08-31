import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/202608310003_screening_review_idempotency.sql', 'utf8');

describe('screening review migration', () => {
  it('accepts validated unscanned evidence and makes repeated decisions idempotent', () => {
    expect(migration).toContain("ef.malware_scan_status IN ('CLEAN', 'NOT_SCANNED')");
    expect(migration).toContain("'idempotent', true");
    expect(migration).toContain('SCREENING_REVIEW_CONFLICT');
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.review_evidence_screening");
  });
});
