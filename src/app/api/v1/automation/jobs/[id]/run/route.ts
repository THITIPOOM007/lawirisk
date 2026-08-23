import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-errors';
import { verifyN8nCallbackToken } from '@/lib/automation-orchestrator';
import { GeminiExtractionError, extractEntitiesWithGemini } from '@/lib/providers/gemini-extraction';
import { consumeRateLimit } from '@/lib/rate-limit';
import { isSupabaseServiceConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';
import { automationRunRequestSchema } from '@/lib/workflow-contracts';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyN8nCallbackToken(request.headers.get('X-N8N-Callback-Token'))) {
    return apiError('AUTOMATION_CALLBACK_UNAUTHENTICATED', 'ไม่อนุญาตให้เรียก automation callback', 401);
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบงานอัตโนมัติ', 404);

  const declaredLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > 16 * 1024) {
    return apiError('PAYLOAD_TOO_LARGE', 'ข้อมูล callback มีขนาดเกินกำหนด', 413);
  }

  if (!isSupabaseServiceConfigured()) {
    return apiError('SERVICE_UNAVAILABLE', 'ระบบอัตโนมัติยังตั้งค่าฐานข้อมูลไม่ครบ', 503);
  }
  const service = createServiceClient();
  try {
    const limit = await consumeRateLimit({
      client: service,
      key: `automation-callback:${id}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!limit.allowed) {
      const response = apiError('RATE_LIMITED', 'เรียก callback ถี่เกินไป', 429);
      response.headers.set('Retry-After', String(limit.retryAfterSeconds));
      return response;
    }
  } catch {
    return apiError('RATE_LIMIT_UNAVAILABLE', 'ระบบควบคุมความถี่ไม่พร้อมใช้งาน', 503);
  }

  const bodyText = await request.text();
  if (Buffer.byteLength(bodyText, 'utf8') > 16 * 1024) {
    return apiError('PAYLOAD_TOO_LARGE', 'ข้อมูล callback มีขนาดเกินกำหนด', 413);
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return apiError('INVALID_REQUEST', 'ข้อมูล callback ต้องเป็น JSON', 400);
  }
  const parsed = automationRunRequestSchema.safeParse(payload);
  if (!parsed.success) return apiError('INVALID_REQUEST', 'ข้อมูล callback ไม่ถูกต้อง', 400);

  const claimed = await service.rpc('claim_automation_job', {
    p_job_id: id,
    p_dispatch_id: parsed.data.dispatch_id,
    p_external_execution_id: parsed.data.external_execution_id || null,
  });
  if (claimed.error || !claimed.data) return apiError('AUTOMATION_CLAIM_FAILED', 'ไม่สามารถรับงานอัตโนมัตินี้ได้', 409);
  const claim = claimed.data as {
    claim_state: 'CLAIMED' | 'RUNNING' | 'SUCCEEDED';
    result_count?: number;
    source_text?: string;
  };
  if (claim.claim_state === 'SUCCEEDED') {
    return NextResponse.json({ data: { status: 'SUCCEEDED', result_count: claim.result_count || 0, duplicate: true } });
  }
  if (claim.claim_state === 'RUNNING') {
    return NextResponse.json({ data: { status: 'RUNNING', duplicate: true } }, { status: 202 });
  }

  try {
    const result = await extractEntitiesWithGemini(claim.source_text || '');
    const completed = await service.rpc('complete_automation_job', {
      p_job_id: id,
      p_dispatch_id: parsed.data.dispatch_id,
      p_candidates: result.candidates,
      p_provider: result.provider,
      p_model: result.model,
      p_prompt_schema_version: result.promptSchemaVersion,
    });
    if (completed.error || !completed.data) throw new Error('AUTOMATION_RESULT_PERSIST_FAILED');
    return NextResponse.json({ data: completed.data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const errorCode = error instanceof GeminiExtractionError ? `GEMINI_${error.code}` : 'AUTOMATION_PROCESSING_FAILED';
    const errorMessage = error instanceof GeminiExtractionError
      ? 'Gemini ไม่พร้อมหรือผลลัพธ์ไม่ผ่าน schema'
      : 'ระบบอัตโนมัติประมวลผลไม่สำเร็จ';
    await service.rpc('fail_automation_job', {
      p_job_id: id,
      p_dispatch_id: parsed.data.dispatch_id,
      p_error_code: errorCode,
      p_error_message: errorMessage,
    });
    return apiError(errorCode, `${errorMessage} กรุณาลองใหม่หรือใช้ Manual fallback`, 503);
  }
}
