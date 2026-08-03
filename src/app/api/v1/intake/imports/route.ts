import { NextRequest, NextResponse } from 'next/server';
import { saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant, addAuditLog } from '@/lib/demo-data';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'กรุณาอัปโหลดไฟล์นำเข้า (CSV/ZIP)' }, { status: 400 });
    }

    const filename = file.name;
    const isZip = filename.endsWith('.zip');
    const isCsv = filename.endsWith('.csv');

    if (!isZip && !isCsv) {
      return NextResponse.json({ error: 'รูปแบบไฟล์ไม่ถูกต้อง รองรับเฉพาะ .zip หรือ .csv' }, { status: 400 });
    }

    // Simulate batch parsing
    const batchId = `batch-${Date.now()}`;
    let totalRows = 3;
    let successRows = 2;
    let failedRows = 1;

    // Create mock envelopes for successfully parsed import rows
    if (isCsv) {
      // Create envelope 1
      const envId1 = `env-imp-1-${Date.now()}`;
      saveIntakeEnvelope({
        id: envId1,
        channel_id: 'ch-email', // Imported via file channel
        status: 'TRIAGE_PENDING',
        complainant_mode: 'IDENTIFIED',
        urgency: 'NORMAL',
        jurisdiction_region: 'เขตสุขภาพที่ 10',
        jurisdiction_agency: 'สสจ.ศรีสะเกษ',
        malware_scan_status: 'CLEAN',
        privacy_risk_status: 'LOW',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      saveIntakeMessage({
        id: `msg-imp-1-${Date.now()}`,
        envelope_id: envId1,
        raw_payload: 'แถวข้อมูลที่ 1: แจ้งเบาะแสร้านนวดผิดกฎหมายอุทุมพรพิสัย'
      });

      // Create envelope 2
      const envId2 = `env-imp-2-${Date.now()}`;
      saveIntakeEnvelope({
        id: envId2,
        channel_id: 'ch-email',
        status: 'TRIAGE_PENDING',
        complainant_mode: 'ANONYMOUS',
        urgency: 'LOW',
        jurisdiction_region: 'เขตสุขภาพที่ 10',
        jurisdiction_agency: 'สสจ.ศรีสะเกษ',
        malware_scan_status: 'CLEAN',
        privacy_risk_status: 'LOW',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      saveIntakeMessage({
        id: `msg-imp-2-${Date.now()}`,
        envelope_id: envId2,
        raw_payload: 'แถวข้อมูลที่ 2: แจ้งเบาะแสขายยาปลอมออนไลน์'
      });
    }

    addAuditLog('ระบบนำเข้าไฟล์', 'INTAKE_IMPORT_BATCH', `ประมวลผลไฟล์นำเข้าชุดข้อมูลสำเร็จ: ${filename} (ผ่าน: ${successRows}, ล้มเหลว: ${failedRows})`);

    return NextResponse.json({
      success: true,
      batchId,
      filename,
      totalRows,
      successRows,
      failedRows,
      errors: [
        { row: 3, error: 'ข้อมูลไม่ครบถ้วน: ขาดรายละเอียดที่อยู่เป้าหมายสำหรับช่องทาง Walk-in' }
      ]
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'เกิดข้อผิดพลาดในการประมวลผลไฟล์นำเข้า' },
      { status: 500 }
    );
  }
}
