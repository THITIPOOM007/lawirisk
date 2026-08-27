import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(target);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [target] : [];
  });
}

describe('release security regressions', () => {
  it('keeps privileged seed credentials out of source and disables production demo seeding', () => {
    const seed = read('scripts/seed-production-demo.mjs');
    expect(seed).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(seed).not.toContain('createClient(');
    expect(seed).toContain('Production demo seeding is disabled');
  });

  it('keeps external auto-login local, audited, and dossier output source-bound', () => {
    const recon = read('src/app/api/v1/intelligence/recon/route.ts');
    const dossier = read('src/app/api/v1/intelligence/dossier/route.ts');
    const model = read('src/lib/case-intelligence.ts');
    const companion = read('src/app/api/v1/sources/[key]/companion/route.ts');
    const sources = read('src/lib/external-sources.ts');
    expect(recon).toContain('external_queries_performed: false');
    expect(dossier).toContain("from('entity_mentions')");
    expect(model).toContain("status: 'LOCAL_AUTO_LOGIN'");
    expect(model).toContain("status: 'REVIEW_REQUIRED'");
    expect(companion).toContain('credentials_received_by_server: false');
    expect(companion).toContain('hasTrustedBrowserOrigin(request)');
    expect(sources).toContain('INSECURE_TRANSPORT_ACK_REQUIRED');
    expect(`${recon}\n${dossier}`).not.toContain('runAutomatedCaseRecon');
  });

  it('does not use raw HTML injection APIs in application source', () => {
    const source = collectSourceFiles(path.join(process.cwd(), 'src'))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    expect(source.match(/dangerouslySetInnerHTML/g)).toHaveLength(1);
    expect(source).not.toContain('__html: currentDoc');
    expect(source).not.toContain('document.write(');
  });
});
