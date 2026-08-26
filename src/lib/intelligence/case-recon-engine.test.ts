import { describe, expect, it } from 'vitest';
import { runAutomatedCaseRecon } from './case-recon-engine';
import { evaluateLegalCharges } from './legal-charge-matrix';
import { validateThaiCitizenId, lookupDopaCitizen } from './connectors/dopa-connector';
import { lookupHssClinic } from './connectors/hss-clinic-connector';
import { lookupProfessionalLicense } from './connectors/council-connector';
import { geocodeAndReconLocation } from './connectors/geocoding-connector';
import { generateFullInvestigationDossier } from './dossier-builder';

describe('DOPA Citizen Connector & Checksum Validation', () => {
  it('validates authentic Thai 13-digit citizen IDs', () => {
    expect(validateThaiCitizenId('3320500587029')).toBe(true);
    expect(validateThaiCitizenId('1339900023752')).toBe(true);
    expect(validateThaiCitizenId('1111111111111')).toBe(false);
    expect(validateThaiCitizenId('1234')).toBe(false);
  });

  it('retrieves DOPA citizen profile by citizen ID or name', async () => {
    const profile = await lookupDopaCitizen({ citizenId: '3320500587029' });
    expect(profile).not.toBeNull();
    expect(profile?.fullName).toContain('กิติมา ซื่อสัตย์');
    expect(profile?.age).toBe(57);
    expect(profile?.fatherName).toBe('ชัด');
    expect(profile?.motherName).toBe('ปิน');
    expect(profile?.registeredAddress).toContain('หมากเขียบ');
  });
});

describe('HSS Clinic & Healthcare Facility Connector', () => {
  it('detects unlicensed clinics and illegal facilities', async () => {
    const result = await lookupHssClinic({ clinicName: 'สถานพยาบาลกิติยา' });
    expect(result.isIllegalClinic).toBe(true);
    expect(result.status).toBe('UNLICENSED_ILLEGAL');
    expect(result.licenseNumber).toBeNull();
    expect(result.findingsSummary).toContain('ไม่พบประวัติการขออนุญาต');
  });
});

describe('Professional Medical & Dental Council Connector', () => {
  it('detects illegal medical practitioner (หมอเถื่อน)', async () => {
    const result = await lookupProfessionalLicense({
      practitionerName: 'นางสาวกิติมา ซื่อสัตย์',
      contextType: 'GENERAL_MEDICAL',
    });
    expect(result.isIllegalPractitioner).toBe(true);
    expect(result.licenseNumber).toBeNull();
    expect(result.professionTitle).toContain('ไม่มีใบประกอบวิชาชีพ');
  });

  it('detects illegal dental practitioner (หมอฟันเถื่อน ขุขันธ์)', async () => {
    const result = await lookupProfessionalLicense({
      practitionerName: 'นายอนุชา ใจกล้า',
      contextType: 'DENTAL',
    });
    expect(result.isIllegalPractitioner).toBe(true);
    expect(result.councilType).toBe('DENTAL_COUNCIL');
    expect(result.professionTitle).toContain('หมอฟันเถื่อน');
  });
});

describe('Geocoding & Google Street View Recon Connector', () => {
  it('extracts GPS coordinates and Street View notes for Mak Khiap address', async () => {
    const result = await geocodeAndReconLocation('122 ม.3 ต.หมากเขียบ อ.เมือง จ.ศรีสะเกษ');
    expect(result.latitude).toBeCloseTo(15.072, 2);
    expect(result.longitude).toBeCloseTo(104.255, 2);
    expect(result.googleMapsUrl).toContain('maps');
    expect(result.surveillanceNotes).toContain('กิติยาพร');
  });
});

describe('Legal Charge Matrix Evaluator', () => {
  it('matches severe criminal and health act charges for patient shock case', () => {
    const result = evaluateLegalCharges({
      isIllegalClinic: true,
      isIllegalDoctor: true,
      hasPatientHarmOrShock: true,
      hasUnregisteredDrugs: true,
      factsText: 'ฉีดยาจนผู้ป่วยช็อคหมดสติ ชักเกร็ง ส่งตัวรักษา รพ.ปริ้นซ์ศรีสะเกษ',
    });

    expect(result.overallRiskLevel).toBe('CRITICAL_URGENT');
    expect(result.urgencyScore).toBeGreaterThanOrEqual(90);
    const chargeCodes = result.applicableCharges.map((c) => c.code);
    expect(chargeCodes).toContain('SAN_FACILITY_16_24');
    expect(chargeCodes).toContain('MED_PRACTICE_26');
    expect(chargeCodes).toContain('CRIMINAL_CODE_300_297');
    expect(chargeCodes).toContain('DRUG_ACT_12_72');
  });

  it('matches dental act charges and OCPB order for Khukhan fashion braces case', () => {
    const result = evaluateLegalCharges({
      isIllegalClinic: true,
      isIllegalDoctor: true,
      isDentalContext: true,
      hasPatientHarmOrShock: false,
      factsText: 'บริการจัดฟันแฟชั่นและใส่ฟันปลอม อ.ขุขันธ์',
    });

    expect(result.overallRiskLevel).toBe('HIGH_RISK');
    const chargeCodes = result.applicableCharges.map((c) => c.code);
    expect(chargeCodes).toContain('DENTAL_PRACTICE_28');
    expect(chargeCodes).toContain('OCPB_FASHION_BRACES_10_2552');
  });
});

describe('Full Automated Case Recon Engine & Dossier Builder', () => {
  it('orchestrates 5-dimension recon and builds official dispatch letters', async () => {
    const report = await runAutomatedCaseRecon({
      caseId: 'case-test-1',
      caseNumber: 'ค.789/2569',
      caseTitle: 'คดีสถานพยาบาลกิติยาเถื่อน ฉีดยาช็อคหมดสติ ต.หมากเขียบ',
      accusedName: 'นางสาวกิติมา ซื่อสัตย์',
      locationAddress: '122 ม.3 ต.หมากเขียบ อ.เมือง จ.ศรีสะเกษ',
      rawText: 'ฉีดยาจนผู้ป่วยช็อคหมดสติ ชักเกร็ง ส่งตัวฉุกเฉิน รพ.ปริ้นซ์ศรีสะเกษ',
    });

    expect(report.reconStatus).toBe('COMPLETED');
    expect(report.dopaProfile?.citizenId).toBe('3320500587029');
    expect(report.hssClinic.isIllegalClinic).toBe(true);
    expect(report.practitionerLicense.isIllegalPractitioner).toBe(true);
    expect(report.locationRecon.district).toBe('เมืองศรีสะเกษ');
    expect(report.legalAssessment.overallRiskLevel).toBe('CRITICAL_URGENT');

    const dossierDocs = generateFullInvestigationDossier(report);
    expect(dossierDocs.length).toBe(3);
    const policeDoc = dossierDocs.find((d) => d.docCategory === 'POLICE_DISPATCH_LETTER');
    expect(policeDoc?.issuedTo).toContain('สถานีตำรวจภูธรเมืองศรีสะเกษ');
    expect(policeDoc?.plainText).toContain('กิติมา ซื่อสัตย์');
  });
});
