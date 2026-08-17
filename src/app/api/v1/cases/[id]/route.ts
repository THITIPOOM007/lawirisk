import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { getCases, getEvidence } from '@/lib/demo-data';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: 'ไม่มีสิทธิ์ดูสำนวนคดี' } }, { status: auth.status });
  const { id } = await context.params;
  if (auth.identity.mode === 'demo') {
    const caseRecord = getCases().find((item) => item.id === id);
    if (!caseRecord) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบสำนวนคดี' } }, { status: 404 });
    return NextResponse.json({ data: { case: caseRecord, evidence: getEvidence().filter((item) => item.case_id === id) } });
  }
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบสำนวนคดี' } }, { status: 404 });

  const supabase = await createServer();
  const [caseResult, evidenceResult] = await Promise.all([
    supabase.from('cases').select('*').eq('id', id).maybeSingle(),
    supabase.from('evidence_files').select('*').eq('case_id', id).order('created_at', { ascending: false }),
  ]);
  if (caseResult.error || !caseResult.data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง' } }, { status: 404 });
  if (evidenceResult.error) return NextResponse.json({ error: { code: 'CASE_DETAIL_FAILED', message: 'โหลดบัญชีหลักฐานไม่สำเร็จ' } }, { status: 503 });
  return NextResponse.json({ data: { case: caseResult.data, evidence: evidenceResult.data } });
}
