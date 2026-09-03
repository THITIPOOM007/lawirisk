import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('automatic match source synchronization migration', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/202609030001_match_candidate_source_sync.sql'),
    'utf8',
  );

  it('maps both ends of every eligible candidate to stored evidence automatically', () => {
    expect(migration).toContain('CREATE TRIGGER sync_match_candidate_sources_after_write');
    expect(migration).toContain('AFTER INSERT OR UPDATE OF source_evidence_id, source_page_number, source_text, target_evidence_id, target_page_number, target_text');
    expect(migration).toContain('candidate.source_evidence_id');
    expect(migration).toContain('candidate.target_evidence_id');
    expect(migration).toContain('evidence.upload_state = \'STORED\'');
    expect(migration).toContain('ON CONFLICT (match_candidate_id, evidence_id, page_number, source_text) DO NOTHING');
  });

  it('does not turn an automatic mapping into an official confirmation', () => {
    expect(migration).not.toContain("status = 'VERIFIED'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.sync_match_candidate_sources() FROM PUBLIC, anon, authenticated');
  });
});
