import { NextResponse } from 'next/server';
import { checkMalwareScannerHealth } from '@/lib/malware-scanner';
import { getRuntimeReadiness } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const readiness = getRuntimeReadiness();
  const scannerHealth = await checkMalwareScannerHealth();
  readiness.checks.malwareScanner = scannerHealth === 'READY';
  readiness.blockers = readiness.blockers.filter((blocker) => !blocker.startsWith('MALWARE_SCANNER_'));
  if (scannerHealth !== 'READY') {
    readiness.blockers.push(scannerHealth === 'NOT_CONFIGURED'
      ? 'MALWARE_SCANNER_NOT_CONFIGURED'
      : 'MALWARE_SCANNER_UNAVAILABLE');
  }
  readiness.ready = readiness.blockers.length === 0;
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
