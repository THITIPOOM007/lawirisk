'use client';

import type { ReconAutomationPlanItem } from './recon-automation';

const LOCAL_BRIDGE = 'http://127.0.0.1:32147';
const LOCAL_HEADERS = { 'X-LawiRisk-Recon-Client': 'lawirisk-web-1' };

export type LocalReconResult = {
  source: string;
  service: string;
  searchField: string;
  pdfFilename: string;
  pdfSha256: string;
  pdfSize: number;
  resultRowCount: number;
  resultSummaries: string[];
  capturedAt: string;
  sourceUrl: string;
  adapterVersion: string;
  searchStrategy: string;
  searchAttemptCount: number;
};

export type CompletedLocalRecon = {
  jobId: string;
  result: LocalReconResult;
  file: File;
};

function message(body: unknown, fallback: string) {
  if (body && typeof body === 'object') {
    const value = body as { error?: { message?: unknown } | string };
    if (typeof value.error === 'string') return value.error;
    if (typeof value.error?.message === 'string') return value.error.message;
  }
  return fallback;
}

async function wait(delay: number, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, delay);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    }, { once: true });
  });
}

export async function executeLocalReconQuery(
  caseId: string,
  item: ReconAutomationPlanItem,
  options: { signal?: AbortSignal; onState?: (state: string) => void } = {},
): Promise<CompletedLocalRecon> {
  options.onState?.('AUTHORIZING');
  const authorizationResponse = await fetch(`/api/v1/sources/${item.source}/companion`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: caseId, service: item.service, intent: 'LOCAL_SEARCH' }),
    signal: options.signal,
  });
  const authorizationBody = await authorizationResponse.json().catch(() => null) as { data?: { companion_uri?: string } } | null;
  if (!authorizationResponse.ok || !authorizationBody?.data?.companion_uri) {
    throw new Error(message(authorizationBody, 'ระบบไม่อนุญาตให้เริ่มค้นแหล่งนี้'));
  }

  options.onState?.('LAUNCHING');
  const launchResponse = await fetch(`${LOCAL_BRIDGE}/v1/command`, {
    method: 'POST',
    headers: { ...LOCAL_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uri: authorizationBody.data.companion_uri,
      search: { field: item.field, value: item.value, purpose: item.purpose, confirmed: true },
    }),
    signal: options.signal,
  }).catch(() => undefined);
  if (!launchResponse) throw new Error('ไม่พบ Recon Companion บนเครื่องนี้ กรุณาติดตั้งหรือเปิด Local Bridge แล้วลองใหม่');
  const launchBody = await launchResponse.json().catch(() => null) as { job_id?: string; error?: string } | null;
  if (!launchResponse.ok || !launchBody?.job_id) throw new Error(message(launchBody, 'Recon Companion ไม่รับงานค้น'));

  const jobId = launchBody.job_id;
  options.onState?.('SEARCHING');
  const deadline = Date.now() + 5 * 60 * 1000;
  let result: LocalReconResult | undefined;
  while (Date.now() < deadline) {
    await wait(1_500, options.signal);
    const statusResponse = await fetch(`${LOCAL_BRIDGE}/v1/jobs/${jobId}/status`, {
      headers: LOCAL_HEADERS,
      cache: 'no-store',
      signal: options.signal,
    });
    const statusBody = await statusResponse.json().catch(() => null) as { data?: { state?: string; result?: LocalReconResult; errorCode?: string } } | null;
    if (!statusResponse.ok || !statusBody?.data?.state) throw new Error(message(statusBody, 'อ่านสถานะงานค้นจาก Recon Companion ไม่สำเร็จ'));
    if (statusBody.data.state === 'FAILED') throw new Error(`ระบบต้นทางค้นไม่สำเร็จ (${statusBody.data.errorCode || 'RECON_FAILED'})`);
    if (statusBody.data.state === 'COMPLETE' && statusBody.data.result) {
      result = statusBody.data.result;
      break;
    }
  }
  if (!result) throw new Error('หมดเวลารอผลค้น กรุณาตรวจหน้าต่าง Recon Companion และลองใหม่');

  options.onState?.('DOWNLOADING');
  const resultResponse = await fetch(`${LOCAL_BRIDGE}/v1/jobs/${jobId}/result`, {
    headers: LOCAL_HEADERS,
    cache: 'no-store',
    signal: options.signal,
  });
  if (!resultResponse.ok) throw new Error('ดาวน์โหลด PDF ผลค้นจาก Recon Companion ไม่สำเร็จ');
  const blob = await resultResponse.blob();
  return {
    jobId,
    result,
    file: new File([blob], result.pdfFilename, { type: 'application/pdf', lastModified: Date.now() }),
  };
}

export async function markLocalReconImported(jobId: string, evidenceId: string) {
  await fetch(`${LOCAL_BRIDGE}/v1/jobs/${jobId}/imported`, {
    method: 'POST',
    headers: { ...LOCAL_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidenceId }),
  }).catch(() => undefined);
}
