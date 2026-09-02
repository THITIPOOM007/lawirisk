import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cross-case matching repair migration', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/202609010002_matching_schema_alignment.sql'),
    'utf8',
  );

  it('resolves evidence trace fields through entity mention pages', () => {
    expect(migration).toContain('JOIN public.evidence_pages ep ON ep.id = em.page_id');
    expect(migration).not.toContain('em.evidence_id');
    expect(migration).not.toContain('em.page_number');
  });

  it('uses the fixed extension schema and keeps privileged functions fail-closed', () => {
    expect(migration).toContain("p.proname = 'similarity'");
    expect(migration).toContain('public.entity_similarity');
    expect(migration).not.toContain('entity_type, entity_value');
    expect(migration).not.toContain('created_by');
    expect(migration.match(/^SECURITY DEFINER/gm)).toHaveLength(2);
    expect(migration.match(/^SET search_path = ''/gm)).toHaveLength(2);
    expect(migration).toContain("public.current_user_role() NOT IN ('ADMIN', 'REVIEWER', 'INVESTIGATOR')");
  });
});
