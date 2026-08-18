import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { getCases, getEvidence } from '@/lib/demo-data';
import { consumeRateLimit } from '@/lib/rate-limit';
import { REVIEW_ROLES, STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { manualSuggestionSchema } from '@/lib/workflow-contracts';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูคิวตรวจทาน');
  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ data: { suggestions: [], cases: getCases(), evidence: getEvidence(), mode: 'demo' } });
  }
  const supabase = await createServer();
  const [suggestions, cases, evidence] = await Promise.all([
    supabase.from('extraction_suggestions').select('id,case_id,evidence_id,page_number,source_text,source_location,entity_type,candidate_value,confidence,reason,provider,model,prompt_schema_version,status,review_reason,reviewed_at,created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('cases').select('id,number,title,status,created_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('evidence_files').select('id,case_id,filename,sha256,status,upload_state,malware_scan_status,created_at').eq('upload_state', 'STORED').order('created_at', { ascending: false }).limit(500),
  ]);
  if (suggestions.error || cases.error || evidence.error) return apiError('REVIEW_QUEUE_FAILED', 'โหลดคิวตรวจทานไม่สำเร็จ', 503);
  return NextResponse.json({ data: { suggestions: suggestions.data, cases: cases.data, evidence: evidence.data, mode: 'production' } });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, new Set([...REVIEW_ROLES, 'INVESTIGATOR']));
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์สร้างข้อเสนอเพื่อตรวจทาน');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  if (auth.identity.mode === 'demo') return apiError('DEMO_WRITE_UNAVAILABLE', 'ข้อเสนอแบบ manual ในโหมดสาธิตจะไม่ถูกบันทึก', 409);
  const parsed = manualSuggestionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'ข้อมูลข้อเสนอไม่ครบหรือรูปแบบไม่ถูกต้อง', 400, undefined, parsed.error.flatten().fieldErrors);
  const supabase = await createServer();
  const limit = await consumeRateLimit({ client: supabase, key: `manual-suggestion:${auth.identity.id}`, limit: 60, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'สร้างข้อเสนอถี่เกินไป' } }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  const payload = parsed.data;
  const { data, error } = await supabase.rpc('create_manual_extraction_suggestion', {
    p_case_id: payload.case_id,
    p_evidence_id: payload.evidence_id,
    p_page_number: payload.page_number,
    p_source_text: payload.source_text,
    p_source_location: payload.source_location,
    p_entity_type: payload.entity_type,
    p_candidate_value: payload.candidate_value,
    p_reason: payload.reason,
  });
  if (error || !data) return apiError(error?.message || 'SUGGESTION_CREATE_FAILED', 'สร้างข้อเสนอไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และหลักฐานต้นทาง', 409);
  return NextResponse.json({ data: { id: data, status: 'SUGGESTED' } }, { status: 201 });
}
