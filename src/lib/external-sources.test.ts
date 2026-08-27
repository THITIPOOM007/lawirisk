import { describe, expect, it } from 'vitest';
import { buildReconCompanionUri, EXTERNAL_SOURCES, externalSourceKeySchema, findExternalSource, isLaunchableSource } from './external-sources';

describe('external source allowlist', () => {
  it('contains only the two reviewed government sources', () => {
    expect(EXTERNAL_SOURCES.map((source) => source.key)).toEqual(['FDA_SKYNET', 'HSS_OSS']);
    expect(externalSourceKeySchema.safeParse('https://attacker.example').success).toBe(false);
  });

  it('allows launch only for a reviewed HTTPS entry point', () => {
    const fda = findExternalSource('FDA_SKYNET');
    expect(fda && isLaunchableSource(fda)).toBe(true);
    expect(fda?.launchUrl).toBe('https://privus.fda.moph.go.th/FDA_LOGIN2/HOME/SET_STATE?STATE=3');
  });

  it('requires explicit risk acknowledgement before handing HSS to the local companion', () => {
    const hss = findExternalSource('HSS_OSS');
    expect(hss?.accessMode).toBe('LOCAL_AUTO_LOGIN_RISK_ACK_REQUIRED');
    expect(hss?.launchUrl).toBe('http://oss.hss.moph.go.th/auth/login');
    expect(hss && isLaunchableSource(hss)).toBe(false);
    expect(() => hss && buildReconCompanionUri(hss)).toThrow('INSECURE_TRANSPORT_ACK_REQUIRED');
    expect(hss && buildReconCompanionUri(hss, { acknowledgeInsecureTransport: true })).toContain('allow_insecure_http=1');
  });

  it('builds an allow-listed local companion URI without credentials', () => {
    const fda = findExternalSource('FDA_SKYNET');
    const uri = fda && buildReconCompanionUri(fda, { caseId: 'case-1', service: 'DOPA' });
    expect(uri).toBe('lawirisk-recon://launch?source=FDA_SKYNET&case_id=case-1&service=DOPA');
    expect(uri).not.toMatch(/password|token|cookie/i);
  });

  it('rejects a service that does not belong to the selected source', () => {
    const hss = findExternalSource('HSS_OSS');
    expect(() => hss && buildReconCompanionUri(hss, {
      service: 'DOPA',
      acknowledgeInsecureTransport: true,
    })).toThrow('SERVICE_NOT_ALLOWED');
  });
});
