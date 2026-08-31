import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { saveIntakeEnvelope, saveIntakeMessage, saveIntakeParticipant, saveIntakeAttachment, saveIntakeSourceCheck } from '@/lib/demo-data';
import { executeComplaintEnrichmentPlan, planComplaintEnrichment, type ComplaintEnrichmentRecord } from '@/lib/complaint-enrichment';
import { isDemoServerEnabled, isSupabaseServiceConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';
import { UNSCANNED_EVIDENCE_STATUS } from '@/lib/evidence-file-status';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILE_COUNT = 5;
const MAX_TOTAL_FILE_SIZE = 50 * 1024 * 1024;
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
  incidentDate: z.string().trim().max(20).optional(),
  incidentTime: z.string().trim().max(20).optional(),
  incidentLocation: z.string().trim().max(500).optional(),
  productName: z.string().trim().max(300).optional(),
  registrationNumber: z.string().trim().max(120).optional(),
  businessName: z.string().trim().max(300).optional(),
  businessAddress: z.string().trim().max(500).optional(),
  purchaseDetails: z.string().trim().max(1000).optional(),
  desiredAction: z.string().trim().max(1000).optional(),
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
    let attachedFiles: File[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const rawTopic = (formData.get('topic') as string) || '';
      const rawDescription = (formData.get('description') as string) || '';
      const rawCategory = (formData.get('category') as string) || '';
      const rawRegion = (formData.get('region') as string) || undefined;
      const rawComplainantName = (formData.get('complainantName') as string) || undefined;
      const rawComplainantContact = (formData.get('complainantContact') as string) || undefined;
      const optional = (key: string) => (formData.get(key) as string) || undefined;
      const rawIsAnonymous = formData.get('isAnonymous') === 'true';

      const parsed = publicComplaintSchema.safeParse({
        topic: rawTopic,
        description: rawDescription,
        category: rawCategory,
        region: rawRegion,
        complainantName: rawComplainantName,
        complainantContact: rawComplainantContact,
        incidentDate: optional('incidentDate'),
        incidentTime: optional('incidentTime'),
        incidentLocation: optional('incidentLocation'),
        productName: optional('productName'),
        registrationNumber: optional('registrationNumber'),
        businessName: optional('businessName'),
        businessAddress: optional('businessAddress'),
        purchaseDetails: optional('purchaseDetails'),
        desiredAction: optional('desiredAction'),
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

      const modernFiles = formData.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
      const legacyFile = formData.get('file');
      attachedFiles = modernFiles.length > 0
        ? modernFiles
        : legacyFile instanceof File && legacyFile.size > 0 ? [legacyFile] : [];
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

    const { topic, description, category, region, complainantName, complainantContact, isAnonymous,
      incidentDate, incidentTime, incidentLocation, productName, registrationNumber,
      businessName, businessAddress, purchaseDetails, desiredAction } = parsedData;
    const structuredPayload = { incidentDate, incidentTime, incidentLocation, productName, registrationNumber, businessName, businessAddress, purchaseDetails, desiredAction };

    // Validate every file before creating the intake envelope so a partial batch
    // cannot leave an accepted complaint with only some of its selected evidence.
    if (attachedFiles.length > MAX_FILE_COUNT) {
      return NextResponse.json(
        { success: false, error: `แนบไฟล์ได้สูงสุด ${MAX_FILE_COUNT} รายการต่อเรื่องร้องเรียน` },
        { status: 400 },
      );
    }
    if (attachedFiles.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'ขนาดรวมของไฟล์แนบต้องไม่เกิน 50 MB' },
        { status: 413 },
      );
    }
    const validatedFiles: Array<{ file: File; buffer: Buffer; sha256: string; mime: string; extension: string }> = [];
    for (const attachedFile of attachedFiles) {
      if (attachedFile.size <= 0 || attachedFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `ไฟล์ ${attachedFile.name} ต้องมีขนาดมากกว่า 0 และไม่เกิน 20 MB` },
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

      const fileBuffer = Buffer.from(await attachedFile.arrayBuffer());
      if (!rule.magic(fileBuffer)) {
        return NextResponse.json(
          { success: false, error: 'โครงสร้างไฟล์ไม่ถูกต้องหรือไม่ตรงกับนามสกุลไฟล์' },
          { status: 400 },
        );
      }

      validatedFiles.push({
        file: attachedFile,
        buffer: fileBuffer,
        sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
        mime: rule.mime,
        extension: ext === 'jpeg' ? 'jpg' : ext,
      });
    }

    // Generate Public Tracking Token (e.g. TRK-2026-AB12CD)
    const randomCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const trackingToken = `TRK-${new Date().getFullYear()}-${randomCode}`;
    const envelopeId = crypto.randomUUID();
    const now = new Date().toISOString();
    const urgency = category === 'HEALTH_HAZARD' || category === 'ONLINE_FRAUD' ? 'HIGH' : 'NORMAL';
    const intakeStatus = 'TRIAGE_PENDING';
    let preliminaryChecks: ComplaintEnrichmentRecord[] = [];
    let enrichmentDeliveryStatus: 'COMPLETED' | 'NOT_APPLICABLE' | 'PERSISTENCE_FAILED' = 'NOT_APPLICABLE';

    if (!hasSupabase) {
      saveIntakeEnvelope({
        id: envelopeId,
        channel_id: 'ch-kouprey',
        status: intakeStatus,
        complainant_mode: isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
        urgency,
        urgency_reason: `[ประชาชนแจ้งเรื่อง: ${trackingToken}] ${topic}: ${description.slice(0, 200)}`,
        jurisdiction_region: region || 'ส่วนกลาง',
        malware_scan_status: UNSCANNED_EVIDENCE_STATUS,
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
          hasAttachment: validatedFiles.length > 0,
          attachmentCount: validatedFiles.length,
          ...structuredPayload,
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

      for (const validated of validatedFiles) {
        saveIntakeAttachment({
          id: `att-${crypto.randomUUID()}`,
          envelope_id: envelopeId,
          filename: validated.file.name,
          file_size: validated.file.size,
          mime_type: validated.mime,
          sha256: validated.sha256,
          storage_path: `intake/${envelopeId}/${crypto.randomUUID()}.${validated.extension}`,
          malware_scan_status: UNSCANNED_EVIDENCE_STATUS,
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
        malware_scan_status: UNSCANNED_EVIDENCE_STATUS,
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
          hasAttachment: validatedFiles.length > 0,
          attachmentCount: validatedFiles.length,
          ...structuredPayload,
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

      let complaintAuditPersisted = false;
      const uploadedPaths: string[] = [];
      const bucketName = process.env.PRIVATE_EVIDENCE_BUCKET || 'evidence-vault';
      for (const validated of validatedFiles) {
        const attachmentId = crypto.randomUUID();
        const storagePath = `intake/${envelopeId}/${attachmentId}.${validated.extension}`;
        const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, validated.buffer, {
          contentType: validated.mime,
          upsert: false,
        });
        if (uploadError) {
          console.error('Failed to upload public attachment batch to storage:', uploadError);
          if (uploadedPaths.length) await supabase.storage.from(bucketName).remove(uploadedPaths);
          await supabase.from('intake_envelopes').delete().eq('id', envelopeId);
          return NextResponse.json(
            { success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'จัดเก็บชุดไฟล์แนบไม่สำเร็จ ระบบยกเลิกทั้งชุดแล้ว กรุณาลองใหม่' } },
            { status: 503 },
          );
        }
        uploadedPaths.push(storagePath);
        const { error: attachmentError } = await supabase.rpc('finalize_public_complaint_attachment', {
            p_attachment_id: attachmentId,
            p_envelope_id: envelopeId,
            p_bucket_name: bucketName,
            p_filename: validated.file.name,
            p_file_size: validated.file.size,
            p_mime_type: validated.mime,
            p_sha256: validated.sha256,
            p_storage_path: storagePath,
            p_tracking_token: trackingToken,
          });
        if (attachmentError) {
          await supabase.storage.from(bucketName).remove(uploadedPaths);
          await supabase.from('intake_envelopes').delete().eq('id', envelopeId);
          return NextResponse.json(
            { success: false, error: { code: 'METADATA_WRITE_FAILED', message: 'บันทึกทะเบียนชุดไฟล์แนบไม่สำเร็จ ระบบยกเลิกทั้งชุดแล้ว กรุณาลองใหม่' } },
            { status: 503 },
          );
        }
        complaintAuditPersisted = true;
      }

      if (!complaintAuditPersisted) {
        const { error: auditError } = await supabase.from('audit_logs').insert({
          profile_id: null,
          action: 'PUBLIC_COMPLAINT_RECEIVED',
          details: {
            envelope_id: envelopeId,
            tracking_token: trackingToken,
            has_attachment: false,
            file_validation_status: 'NOT_APPLICABLE',
          },
        });
        if (auditError) {
          await supabase.from('intake_envelopes').delete().eq('id', envelopeId);
          return NextResponse.json(
            { success: false, error: { code: 'AUDIT_WRITE_FAILED', message: 'บันทึกเหตุการณ์ตรวจสอบไม่สำเร็จ จึงยกเลิกการรับเรื่องอย่างปลอดภัย' } },
            { status: 503 },
          );
        }
      }
    }

    // Preliminary checks are deliberately source-bound and non-blocking. A source outage
    // must not discard a complaint that has already been accepted into the intake ledger.
    try {
      const enrichmentPlan = planComplaintEnrichment({
        topic,
        description: [description, productName, registrationNumber, businessName, businessAddress].filter(Boolean).join(' '),
        category,
      });
      if (hasSupabase && enrichmentPlan.length > 0) {
        const requestAudit = await service!.from('audit_logs').insert({
          profile_id: null,
          action: 'PUBLIC_COMPLAINT_PRELIMINARY_SEARCH_REQUESTED',
          details: {
            envelope_id: envelopeId,
            source_keys: enrichmentPlan.map((item) => item.sourceKey),
            query_kinds: enrichmentPlan.map((item) => item.queryKind),
            classification: 'SUGGESTED',
          },
        });
        if (requestAudit.error) throw new Error('PRELIMINARY_SEARCH_AUDIT_FAILED');
      }
      preliminaryChecks = await executeComplaintEnrichmentPlan(enrichmentPlan);
      enrichmentDeliveryStatus = preliminaryChecks.length > 0 ? 'COMPLETED' : 'NOT_APPLICABLE';
      if (preliminaryChecks.length > 0) {
        if (!hasSupabase) {
          for (const check of preliminaryChecks) {
            saveIntakeSourceCheck({
              id: `check-${crypto.randomUUID()}`,
              envelope_id: envelopeId,
              source_key: check.sourceKey,
              source_label: check.sourceLabel,
              source_url: check.sourceUrl,
              query_text: check.query,
              query_kind: check.queryKind,
              source_category: check.category,
              routing_reason: check.reason,
              status: check.status,
              classification: check.classification,
              result_count: check.resultCount,
              summary: check.summary,
              results: check.results,
              checked_at: check.checkedAt,
              created_at: now,
              updated_at: now,
            });
          }
        } else {
          const rows = preliminaryChecks.map((check) => ({
            id: crypto.randomUUID(),
            envelope_id: envelopeId,
            source_key: check.sourceKey,
            source_label: check.sourceLabel,
            source_url: check.sourceUrl,
            query_text: check.query,
            query_kind: check.queryKind,
            source_category: check.category,
            routing_reason: check.reason,
            status: check.status,
            classification: check.classification,
            result_count: check.resultCount,
            summary: check.summary,
            results: check.results,
            checked_at: check.checkedAt,
          }));
          const { error: checksError } = await service!.from('intake_source_checks').insert(rows);
          if (checksError) {
            enrichmentDeliveryStatus = 'PERSISTENCE_FAILED';
            console.error('Failed to persist preliminary source checks', { code: checksError.code, envelopeId });
          }
        }
      }
    } catch (enrichmentError) {
      enrichmentDeliveryStatus = 'PERSISTENCE_FAILED';
      console.error('Preliminary complaint enrichment failed', {
        envelopeId,
        message: enrichmentError instanceof Error ? enrichmentError.message : 'UNKNOWN',
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          trackingToken,
          message: validatedFiles.length > 0
            ? `บันทึกเรื่องร้องเรียนและตรวจรูปแบบไฟล์แนบ ${validatedFiles.length} รายการแล้ว เจ้าหน้าที่สามารถคัดกรองต่อได้`
            : 'บันทึกเรื่องร้องเรียนแล้ว เจ้าหน้าที่จะดำเนินการคัดกรองต่อไป',
          receivedAt: now,
          status: intakeStatus,
          hasAttachment: validatedFiles.length > 0,
          attachmentCount: validatedFiles.length,
          attachmentValidationStatus: validatedFiles.length > 0 ? 'VALIDATED' : null,
          preliminarySearch: {
            status: enrichmentDeliveryStatus,
            checkCount: preliminaryChecks.length,
            foundCount: preliminaryChecks.filter((check) => check.status === 'FOUND').length,
            note: enrichmentDeliveryStatus === 'PERSISTENCE_FAILED'
              ? 'รับเรื่องร้องเรียนแล้ว แต่การส่งผลตรวจเบื้องต้นให้เจ้าหน้าที่ไม่สมบูรณ์ ระบบจะให้เจ้าหน้าที่ลองตรวจซ้ำจากหน้ารับเรื่อง'
              : preliminaryChecks.length > 0
                ? 'ระบบตรวจฐานข้อมูลทางการเบื้องต้นแล้ว และส่งผลในสถานะข้อเสนอให้เจ้าหน้าที่ตรวจทาน'
                : 'ยังไม่มีคำค้นที่ปลอดภัยและตรงประเภทเพียงพอสำหรับการตรวจอัตโนมัติ',
          },
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
