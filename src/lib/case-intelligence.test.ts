import { describe, expect, it } from 'vitest';
import { buildCaseIntelligenceSearchResult, buildCaseReconSummary, buildVerifiedDossierDocuments } from './case-intelligence';

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

  it('answers with only source-traceable findings and keeps registry matches reviewable', () => {
    const search = buildCaseIntelligenceSearchResult({
      evidenceInventory: [{ id: 'evidence-1', filename: 'source.pdf', sha256: 'b'.repeat(64), safetyStatus: 'CLEAN' }],
      verifiedFacts: [{
        id: 'mention-1',
        entityType: 'PHONE',
        value: '080-000-0000',
        evidenceId: 'evidence-1',
        filename: 'source.pdf',
        pageNumber: 2,
        snippet: 'ติดต่อ 080-000-0000',
        sha256: 'b'.repeat(64),
      }],
      verifiedRelationships: [],
      trustedRegistryFindings: [{
        id: 'registry-1',
        title: 'ประกาศเตือนภัยที่เกี่ยวข้อง',
        snippet: 'พบเบอร์โทรในประกาศของหน่วยงาน',
        source: 'หน่วยงานทางการ',
        sourceUrl: 'https://example.go.th/notices/1',
        publishedDate: '2569-08-01',
      }],
      searchedRegistryTermCount: 1,
      pendingReviewCount: 2,
      registryStatus: 'SEARCHED',
      groundedWebFindings: [{
        id: 'web-1',
        title: 'ชุดข้อมูลเปิดที่เกี่ยวข้อง',
        snippet: 'พบข้อความที่ตรงกับคำค้นในหน้าเผยแพร่ของหน่วยงาน',
        source: 'ศูนย์ข้อมูลเปิดภาครัฐ',
        sourceUrl: 'https://data.example.go.th/dataset/1',
        publishedDate: 'ตรวจพบจากเว็บล่าสุด',
      }],
      publicWebQueryCount: 1,
      publicWebStatus: 'SEARCHED',
    });

    expect(search.findings).toHaveLength(3);
    expect(search.summary).toContain('ตรวจย้อนกลับได้ 3 รายการ');
    expect(search.findings[0].source).toMatchObject({ filename: 'source.pdf', pageNumber: 2 });
    expect(search.findings[1]).toMatchObject({ kind: 'TRUSTED_REGISTRY', statusLabel: 'พบรายการเกี่ยวข้องในทะเบียนที่อนุมัติ' });
    expect(search.findings[2]).toMatchObject({
      kind: 'GROUNDED_WEB',
      statusLabel: 'พบจากเว็บสาธารณะ · รอตรวจทาน',
      source: { url: 'https://data.example.go.th/dataset/1' },
    });
    expect(search.publicWebFindingCount).toBe(1);
    expect(search.publicWebQueryCount).toBe(1);
    expect(search.notice).toContain('ไม่ใช่การยืนยัน');
  });

  it('explains an empty result instead of fabricating an answer', () => {
    const search = buildCaseIntelligenceSearchResult({
      evidenceInventory: [],
      verifiedFacts: [],
      verifiedRelationships: [],
      trustedRegistryFindings: [],
      searchedRegistryTermCount: 0,
      pendingReviewCount: 3,
      registryStatus: 'NO_ELIGIBLE_TERMS',
    });

    expect(search.findings).toEqual([]);
    expect(search.summary).toContain('ข้อเสนอรอตรวจทาน 3 รายการ');
  });

  it('shows clean evidence inventory when extraction has not produced reviewed facts yet', () => {
    const search = buildCaseIntelligenceSearchResult({
      evidenceInventory: [{ id: 'evidence-1', filename: 'complaint.pdf', sha256: 'c'.repeat(64), safetyStatus: 'CLEAN' }],
      verifiedFacts: [],
      verifiedRelationships: [],
      trustedRegistryFindings: [],
      searchedRegistryTermCount: 0,
      pendingReviewCount: 0,
      registryStatus: 'NO_ELIGIBLE_TERMS',
    });

    expect(search.summary).toContain('พบหลักฐานต้นฉบับที่ตรวจโครงสร้างแล้ว 1 ไฟล์');
    expect(search.evidenceInventory[0]).toMatchObject({ filename: 'complaint.pdf', safetyStatus: 'CLEAN' });
  });

  it('keeps stored evidence usable without falsely labelling an unscanned file as clean', () => {
    const search = buildCaseIntelligenceSearchResult({
      evidenceInventory: [{ id: 'evidence-2', filename: 'capture.png', sha256: 'd'.repeat(64), safetyStatus: 'NOT_SCANNED' }],
      verifiedFacts: [],
      verifiedRelationships: [],
      trustedRegistryFindings: [],
      searchedRegistryTermCount: 0,
      pendingReviewCount: 0,
      registryStatus: 'NO_ELIGIBLE_TERMS',
    });

    expect(search.evidenceInventory).toEqual([
      expect.objectContaining({ filename: 'capture.png', safetyStatus: 'NOT_SCANNED' }),
    ]);
    expect(search.summary).toContain('พบหลักฐานต้นฉบับที่ตรวจโครงสร้างแล้ว 1 ไฟล์');
  });
});
