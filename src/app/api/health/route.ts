import { NextResponse } from 'next/server';
import { getRuntimeReadiness } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const readiness = getRuntimeReadiness();
  return NextResponse.json(
    {
      status: readiness.ready ? 'ready' : readiness.mode === 'demo' ? 'demo' : 'not_ready',
      mode: readiness.mode,
      checks: readiness.checks,
      blockers: readiness.blockers,
      timestamp: new Date().toISOString(),
    },
    {
      status: readiness.ready || readiness.mode === 'demo' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
