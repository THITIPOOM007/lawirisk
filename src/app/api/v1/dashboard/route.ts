import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { authError } from '@/lib/api-errors';
import { getAuditLogs, getCases, getEntities, getEvidence, getIntakeEnvelopes } from '@/lib/demo-data';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูภาพรวมระบบ');
  if (auth.identity.mode === 'demo') {
    const intake = getIntakeEnvelopes();
    return NextResponse.json({ data: {
      counts: { intake: intake.length, cases: getCases().length, evidence: getEvidence().length, entities: getEntities().length, audit: getAuditLogs().length },
      queue: intake.filter((item) => item.status === 'TRIAGE_PENDING').slice(0, 5),
    } });
  }
  const supabase = await createServer();
  const canReadAudit = auth.identity.role === 'ADMIN' || auth.identity.role === 'INVESTIGATOR';
  const [intake, cases, evidence, entities, audit, queue] = await Promise.all([
    supabase.from('intake_envelopes').select('*', { count: 'exact', head: true }),
    supabase.from('cases').select('*', { count: 'exact', head: true }),
    supabase.from('evidence_files').select('*', { count: 'exact', head: true }).eq('upload_state', 'STORED'),
    supabase.from('extracted_entities').select('*', { count: 'exact', head: true }),
    canReadAudit
      ? supabase.from('audit_logs').select('*', { count: 'exact', head: true })
      : Promise.resolve({ count: 0, error: null }),
    supabase.from('intake_envelopes').select('id,status,urgency,jurisdiction_agency,created_at').eq('status', 'TRIAGE_PENDING').order('created_at', { ascending: false }).limit(5),
  ]);
  const error = intake.error || cases.error || evidence.error || entities.error || audit.error || queue.error;
  if (error) return NextResponse.json({ error: { code: 'DASHBOARD_FAILED', message: 'โหลดภาพรวมระบบไม่สำเร็จ' } }, { status: 503 });
  return NextResponse.json({ data: {
    counts: { intake: intake.count || 0, cases: cases.count || 0, evidence: evidence.count || 0, entities: entities.count || 0, audit: audit.count || 0 },
    queue: queue.data || [],
  } });
}
