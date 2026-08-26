export interface LegalCharge {
  code: string;
  actTitleTh: string;
  sectionTh: string;
  penaltyTh: string;
  elementsDescription: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  relevanceScore: number;
  matchedKeywords: string[];
}

export interface LegalAssessmentResult {
  overallRiskLevel: 'CRITICAL_URGENT' | 'HIGH_RISK' | 'MODERATE_RISK';
  urgencyScore: number; // 0 - 100
  recommendedImmediateActions: string[];
  applicableCharges: LegalCharge[];
  executiveSummary: string;
}

export function evaluateLegalCharges(input: {
  isIllegalClinic: boolean;
  isIllegalDoctor: boolean;
  isDentalContext?: boolean;
  hasPatientHarmOrShock?: boolean;
  hasUnregisteredDrugs?: boolean;
  factsText: string;
}): LegalAssessmentResult {
  const charges: LegalCharge[] = [];
  const text = input.factsText.toLowerCase();

  // 1. Unlicensed Healthcare Facility (พ.ร.บ.สถานพยาบาล พ.ศ. 2541)
  if (input.isIllegalClinic || text.includes('สถานพยาบาล') || text.includes('คลินิก') || text.includes('เปิดร้าน')) {
    charges.push({
      code: 'SAN_FACILITY_16_24',
      actTitleTh: 'พระราชบัญญัติสถานพยาบาล พ.ศ. 2541 และที่แก้ไขเพิ่มเติม',
      sectionTh: 'มาตรา 16 ประกอบมาตรา 24 (เปิดและประกอบกิจการสถานพยาบาลโดยไม่ได้รับอนุญาต)',
      penaltyTh: 'ระวางโทษจำคุกไม่เกิน 5 ปี หรือปรับไม่เกิน 100,000 บาท หรือทั้งจำทั้งปรับ (มาตรา 56)',
      elementsDescription: 'จัดตั้งและดำเนินการสถานพยาบาลโดยมิได้รับใบอนุญาตให้ประกอบกิจการและใบอนุญาตให้ดำเนินการสถานพยาบาลจากผู้อนุญาต (นายแพทย์สาธารณสุขจังหวัด)',
      severity: 'HIGH',
      relevanceScore: 0.98,
      matchedKeywords: ['สถานพยาบาล', 'คลินิก', 'เปิดบริการรักษา', 'กิติยา'],
    });
  }

  // 2. Unlicensed Medical Practice (พ.ร.บ.วิชาชีพเวชกรรม พ.ศ. 2525)
  if (input.isIllegalDoctor && !input.isDentalContext) {
    charges.push({
      code: 'MED_PRACTICE_26',
      actTitleTh: 'พระราชบัญญัติวิชาชีพเวชกรรม พ.ศ. 2525',
      sectionTh: 'มาตรา 26 (ประกอบวิชาชีพเวชกรรมโดยไม่ได้รับอนุญาต / หมอเถื่อน)',
      penaltyTh: 'ระวางโทษจำคุกไม่เกิน 3 ปี หรือปรับไม่เกิน 30,000 บาท หรือทั้งจำทั้งปรับ (มาตรา 43)',
      elementsDescription: 'กระทำด้วยประการใดๆ ที่แสดงหรือทำให้ผู้อื่นเข้าใจว่าตนเป็นผู้มีสิทธิประกอบวิชาชีพเวชกรรม หรือกระทำการตรวจ วินิจฉัย บำบัด หรือฉีดยาให้แก่ผู้ป่วยโดยไม่ได้ขึ้นทะเบียนและรับใบอนุญาตเป็นผู้ประกอบวิชาชีพเวชกรรมจากแพทยสภา',
      severity: 'HIGH',
      relevanceScore: 0.95,
      matchedKeywords: ['ฉีดยา', 'รักษา', 'หมอเถื่อน', 'ตรวจโรค'],
    });
  }

  // 3. Unlicensed Dental Practice (พ.ร.บ.วิชาชีพทันตกรรม พ.ศ. 2537)
  if (input.isDentalContext || text.includes('ฟัน') || text.includes('จัดฟัน') || text.includes('ทันต')) {
    charges.push({
      code: 'DENTAL_PRACTICE_28',
      actTitleTh: 'พระราชบัญญัติวิชาชีพทันตกรรม พ.ศ. 2537',
      sectionTh: 'มาตรา 28 (ประกอบวิชาชีพทันตกรรมโดยไม่ได้รับอนุญาต / หมอฟันเถื่อน)',
      penaltyTh: 'ระวางโทษจำคุกไม่เกิน 3 ปี หรือปรับไม่เกิน 30,000 บาท หรือทั้งจำทั้งปรับ (มาตรา 50)',
      elementsDescription: 'กระทำการตรวจ วินิจฉัย บำบัด หรือป้องกันโรคฟัน โรคในช่องปาก การดัดฟัน ใส่ลวด หรือทำฟันเทียมให้แก่ผู้อื่นโดยมิได้ขึ้นทะเบียนและรับใบอนุญาตจากทันตแพทยสภา',
      severity: 'HIGH',
      relevanceScore: 0.96,
      matchedKeywords: ['จัดฟัน', 'ทำฟัน', 'ลวดดัดฟัน', 'ทันตกรรม'],
    });

    charges.push({
      code: 'OCPB_FASHION_BRACES_10_2552',
      actTitleTh: 'คำสั่งคณะกรรมการคุ้มครองผู้บริโภค (สคบ.) ที่ 10/2552',
      sectionTh: 'ห้ามขายสินค้าลวดดัดฟันแฟชั่นที่เป็นอันตรายต่อผู้บริโภค',
      penaltyTh: 'ระวางโทษจำคุกไม่เกิน 5 ปี หรือปรับไม่เกิน 500,000 บาท หรือทั้งจำทั้งปรับ (ผู้ผลิต/นำเข้า จำคุกไม่เกิน 10 ปี ปรับไม่เกิน 1,000,000 บาท)',
      elementsDescription: 'จำหน่าย ให้บริการ หรือจัดหาสินค้าลวดดัดฟันแฟชั่นซึ่งอาจมีสารโลหะหนักปนเปื้อนหรือทำให้ติดเชื้อในช่องปาก',
      severity: 'MEDIUM',
      relevanceScore: 0.90,
      matchedKeywords: ['จัดฟันแฟชั่น', 'ยางจัดฟัน', 'ลวดดัดฟัน'],
    });
  }

  // 4. Grievous Bodily Harm / Negligence Causing Serious Injury (ประมวลกฎหมายอาญา)
  if (input.hasPatientHarmOrShock || text.includes('ช็อค') || text.includes('หมดสติ') || text.includes('ไอซียู') || text.includes('icu') || text.includes('ชักเกร็ง') || text.includes('ปริ้นซ์')) {
    charges.push({
      code: 'CRIMINAL_CODE_300_297',
      actTitleTh: 'ประมวลกฎหมายอาญา',
      sectionTh: 'มาตรา 300 ประกอบมาตรา 297 (กระทำโดยประมาทเป็นเหตุให้ผู้อื่นรับอันตรายสาหัส)',
      penaltyTh: 'ระวางโทษจำคุกไม่เกิน 3 ปี หรือปรับไม่เกิน 60,000 บาท หรือทั้งจำทั้งปรับ (หากมีเจตนาทำร้ายเป็นเหตุให้สาหัส ม.297 จำคุกตั้งแต่ 6 เดือน ถึง 10 ปี)',
      elementsDescription: 'การฉีดยาหรือทำหัตถการทางการแพทย์โดยไร้ความรู้ความชำนาญทางวิชาชีพเวชกรรม จนเป็นเหตุให้ผู้ป่วยเกิดภาวะแพ้ยารุนแรง (Anaphylactic Shock) ชักเกร็ง หมดสติ ต้องส่งรักษาห้องฉุกเฉิน/ICU และใช้เครื่องช่วยหายใจ ถือเป็นอันตรายถึงชีวิตและอันตรายสาหัส',
      severity: 'CRITICAL',
      relevanceScore: 0.99,
      matchedKeywords: ['ช็อค', 'หมดสติ', 'ชักเกร็ง', 'ส่งรพ.', 'เครื่องช่วยหายใจ'],
    });
  }

  // 5. Drug Act Violations (พ.ร.บ.ยา พ.ศ. 2510)
  if (input.hasUnregisteredDrugs || text.includes('ฉีดยา') || text.includes('ยา') || text.includes('เข็ม')) {
    charges.push({
      code: 'DRUG_ACT_12_72',
      actTitleTh: 'พระราชบัญญัติยา พ.ศ. 2510 และที่แก้ไขเพิ่มเติม',
      sectionTh: 'มาตรา 12 (ขายยาแผนปัจจุบันโดยไม่ได้รับอนุญาต) และ มาตรา 72(4) (ขายยาที่มิได้ขึ้นทะเบียนตำรับยา)',
      penaltyTh: 'ขายยาโดยไม่ได้รับอนุญาต จำคุกไม่เกิน 5 ปี และปรับไม่เกิน 10,000 บาท / ขยายยาไม่ได้ขึ้นทะเบียน จำคุกไม่เกิน 3 ปี หรือปรับไม่เกิน 5,000 บาท',
      elementsDescription: 'มีไว้ในครอบครองเพื่อขายหรือจ่ายยาแผนปัจจุบัน/ยาอันตราย/ยาควบคุมพิเศษ หรือฉีดยาให้แก่ผู้รับบริการโดยมิได้รับใบอนุญาตขายยา',
      severity: 'MEDIUM',
      relevanceScore: 0.88,
      matchedKeywords: ['ยา', 'ฉีดยา', 'ยาอันตราย', 'ไซริงค์'],
    });
  }

  const isCritical = charges.some((c) => c.severity === 'CRITICAL');
  const isHigh = charges.some((c) => c.severity === 'HIGH');

  const overallRiskLevel = isCritical ? 'CRITICAL_URGENT' : isHigh ? 'HIGH_RISK' : 'MODERATE_RISK';
  const urgencyScore = isCritical ? 98 : isHigh ? 85 : 65;

  const recommendedImmediateActions = [
    'มีคำสั่งแต่งตั้งพนักงานเจ้าหน้าที่ตาม พ.ร.บ.สถานพยาบาล พ.ศ. 2541 และ พ.ร.บ.วิชาชีพเวชกรรม/ทันตกรรม เพื่อลงพื้นที่ตรวจสอบข้อเท็จจริง',
    'ทำหนังสือประสานงานผู้กำกับการสถานีตำรวจภูธรในพื้นที่ (สภ.เมืองศรีสะเกษ / สภ.ขุขันธ์) และฝ่ายปกครองเพื่อขอกำลังร่วมปฏิบัติการตรวจค้น-จับกุม',
    'รวบรวมพยานหลักฐานประวัติการรักษาพยาบาลจากโรงพยาบาลที่รับส่งต่อ (รพ.ปริ้นซ์ศรีสะเกษ / รพ.ศูนย์ศรีสะเกษ) เพื่อยืนยันภาวะอันตรายสาหัส',
    'เตรียมหมายค้นศาลจังหวัดศรีสะเกษ (กรณีสถานที่เป้าหมายเป็นเคหสถานปิดมิดชิด)',
    'จัดทำบันทึกตรวจยึดอายัดของกลาง ยา เวชภัณฑ์ และอุปกรณ์ทางการแพทย์ ส่งตรวจพิสูจน์ที่ศูนย์วิทยาศาสตร์การแพทย์ที่ 10 อุบลราชธานี / สำนักยา อย.',
  ];

  const executiveSummary = `พฤติการณ์ในคดีมีพยานหลักฐานชัดเจนว่าผู้ถูกร้องเปิดให้บริการรักษาพยาบาล/หัตถการโดยไม่ได้รับอนุญาตตามกฎหมายสาธารณสุข และไม่มีใบประกอบวิชาชีพจากสภาวิชาชีพ${isCritical ? ' อีกทั้งมีผู้ป่วยได้รับอันตรายจนเกิดภาวะช็อคหมดสติต้องใช้เครื่องช่วยหายใจ เข้าข่ายอันตรายสาหัสตามประมวลกฎหมายอาญา มาตรา 300/297 จึงต้องดำเนินการสืบสวนจับกุมและดำเนินคดีโดยเร่งด่วน' : ' ควรดำเนินการตรวจค้นและสั่งระงับการประกอบการโดยทันที'}`;

  return {
    overallRiskLevel,
    urgencyScore,
    recommendedImmediateActions,
    applicableCharges: charges,
    executiveSummary,
  };
}
