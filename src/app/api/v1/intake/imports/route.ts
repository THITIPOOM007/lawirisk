import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { saveIntakeEnvelope, saveIntakeMessage, addAuditLog } from '@/lib/demo-data';
import { INTAKE_WRITE_ROLES } from '@/lib/roles';


export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, INTAKE_WRITE_ROLES);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'ไม่มีสิทธิ์นำเข้าข้อมูล' }, { status: auth.status });
  }
  if (auth.identity.mode !== 'demo') {
    return NextResponse.json({ error: 'ตัวประมวลผลไฟล์นำเข้าจริงยังไม่เปิดใช้งาน' }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'กรุณาอัปโหลดไฟล์นำเข้า (CSV/ZIP)' }, { status: 400 });
    }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'ไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 20 MB' }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    const isZip = filename.endsWith('.zip');
    const isCsv = filename.endsWith('.csv');

    if (!isZip && !isCsv) {
      return NextResponse.json({ error: 'รูปแบบไฟล์ไม่ถูกต้อง รองรับเฉพาะ .zip หรือ .csv' }, { status: 400 });
    }

    // Simulate batch parsing
    const batchId = `batch-${Date.now()}`;
    const totalRows = 3;
    const successRows = 2;
    const failedRows = 1;

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
        malware_scan_status: 'PENDING',
        privacy_risk_status: 'PENDING',
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
        malware_scan_status: 'PENDING',
        privacy_risk_status: 'PENDING',
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
  } catch (error: unknown) {
    console.error('Batch intake import failed', { error: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการประมวลผลไฟล์นำเข้า' },
      { status: 500 }
    );
  }
}
