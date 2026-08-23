import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant, saveIntakeAttachment } from '@/lib/demo-data';
import { isDemoServerEnabled, isSupabaseServiceConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';
import { scanEvidenceFile } from '@/lib/malware-scanner';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

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
    if (!hasTrustedBrowserOrigin(request)) {
      return NextResponse.json(
        { success: false, error: { code: 'UNTRUSTED_ORIGIN', message: 'คำขอไม่ได้มาจากหน้าบริการที่อนุญาต' } },
        { status: 403 },
      );
    }

    const hasSupabase = isSupabaseServiceConfigured();
    if (!hasSupabase && !isDemoServerEnabled()) {
      return NextResponse.json(
        { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'ระบบรับเรื่องยังไม่พร้อมใช้งาน' } },
        { status: 503 },
      );
    }
    const service = hasSupabase ? createServiceClient() : undefined;
    const clientAddress = request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown';
    const rateLimit = await consumeRateLimit({
      client: service,
      key: `public-complaint:${clientAddress}:${request.headers.get('user-agent') || 'unknown'}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'ส่งคำร้องถี่เกินไป กรุณารอสักครู่' } },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

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
      if (!ext || !rule || attachedFile.type !== rule.mime) {
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

    const attachmentScan = attachedFile ? await scanEvidenceFile(attachedFile) : null;

    // Generate Public Tracking Token (e.g. TRK-2026-AB12CD)
    const randomCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const trackingToken = `TRK-${new Date().getFullYear()}-${randomCode}`;
    const envelopeId = crypto.randomUUID();
    const now = new Date().toISOString();
    const urgency = category === 'HEALTH_HAZARD' || category === 'ONLINE_FRAUD' ? 'HIGH' : 'NORMAL';
    const intakeStatus = attachedFile && attachmentScan?.status !== 'CLEAN' ? 'QUARANTINED' : 'TRIAGE_PENDING';

    if (!hasSupabase) {
      saveIntakeEnvelope({
        id: envelopeId,
        channel_id: 'ch-kouprey',
        status: intakeStatus,
        complainant_mode: isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
        urgency,
        urgency_reason: `[ประชาชนแจ้งเรื่อง: ${trackingToken}] ${topic}: ${description.slice(0, 200)}`,
        jurisdiction_region: region || 'ส่วนกลาง',
        malware_scan_status: attachmentScan?.status || 'CLEAN',
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
          storage_path: `intake/${envelopeId}/${crypto.randomUUID()}.${fileExtension}`,
          malware_scan_status: attachmentScan?.status || 'PENDING',
        });
      }
    } else {
      const supabase = service!;

      const channelRes = await supabase.from('intake_channels').select('id').eq('code', 'PUBLIC_PORTAL').maybeSingle();
      if (channelRes.error || !channelRes.data?.id) {
        return NextResponse.json(
          { success: false, error: { code: 'CHANNEL_UNAVAILABLE', message: 'ช่องทางรับเรื่องสาธารณะยังไม่พร้อมใช้งาน' } },
          { status: 503 },
        );
      }
      const channelId = channelRes.data.id;

      const { error: envelopeError } = await supabase.from('intake_envelopes').insert({
        id: envelopeId,
        channel_id: channelId,
        status: intakeStatus,
        complainant_mode: isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
        urgency,
        urgency_reason: `[ประชาชนแจ้งเรื่อง: ${trackingToken}] ${topic}: ${description.slice(0, 200)}`,
        jurisdiction_region: region || 'ส่วนกลาง',
        malware_scan_status: attachmentScan?.status || 'CLEAN',
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
      if (msgError) {
        await supabase.from('intake_envelopes').delete().eq('id', envelopeId);
        return NextResponse.json(
          { success: false, error: { code: 'METADATA_WRITE_FAILED', message: 'บันทึกเนื้อหาคำร้องไม่สำเร็จ กรุณาลองใหม่' } },
          { status: 503 },
        );
      }

      if (!isAnonymous && (complainantName || complainantContact)) {
        const { error: participantError } = await supabase.from('intake_participants').insert({
          id: crypto.randomUUID(),
          envelope_id: envelopeId,
          role: 'COMPLAINANT',
          name: complainantName || null,
          phone: complainantContact || null,
        });
        if (participantError) {
          await supabase.from('intake_envelopes').delete().eq('id', envelopeId);
          return NextResponse.json(
            { success: false, error: { code: 'METADATA_WRITE_FAILED', message: 'บันทึกข้อมูลผู้แจ้งไม่สำเร็จ กรุณาลองใหม่' } },
            { status: 503 },
          );
        }
      }

      let uploadedStoragePath: string | null = null;
      let uploadedBucketName: string | null = null;
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
          await supabase.from('intake_envelopes').delete().eq('id', envelopeId);
          return NextResponse.json(
            { success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'จัดเก็บไฟล์แนบไม่สำเร็จ กรุณาลองใหม่' } },
            { status: 503 },
          );
        } else {
          uploadedStoragePath = storagePath;
          uploadedBucketName = bucketName;
          const scanStatus = attachmentScan?.status || 'UNAVAILABLE';
          const scanDetails = attachmentScan && 'reason' in attachmentScan
            ? { reason: attachmentScan.reason }
            : attachmentScan
              ? { scanner: attachmentScan.scanner, signature_version: attachmentScan.signatureVersion }
              : { reason: 'SCANNER_NOT_RUN' };

          const { error: attachmentError } = await supabase.from('intake_attachments').insert({
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
          if (attachmentError) {
            await supabase.storage.from(bucketName).remove([storagePath]);
            await supabase.from('intake_envelopes').delete().eq('id', envelopeId);
            return NextResponse.json(
              { success: false, error: { code: 'METADATA_WRITE_FAILED', message: 'บันทึกทะเบียนไฟล์แนบไม่สำเร็จ กรุณาลองใหม่' } },
              { status: 503 },
            );
          }
        }
      }

      const { error: auditError } = await supabase.from('audit_logs').insert({
        profile_id: null,
        action: 'PUBLIC_COMPLAINT_RECEIVED',
        details: {
          envelope_id: envelopeId,
          tracking_token: trackingToken,
          has_attachment: Boolean(attachedFile),
          scan_status: attachmentScan?.status || 'NOT_APPLICABLE',
        },
      });
      if (auditError) {
        if (uploadedStoragePath && uploadedBucketName) {
          await supabase.storage.from(uploadedBucketName).remove([uploadedStoragePath]);
        }
        await supabase.from('intake_envelopes').delete().eq('id', envelopeId);
        return NextResponse.json(
          { success: false, error: { code: 'AUDIT_WRITE_FAILED', message: 'บันทึกเหตุการณ์ตรวจสอบไม่สำเร็จ จึงยกเลิกการรับเรื่องอย่างปลอดภัย' } },
          { status: 503 },
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          trackingToken,
          message: attachmentScan?.status === 'CLEAN'
            ? 'บันทึกเรื่องร้องเรียนและไฟล์ที่ผ่านผลสแกน CLEAN แล้ว'
            : attachedFile
              ? 'บันทึกเรื่องร้องเรียนและจัดเก็บไฟล์แล้ว แต่ไฟล์ยังไม่ผ่านผลสแกน CLEAN จึงยังไม่ถูกนำไปประมวลผล'
              : 'บันทึกเรื่องร้องเรียนแล้ว เจ้าหน้าที่จะดำเนินการคัดกรองต่อไป',
          receivedAt: now,
          status: intakeStatus,
          hasAttachment: Boolean(attachedFile),
          attachmentScanStatus: attachmentScan?.status || null,
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
