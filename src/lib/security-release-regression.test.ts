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
    const publicDiscovery = read('src/lib/providers/gemini-grounded-search.ts');
    const extraction = read('src/lib/providers/gemini-extraction.ts');
    const workspace = read('src/components/CaseIntelligenceWorkspace.tsx');
    const dossier = read('src/app/api/v1/intelligence/dossier/route.ts');
    const model = read('src/lib/case-intelligence.ts');
    const companion = read('src/app/api/v1/sources/[key]/companion/route.ts');
    const capture = read('src/app/api/v1/intelligence/recon/captures/route.ts');
    const sources = read('src/lib/external-sources.ts');
    expect(recon).toContain('credentialed_external_queries_performed: false');
    expect(recon).toContain("rpc('search_trusted_sources'");
    expect(recon).toContain("new Set(['ORGANIZATION', 'PHONE', 'EMAIL', 'LOCATION'])");
    expect(recon).not.toContain("new Set(['CITIZEN_ID'");
    expect(publicDiscovery).toContain("import 'server-only'");
    expect(publicDiscovery).toContain('tools: [{ google_search: {} }]');
    expect(publicDiscovery).toContain("url.protocol === 'https:'");
    expect(publicDiscovery).toContain('Never decide identity, guilt, ownership, intent, liability');
    expect(publicDiscovery).not.toContain('NEXT_PUBLIC_GEMINI');
    expect(extraction).toContain('TRANSIENT_STATUSES');
    expect(extraction).toContain('discoverGeminiGenerationModels');
    expect(extraction).not.toContain('gemini-1.5');
    expect(extraction).not.toContain('errorText.slice');
    expect(workspace).toContain("extractionPreparationKey.current = ''");
    expect(workspace).toContain('เปิด Manual fallback');
    expect(dossier).toContain("from('entity_mentions')");
    expect(model).toContain("status: 'LOCAL_AUTO_LOGIN'");
    expect(model).toContain("status: 'REVIEW_REQUIRED'");
    expect(companion).toContain('credentials_received_by_server: false');
    expect(companion).toContain('hasTrustedBrowserOrigin(request)');
    expect(capture).toContain("action: 'RECON_RESULT_IMPORTED'");
    expect(capture).toContain("raw_query_received_by_server: false");
    expect(capture).toContain("raw_provider_rows_received_by_server: false");
    expect(capture).toContain("capturedUrl.hostname !== expectedHost");
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

  it('keeps the notification stream authenticated, role-filtered, CSRF-protected, and free of raw evidence content', () => {
    const route = read('src/app/api/v1/notifications/route.ts');
    const builder = read('src/lib/notification-center.ts');
    expect(route).toContain('authorizeStaff(request, STAFF_READ_ROLES)');
    expect(route).toContain('INTAKE_READ_ROLES.has(auth.identity.role)');
    expect(route).toContain('REVIEW_ROLES.has(auth.identity.role)');
    expect(route).toContain('CASE_WRITE_ROLES.has(auth.identity.role)');
    expect(route).toContain('hasTrustedBrowserOrigin(request)');
    expect(route).toContain('consumeRateLimit');
    expect(route).toContain("from('notification_reads')");
    expect(`${route}\n${builder}`).not.toContain('raw_payload');
    expect(`${route}\n${builder}`).not.toContain('source_text');
    expect(`${route}\n${builder}`).not.toContain('candidate_value');
  });
});
