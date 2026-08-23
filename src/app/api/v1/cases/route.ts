import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { createCaseSchema } from '@/lib/intake-contracts';
import { CASE_WRITE_ROLES, STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { getCases, saveCase } from '@/lib/demo-data';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: 'ไม่มีสิทธิ์ดูสำนวนคดี' } }, { status: auth.status });
  if (auth.identity.mode === 'demo') return NextResponse.json({ data: getCases() });

  const supabase = await createServer();
  const { data, error } = await supabase.from('cases').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: { code: 'CASE_LIST_FAILED', message: 'โหลดรายการคดีไม่สำเร็จ' } }, { status: 503 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: auth.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'ไม่มีสิทธิ์สร้างคดี' } }, { status: auth.status });
  if (!hasTrustedBrowserOrigin(request)) return NextResponse.json({ error: { code: 'UNTRUSTED_ORIGIN', message: 'คำขอไม่ได้มาจากระบบที่อนุญาต' } }, { status: 403 });

  const supabase = auth.identity.mode === 'supabase' ? await createServer() : undefined;
  const limit = await consumeRateLimit({ client: supabase, key: `case-create:${auth.identity.id}`, limit: 20, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'สร้างคดีถี่เกินไป' } }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  const parsed = createCaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'ข้อมูลคดีไม่ครบหรือรูปแบบไม่ถูกต้อง', fields: parsed.error.flatten().fieldErrors } }, { status: 400 });
  const payload = parsed.data;

  if (auth.identity.mode === 'demo') {
    const now = new Date().toISOString();
    const record = {
      id: `case-${crypto.randomUUID()}`,
      ...payload,
      description: payload.description ?? '',
      status: 'ACTIVE' as const,
      created_by: auth.identity.name,
      created_at: now,
      updated_at: now,
    };
    saveCase(record);
    return NextResponse.json({ data: record }, { status: 201 });
  }

  if (!supabase) return NextResponse.json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'ฐานข้อมูลยังไม่พร้อมใช้งาน' } }, { status: 503 });
  const { data: caseId, error } = await supabase.rpc('create_case', {
    p_number: payload.number,
    p_title: payload.title,
    p_description: payload.description ?? null,
    p_jurisdiction_region: payload.jurisdiction_region ?? null,
    p_jurisdiction_agency: payload.jurisdiction_agency ?? null,
  });

  if (error || !caseId) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: { code: 'CASE_NUMBER_EXISTS', message: 'เลขคดีนี้มีอยู่แล้วในระบบ' } }, { status: 409 });
    }
    console.error('create_case RPC failed', { code: error?.code });
    return NextResponse.json(
      { error: { code: 'CASE_CREATE_FAILED', message: 'สร้างคดีไม่สำเร็จ กรุณาลองใหม่' } },
      { status: 503 },
    );
  }

  return NextResponse.json({ data: { id: caseId } }, { status: 201 });
}
