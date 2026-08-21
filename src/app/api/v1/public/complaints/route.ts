import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant, saveIntakeAttachment } from '@/lib/demo-data';
import { isSupabaseServerConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';
import { scanEvidenceFile } from '@/lib/malware-scanner';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const allowedTypes = {
  pdf: { mime: 'application/pdf', magic: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '25504446' },
  png: { mime: 'image/png', magic: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '89504e47' },
  jpg: { mime: 'image/jpeg', magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
  jpeg: { mime: 'image/jpeg', magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
} as const;

const publicComplaintSchema = z.object({
  topic: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(4000),
  category: z.enum(['HEALTH_HAZARD', 'ONLINE_FRAUD', 'ILLEGAL_CLINIC', 'OTHER']),
  region: z.string().trim().max(100).optional(),
  complainantName: z.string().trim().max(200).optional(),
  complainantContact: z.string().trim().max(200).optional(),
  isAnonymous: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let parsedData: z.infer<typeof publicComplaintSchema>;
    let attachedFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const rawTopic = (formData.get('topic') as string) || '';
      const rawDescription = (formData.get('description') as string) || '';
      const rawCategory = (formData.get('category') as string) || '';
      const rawRegion = (formData.get('region') as string) || undefined;
      const rawComplainantName = (formData.get('complainantName') as string) || undefined;
      const rawComplainantContact = (formData.get('complainantContact') as string) || undefined;
      const rawIsAnonymous = formData.get('isAnonymous') === 'true';

      const parsed = publicComplaintSchema.safeParse({
        topic: rawTopic,
        description: rawDescription,
        category: rawCategory,
        region: rawRegion,
        complainantName: rawComplainantName,
        complainantContact: rawComplainantContact,
        isAnonymous: rawIsAnonymous,
      });

      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: 'ข้อมูลคำร้องไม่ครบถ้วน กรุณากรอกหัวข้อและรายละเอียดให้ชัดเจน',
            fields: parsed.error.flatten().fieldErrors,
          },
          { status: 400 },
        );
      }
      parsedData = parsed.data;

      const fileEntry = formData.get('file');
      if (fileEntry instanceof File && fileEntry.size > 0) {
        attachedFile = fileEntry;
      }
    } else {
      const json = await request.json().catch(() => null);
      const parsed = publicComplaintSchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: 'ข้อมูลคำร้องไม่ครบถ้วน กรุณากรอกหัวข้อและรายละเอียดให้ชัดเจน',
            fields: parsed.error.flatten().fieldErrors,
          },
          { status: 400 },
        );
      }
      parsedData = parsed.data;
    }

    const { topic, description, category, region, complainantName, complainantContact, isAnonymous } = parsedData;

    // Validate file if present
    let fileBuffer: Buffer | null = null;
    let fileSha256 = '';
    let fileMime = '';
    let fileExtension = '';

    if (attachedFile) {
      if (attachedFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: 'ขนาดไฟล์เกินกำหนดสูงสุด 20 MB' },
          { status: 400 },
        );
      }
      const ext = attachedFile.name.split('.').pop()?.toLowerCase() as keyof typeof allowedTypes | undefined;
      const rule = ext ? allowedTypes[ext] : undefined;
      if (!ext || !rule) {
        return NextResponse.json(
          { success: false, error: 'ประเภทไฟล์ไม่รองรับ รองรับเฉพาะ PDF, PNG, JPG' },
          { status: 400 },
        );
      }

      fileBuffer = Buffer.from(await attachedFile.arrayBuffer());
      if (!rule.magic(fileBuffer)) {
        return NextResponse.json(
          { success: false, error: 'โครงสร้างไฟล์ไม่ถูกต้องหรือไม่ตรงกับนามสกุลไฟล์' },
          { status: 400 },
        );
      }

      fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      fileMime = rule.mime;
      fileExtension = ext === 'jpeg' ? 'jpg' : ext;
    }

    // Generate Public Tracking Token (e.g. TRK-2026-AB12CD)
    const randomCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const trackingToken = `TRK-${new Date().getFullYear()}-${randomCode}`;
    const envelopeId = crypto.randomUUID();
    const now = new Date().toISOString();
    const urgency = category === 'HEALTH_HAZARD' || category === 'ONLINE_FRAUD' ? 'HIGH' : 'NORMAL';

    if (!isSupabaseServerConfigured()) {
      saveIntakeEnvelope({
        id: envelopeId,
        channel_id: 'ch-kouprey',
        status: 'TRIAGE_PENDING',
        complainant_mode: isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
        urgency,
        urgency_reason: `[ประชาชนแจ้งเรื่อง: ${trackingToken}] ${topic}: ${description.slice(0, 200)}`,
        jurisdiction_region: region || 'ส่วนกลาง',
        malware_scan_status: attachedFile ? 'PENDING' : 'CLEAN',
        privacy_risk_status: isAnonymous ? 'LOW' : 'MEDIUM',
        created_at: now,
        updated_at: now,
      });

      saveIntakeMessage({
        id: `msg-${crypto.randomUUID()}`,
        envelope_id: envelopeId,
        raw_payload: JSON.stringify({
          trackingToken,
          topic,
          description,
          category,
          region,
          complainantName: isAnonymous ? 'ไม่ประสงค์ออกนาม' : complainantName,
          complainantContact: isAnonymous ? '-' : complainantContact,
          source: 'CITIZEN_PUBLIC_PORTAL',
          hasAttachment: Boolean(attachedFile),
        }),
        message_id: trackingToken,
      });

      if (!isAnonymous && (complainantName || complainantContact)) {
        saveIntakeParticipant({
          id: `part-${crypto.randomUUID()}`,
          envelope_id: envelopeId,
          role: 'COMPLAINANT',
          name: complainantName,
          phone: complainantContact,
        });
      }

      if (attachedFile && fileBuffer) {
        saveIntakeAttachment({
          id: `att-${crypto.randomUUID()}`,
          envelope_id: envelopeId,
          filename: attachedFile.name,
          file_size: attachedFile.size,
          mime_type: fileMime,
          sha256: fileSha256,
          storage_path: `/vault/intake/${envelopeId}/${attachedFile.name}`,
          malware_scan_status: 'CLEAN',
        });
      }
    } else {
      const supabase = createServiceClient();

      const channelRes = await supabase.from('intake_channels').select('id').eq('type', 'MANUAL_POST').limit(1).maybeSingle();
      let channelId = channelRes.data?.id;
      if (!channelId) {
        channelId = crypto.randomUUID();
        const { error: chError } = await supabase.from('intake_channels').insert({
          id: channelId,
          name: 'Public Portal',
          type: 'MANUAL_POST',
        });
        if (chError) {
          console.error('Failed to create public intake channel:', chError);
        }
      }

      const { error: envelopeError } = await supabase.from('intake_envelopes').insert({
        id: envelopeId,
        channel_id: channelId,
        status: 'TRIAGE_PENDING',
        complainant_mode: isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
        urgency,
        urgency_reason: `[ประชาชนแจ้งเรื่อง: ${trackingToken}] ${topic}: ${description.slice(0, 200)}`,
        jurisdiction_region: region || 'ส่วนกลาง',
        malware_scan_status: attachedFile ? 'PENDING' : 'CLEAN',
        privacy_risk_status: isAnonymous ? 'LOW' : 'MEDIUM',
      });
      if (envelopeError) throw envelopeError;

      const { error: msgError } = await supabase.from('intake_messages').insert({
        id: crypto.randomUUID(),
        envelope_id: envelopeId,
        raw_payload: JSON.stringify({
          trackingToken,
          topic,
          description,
          category,
          region,
          complainantName: isAnonymous ? 'ไม่ประสงค์ออกนาม' : complainantName,
          complainantContact: isAnonymous ? '-' : complainantContact,
          source: 'CITIZEN_PUBLIC_PORTAL',
          hasAttachment: Boolean(attachedFile),
        }),
        message_id: trackingToken,
      });
      if (msgError) throw msgError;

      if (!isAnonymous && (complainantName || complainantContact)) {
        await supabase.from('intake_participants').insert({
          id: crypto.randomUUID(),
          envelope_id: envelopeId,
          role: 'COMPLAINANT',
          name: complainantName || null,
          phone: complainantContact || null,
        });
      }

      if (attachedFile && fileBuffer) {
        const attachmentId = crypto.randomUUID();
        const bucketName = process.env.PRIVATE_EVIDENCE_BUCKET || 'evidence-vault';
        const storagePath = `intake/${envelopeId}/${attachmentId}.${fileExtension}`;

        const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, fileBuffer, {
          contentType: fileMime,
          upsert: false,
        });

        if (uploadError) {
          console.error('Failed to upload public attachment to storage:', uploadError);
        } else {
          const scan = await scanEvidenceFile(attachedFile);
          const scanStatus = scan.status === 'INFECTED' ? 'INFECTED' : (scan.status === 'CLEAN' ? 'CLEAN' : 'PENDING');
          const scanDetails = 'reason' in scan
            ? { reason: scan.reason }
            : { scanner: scan.scanner, signature_version: scan.signatureVersion };

          await supabase.from('intake_attachments').insert({
            id: attachmentId,
            envelope_id: envelopeId,
            filename: attachedFile.name,
            file_size: attachedFile.size,
            mime_type: fileMime,
            sha256: fileSha256,
            storage_path: storagePath,
            malware_scan_status: scanStatus,
            malware_scan_details: scanDetails,
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          trackingToken,
          message: 'บันทึกเรื่องร้องเรียนและหลักฐานเรียบร้อยแล้ว เจ้าหน้าที่จะดำเนินการคัดกรองความปลอดภัยต่อไป',
          receivedAt: now,
          status: 'TRIAGE_PENDING',
          hasAttachment: Boolean(attachedFile),
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error('Public complaint submission error:', error);
    return NextResponse.json(
      { success: false, error: 'เกิดข้อผิดพลาดในการบันทึกคำร้อง กรุณาลองใหม่อีกครั้ง' },
      { status: 500 },
    );
  }
}
