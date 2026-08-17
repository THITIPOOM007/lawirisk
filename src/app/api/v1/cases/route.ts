import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { createCaseSchema } from '@/lib/intake-contracts';
import { CASE_WRITE_ROLES, STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { getCases, saveCase } from '@/lib/demo-data';

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

  const supabase = await createServer();
  const { data: caseId, error } = await supabase.rpc('create_case', {
    p_number: payload.number,
    p_title: payload.title,
    p_description: payload.description ?? null,
    p_jurisdiction_region: payload.jurisdiction_region ?? null,
    p_jurisdiction_agency: payload.jurisdiction_agency ?? null,
  });
  if (error || !caseId) {
    const duplicate = error?.code === '23505';
    return NextResponse.json({ error: { code: duplicate ? 'CASE_NUMBER_EXISTS' : 'CASE_CREATE_FAILED', message: duplicate ? 'เลขคดีนี้มีอยู่แล้ว' : 'สร้างคดีไม่สำเร็จ กรุณาลองใหม่' } }, { status: duplicate ? 409 : 503 });
  }
  return NextResponse.json({ data: { id: caseId } }, { status: 201 });
}
