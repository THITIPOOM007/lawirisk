import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { isEvidenceUsable } from '@/lib/evidence-file-status';
import { GeminiExtractionError, extractEntitiesWithGemini } from '@/lib/providers/gemini-extraction';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { aiExtractionRequestSchema } from '@/lib/workflow-contracts';

const AI_CREATE_ROLES = new Set([...REVIEW_ROLES, 'INVESTIGATOR'] as const);
const MAX_VISION_FILE_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, AI_CREATE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์สร้างข้อเสนอด้วย AI');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body?.case_id || !body.evidence_id) return apiError('INVALID_REQUEST', 'กรุณาเลือกคดีและหลักฐาน', 400);
    const sourceText = typeof body.source_text === 'string' && body.source_text.trim()
      ? body.source_text.trim()
      : 'OCR สาธิตจากภาพ: ข้อมูลสังเคราะห์ ติดต่อเบอร์ 080-000-0000 บุคคลตัวอย่าง จ';
    const phone = sourceText.match(/0\d{2}[- ]?\d{3}[- ]?\d{4}/)?.[0] || '080-000-0000';
    const suggestion = {
      id: `demo-ai-${Date.now()}`,
      case_id: body.case_id,
      evidence_id: body.evidence_id,
      page_number: Number(body.page_number || 1),
      source_text: sourceText,
      source_location: body.source_location || { kind: 'demo-ocr' },
      entity_type: 'PHONE',
      candidate_value: phone,
      confidence: 0.94,
      reason: 'ตัวประมวลผลสาธิตพบรูปแบบหมายเลขโทรศัพท์ในข้อความ OCR',
      provider: 'DEMO_OCR_RULE_ENGINE',
      model: 'deterministic-v1',
      prompt_schema_version: 'demo-1',
      status: 'SUGGESTED',
      created_at: new Date().toISOString(),
    };
    return NextResponse.json({ data: { suggestion_ids: [suggestion.id], suggestions: [suggestion], count: 1, provider: suggestion.provider, model: suggestion.model, status: 'SUGGESTED', mode: 'demo' } }, { status: 201 });
  }

  const parsed = aiExtractionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    const labels: Record<string, string> = {
      case_id: 'สำนวนคดี', evidence_id: 'ไฟล์หลักฐาน', page_number: 'หน้าเอกสาร',
      source_text: 'ข้อความต้นทาง', source_location: 'ตำแหน่งในเอกสาร',
    };
    const invalidFields = Object.keys(fields).map((field) => labels[field] || field).join(', ');
    return apiError(
      'INVALID_REQUEST',
      `ข้อมูลสำหรับ AI ยังไม่พร้อม กรุณาตรวจสอบ: ${invalidFields || 'ข้อมูลที่ส่งมา'}`,
      400,
      undefined,
      fields,
    );
  }

  const supabase = await createServer();
  const limit = await consumeRateLimit({
    client: supabase,
    key: `ai-extraction:${auth.identity.id}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'เรียก AI ถี่เกินไป กรุณารอสักครู่' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const payload = parsed.data;
  const evidence = await supabase
    .from('evidence_files')
    .select('id,case_id,upload_state,malware_scan_status,file_path,mime_type,file_size')
    .eq('id', payload.evidence_id)
    .eq('case_id', payload.case_id)
    .maybeSingle();
  if (evidence.error || !evidence.data) return apiError('EVIDENCE_NOT_AVAILABLE', 'ไม่พบหลักฐานในขอบเขตที่ได้รับอนุญาต', 404);
  if (!isEvidenceUsable(evidence.data.upload_state, evidence.data.malware_scan_status)) {
    return apiError('EVIDENCE_NOT_READY', 'หลักฐานต้องจัดเก็บและตรวจรูปแบบไฟล์ให้สมบูรณ์ก่อนส่งให้ AI', 409);
  }

  let base64Image: string | undefined;
  let mimeType: string | undefined;

  // If no source text, attempt to use vision OCR
  if (!payload.source_text) {
    if (evidence.data.file_size > MAX_VISION_FILE_BYTES) {
      return apiError('AI_FILE_TOO_LARGE', 'ไฟล์สำหรับ Vision OCR ต้องมีขนาดไม่เกิน 20 MB กรุณาแยกหน้าไฟล์หรือใช้ข้อความที่ตรวจทานแล้ว', 413);
    }
    const bucketName = process.env.PRIVATE_EVIDENCE_BUCKET || 'evidence-vault';
    const { data: fileData, error: fileError } = await supabase.storage.from(bucketName).download(evidence.data.file_path);
    if (fileError || !fileData) return apiError('EVIDENCE_DOWNLOAD_FAILED', 'ไม่สามารถดาวน์โหลดไฟล์หลักฐานสำหรับ OCR ได้', 500);
    const arrayBuffer = await fileData.arrayBuffer();
    base64Image = Buffer.from(arrayBuffer).toString('base64');
    mimeType = evidence.data.mime_type;
  }

  try {
    const result = await extractEntitiesWithGemini(payload.source_text || '', base64Image, mimeType);
    const { data, error } = await supabase.rpc('create_ai_extraction_suggestions', {
      p_case_id: payload.case_id,
      p_evidence_id: payload.evidence_id,
      p_page_number: payload.page_number,
      p_source_text: payload.source_text || '[OCR_EXTRACTED_IMAGE]',
      p_source_location: payload.source_location,
      p_candidates: result.candidates,
      p_provider: result.provider,
      p_model: result.model,
      p_prompt_schema_version: result.promptSchemaVersion,
    });
    if (error || !data) return apiError('AI_SUGGESTION_PERSIST_FAILED', 'AI วิเคราะห์แล้วแต่บันทึกข้อเสนอไม่สำเร็จ', 503);
    return NextResponse.json({
      data: {
        suggestion_ids: data,
        count: result.candidates.length,
        provider: result.provider,
        model: result.model,
        status: 'SUGGESTED',
      },
    }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: unknown) {
    if (error instanceof GeminiExtractionError) {
      const status = error.code === 'INVALID_OUTPUT' ? 502 : 503;
      const message = error.code === 'NOT_CONFIGURED'
        ? 'ยังไม่ได้ตั้งค่า Gemini สำหรับระบบ'
        : error.code === 'AUTH_FAILED'
          ? 'Gemini ปฏิเสธ API key กรุณาให้ผู้ดูแลระบบตรวจสอบหรือเปลี่ยน key'
          : error.code === 'RATE_LIMITED'
            ? 'Gemini ติดข้อจำกัดการใช้งานชั่วคราว ระบบลองใหม่แล้ว กรุณากดค้นอีกครั้งในอีกสักครู่'
          : error.code === 'NO_COMPATIBLE_MODEL'
            ? 'บัญชี Gemini นี้ยังไม่มีโมเดลที่รองรับการวิเคราะห์หลักฐาน กรุณาให้ผู้ดูแลตรวจสิทธิ์ของ API key'
        : error.code === 'INVALID_OUTPUT'
          ? 'ผลลัพธ์ AI ไม่ผ่าน schema จึงไม่ถูกบันทึก'
          : 'Gemini ไม่พร้อมใช้งานชั่วคราว ระบบลองทั้งโมเดลหลักและสำรองแล้ว กรุณากดค้นอีกครั้ง';
      return apiError(`GEMINI_${error.code}`, message, status);
    }
    return apiError('AI_EXTRACTION_FAILED', 'วิเคราะห์ด้วย AI ไม่สำเร็จ กรุณาใช้ Manual fallback', 503);
  }
}
