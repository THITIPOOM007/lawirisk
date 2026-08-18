import 'server-only';
import type { NextRequest } from 'next/server';

export function hasTrustedBrowserOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set([request.nextUrl.origin]);
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(':', '');
  if (host && (protocol === 'http' || protocol === 'https')) allowed.add(`${protocol}://${host}`);
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) {
    try { allowed.add(new URL(configured).origin); }
    catch { return false; }
  }
  try { return allowed.has(new URL(origin).origin); }
  catch { return false; }
}
