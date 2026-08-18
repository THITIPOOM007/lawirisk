import { describe, expect, it } from 'vitest';
import { EXTERNAL_SOURCES, externalSourceKeySchema, findExternalSource, isLaunchableSource } from './external-sources';

describe('external source allowlist', () => {
  it('contains only the two reviewed government sources', () => {
    expect(EXTERNAL_SOURCES.map((source) => source.key)).toEqual(['FDA_SKYNET', 'HSS_OSS']);
    expect(externalSourceKeySchema.safeParse('https://attacker.example').success).toBe(false);
  });

  it('allows launch only for a reviewed HTTPS entry point', () => {
    const fda = findExternalSource('FDA_SKYNET');
    expect(fda && isLaunchableSource(fda)).toBe(true);
    expect(fda?.launchUrl).toMatch(/^https:\/\//);
  });

  it('fails closed for the HSS portal while it redirects to HTTP', () => {
    const hss = findExternalSource('HSS_OSS');
    expect(hss?.accessMode).toBe('BLOCKED_INSECURE_TRANSPORT');
    expect(hss?.launchUrl).toBeNull();
    expect(hss && isLaunchableSource(hss)).toBe(false);
  });
});
