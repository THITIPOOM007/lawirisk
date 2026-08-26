import { type AutomatedCaseReconReport } from './case-recon-engine';

export interface GeneratedDocument {
  docId: string;
  docTitle: string;
  docCategory: 'POLICE_DISPATCH_LETTER' | 'INTERNAL_INVESTIGATION_MEMO' | 'JOINT_RAID_PLAN' | 'EVIDENCE_SEIZURE_CHECKLIST';
  issuedTo: string;
  contentHtml: string;
  plainText: string;
}

export function generateFullInvestigationDossier(report: AutomatedCaseReconReport): GeneratedDocument[] {
  const dateThai = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const accusedPerson = report.dopaProfile
    ? `${report.dopaProfile.prefix}${report.dopaProfile.firstName} ${report.dopaProfile.lastName} (เลขประจำตัวประชาชน ${report.dopaProfile.citizenId})`
    : 'ผู้ต้องสงสัยตามเบาะแส';

  const locationText = report.locationRecon.formattedAddress;
  const isDental = report.caseTitle.includes('ฟัน') || report.caseTitle.includes('ทันต');
  const targetPoliceStation = locationText.includes('ขุขันธ์') ? 'สถานีตำรวจภูธรขุขันธ์' : 'สถานีตำรวจภูธรเมืองศรีสะเกษ';

  // 1. หนังสือประสานขอความร่วมมือกำลังตำรวจร่วมตรวจค้น-จับกุม
  const policeDispatchLetter: GeneratedDocument = {
    docId: `DOC-POLICE-${report.caseId.slice(0, 8)}`,
    docTitle: `หนังสือประสานขอความร่วมมือกำลังเจ้าหน้าที่ตำรวจร่วมตรวจค้นและจับกุม (${targetPoliceStation})`,
    docCategory: 'POLICE_DISPATCH_LETTER',
    issuedTo: `ผู้กำกับการ ${targetPoliceStation}`,
    plainText: `ที่ ศก ๐๐๓๓/................
สำนักงานสาธารณสุขจังหวัดศรีสะเกษ
ถนนกสิกรรม อำเภอเมืองศรีสะเกษ จังหวัดศรีสะเกษ ๓๓๐๐๐

วันที่ ${dateThai}

เรื่อง  ขอความร่วมมือกำลังเจ้าหน้าที่ตำรวจร่วมเข้าตรวจสอบและจับกุมผู้กระทำความผิดตามกฎหมายสาธารณสุข
เรียน  ผู้กำกับการ ${targetPoliceStation}

สิ่งที่ส่งมาด้วย  ๑. รายงานผลการสืบสวนและพิกัดสถานที่เป้าหมายเบื้องต้น จำนวน ๑ ชุด
                ๒. สำเนาคำร้องเรียน/เบาะแส และพยานหลักฐาน จำนวน ๑ ชุด

    ด้วย สำนักงานสาธารณสุขจังหวัดศรีสะเกษ ได้รับเรื่องร้องเรียนและดำเนินการสืบสวนข้อเท็จจริง กรณีได้รับแจ้งว่ามีบุคคลเปิดให้บริการ${isDental ? 'ทำฟัน/จัดฟันแฟชั่นผิดกฎหมาย' : 'สถานพยาบาลและตรวจรักษา ฉีดยาแก่ประชาชนโดยไม่ได้รับอนุญาต'} ณ บริเวณ ${locationText} โดยมี ${accusedPerson} เป็นผู้ดำเนินการ

    จากการตรวจสอบข้อมูลสารบบสารสนเทศของกระทรวงสาธารณสุข และสภาวิชาชีพ พบข้อเท็จจริงเบื้องต้น ดังนี้:
    ๑. สถานประกอบการดังกล่าว ไม่ได้รับใบอนุญาตให้ประกอบกิจการและดำเนินการสถานพยาบาลตาม พ.ร.บ.สถานพยาบาล พ.ศ. ๒๕๔๑
    ๒. ผู้ให้บริการ ไม่ได้รับใบอนุญาตเป็นผู้ประกอบวิชาชีพ${isDental ? 'ทันตกรรม ตาม พ.ร.บ.วิชาชีพทันตกรรม พ.ศ. ๒๕๓๗' : 'เวชกรรม ตาม พ.ร.บ.วิชาชีพเวชกรรม พ.ศ. ๒๕๒๕ (หมอเถื่อน)'}
    ๓. ${report.legalAssessment.overallRiskLevel === 'CRITICAL_URGENT' ? 'มีพฤติการณ์ก่อให้เกิดอันตรายสาหัสแก่ผู้รับบริการ (ภาวะช็อคหมดสติ ต้องเข้ารับการรักษาในห้องฉุกเฉิน)' : 'มีพฤติการณ์กระทำความผิดต่อเนื่องอันเป็นอันตรายต่อสุขอนามัยของประชาชน'}

    เพื่อให้การบังคับใช้กฎหมายเป็นไปด้วยความเรียบร้อย รวดเร็ว และเกิดประสิทธิภาพสูงสุด สำนักงานสาธารณสุขจังหวัดศรีสะเกษ จึงใคร่ขอความอนุเคราะห์จากท่าน โปรดมอบหมายเจ้าหน้าที่ตำรวจในสังกัด ร่วมบูรณาการกำลังกับพนักงานเจ้าหน้าที่ สสจ.ศรีสะเกษ ในการเข้าตรวจค้น รวบรวมพยานหลักฐาน ยึดอายัดของกลาง และดำเนินคดีตามกฎหมายต่อผู้กระทำความผิดต่อไป

    จึงเรียนมาเพื่อโปรดพิจารณาให้ความอนุเคราะห์

                                      ขอแสดงความนับถือ


                                  (.......................................................)
                                   นายแพทย์สาธารณสุขจังหวัดศรีสะเกษ`,
    contentHtml: `<div class="p-8 bg-white text-black font-serif space-y-4 text-sm leading-relaxed rounded-xl shadow">
      <div class="text-center font-bold text-lg mb-2">ตราครุฑ</div>
      <div class="flex justify-between text-xs">
        <div>ที่ ศก ๐๐๓๓/................</div>
        <div class="text-right">สำนักงานสาธารณสุขจังหวัดศรีสะเกษ<br/>ถนนกสิกรรม อ.เมืองศรีสะเกษ ๓๓๐๐๐</div>
      </div>
      <div class="text-center my-3 font-semibold">วันที่ ${dateThai}</div>
      <div><strong>เรื่อง:</strong> ขอความร่วมมือกำลังเจ้าหน้าที่ตำรวจร่วมเข้าตรวจสอบและจับกุมผู้กระทำความผิด</div>
      <div><strong>เรียน:</strong> ผู้กำกับการ ${targetPoliceStation}</div>
      <div><strong>สิ่งที่ส่งมาด้วย:</strong> ๑. รายงานผลการสืบสวนและพิกัดสถานที่เป้าหมาย ๒. สำเนาพยานหลักฐานและภาพถ่าย</div>
      <p class="indent-8 text-justify">
        ด้วย สำนักงานสาธารณสุขจังหวัดศรีสะเกษ ได้รับเรื่องร้องเรียนและดำเนินการสืบสวนข้อเท็จจริง กรณีได้รับแจ้งว่ามีบุคคลเปิดให้บริการ${isDental ? 'ทำฟัน/จัดฟันแฟชั่นผิดกฎหมาย' : 'สถานพยาบาลและตรวจรักษา ฉีดยาแก่ประชาชนโดยไม่ได้รับอนุญาต'} ณ บริเวณ ${locationText} โดยมี ${accusedPerson} เป็นผู้ดำเนินการ
      </p>
      <p class="indent-8 text-justify">
        จากการตรวจสอบข้อมูลสารบบสารสนเทศของกระทรวงสาธารณสุข และสภาวิชาชีพ พบข้อเท็จจริงชัดเจนว่า สถานประกอบการดังกล่าวไม่ได้รับอนุญาตเปิดสถานพยาบาล และผู้ให้บริการไม่มีใบประกอบวิชาชีพ จึงใคร่ขอความอนุเคราะห์กำลังเจ้าหน้าที่ตำรวจร่วมบูรณาการเข้าตรวจค้นและดำเนินคดีตามกฎหมาย
      </p>
      <div class="mt-8 text-right pr-12">
        <p>ขอแสดงความนับถือ</p>
        <p class="mt-8">(.......................................................)</p>
        <p>นายแพทย์สาธารณสุขจังหวัดศรีสะเกษ</p>
      </div>
    </div>`,
  };

  // 2. บันทึกข้อความสรุปผลการสืบสวนเสนอ นพ.สสจ.
  const internalMemo: GeneratedDocument = {
    docId: `DOC-MEMO-${report.caseId.slice(0, 8)}`,
    docTitle: 'บันทึกข้อความสรุปผลการสืบสวนและขออนุมัติแผนปฏิบัติการตรวจค้น (เสนอ นพ.สสจ.)',
    docCategory: 'INTERNAL_INVESTIGATION_MEMO',
    issuedTo: 'นายแพทย์สาธารณสุขจังหวัดศรีสะเกษ',
    plainText: `บันทึกข้อความ
ส่วนราชการ: กลุ่มงานคุ้มครองผู้บริโภคและเภสัชสาธารณสุข สำนักงานสาธารณสุขจังหวัดศรีสะเกษ โทร. ๐-๔๕๖๑-๒๙๔๐
ที่: ศก ๐๐๓๓.๔/................                          วันที่: ${dateThai}
เรื่อง: รายงานผลการสืบค้นข้อมูลเชิงลึกและขออนุมัติแผนปฏิบัติการตรวจสอบคดี ${report.caseNumber}

เรียน: นายแพทย์สาธารณสุขจังหวัดศรีสะเกษ

๑. ข้อเท็จจริงและพฤติการณ์คดี
   ตามที่กลุ่มงานคุ้มครองผู้บริโภคฯ ได้รับเรื่องร้องเรียนคดี ${report.caseNumber} (${report.caseTitle}) เจ้าหน้าที่ได้ดำเนินการสืบค้นข้อมูลผ่านระบบ LAW-i-RISK National Intelligence Engine พบข้อมูลเชิงลึกยืนยันตัวตน ดังนี้:
   - ผู้ถูกกล่าวหา: ${accusedPerson}
   - ที่ตั้งเป้าหมาย: ${locationText} (พิกัด GPS: ${report.locationRecon.latitude}, ${report.locationRecon.longitude})
   - สภาพสถานที่: ${report.locationRecon.surveillanceNotes}

๒. ผลการตรวจสอบสารบบทางกฎหมายและสภาวิชาชีพ
   - ระบบ สบส. (HSS OSS): ${report.hssClinic.findingsSummary}
   - สภาวิชาชีพ (${report.practitionerLicense.councilNameTh}): ${report.practitionerLicense.findingsSummary}
   - ฐานความผิดที่เข้าข่าย: ${report.legalAssessment.applicableCharges.map((c) => c.actTitleTh + ' ' + c.sectionTh).join('\n     ')}

๓. ข้อพิจารณาและข้อเสนอ
   เนื่องจากกรณีดังกล่าวมีระดับความเสี่ยง "${report.legalAssessment.overallRiskLevel}" และส่งผลกระทบต่อความปลอดภัยของประชาชน จึงเห็นควรพิจารณา:
   ๑. อนุมัติแผนปฏิบัติการบูรณาการกำลังร่วมกับ ${targetPoliceStation} และฝ่ายปกครอง
   ๒. มอบหมายพนักงานเจ้าหน้าที่ตามคำสั่ง สสจ.ศรีสะเกษ ลงพื้นที่ตรวจค้น ยึดอายัดของกลาง และร้องทุกข์กล่าวโทษต่อพนักงานสอบสวน

   จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ`,
    contentHtml: `<div class="p-8 bg-white text-black font-sans space-y-4 text-xs leading-relaxed rounded-xl shadow">
      <div class="border-b-2 border-black pb-2">
        <h2 class="text-xl font-bold text-center">บันทึกข้อความ</h2>
        <div class="grid grid-cols-2 gap-2 mt-3">
          <div><strong>ส่วนราชการ:</strong> กลุ่มงานคุ้มครองผู้บริโภคและเภสัชสาธารณสุข สสจ.ศรีสะเกษ</div>
          <div><strong>วันที่:</strong> ${dateThai}</div>
          <div><strong>เรื่อง:</strong> รายงานผลการสืบสวนและขออนุมัติแผนปฏิบัติการ (${report.caseNumber})</div>
        </div>
      </div>
      <div><strong>เรียน:</strong> นายแพทย์สาธารณสุขจังหวัดศรีสะเกษ</div>
      <div class="space-y-2">
        <p><strong>๑. ข้อมูลผู้ถูกกล่าวหา:</strong> ${accusedPerson}</p>
        <p><strong>๒. สถานที่เป้าหมาย:</strong> ${locationText} (GPS: ${report.locationRecon.latitude}, ${report.locationRecon.longitude})</p>
        <p><strong>๓. ผลตรวจสอบ:</strong> ${report.hssClinic.findingsSummary} และ ${report.practitionerLicense.findingsSummary}</p>
        <p><strong>๔. ฐานความผิด:</strong></p>
        <ul class="list-disc pl-5 space-y-1">
          ${report.legalAssessment.applicableCharges.map((c) => `<li><strong>${c.sectionTh}:</strong> ${c.penaltyTh}</li>`).join('')}
        </ul>
      </div>
      <div class="mt-8 text-right pr-8">
        <p>(ลงชื่อ).......................................................ผู้รายงาน</p>
        <p class="mt-4">(ลงชื่อ).......................................................นพ.สสจ.ศรีสะเกษ (ผู้อนุมัติ)</p>
      </div>
    </div>`,
  };

  // 3. แผนและ Checklist การลงพื้นที่ตรวจค้น-จับกุมร่วม
  const raidPlanChecklist: GeneratedDocument = {
    docId: `DOC-RAID-${report.caseId.slice(0, 8)}`,
    docTitle: 'แผนและ Checklist การตรวจค้น-ยึดอายัดพยานหลักฐานร่วม (Joint Operation Checklist)',
    docCategory: 'JOINT_RAID_PLAN',
    issuedTo: 'คณะพนักงานเจ้าหน้าที่ชุดตรวจค้น',
    plainText: `แผนปฏิบัติการและรายการตรวจสอบการตรวจค้น (Joint Raid Checklist)
สำนวนคดี: ${report.caseNumber} - ${report.caseTitle}
สถานที่: ${locationText}
พิกัด GPS: ${report.locationRecon.latitude}, ${report.locationRecon.longitude}

[ ] ๑. บัตรประจำตัวพนักงานเจ้าหน้าที่ (บัตร สบส. / บัตรพนักงานเจ้าหน้าที่ตาม พ.ร.บ.ยา / พ.ร.บ.สถานพยาบาล)
[ ] ๒. บันทึกการตรวจค้น และแบบฟอร์มการตรวจยึดอายัดของกลาง (สพ.๑๑ / บันทึกการจับกุม)
[ ] ๓. กล้องบันทึกภาพนิ่งและวิดีโอ (Body Cam / กล้องบันทึกหลักฐานความละเอียดสูง)
[ ] ๔. ถุงใส่พยานวัตถุและเทปซีลหลักฐานพร้อมเซ็นกำกับ (Evidence Tamper-Evident Bags)
[ ] ๕. บัญชีรายการของกลางที่ต้องตรวจยึด:
    - ยาแผนปัจจุบัน ยาอันตราย ยาฉีด ยาระงับปวด และเวชภัณฑ์ที่พบทั้งหมด
    - ไซริงค์ เข็มฉีดยา ชุดให้น้ำเกลือ เครื่องวัดความดัน หูฟังแพทย์
    - เครื่องมือทันตกรรม ลวดดัดฟัน กาวติดฟัน คีมดัดฟัน ฟันปลอม (กรณีทันตกรรม)
    - ใบเสร็จ สมุดบันทึกรายชื่อผู้ป่วย เวชระเบียน และป้ายโฆษณาหน้าร้าน
[ ] ๖. การประสานงาน รพ.แม่ข่าย สำรองเตียงฉุกเฉินกรณีมีผู้ป่วยตกค้างในสถานที่เกิดเหตุ`,
    contentHtml: `<div class="p-6 bg-slate-900 text-slate-100 font-mono text-xs space-y-4 rounded-xl border border-slate-700">
      <div class="border-b border-slate-700 pb-3">
        <h3 class="text-base font-bold text-amber-400">🚨 แผนปฏิบัติการและ CHECKLIST ตรวจค้น-จับกุมร่วม</h3>
        <p class="text-slate-400 mt-1">คดี: ${report.caseNumber} | พิกัด: ${report.locationRecon.latitude}, ${report.locationRecon.longitude}</p>
      </div>
      <div class="space-y-2">
        <div class="p-2 bg-slate-800 rounded border border-slate-700">✅ <strong>เป้าหมาย:</strong> ${accusedPerson} (${locationText})</div>
        <div class="p-2 bg-slate-800 rounded border border-slate-700">📋 <strong>เอกสารต้องเตรียม:</strong> บัตรพนักงานเจ้าหน้าที่, แบบตรวจยึด สพ.๑๑, หมายค้น (ถ้ามี)</div>
        <div class="p-2 bg-slate-800 rounded border border-slate-700">📦 <strong>ของกลางที่ต้องยึด:</strong> ยาแผนปัจจุบัน, ไซริงค์, เวชระเบียน, อุปกรณ์หัตถการ, ป้ายร้าน</div>
        <div class="p-2 bg-slate-800 rounded border border-slate-700">🚔 <strong>หน่วยร่วมปฏิบัติ:</strong> สสจ.ศรีสะเกษ + ${targetPoliceStation} + ฝ่ายปกครอง</div>
      </div>
    </div>`,
  };

  return [policeDispatchLetter, internalMemo, raidPlanChecklist];
}
