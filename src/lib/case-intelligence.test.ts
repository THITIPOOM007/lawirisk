import { describe, expect, it } from 'vitest';
import { buildCaseReconSummary, buildVerifiedDossierDocuments } from './case-intelligence';

describe('case intelligence workspace', () => {
  it('reports complete recon coverage without fabricated findings', () => {
    const report = buildCaseReconSummary({
      caseId: 'case-1',
      caseNumber: 'ค.1/2569',
      caseTitle: 'ทดสอบ',
      evidenceCount: 2,
      entityCount: 3,
      verifiedRelationshipCount: 1,
      crossCaseMatchCount: 1,
    });

    expect(report.dimensions.find((item) => item.key === 'CROSS_CASE')?.status).toBe('AVAILABLE');
    expect(report.dimensions).toHaveLength(10);
    expect(report.dimensions.find((item) => item.key === 'PERSON_CONTACT')?.label).toContain('เบอร์โทร');
    expect(report.dimensions.find((item) => item.key === 'PHOTO_IMAGE')?.label).toContain('ภาพถ่าย');
    expect(report.dimensions.find((item) => item.key === 'CIRCUMSTANTIAL')?.label).toContain('พยานแวดล้อม');
    expect(report.dimensions.find((item) => item.key === 'PRODUCT_REGISTRY')?.status).toBe('LOCAL_AUTO_LOGIN');
    expect(JSON.stringify(report)).not.toMatch(/คลินิกเถื่อน|หมอเถื่อน|ยืนยันตัวตนแล้ว/);
  });

  it('builds plain-text drafts with source hashes and explicit review status', () => {
    const documents = buildVerifiedDossierDocuments({
      caseNumber: 'ค.1/2569',
      caseTitle: '<script>alert(1)</script>',
      description: 'ข้อเท็จจริงที่บันทึกไว้',
      evidence: [{ filename: 'source.pdf', sha256: 'a'.repeat(64) }],
      verifiedFacts: ['ORGANIZATION: ตัวอย่าง'],
      verifiedRelationships: ['ASSOCIATED_WITH'],
    });

    expect(documents).toHaveLength(3);
    expect(documents[0].plainText).toContain('SHA-256');
    expect(documents[0].plainText).toContain('ร่างเพื่อการตรวจทาน');
    expect(documents.every((item) => !('contentHtml' in item))).toBe(true);
  });
});
