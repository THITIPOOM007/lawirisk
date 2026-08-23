import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { GeminiExtractionError, extractEntitiesWithGemini } from '@/lib/providers/gemini-extraction';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { aiExtractionRequestSchema } from '@/lib/workflow-contracts';

const AI_CREATE_ROLES = new Set([...REVIEW_ROLES, 'INVESTIGATOR'] as const);

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, AI_CREATE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์สร้างข้อเสนอด้วย AI');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body?.case_id || !body.evidence_id) return apiError('INVALID_REQUEST', 'กรุณาเลือกคดีและหลักฐาน', 400);
    const sourceText = typeof body.source_text === 'string' && body.source_text.trim()
      ? body.source_text.trim()
      : 'OCR สาธิตจากภาพ: ติดต่อสั่งซื้อทาง LINE และโทร 062-4149791 ผู้รับเงิน นางสาวปนัดดา คำนนท์';
    const phone = sourceText.match(/0\d{2}[- ]?\d{3}[- ]?\d{4}/)?.[0] || '062-4149791';
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
  if (!parsed.success) return apiError('INVALID_REQUEST', 'ข้อมูลสำหรับ AI ไม่ครบหรือรูปแบบไม่ถูกต้อง', 400, undefined, parsed.error.flatten().fieldErrors);

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
    .select('id,case_id,upload_state,malware_scan_status,file_path,mime_type')
    .eq('id', payload.evidence_id)
    .eq('case_id', payload.case_id)
    .maybeSingle();
  if (evidence.error || !evidence.data) return apiError('EVIDENCE_NOT_AVAILABLE', 'ไม่พบหลักฐานในขอบเขตที่ได้รับอนุญาต', 404);
  if (evidence.data.upload_state !== 'STORED' || evidence.data.malware_scan_status !== 'CLEAN') {
    return apiError('EVIDENCE_NOT_CLEAN', 'ต้องสแกนหลักฐานเป็น CLEAN ก่อนส่งข้อความให้ AI', 409);
  }

  let base64Image: string | undefined;
  let mimeType: string | undefined;

  // If no source text, attempt to use vision OCR
  if (!payload.source_text) {
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
        : error.code === 'INVALID_OUTPUT'
          ? 'ผลลัพธ์ AI ไม่ผ่าน schema จึงไม่ถูกบันทึก'
          : 'Gemini ไม่พร้อมใช้งาน กรุณาใช้ Manual fallback';
      return apiError(`GEMINI_${error.code}`, message, status);
    }
    return apiError('AI_EXTRACTION_FAILED', 'วิเคราะห์ด้วย AI ไม่สำเร็จ กรุณาใช้ Manual fallback', 503);
  }
}
