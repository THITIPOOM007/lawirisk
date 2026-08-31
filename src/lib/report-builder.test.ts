import { describe, expect, it } from 'vitest';
import { buildCaseReport, buildPredictionFormReport } from './report-builder';
import type { ReportIntakeContext } from './report-context';

const intake = (overrides: Partial<ReportIntakeContext> = {}): ReportIntakeContext => ({
  envelopeId: '00000000-0000-4000-8000-000000000001', receivedAt: '2026-08-30T00:30:00.000Z', complainantMode: 'IDENTIFIED',
  trackingToken: 'TRK-TEST-001', topic: 'ตรวจสอบผลิตภัณฑ์อาหาร', description: 'ผู้ร้องสงสัยว่าฉลากไม่ตรงกับสถานที่ผลิต', category: 'HEALTH_HAZARD',
  region: 'จังหวัดทดสอบ', incidentDate: '2026-08-29', incidentTime: '13:00', incidentLocation: 'ร้านค้าทดสอบ', productName: 'ผลิตภัณฑ์ทดสอบ',
  registrationNumber: '00-0-00000-0-0000', businessName: 'โรงงานทดสอบ', businessAddress: 'อำเภอทดสอบ จังหวัดทดสอบ', purchaseDetails: 'ซื้อ 2 หน่วย ราคา 100 บาท',
  desiredAction: 'ตรวจทะเบียนและสถานที่ผลิต', triageReason: 'ข้อมูลอยู่ในขอบเขตงานอาหาร',
  participants: [{ role: 'COMPLAINANT', name: 'ผู้ร้องตัวอย่าง', phone: '0800000000' }],
  officialChecks: [{ sourceLabel: 'ฐานข้อมูลทางการตัวอย่าง', sourceUrl: 'https://example.go.th/', query: '00-0-00000-0-0000', status: 'FOUND', classification: 'SUGGESTED', summary: 'พบ 1 รายการให้เจ้าหน้าที่เปิดต้นทางตรวจทาน', checkedAt: '2026-08-30T00:31:00.000Z', resultCount: 1, results: [{ title: 'ผลิตภัณฑ์ทดสอบ' }] }],
  ...overrides,
});

