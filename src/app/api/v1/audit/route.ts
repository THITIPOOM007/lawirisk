import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { authError } from '@/lib/api-errors';
import { getAuditLogs } from '@/lib/demo-data';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูบันทึกกิจกรรม');
  if (auth.identity.mode === 'demo') return NextResponse.json({ data: getAuditLogs() });
  const supabase = await createServer();
  const { data, error } = await supabase.rpc('list_audit_logs', { p_limit: 500 });
  if (error) return NextResponse.json({ error: { code: 'AUDIT_LIST_FAILED', message: 'โหลดบันทึกกิจกรรมไม่สำเร็จ' } }, { status: 503 });
  const logs = (data || []).map((item: Record<string, unknown>) => ({
    ...item,
    details: typeof item.details === 'string' ? item.details : JSON.stringify(item.details || {}),
    ip_address: item.ip_address || '-',
  }));
  return NextResponse.json({ data: logs });
}
