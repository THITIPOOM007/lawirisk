import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { addAuditLog, getCases } from '@/lib/demo-data';
import {
  buildReconCompanionUri,
  companionLaunchRequestSchema,
  findExternalSource,
} from '@/lib/external-sources';
import { consumeRateLimit } from '@/lib/rate-limit';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { createServer } from '@/lib/supabase-server';

export async function POST(request: NextRequest, context: RouteContext<'/api/v1/sources/[key]/companion'>) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์เรียกใช้ Recon Companion');
  if (!hasTrustedBrowserOrigin(request)) return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);

  const { key } = await context.params;
  const source = findExternalSource(key);
  if (!source) return apiError('SOURCE_NOT_FOUND', 'ไม่พบแหล่งสืบค้นที่อนุญาต', 404);

  const parsed = companionLaunchRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'ข้อมูลเรียกใช้ Recon Companion ไม่ถูกต้อง', 400);
  if (parsed.data.service && !source.services.some((service) => service.key === parsed.data.service)) {
    return apiError('SERVICE_NOT_ALLOWED', 'บริการย่อยไม่อยู่ในแหล่งสืบค้นที่เลือก', 400);
  }
  const selectedService = parsed.data.service
    ? source.services.find((service) => service.key === parsed.data.service)
    : undefined;
  if (parsed.data.intent === 'LOCAL_SEARCH') {
    if (!parsed.data.case_id) {
      return apiError('CASE_REQUIRED', 'ต้องเลือกสำนวนคดีก่อนค้นอัตโนมัติ', 400);
    }
    if (!selectedService || selectedService.automationMode !== 'LOCAL_SEARCH') {
      return apiError('LOCAL_SEARCH_NOT_ALLOWED', 'บริการนี้ยังไม่รองรับการค้นอัตโนมัติ', 409);
    }
  }
  if (source.accessMode === 'LOCAL_AUTO_LOGIN_RISK_ACK_REQUIRED' && !parsed.data.acknowledge_insecure_transport) {
    return apiError('INSECURE_TRANSPORT_ACK_REQUIRED', 'ต้องยืนยันความเสี่ยง HTTP ก่อนเรียกใช้แหล่งนี้', 409);
  }

  const supabase = auth.identity.mode === 'supabase' ? await createServer() : undefined;
  const rateLimit = await consumeRateLimit({
    client: supabase,
    key: `recon-companion:${auth.identity.id}:${source.key}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!rateLimit.allowed) return apiError('RATE_LIMITED', 'เรียก Recon Companion ถี่เกินไป', 429);

  if (parsed.data.case_id) {
    if (auth.identity.mode === 'demo') {
      if (!getCases().some((item) => item.id === parsed.data.case_id)) {
        return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404);
      }
    } else if (supabase) {
      if (!z.string().uuid().safeParse(parsed.data.case_id).success) {
        return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404);
      }
      const caseResult = await supabase.from('cases').select('id').eq('id', parsed.data.case_id).maybeSingle();
      if (caseResult.error || !caseResult.data) {
        return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404);
      }
    }
  }

  const outcome = parsed.data.intent === 'LOCAL_SEARCH'
    ? (source.transport === 'HTTP_ONLY'
        ? 'LOCAL_SEARCH_INSECURE_HTTP_ACKNOWLEDGED'
        : 'LOCAL_SEARCH_AUTHORIZED')
    : (source.transport === 'HTTP_ONLY'
        ? 'LOCAL_AUTO_LOGIN_INSECURE_HTTP_ACKNOWLEDGED'
        : 'LOCAL_AUTO_LOGIN_REQUESTED');
  const details = {
    source_key: source.key,
    outcome,
    intent: parsed.data.intent,
    case_id: parsed.data.case_id || null,
    service: parsed.data.service || null,
    credentials_received_by_server: false,
    search_query_received_by_server: false,
  };
  if (auth.identity.mode === 'demo') {
    addAuditLog(auth.identity.name, 'RECON_COMPANION_LAUNCH', `${source.key}:${outcome}`);
  } else if (supabase) {
    const audit = await supabase.from('audit_logs').insert({
      profile_id: auth.identity.id,
      action: 'RECON_COMPANION_LAUNCH',
      details,
    });
    if (audit.error) return apiError('SOURCE_AUDIT_FAILED', 'บันทึกการเรียก Recon Companion ไม่สำเร็จ', 503);
  }

  const companionUri = buildReconCompanionUri(source, {
    caseId: parsed.data.case_id,
    service: parsed.data.service,
    acknowledgeInsecureTransport: parsed.data.acknowledge_insecure_transport,
  });
  return NextResponse.json(
    {
      data: {
        companion_uri: companionUri,
        source: { key: source.key, name: source.name },
        warning: source.transport === 'HTTP_ONLY'
          ? 'ปลายทางใช้ HTTP รหัสผ่านจะเดินทางโดยไม่มี TLS ตามข้อจำกัดของระบบต้นทาง'
          : null,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
