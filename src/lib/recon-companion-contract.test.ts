import { describe, expect, it } from 'vitest';
import {
  assertSourceLaunchAllowed,
  parseReconUri,
  safeCompanionMessage,
} from '../../scripts/recon/companion-contract.mjs';

describe('local recon companion contract', () => {
  it('accepts only the allow-listed protocol, action, and source', () => {
    const request = parseReconUri('lawirisk-recon://launch?source=FDA_SKYNET&case_id=case-1');
    expect(request.action).toBe('launch');
    expect(request.source.key).toBe('FDA_SKYNET');
    expect(request.caseId).toBe('case-1');
    expect(() => parseReconUri('https://example.com/?source=FDA_SKYNET')).toThrow('INVALID_RECON_PROTOCOL');
    expect(() => parseReconUri('lawirisk-recon://launch?source=ATTACKER')).toThrow('SOURCE_NOT_ALLOWED');
  });

  it('fails closed for HSS unless the per-launch HTTP acknowledgement is present', () => {
    const denied = parseReconUri('lawirisk-recon://launch?source=HSS_OSS');
    expect(() => assertSourceLaunchAllowed(denied)).toThrow('INSECURE_HTTP_ACK_REQUIRED');
    const allowed = parseReconUri('lawirisk-recon://launch?source=HSS_OSS&allow_insecure_http=1');
    expect(() => assertSourceLaunchAllowed(allowed)).not.toThrow();
  });

  it('allows only source-bound service navigation', () => {
    expect(parseReconUri('lawirisk-recon://launch?source=FDA_SKYNET&service=DBD').service).toBe('DBD');
    expect(parseReconUri('lawirisk-recon://launch?source=HSS_OSS&service=HSS_FACILITY&allow_insecure_http=1').service).toBe('HSS_FACILITY');
    expect(() => parseReconUri('lawirisk-recon://launch?source=HSS_OSS&service=DBD&allow_insecure_http=1')).toThrow('SERVICE_NOT_ALLOWED');
  });

  it('returns safe messages without reflecting arbitrary errors or credentials', () => {
    const message = safeCompanionMessage(new Error('password=super-secret'));
    expect(message).toContain('ทำงานไม่สำเร็จ');
    expect(message).not.toContain('super-secret');
  });
});