describe('deterministic report builder', () => {
  it('includes source-backed facts and an explicit non-adjudication boundary', () => {
    const report = buildCaseReport({
      caseRecord: { number: 'ค.1/2569', title: 'กรณีทดสอบ', description: 'รายละเอียด', status: 'ACTIVE', created_at: '2026-08-18T00:00:00.000Z' },
      reportType: 'SUMMARY',
      evidence: [{ filename: 'source.pdf', sha256: 'a'.repeat(64), malware_scan_status: 'CLEAN' }],
      sourcedEntities: [{ type: 'PHONE', value: '0800000000' }],
      sourcedRelationships: [{ type: 'CONTACTED' }],
      generatedAt: new Date('2026-08-18T01:00:00.000Z'),
    });
    expect(report).toContain('SHA-256');
    expect(report).toContain('PHONE: 0800000000');
    expect(report).toContain('ไม่ใช่ข้อวินิจฉัยความผิด');
    expect(report).toContain('2026-08-18T01:00:00.000Z');
  });

  it('builds the ten-section prediction form without inventing legal conclusions', () => {
    const report = buildPredictionFormReport({
      caseRecord: { number: 'ค.2/2569', title: 'กรณีทดสอบฟอร์ม', description: 'ตรวจสอบข้อเท็จจริง', status: 'ACTIVE', jurisdiction_region: 'พื้นที่สังเคราะห์', created_at: '2026-08-30T00:00:00.000Z' },
      evidence: [{ filename: 'evidence.pdf', sha256: 'b'.repeat(64), malware_scan_status: 'CLEAN' }],
      sourcedEntities: [{ type: 'ORGANIZATION', value: 'องค์กรตัวอย่าง' }],
      sourcedRelationships: [],
      screenings: [{ filename: 'evidence.pdf', classification: 'DIRECT', summary: 'พบข้อมูลที่ยืนยันแล้ว', status: 'SUGGESTED' }],
      automaticAdvice: [
        {
          id: 'advice-evidence', status: 'AUTO_ADVICE', priority: 'HIGH', category: 'EVIDENCE_PRIORITY',
          title: 'เริ่มตรวจจากหลักฐานที่เชื่อมโยงมากที่สุด',
          recommendation: 'เปิด evidence.pdf และตรวจ source trace ก่อน',
          rationale: 'พบข้อความที่เชื่อมโยงกับประเด็นคดีโดยตรง', confidence: 0.9,
          sourceEvidenceIds: ['evidence-1'], sourceCount: 1, officialConfirmationRequired: false,
        },
        {
          id: 'advice-legal', status: 'AUTO_ADVICE', priority: 'MEDIUM', category: 'LEGAL_RESEARCH',
          title: 'ประเด็นกฎหมายที่ควรค้นจากฐานข้อมูลทางการ',
          recommendation: 'ค้นฐานข้อมูลทางการเรื่องใบอนุญาตและฉลาก',
          rationale: 'เป็นหัวข้อค้นคว้าจากประเภทกิจการ ไม่ใช่ข้อวินิจฉัย', confidence: 0.68,
          sourceEvidenceIds: ['evidence-1'], sourceCount: 1, officialConfirmationRequired: true,
        },
      ],
      intakeContexts: [intake()],
      generatedAt: new Date('2026-08-30T01:00:00.000Z'),
    });
    expect(report.sections).toHaveLength(10);
    expect(report.sections[8].content).toContain('SHA-256');
    expect(report.automationSummary?.status).toBe('AUTO_ADVICE_READY');
    expect(report.automatedAdvice).toHaveLength(2);
    expect(report.sections[4].content).toContain('เปิด evidence.pdf');
    expect(report.sections[4].content).toContain('ไม่วินิจฉัยข้อหา');
    expect(report.sections[5].content).toContain('ค้นฐานข้อมูลทางการเรื่องใบอนุญาตและฉลาก');
    expect(report.sections[5].content).toContain('ไม่ใช่การยืนยัน');
    expect(report.sections[9].content).toContain('ความเชื่อมั่น: 90%');
    expect(report.schemaVersion).toBe('lawirisk-prediction-form-v2');
    expect(report.dataQuality?.status).toBe('COMPLETE');
    expect(report.sections[0].content).toContain('ผู้ร้องตัวอย่าง');
    expect(report.sections[3].content).toContain('ฐานข้อมูลทางการตัวอย่าง');
    expect(report.sections[3].content).toContain('00-0-00000-0-0000');
  });

  it.each([
    ['โรงงานอาหารไม่ถูกสุขลักษณะ', 'โรงงานเส้นทดสอบ', 'ตรวจสภาพสถานที่ผลิต'],
    ['น้ำดื่มสงสัยสวมฉลาก', 'โรงงานน้ำทดสอบ', 'ตรวจทะเบียนและฉลาก'],
    ['ขนมปังสงสัยวัตถุดิบปลอม', 'ร้านขนมทดสอบ', 'เก็บตัวอย่างส่งตรวจ'],
  ])('keeps real-case report fields source-bound: %s', (topic, businessName, desiredAction) => {
    const report = buildPredictionFormReport({
      caseRecord: { number: 'CASE-STUDY', title: topic, status: 'ACTIVE', created_at: '2026-08-30T00:00:00.000Z' },
      evidence: [{ filename: 'ต้นเรื่อง.pdf', sha256: 'e'.repeat(64), malware_scan_status: 'CLEAN' }],
      sourcedEntities: [], sourcedRelationships: [], intakeContexts: [intake({ topic, businessName, desiredAction })],
    });
    expect(report.sections).toHaveLength(10);
    expect(report.sections[1].content).toContain(topic);
    expect(report.sections[3].content).toContain(businessName);
    expect(report.sections[9].content).toContain(desiredAction);
    expect(report.sections[5].content).toContain('ยังไม่ใส่มาตรา');
  });
});
