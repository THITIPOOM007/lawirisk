import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { getEvidence, getIntakeEnvelopes } from '@/lib/demo-data';
import { buildNotificationItems } from '@/lib/notification-center';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { CASE_WRITE_ROLES, INTAKE_READ_ROLES, REVIEW_ROLES, STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

const markReadSchema = z.object({
  ids: z.array(z.string().min(3).max(180)).min(1).max(100),
}).strict();

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูศูนย์แจ้งเตือน');

  if (auth.identity.mode === 'demo') {
    const items = buildNotificationItems({
      intakes: INTAKE_READ_ROLES.has(auth.identity.role) ? getIntakeEnvelopes() : [],
      suggestions: REVIEW_ROLES.has(auth.identity.role) ? [{
        id: 'demo-suggestion-phone', case_id: 'case-1', entity_type: 'PHONE', confidence: 0.96,
        status: 'SUGGESTED', created_at: '2026-08-29T01:00:00.000Z',
      }] : [],
      evidence: CASE_WRITE_ROLES.has(auth.identity.role) ? getEvidence() : [],
    });
    return NextResponse.json({ data: { items, unread_count: items.length, mode: 'demo', partial: false, unavailable_sources: [], generated_at: new Date().toISOString() } }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const supabase = await createServer();
  const [intakes, suggestions, jobs, evidence, reads] = await Promise.all([
    INTAKE_READ_ROLES.has(auth.identity.role)
      ? supabase.from('intake_envelopes').select('id,status,urgency,jurisdiction_region,updated_at,created_at').in('status', ['TRIAGE_PENDING', 'QUARANTINED', 'NEEDS_INFO']).order('updated_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    REVIEW_ROLES.has(auth.identity.role)
      ? supabase.from('extraction_suggestions').select('id,case_id,entity_type,confidence,status,created_at').eq('status', 'SUGGESTED').order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    auth.identity.role !== 'VIEWER'
      ? supabase.from('automation_jobs').select('id,case_id,status,error_code,result_count,updated_at,created_at').in('status', ['FAILED', 'SUCCEEDED']).order('updated_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    CASE_WRITE_ROLES.has(auth.identity.role)
      ? supabase.from('evidence_files').select('id,case_id,filename,status,upload_state,malware_scan_status,created_at').or('upload_state.eq.RESERVED,status.eq.FAILED,malware_scan_status.in.(INFECTED,ERROR,UNAVAILABLE)').order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('notification_reads').select('notification_key').eq('profile_id', auth.identity.id).limit(1000),
  ]);

  const results = { intake: intakes, review: suggestions, automation: jobs, evidence, read_state: reads };
  const unavailableSources = Object.entries(results).filter(([, result]) => result.error).map(([name]) => name);
  if (unavailableSources.length === Object.keys(results).length) {
    return apiError('NOTIFICATION_CENTER_UNAVAILABLE', 'โหลดศูนย์แจ้งเตือนไม่สำเร็จ', 503);
  }
  const readIds = (reads.data || []).map((row) => row.notification_key);
  const items = buildNotificationItems({
    intakes: intakes.error ? [] : intakes.data || [],
    suggestions: suggestions.error ? [] : suggestions.data || [],
    jobs: jobs.error ? [] : jobs.data || [],
    evidence: evidence.error ? [] : evidence.data || [],
    readIds,
  });

  return NextResponse.json({ data: {
    items,
    unread_count: items.filter((item) => !item.read).length,
    mode: 'production',
    partial: unavailableSources.length > 0,
    unavailable_sources: unavailableSources,
    generated_at: new Date().toISOString(),
  } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function PATCH(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ปรับสถานะการแจ้งเตือน');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const parsed = markReadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_NOTIFICATION_IDS', 'รายการแจ้งเตือนไม่ถูกต้อง', 400);
  if (auth.identity.mode === 'demo') return NextResponse.json({ data: { marked: parsed.data.ids.length, mode: 'demo' } });

  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `notification-read:${auth.identity.id}`, limit: 30, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'ปรับสถานะแจ้งเตือนถี่เกินไป' } }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  const readAt = new Date().toISOString();
  const rows = parsed.data.ids.map((notificationKey) => ({ profile_id: auth.identity.id, notification_key: notificationKey, read_at: readAt }));
  const { error } = await supabase.from('notification_reads').upsert(rows, { onConflict: 'profile_id,notification_key' });
  if (error) return apiError('NOTIFICATION_READ_FAILED', 'บันทึกสถานะการแจ้งเตือนไม่สำเร็จ', 503);
  return NextResponse.json({ data: { marked: rows.length, mode: 'production' } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
