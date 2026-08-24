import { NextResponse } from 'next/server';
import { checkMalwareScannerHealth } from '@/lib/malware-scanner';
import { getRuntimeReadiness } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const readiness = getRuntimeReadiness();
  if (readiness.checks.malwareScanner && !await checkMalwareScannerHealth()) {
    readiness.checks.malwareScanner = false;
    readiness.blockers.push('MALWARE_SCANNER_UNAVAILABLE');
    readiness.ready = false;
  }
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
