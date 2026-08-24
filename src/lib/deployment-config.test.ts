import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wranglerConfig = readFileSync('wrangler.jsonc', 'utf8');
const deployScript = readFileSync('scripts/deploy-staging.mjs', 'utf8');

const readinessSecrets = [
  'N8N_AUTOMATION_WEBHOOK_URL',
  'N8N_DISPATCH_TOKEN',
  'N8N_CALLBACK_TOKEN',
];

describe('staging deployment contract', () => {
  it.each(readinessSecrets)('declares and checks %s before deployment', (secretName) => {
    expect(wranglerConfig).toContain(`"${secretName}"`);
    expect(deployScript).toContain(`'${secretName}'`);
  });

  it('checks Cloudflare secret names before invoking deployment', () => {
    expect(deployScript.indexOf('assertCloudflareSecrets();')).toBeLessThan(deployScript.indexOf('const deployment = runPnpm'));
  });

  it('does not require or bind a malware scanner', () => {
    expect(wranglerConfig).not.toContain('MALWARE_SCANNER');
    expect(deployScript).not.toContain('MALWARE_SCANNER');
  });
});
