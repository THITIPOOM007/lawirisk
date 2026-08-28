import { describe, expect, it } from 'vitest';
import {
  assertSourceLaunchAllowed,
  buildLocalSearchCandidates,
  isHssResultBoundToQuery,
  parseReconUri,
  resolveFdaSearchModel,
  resolveEsta2SearchOption,
  resolveHssSearchFilter,
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
    expect(parseReconUri('lawirisk-recon://launch?source=HSS_ESTA2&service=HSS_HEALTH_BUSINESS_APPROVED').service).toBe('HSS_HEALTH_BUSINESS_APPROVED');
    expect(() => assertSourceLaunchAllowed(parseReconUri('lawirisk-recon://launch?source=HSS_ESTA2'))).not.toThrow();
    expect(() => parseReconUri('lawirisk-recon://launch?source=HSS_OSS&service=DBD&allow_insecure_http=1')).toThrow('SERVICE_NOT_ALLOWED');
  });

  it('maps only the reviewed ESTA2 approved-business search field', () => {
    expect(resolveEsta2SearchOption('HSS_HEALTH_BUSINESS_APPROVED', 'APPLICANT_NAME')).toBe('ชื่อผู้ยื่นคำร้อง');
    expect(resolveEsta2SearchOption('HSS_HEALTH_BUSINESS_APPROVED', 'APPLICANT_ID')).toBe('เลขที่บัตรประจำตัวประชาชนผู้ยื่น');
    expect(resolveEsta2SearchOption('HSS_HEALTH_BUSINESS_APPROVED', 'FACILITY_NAME')).toBe('ชื่อสถานประกอบการ ( ภาษาไทย )');
    expect(resolveEsta2SearchOption('HSS_HEALTH_BUSINESS_APPROVED', 'FACILITY_NAME_ENGLISH')).toBe('ชื่อสถานประกอบการ ( ภาษาอังกฤษ )');
    expect(resolveEsta2SearchOption('HSS_HEALTH_BUSINESS_APPROVED', 'LICENSE_NUMBER')).toBe('เลขที่ใบอนุญาต');
    expect(() => resolveEsta2SearchOption('HSS_HEALTH_BUSINESS_APPROVED', 'PHONE')).toThrow('SEARCH_FIELD_NOT_ALLOWED');
    expect(() => resolveEsta2SearchOption('HSS_FACILITY', 'FACILITY_NAME')).toThrow('SEARCH_FIELD_NOT_ALLOWED');
  });

  it('maps only the reviewed FDA exact identifier fields', () => {
    expect(resolveFdaSearchModel('DBD', 'JURISTIC_ID')).toBe('ENTRE_IDENTIFY');
    expect(resolveFdaSearchModel('DOPA', 'CITIZEN_ID')).toBe('CTZNO');
    expect(() => resolveFdaSearchModel('DBD', 'COMPANY_NAME')).toThrow('SEARCH_FIELD_NOT_ALLOWED');
    expect(() => resolveFdaSearchModel('DOPA', 'PERSON_NAME')).toThrow('SEARCH_FIELD_NOT_ALLOWED');
    expect(() => resolveFdaSearchModel('FDA_PLACE_DRUG', 'LICENSE_NUMBER')).toThrow('SEARCH_FIELD_NOT_ALLOWED');
  });

  it('builds bounded fallback searches for business names without broadening identifiers', () => {
    expect(buildLocalSearchCandidates(
      'HSS_ESTA2',
      'HSS_HEALTH_BUSINESS_APPROVED',
      'FACILITY_NAME',
      '  บีบี   ไทยอโรม่า นวดเพื่อสุขภาพ  ',
    )).toEqual([
      { value: 'บีบี ไทยอโรม่า นวดเพื่อสุขภาพ', strategy: 'EXACT' },
      { value: 'บีบี ไทยอโรม่า', strategy: 'BUSINESS_CORE' },
      { value: 'บีบี', strategy: 'DISTINCTIVE_TOKEN' },
    ]);

    expect(buildLocalSearchCandidates(
      'HSS_OSS',
      'HSS_FACILITY',
      'FACILITY_NAME',
      'ร้าน คลินิกตัวอย่าง เพื่อสุขภาพ',
    )).toEqual([
      { value: 'ร้าน คลินิกตัวอย่าง เพื่อสุขภาพ', strategy: 'EXACT' },
      { value: 'คลินิกตัวอย่าง', strategy: 'DISTINCTIVE_TOKEN' },
    ]);

    expect(buildLocalSearchCandidates(
      'HSS_ESTA2',
      'HSS_HEALTH_BUSINESS_APPROVED',
      'APPLICANT_ID',
      ' 1234567890123 ',
    )).toEqual([{ value: '1234567890123', strategy: 'EXACT' }]);

    expect(buildLocalSearchCandidates(
      'HSS_OSS',
      'HSS_PROFESSIONAL',
      'PERSON_NAME',
      'นาย ตัวอย่าง ทดสอบ',
    )).toEqual([{ value: 'นาย ตัวอย่าง ทดสอบ', strategy: 'EXACT' }]);
  });

  it('accepts only UUID v4 one-time job identifiers', () => {
    const request = parseReconUri('lawirisk-recon://launch?source=HSS_OSS&case_id=case-1&service=HSS_FACILITY&allow_insecure_http=1&job_id=123e4567-e89b-42d3-a456-426614174000');
    expect(request.jobId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(() => parseReconUri('lawirisk-recon://launch?source=HSS_OSS&job_id=not-a-job')).toThrow('INVALID_JOB_ID');
  });

  it('maps each HSS search field to a reviewed form value and rejects cross-service fields', () => {
    expect(resolveHssSearchFilter('HSS_FACILITY', 'PHONE')).toBe('Telphone');
    expect(resolveHssSearchFilter('HSS_PROFESSIONAL', 'CITIZEN_ID')).toBe('CitizenID');
    expect(() => resolveHssSearchFilter('HSS_PROFESSIONAL', 'PHONE')).toThrow('SEARCH_FIELD_NOT_ALLOWED');
    expect(() => resolveHssSearchFilter('DBD', 'PERSON_NAME')).toThrow('SEARCH_FIELD_NOT_ALLOWED');
  });

  it('fails closed when populated HSS result rows are not bound to the confirmed query', () => {
    expect(isHssResultBoundToQuery([], 'สถานพยาบาลทดสอบ')).toBe(true);
    expect(isHssResultBoundToQuery(['สถานพยาบาลทดสอบ 999999'], 'สถานพยาบาลทดสอบ')).toBe(true);
    expect(isHssResultBoundToQuery(['บริษัทที่ไม่เกี่ยวข้อง', 'ข้อมูลผู้ประกอบการอื่น'], 'สถานพยาบาลทดสอบ')).toBe(false);
    expect(isHssResultBoundToQuery(['080-000-0000'], '0800000000')).toBe(true);
  });

  it('returns safe messages without reflecting arbitrary errors or credentials', () => {
    const message = safeCompanionMessage(new Error('password=super-secret'));
    expect(message).toContain('ทำงานไม่สำเร็จ');
    expect(message).not.toContain('super-secret');
  });
});
