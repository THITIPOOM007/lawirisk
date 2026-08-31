import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { executeComplaintEnrichmentPlan, planComplaintEnrichment } from '@/lib/complaint-enrichment';
import {
  getIntakeEnvelopes,
  getIntakeMessages,
  getIntakeSourceChecks,
  saveIntakeSourceCheck,
} from '@/lib/demo-data';
import { consumeRateLimit } from '@/lib/rate-limit';
import { INTAKE_WRITE_ROLES } from '@/lib/roles';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { createServer, createServiceClient } from '@/lib/supabase-server';

const complaintPayloadSchema = z.object({
  topic: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(4000),
  category: z.string().trim().min(1).max(100).transform((value): 'HEALTH_HAZARD' | 'ONLINE_FRAUD' | 'ILLEGAL_CLINIC' | 'OTHER' => {
    if (value === 'HEALTH_HAZARD' || value === 'ONLINE_FRAUD' || value === 'ILLEGAL_CLINIC' || value === 'OTHER') return value;
    if (/คลินิก|สถานพยาบาล|วิชาชีพเวชกรรม/.test(value)) return 'ILLEGAL_CLINIC';
    if (/ยา|อาหาร|ผลิตภัณฑ์|อันตราย|สุขภาพ/.test(value)) return 'HEALTH_HAZARD';
    if (/หลอก|โกง|ออนไลน์/.test(value)) return 'ONLINE_FRAUD';
    return 'OTHER';
  }),
}).passthrough();

function parseComplaintPayload(rawPayload: string) {
  try {
    return complaintPayloadSchema.safeParse(JSON.parse(rawPayload));
  } catch {
    return complaintPayloadSchema.safeParse(null);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, INTAKE_WRITE_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: 'ไม่มีสิทธิ์สั่งตรวจฐานข้อมูลเบื้องต้น' } }, { status: auth.status });
  if (!hasTrustedBrowserOrigin(request)) return NextResponse.json({ error: { code: 'UNTRUSTED_ORIGIN', message: 'คำขอไม่ได้มาจากระบบที่อนุญาต' } }, { status: 403 });
  const { id } = await context.params;

  if (auth.identity.mode === 'demo') {
    const envelope = getIntakeEnvelopes().find((item) => item.id === id);
    const message = getIntakeMessages().find((item) => item.envelope_id === id);
    if (!envelope || !message) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้อง' } }, { status: 404 });
    const parsed = parseComplaintPayload(message.raw_payload);
    if (!parsed.success) return NextResponse.json({ error: { code: 'ENRICHMENT_INPUT_UNAVAILABLE', message: 'คำร้องนี้ไม่มีหัวข้อและรายละเอียดที่ใช้ค้นอัตโนมัติได้' } }, { status: 409 });
    const checks = await executeComplaintEnrichmentPlan(planComplaintEnrichment(parsed.data));
    const now = new Date().toISOString();
    for (const check of checks) {
      const previous = getIntakeSourceChecks().find((item) => item.envelope_id === id && item.source_key === check.sourceKey && item.query_text === check.query);
      saveIntakeSourceCheck({
        id: previous?.id || `check-${crypto.randomUUID()}`,
        envelope_id: id,
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
        created_at: previous?.created_at || now,
        updated_at: now,
      });
    }
    return NextResponse.json({ data: { checks } });
  }

  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้อง' } }, { status: 404 });
  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `intake-enrichment:${auth.identity.id}`, limit: 10, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'สั่งตรวจฐานข้อมูลถี่เกินไป กรุณารอสักครู่' } }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });

  const [envelopeResult, messageResult] = await Promise.all([
    supabase.from('intake_envelopes').select('id').eq('id', id).maybeSingle(),
    supabase.from('intake_messages').select('raw_payload').eq('envelope_id', id).order('created_at').limit(1).maybeSingle(),
  ]);
  if (envelopeResult.error || !envelopeResult.data || messageResult.error || !messageResult.data) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบคำร้องหรือไม่มีสิทธิ์เข้าถึง' } }, { status: 404 });
  }
  const parsed = parseComplaintPayload(messageResult.data.raw_payload);
  if (!parsed.success) return NextResponse.json({ error: { code: 'ENRICHMENT_INPUT_UNAVAILABLE', message: 'คำร้องนี้ไม่มีหัวข้อและรายละเอียดที่ใช้ค้นอัตโนมัติได้' } }, { status: 409 });

  const plan = planComplaintEnrichment(parsed.data);
  if (plan.length === 0) return NextResponse.json({ data: { checks: [], status: 'NOT_APPLICABLE' } });
  const requestAudit = await supabase.from('audit_logs').insert({
    profile_id: auth.identity.id,
    action: 'INTAKE_PRELIMINARY_SEARCH_REQUESTED',
    details: { envelope_id: id, source_keys: plan.map((item) => item.sourceKey), query_kinds: plan.map((item) => item.queryKind) },
  });
  if (requestAudit.error) return NextResponse.json({ error: { code: 'AUDIT_WRITE_FAILED', message: 'บันทึกคำขอตรวจสอบไม่สำเร็จ จึงยังไม่ส่งข้อมูลไปยังต้นทาง' } }, { status: 503 });
  const checks = await executeComplaintEnrichmentPlan(plan);
  const service = createServiceClient();
  for (const check of checks) {
    const row = {
      source_label: check.sourceLabel,
      source_url: check.sourceUrl,
      query_kind: check.queryKind,
      source_category: check.category,
      routing_reason: check.reason,
      status: check.status,
      classification: check.classification,
      result_count: check.resultCount,
      summary: check.summary,
      results: check.results,
      checked_at: check.checkedAt,
      updated_at: new Date().toISOString(),
    };
    const existing = await service.from('intake_source_checks')
      .select('id').eq('envelope_id', id).eq('source_key', check.sourceKey).eq('query_text', check.query).maybeSingle();
    const write = existing.data?.id
      ? await service.from('intake_source_checks').update(row).eq('id', existing.data.id)
      : await service.from('intake_source_checks').insert({
        id: crypto.randomUUID(), envelope_id: id, source_key: check.sourceKey, query_text: check.query, ...row,
      });
    if (existing.error || write.error) {
      return NextResponse.json({ error: { code: 'ENRICHMENT_WRITE_FAILED', message: 'ตรวจต้นทางแล้วแต่บันทึกผลให้เจ้าหน้าที่ไม่สำเร็จ กรุณาลองใหม่' } }, { status: 503 });
    }
  }
  const audit = await supabase.from('audit_logs').insert({
    profile_id: auth.identity.id,
    action: 'INTAKE_PRELIMINARY_SEARCH_RETRY',
    details: { envelope_id: id, source_keys: checks.map((check) => check.sourceKey), statuses: checks.map((check) => check.status) },
  });
  if (audit.error) console.error('Failed to record intake enrichment completion', { envelopeId: id, code: audit.error.code });
  return NextResponse.json({ data: { checks } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
