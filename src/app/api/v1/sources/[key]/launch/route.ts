import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { addAuditLog } from '@/lib/demo-data';
import { findExternalSource, isLaunchableSource } from '@/lib/external-sources';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';

export async function POST(request: NextRequest, context: RouteContext<'/api/v1/sources/[key]/launch'>) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์เปิดแหล่งสืบค้นภายนอก');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);

  const { key } = await context.params;
  const source = findExternalSource(key);
  if (!source) return apiError('SOURCE_NOT_FOUND', 'ไม่พบแหล่งสืบค้นที่อนุญาต', 404);

  const supabase = auth.identity.mode === 'supabase' ? await createServer() : undefined;
  const rateLimit = await consumeRateLimit({
    client: supabase,
    key: `source-launch:${auth.identity.id}:${source.key}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!rateLimit.allowed) return apiError('RATE_LIMITED', 'เปิดแหล่งสืบค้นถี่เกินไป', 429);

  const outcome = isLaunchableSource(source) ? 'MANUAL_LAUNCH' : source.accessMode;
  if (auth.identity.mode === 'demo') {
    addAuditLog(auth.identity.name, 'EXTERNAL_SOURCE_ACCESS', `${source.key}:${outcome}`);
  } else if (supabase) {
    const { error } = await supabase.from('audit_logs').insert({
      profile_id: auth.identity.id,
      action: 'EXTERNAL_SOURCE_ACCESS',
      details: { source_key: source.key, outcome, transport: source.transport },
    });
    if (error) return apiError('SOURCE_AUDIT_FAILED', 'บันทึกการเปิดแหล่งสืบค้นไม่สำเร็จ', 503);
  }

  if (!isLaunchableSource(source) || !source.launchUrl) {
    return apiError('SOURCE_INSECURE_TRANSPORT', 'แหล่งสืบค้นนี้ถูกบล็อกจนกว่าจะมีช่องทาง HTTPS/API ที่รับรอง', 409);
  }

  return NextResponse.redirect(source.launchUrl, {
    status: 303,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
