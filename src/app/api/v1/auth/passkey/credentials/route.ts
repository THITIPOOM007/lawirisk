import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

const deleteSchema = z.object({ credentialId: z.string().uuid() });

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ต้องเข้าสู่ระบบก่อนดูอุปกรณ์ Passkey');
  if (auth.identity.mode === 'demo') {
    return NextResponse.json({ data: [{
      id: '00000000-0000-4000-8000-000000000901',
      nickname: 'Windows Hello · เครื่องสาธิต',
      deviceType: 'multiDevice',
      backedUp: true,
      transports: ['internal'],
      lastUsedAt: new Date().toISOString(),
      createdAt: '2026-08-23T01:00:00.000Z',
      mode: 'demo',
    }] });
  }

  const supabase = await createServer();
  const { data, error } = await supabase
    .from('webauthn_credentials')
    .select('id, nickname, device_type, backed_up, transports, last_used_at, created_at')
    .eq('profile_id', auth.identity.id)
    .order('created_at', { ascending: false });
  if (error) return apiError('PASSKEY_LIST_FAILED', 'โหลดรายการอุปกรณ์ Passkey ไม่สำเร็จ', 503);
  return NextResponse.json({ data: (data || []).map((item) => ({
    id: item.id,
    nickname: item.nickname || 'Passkey',
    deviceType: item.device_type,
    backedUp: item.backed_up,
    transports: item.transports,
    lastUsedAt: item.last_used_at,
    createdAt: item.created_at,
  })) });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ต้องเข้าสู่ระบบก่อนลบอุปกรณ์ Passkey');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'รหัสอุปกรณ์ไม่ถูกต้อง', 400);
  if (auth.identity.mode === 'demo') return NextResponse.json({ data: { removed: true, mode: 'demo' } });

  const supabase = await createServer();
  const { data, error } = await supabase.rpc('remove_own_webauthn_credential', { p_credential_id: parsed.data.credentialId });
  if (error) return apiError('PASSKEY_REMOVE_FAILED', 'ลบอุปกรณ์ Passkey ไม่สำเร็จ', 503);
  if (data !== true) return apiError('PASSKEY_NOT_FOUND', 'ไม่พบอุปกรณ์ Passkey นี้', 404);
  return NextResponse.json({ data: { removed: true } });
}
