import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { INTAKE_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { getIntakeEnvelopes, getIntakeMessages, INITIAL_INTAKE_CHANNELS } from '@/lib/demo-data';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, INTAKE_READ_ROLES);
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: auth.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'ไม่มีสิทธิ์ดูคิวรับเรื่อง' } }, { status: auth.status });
  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ data: { envelopes: getIntakeEnvelopes(), messages: getIntakeMessages(), channels: INITIAL_INTAKE_CHANNELS } });
  }

  const supabase = await createServer();
  const [envelopesResult, messagesResult, channelsResult] = await Promise.all([
    supabase.from('intake_envelopes').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('intake_messages').select('id,envelope_id,headers,raw_payload,message_id,created_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('intake_channels').select('id,name,type,code').order('name'),
  ]);
  const firstError = envelopesResult.error || messagesResult.error || channelsResult.error;
  if (firstError) return NextResponse.json({ error: { code: 'INTAKE_LIST_FAILED', message: 'โหลดคิวรับเรื่องไม่สำเร็จ' } }, { status: 503 });
  return NextResponse.json({ data: { envelopes: envelopesResult.data, messages: messagesResult.data, channels: channelsResult.data } });
}
