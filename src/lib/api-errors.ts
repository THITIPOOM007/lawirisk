import { NextResponse } from 'next/server';

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function requestId() {
  return crypto.randomUUID();
}

export function apiError(
  code: string,
  message: string,
  status: number,
  traceId = requestId(),
  fields?: Record<string, string[] | undefined>,
) {
  return NextResponse.json(
    { success: false, error: { code, message, request_id: traceId, ...(fields ? { fields } : {}) } },
    { status, headers: { 'X-Request-ID': traceId } },
  );
}

export function authError(result: Extract<import('@/lib/api-auth').StaffAuthResult, { ok: false }>, fallback: string) {
  const message = result.code === 'AUTH_NOT_CONFIGURED'
    ? 'ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแลระบบ'
    : result.status === 401
      ? 'กรุณาเข้าสู่ระบบ'
      : fallback;
  return apiError(result.code, message, result.status);
}
