import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { getSettings, INITIAL_USERS, saveSettings } from '@/lib/demo-data';
import { ADMIN_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

const settingsSchema = z.object({
  confidenceThreshold: z.number().min(0).max(1),
  autoExtraction: z.boolean(),
}).strict();

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, ADMIN_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูการตั้งค่าระบบ');
  if (auth.identity.mode === 'demo') return NextResponse.json({ data: { settings: getSettings(), users: INITIAL_USERS } });
  const supabase = await createServer();
  const [settings, users] = await Promise.all([
    supabase.from('system_settings').select('confidence_threshold,auto_extraction,updated_at').eq('id', true).single(),
    supabase.from('profiles').select('id,email,name,role,created_at').order('created_at').limit(500),
  ]);
  if (settings.error || users.error) return apiError('SETTINGS_LOAD_FAILED', 'โหลดการตั้งค่าระบบไม่สำเร็จ', 503);
  return NextResponse.json({ data: {
    settings: { confidenceThreshold: settings.data.confidence_threshold, autoExtraction: settings.data.auto_extraction },
    users: users.data,
  } });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorizeStaff(request, ADMIN_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์แก้ไขการตั้งค่าระบบ');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  const supabase = auth.identity.mode === 'supabase' ? await createServer() : undefined;
  const limit = await consumeRateLimit({ client: supabase, key: `settings-update:${auth.identity.id}`, limit: 10, windowSeconds: 60 });
  if (!limit.allowed) return apiError('RATE_LIMITED', 'บันทึกการตั้งค่าถี่เกินไป', 429);
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'รูปแบบการตั้งค่าไม่ถูกต้อง', 400, undefined, parsed.error.flatten().fieldErrors);
  if (auth.identity.mode === 'demo') {
    saveSettings({ ...getSettings(), ...parsed.data });
    return NextResponse.json({ data: parsed.data });
  }
  if (!supabase) return apiError('AUTH_NOT_CONFIGURED', 'ฐานข้อมูลยังไม่พร้อมใช้งาน', 503);
  const { data, error } = await supabase.from('system_settings').update({
    confidence_threshold: parsed.data.confidenceThreshold,
    auto_extraction: parsed.data.autoExtraction,
    updated_by: auth.identity.id,
    updated_at: new Date().toISOString(),
  }).eq('id', true).select('confidence_threshold,auto_extraction').single();
  if (error) return apiError('SETTINGS_UPDATE_FAILED', 'บันทึกการตั้งค่าไม่สำเร็จ', 503);
  await supabase.from('audit_logs').insert({ profile_id: auth.identity.id, action: 'SYSTEM_SETTINGS_UPDATE', details: { auto_extraction: data.auto_extraction, confidence_threshold: data.confidence_threshold } });
  return NextResponse.json({ data: { confidenceThreshold: data.confidence_threshold, autoExtraction: data.auto_extraction } });
}
