import { describe, expect, it } from 'vitest';
import { buildReconCompanionUri, companionLaunchRequestSchema, EXTERNAL_SOURCES, externalSourceKeySchema, findExternalSource, isLaunchableSource } from './external-sources';

describe('external source allowlist', () => {
  it('contains only the three reviewed government sources', () => {
    expect(EXTERNAL_SOURCES.map((source) => source.key)).toEqual(['FDA_SKYNET', 'HSS_OSS', 'HSS_ESTA2']);
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

  it('allows the reviewed HTTPS ESTA2 approved-business entry point without an HTTP exception', () => {
    const esta2 = findExternalSource('HSS_ESTA2');
    expect(esta2?.transport).toBe('HTTPS');
    expect(esta2?.launchUrl).toBe('https://esta2.hss.moph.go.th/business/approved');
    expect(esta2 && isLaunchableSource(esta2)).toBe(true);
    expect(esta2 && buildReconCompanionUri(esta2, { service: 'HSS_HEALTH_BUSINESS_APPROVED' }))
      .toBe('lawirisk-recon://launch?source=HSS_ESTA2&service=HSS_HEALTH_BUSINESS_APPROVED');
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

  it('advertises local automatic search only for reviewed HSS forms', () => {
    const fda = findExternalSource('FDA_SKYNET');
    const hss = findExternalSource('HSS_OSS');
    const esta2 = findExternalSource('HSS_ESTA2');
    expect(fda?.services.every((service) => service.automationMode === 'FORM_ONLY' && service.searchFields.length === 0)).toBe(true);
    expect(hss?.services.every((service) => service.automationMode === 'LOCAL_SEARCH' && service.searchFields.length > 0)).toBe(true);
    expect(hss?.services.find((service) => service.key === 'HSS_FACILITY')?.searchFields.map((field) => field.key)).toContain('PHONE');
    expect(hss?.services.find((service) => service.key === 'HSS_PROFESSIONAL')?.searchFields.map((field) => field.key)).toContain('CITIZEN_ID');
    expect(esta2?.services).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'HSS_HEALTH_BUSINESS_APPROVED',
        automationMode: 'LOCAL_SEARCH',
        searchFields: [expect.objectContaining({ key: 'FACILITY_NAME' })],
      }),
    ]));
  });

  it('never accepts a raw query in the cloud companion authorization contract', () => {
    expect(companionLaunchRequestSchema.safeParse({
      case_id: 'case-1',
      service: 'HSS_FACILITY',
      intent: 'LOCAL_SEARCH',
      acknowledge_insecure_transport: true,
    }).success).toBe(true);
    expect(companionLaunchRequestSchema.safeParse({
      case_id: 'case-1',
      service: 'HSS_FACILITY',
      intent: 'LOCAL_SEARCH',
      acknowledge_insecure_transport: true,
      query: 'ข้อมูลส่วนบุคคล',
    }).success).toBe(false);
  });
});
