import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { CASE_WRITE_ROLES, ADMIN_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { isDemoServerEnabled } from '@/lib/runtime-config';

const statusChangeSchema = z.object({
  status: z.enum(['CLOSED', 'ACTIVE']),
  reason: z.string().trim().min(1).max(2000),
}).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const traceId = requestId();
  const { id: caseId } = await params;

  try {
    if (!hasTrustedBrowserOrigin(request)) {
      return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);
    }

    const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
    if (!auth.ok) {
      return authError(auth, 'ไม่มีสิทธิ์เปลี่ยนสถานะสำนวนคดี');
    }

    const body = await request.json().catch(() => ({}));
    const parseResult = statusChangeSchema.safeParse(body);
    if (!parseResult.success) {
      return apiError('VALIDATION_ERROR', 'กรุณาระบุสถานะและเหตุผลที่ถูกต้อง', 400, traceId, parseResult.error.flatten().fieldErrors);
    }

    const { status, reason } = parseResult.data;

    if (auth.identity.mode === 'demo' || isDemoServerEnabled()) {
      return NextResponse.json({ success: true, data: { status } }, { headers: { 'X-Request-ID': traceId } });
    }

    const supabase = await createServer();
    const rateLimit = await consumeRateLimit({
      client: supabase,
      key: `case-status:${auth.identity.id}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return apiError('RATE_LIMITED', 'เปลี่ยนสถานะคดีถี่เกินไป กรุณารอสักครู่', 429, traceId);
    }

    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id, status')
      .eq('id', caseId)
      .maybeSingle();

    if (caseError || !caseData) {
      return apiError('NOT_FOUND', 'ไม่พบสำนวนคดีที่ระบุ', 404, traceId);
    }

    if (auth.identity.role !== 'ADMIN') {
      const { data: membershipData } = await supabase
        .from('case_members')
        .select('id')
        .eq('case_id', caseId)
        .eq('profile_id', auth.identity.id)
        .maybeSingle();

      if (!membershipData) {
        return apiError('FORBIDDEN', 'ไม่มีสิทธิ์แก้ไขสำนวนนี้', 403, traceId);
      }
    }

    // Reopen case
    if (status === 'ACTIVE' && caseData.status === 'CLOSED') {
      if (!ADMIN_ROLES.has(auth.identity.role)) {
        return apiError('FORBIDDEN', 'เฉพาะผู้ดูแลระบบ (ADMIN) เท่านั้นที่สามารถเปิดสำนวนใหม่ได้', 403, traceId);
      }

      const { error: updateError } = await supabase
        .from('cases')
        .update({ status: 'ACTIVE' })
        .eq('id', caseId);

      if (updateError) throw updateError;

      await supabase.from('audit_logs').insert({
        action: 'CASE_REOPENED',
        profile_id: auth.identity.id,
        details: { case_id: caseId, reason },
      });

      return NextResponse.json({ success: true, data: { status: 'ACTIVE' } }, { headers: { 'X-Request-ID': traceId } });
    }

    // Close case with closure gates
    if (status === 'CLOSED' && caseData.status !== 'CLOSED') {
      const blockers: string[] = [];

      // Gate 1: All evidence must be STORED and CLEAN
      const { data: evidenceFiles, error: evidenceError } = await supabase
        .from('evidence_files')
        .select('id, upload_state, malware_scan_status')
        .eq('case_id', caseId);

      if (!evidenceError && evidenceFiles) {
        const notClean = evidenceFiles.some((f) => f.upload_state !== 'STORED' || f.malware_scan_status !== 'CLEAN');
        if (notClean) blockers.push('EVIDENCE_NOT_CLEAN');
      }

      // Gate 2: No pending suggestions
      const { count: pendingSuggestions } = await supabase
        .from('extraction_suggestions')
        .select('*', { count: 'exact', head: true })
        .eq('case_id', caseId)
        .eq('status', 'SUGGESTED');
      if (pendingSuggestions && pendingSuggestions > 0) blockers.push('PENDING_SUGGESTIONS');

      // Gate 3: No pending matches
      const { count: pendingMatches } = await supabase
        .from('match_candidates')
        .select('*', { count: 'exact', head: true })
        .eq('source_case_id', caseId)
        .eq('status', 'PENDING');
      if (pendingMatches && pendingMatches > 0) blockers.push('PENDING_MATCHES');

      // Gate 4: No active automation jobs
      const { count: activeJobs } = await supabase
        .from('automation_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('case_id', caseId)
        .in('status', ['QUEUED', 'DISPATCHED', 'RUNNING']);
      if (activeJobs && activeJobs > 0) blockers.push('ACTIVE_AUTOMATION');

      // Gate 5: Must have at least one summary report with snapshot
      const { count: summaryReports } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('case_id', caseId)
        .eq('report_type', 'SUMMARY');
      if (!summaryReports || summaryReports === 0) blockers.push('NO_SUMMARY_REPORT');

      if (blockers.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'CLOSURE_GATES_FAILED',
              message: 'ไม่สามารถปิดสำนวนได้ เนื่องจากยังมีขั้นตอนที่ยังไม่เสร็จสมบูรณ์',
              blockers,
            },
          },
          { status: 409, headers: { 'X-Request-ID': traceId } }
        );
      }

      const { error: updateError } = await supabase
        .from('cases')
        .update({ status: 'CLOSED' })
        .eq('id', caseId);

      if (updateError) throw updateError;

      await supabase.from('audit_logs').insert({
        action: 'CASE_CLOSED',
        profile_id: auth.identity.id,
        details: { case_id: caseId, reason },
      });

      return NextResponse.json({ success: true, data: { status: 'CLOSED' } }, { headers: { 'X-Request-ID': traceId } });
    }

    return NextResponse.json({ success: true, data: { status: caseData.status } }, { headers: { 'X-Request-ID': traceId } });
  } catch (error: unknown) {
    console.error('Case status update error:', error);
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะสำนวน', 500, traceId);
  }
}

