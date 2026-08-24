import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { dispatchAutomationJob, isN8nAutomationConfigured } from '@/lib/automation-orchestrator';
import { getCases, getEvidence } from '@/lib/demo-data';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { REVIEW_ROLES, STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { automationJobCreateSchema } from '@/lib/workflow-contracts';

const AUTOMATION_CREATE_ROLES = new Set([...REVIEW_ROLES, 'INVESTIGATOR'] as const);
const idempotencyKeySchema = z.string().uuid();

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูงานอัตโนมัติ');
  if (auth.identity.mode === 'demo') {
    return NextResponse.json({
      data: {
        jobs: [],
        cases: getCases(),
        evidence: getEvidence(),
        mode: 'demo',
        configured: false,
      },
    });
  }

  const supabase = await createServer();
  const [jobs, cases, evidence] = await Promise.all([
    supabase.from('automation_jobs')
      .select('id,case_id,evidence_id,job_type,status,page_number,input_sha256,attempt,max_attempts,result_count,error_code,error_message,provider,model,created_at,updated_at,started_at,completed_at')
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('cases').select('id,number,title,status,created_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('evidence_files').select('id,case_id,filename,sha256,upload_state,malware_scan_status,created_at')
      .eq('upload_state', 'STORED').order('created_at', { ascending: false }).limit(500),
  ]);
  if (jobs.error || cases.error || evidence.error) {
    return apiError('AUTOMATION_QUEUE_FAILED', 'โหลดศูนย์ควบคุมงานอัตโนมัติไม่สำเร็จ', 503);
  }
  return NextResponse.json({
    data: {
      jobs: jobs.data,
      cases: cases.data,
      evidence: evidence.data,
      mode: 'production',
      configured: isN8nAutomationConfigured(),
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, AUTOMATION_CREATE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์เริ่มงานอัตโนมัติ');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') return apiError('DEMO_WRITE_UNAVAILABLE', 'โหมดสาธิตไม่ส่งงานไป n8n', 409);
  if (!isN8nAutomationConfigured()) return apiError('N8N_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า n8n automation', 503);

  const idempotency = idempotencyKeySchema.safeParse(request.headers.get('Idempotency-Key'));
  if (!idempotency.success) return apiError('IDEMPOTENCY_KEY_REQUIRED', 'คำขอต้องมี Idempotency-Key แบบ UUID', 400);
  const parsed = automationJobCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'ข้อมูลเริ่มงานอัตโนมัติไม่ครบหรือรูปแบบไม่ถูกต้อง', 400, undefined, parsed.error.flatten().fieldErrors);

  const supabase = await createServer();
  const limit = await consumeRateLimit({
    client: supabase,
    key: `automation-create:${auth.identity.id}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!limit.allowed) return NextResponse.json(
    { error: { code: 'RATE_LIMITED', message: 'เริ่มงานอัตโนมัติถี่เกินไป' } },
    { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
  );

  const payload = parsed.data;
  const queued = await supabase.rpc('queue_text_extraction_job', {
    p_case_id: payload.case_id,
    p_evidence_id: payload.evidence_id,
    p_page_number: payload.page_number,
    p_source_text: payload.source_text,
    p_source_location: payload.source_location,
    p_idempotency_key: idempotency.data,
  });
  if (queued.error || !queued.data) {
    const code = queued.error?.message || 'AUTOMATION_QUEUE_FAILED';
    const message = code === 'AUTOMATION_EVIDENCE_NOT_CLEAN'
      ? 'ต้องใช้หลักฐานที่จัดเก็บและตรวจรูปแบบไฟล์สมบูรณ์ก่อนเริ่มงานอัตโนมัติ'
      : 'สร้างงานอัตโนมัติไม่สำเร็จ';
    return apiError(code, message, code === 'AUTOMATION_EVIDENCE_NOT_CLEAN' ? 409 : 503);
  }
  const job = queued.data as { id: string; status: string; attempt: number; created: boolean };
  if (!job.created && job.status !== 'QUEUED') {
    return NextResponse.json({ data: job }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const dispatchId = crypto.randomUUID();
  const marked = await supabase.rpc('mark_automation_job_dispatched', {
    p_job_id: job.id,
    p_dispatch_id: dispatchId,
  });
  if (marked.error) return apiError('AUTOMATION_DISPATCH_STATE_FAILED', 'เตรียมส่งงานไป n8n ไม่สำเร็จ', 503);
  try {
    await dispatchAutomationJob({ jobId: job.id, dispatchId });
    return NextResponse.json({
      data: { ...job, status: 'DISPATCHED', dispatch_id: dispatchId },
    }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    await supabase.rpc('mark_automation_job_dispatch_failed', {
      p_job_id: job.id,
      p_error_code: 'N8N_DISPATCH_FAILED',
    });
    return apiError('N8N_DISPATCH_FAILED', 'ส่งงานไป n8n ไม่สำเร็จ สามารถกดลองใหม่ได้', 503);
  }
}
