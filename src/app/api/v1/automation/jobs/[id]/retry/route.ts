import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { dispatchAutomationJob, isN8nAutomationConfigured } from '@/lib/automation-orchestrator';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

const AUTOMATION_CREATE_ROLES = new Set([...REVIEW_ROLES, 'INVESTIGATOR'] as const);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, AUTOMATION_CREATE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ลองงานอัตโนมัติใหม่');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') return apiError('DEMO_WRITE_UNAVAILABLE', 'โหมดสาธิตไม่ส่งงานไป n8n', 409);
  if (!isN8nAutomationConfigured()) return apiError('N8N_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า n8n automation', 503);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบงานอัตโนมัติ', 404);

  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `automation-retry:${auth.identity.id}`, limit: 10, windowSeconds: 60 });
  if (!limit.allowed) return apiError('RATE_LIMITED', 'ลองงานอัตโนมัติใหม่ถี่เกินไป', 429);
  const prepared = await supabase.rpc('prepare_automation_job_retry', { p_job_id: id });
  if (prepared.error || !prepared.data) {
    const code = prepared.error?.message || 'AUTOMATION_RETRY_FAILED';
    const messages: Record<string, string> = {
      AUTOMATION_JOB_RETRY_EXHAUSTED: 'งานนี้ลองใหม่ครบจำนวนที่กำหนดแล้ว',
      AUTOMATION_JOB_NOT_RETRYABLE: 'งานนี้ยังไม่อยู่ในสถานะที่ลองใหม่ได้',
    };
    return apiError(code, messages[code] || 'เตรียมลองงานใหม่ไม่สำเร็จ', 409);
  }
  const job = prepared.data as { id: string; status: string; attempt: number };
  const dispatchId = crypto.randomUUID();
  const marked = await supabase.rpc('mark_automation_job_dispatched', { p_job_id: id, p_dispatch_id: dispatchId });
  if (marked.error) return apiError('AUTOMATION_DISPATCH_STATE_FAILED', 'เตรียมส่งงานไป n8n ไม่สำเร็จ', 503);
  try {
    await dispatchAutomationJob({ jobId: id, dispatchId });
    return NextResponse.json({ data: { ...job, status: 'DISPATCHED', dispatch_id: dispatchId } }, { status: 202 });
  } catch {
    await supabase.rpc('mark_automation_job_dispatch_failed', { p_job_id: id, p_error_code: 'N8N_DISPATCH_FAILED' });
    return apiError('N8N_DISPATCH_FAILED', 'ส่งงานไป n8n ไม่สำเร็จ สามารถกดลองใหม่ได้', 503);
  }
}
