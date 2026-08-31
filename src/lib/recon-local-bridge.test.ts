import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  LOCAL_BRIDGE_CLIENT_HEADER,
  LOCAL_BRIDGE_HOST,
  LOCAL_BRIDGE_PORT,
  createLocalBridgeServer,
  isAllowedReconOrigin,
  validateLocalSearch,
} from '../../scripts/recon/local-bridge.mjs';

async function withLocalBridge(
  run: (baseUrl: string, launched: string[]) => Promise<void>,
  options: { jobTtlMs?: number; resultTtlMs?: number; resultRoot?: string } = {},
) {
  const launched: string[] = [];
  const server = createLocalBridgeServer({ ...options, launchHandler: (uri: string) => launched.push(uri) });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOCAL_BRIDGE_HOST, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP bridge address');
  try {
    await run(`http://${LOCAL_BRIDGE_HOST}:${address.port}`, launched);
  }
  finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const trustedHeaders = {
  Origin: 'https://lawirisk-ssk.evidenceverse-th.workers.dev',
  'X-LawiRisk-Recon-Client': LOCAL_BRIDGE_CLIENT_HEADER,
};

describe('local recon bridge boundary', () => {
  it('binds only to loopback with a stable non-secret client marker', () => {
    expect(LOCAL_BRIDGE_HOST).toBe('127.0.0.1');
    expect(LOCAL_BRIDGE_PORT).toBe(32147);
    expect(LOCAL_BRIDGE_CLIENT_HEADER).toBe('lawirisk-web-1');
  });

  it('allows only the deployed app and explicit local development origins', () => {
    expect(isAllowedReconOrigin('https://lawirisk-ssk.evidenceverse-th.workers.dev')).toBe(true);
    expect(isAllowedReconOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedReconOrigin('https://attacker.example')).toBe(false);
    expect(isAllowedReconOrigin(undefined)).toBe(false);
  });

  it('reports loopback health without exposing credentials', async () => {
    await withLocalBridge(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'ready', transport: 'loopback-only' });
    });
  });

  it('allows the trusted private-network preflight and rejects other origins', async () => {
    await withLocalBridge(async (baseUrl) => {
      const allowed = await fetch(`${baseUrl}/v1/command`, {
        method: 'OPTIONS',
        headers: {
          Origin: trustedHeaders.Origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,x-lawirisk-recon-client',
          'Access-Control-Request-Private-Network': 'true',
        },
      });
      expect(allowed.status).toBe(204);
      expect(allowed.headers.get('access-control-allow-origin')).toBe(trustedHeaders.Origin);
      expect(allowed.headers.get('access-control-allow-private-network')).toBe('true');

      const blocked = await fetch(`${baseUrl}/v1/command`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://attacker.example' },
      });
      expect(blocked.status).toBe(403);
      expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  it('fails closed for untrusted origins, missing client marker and unknown routes', async () => {
    await withLocalBridge(async (baseUrl) => {
      const untrusted = await fetch(`${baseUrl}/v1/command`, {
        method: 'POST',
        headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: 'lawirisk-recon://setup?source=FDA_SKYNET' }),
      });
      expect(untrusted.status).toBe(403);
      await expect(untrusted.json()).resolves.toEqual({ error: 'ORIGIN_NOT_ALLOWED' });

      const noMarker = await fetch(`${baseUrl}/v1/command`, {
        method: 'POST',
        headers: { Origin: trustedHeaders.Origin, 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(noMarker.status).toBe(403);
      await expect(noMarker.json()).resolves.toEqual({ error: 'CLIENT_HEADER_REQUIRED' });

      const missing = await fetch(`${baseUrl}/missing`, { method: 'POST', headers: trustedHeaders });
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toEqual({ error: 'NOT_FOUND' });
    });
  });

  it('rejects malformed, oversized and non-allowlisted commands without launching a process', async () => {
    await withLocalBridge(async (baseUrl) => {
      const malformed = await fetch(`${baseUrl}/v1/command`, {
        method: 'POST',
        headers: { ...trustedHeaders, 'Content-Type': 'application/json' },
        body: '{',
      });
      expect(malformed.status).toBe(400);

      const invalidSource = await fetch(`${baseUrl}/v1/command`, {
        method: 'POST',
        headers: { ...trustedHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: 'lawirisk-recon://setup?source=ATTACKER' }),
      });
      expect(invalidSource.status).toBe(400);
      await expect(invalidSource.json()).resolves.toEqual({ error: 'SOURCE_NOT_ALLOWED' });

      const oversized = await fetch(`${baseUrl}/v1/command`, {
        method: 'POST',
        headers: { ...trustedHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: `lawirisk-recon://setup?source=FDA_SKYNET&padding=${'x'.repeat(9_000)}` }),
      });
      expect(oversized.status).toBe(400);
      await expect(oversized.json()).resolves.toEqual({ error: 'REQUEST_TOO_LARGE' });
    });
  });

  it('holds a confirmed HSS query in one-time local memory without putting it in the launch URI', async () => {
    await withLocalBridge(async (baseUrl, launched) => {
      const response = await fetch(`${baseUrl}/v1/command`, {
        method: 'POST',
        headers: { ...trustedHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uri: 'lawirisk-recon://launch?source=HSS_OSS&case_id=case-1&service=HSS_FACILITY&allow_insecure_http=1',
          search: { field: 'PHONE', value: '0800000000', purpose: 'ตรวจสอบตามสำนวนที่ได้รับมอบหมาย', confirmed: true },
        }),
      });
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({ mode: 'LOCAL_SEARCH', source: 'HSS_OSS' });
      expect(launched).toHaveLength(1);
      expect(launched[0]).not.toContain('0800000000');
      expect(launched[0]).not.toContain('purpose');

      const uri = new URL(launched[0]);
      const jobId = uri.searchParams.get('job_id');
      expect(jobId).toMatch(/^[0-9a-f-]{36}$/i);
      const consumed = await fetch(`${baseUrl}/v1/jobs/${jobId}`, {
        headers: { 'X-LawiRisk-Recon-Job': jobId! },
      });
      expect(consumed.status).toBe(200);
      await expect(consumed.json()).resolves.toMatchObject({
        data: { field: 'PHONE', value: '0800000000', caseId: 'case-1' },
      });
      const replay = await fetch(`${baseUrl}/v1/jobs/${jobId}`, {
        headers: { 'X-LawiRisk-Recon-Job': jobId! },
      });
      expect(replay.status).toBe(404);
    });
  });

  it('holds a confirmed FDA identifier in one-time local memory without leaking it into the launch URI', async () => {
    await withLocalBridge(async (baseUrl, launched) => {
      const response = await fetch(`${baseUrl}/v1/command`, {
        method: 'POST',
        headers: { ...trustedHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uri: 'lawirisk-recon://launch?source=FDA_SKYNET&case_id=case-1&service=DBD',
          search: { field: 'JURISTIC_ID', value: '0100000000001', purpose: 'ตรวจสอบตามสำนวนที่ได้รับมอบหมาย', confirmed: true },
        }),
      });
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({ mode: 'LOCAL_SEARCH', source: 'FDA_SKYNET' });
      expect(launched).toHaveLength(1);
      expect(launched[0]).not.toContain('0100000000001');
      const jobId = new URL(launched[0]).searchParams.get('job_id');
      const consumed = await fetch(`${baseUrl}/v1/jobs/${jobId}`, {
        headers: { 'X-LawiRisk-Recon-Job': jobId! },
      });
      expect(consumed.status).toBe(200);
      await expect(consumed.json()).resolves.toMatchObject({
        data: { source: 'FDA_SKYNET', service: 'DBD', field: 'JURISTIC_ID', value: '0100000000001' },
      });
    });
  });

  it('returns a completed official PDF to the trusted app without exposing the raw query in status', async () => {
    const resultRoot = await mkdtemp(path.join(os.tmpdir(), 'lawirisk-recon-result-'));
    try {
      await withLocalBridge(async (baseUrl) => {
        const launch = await fetch(`${baseUrl}/v1/command`, {
          method: 'POST',
          headers: { ...trustedHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uri: 'lawirisk-recon://launch?source=FDA_SKYNET&case_id=case-1&service=DBD',
            search: { field: 'JURISTIC_ID', value: '0100000000001', purpose: 'ตรวจสอบตามสำนวนที่ได้รับมอบหมาย', confirmed: true },
          }),
        });
        const launched = await launch.json() as { job_id: string };
        const jobId = launched.job_id;
        const consumed = await fetch(`${baseUrl}/v1/jobs/${jobId}`, { headers: { 'X-LawiRisk-Recon-Job': jobId } });
        expect(consumed.status).toBe(200);

        const pdfFilename = `FDA_SKYNET-DBD-${jobId}.pdf`;
        const metadataFilename = `FDA_SKYNET-DBD-${jobId}.json`;
        const pdfBytes = Buffer.from('%PDF-1.4\n% trusted test result\n%%EOF', 'utf8');
        const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
        await Promise.all([
          writeFile(path.join(resultRoot, pdfFilename), pdfBytes),
          writeFile(path.join(resultRoot, metadataFilename), '{}', 'utf8'),
        ]);
        const completed = await fetch(`${baseUrl}/v1/jobs/${jobId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-LawiRisk-Recon-Job': jobId },
          body: JSON.stringify({
            pdfFilename,
            metadataFilename,
            pdfSha256,
            resultRowCount: 1,
            resultSummaries: ['0100000000001 บริษัท ตัวอย่าง จำกัด'],
            capturedAt: '2026-08-29T03:00:00.000Z',
            sourceUrl: 'https://help.fda.moph.go.th/FDA_DBD/HOME/FRM_DBD_DATA_SEARCH',
            adapterVersion: 'test-v1',
            searchStrategy: 'EXACT',
            searchAttemptCount: 1,
          }),
        });
        expect(completed.status).toBe(200);

        const status = await fetch(`${baseUrl}/v1/jobs/${jobId}/status`, { headers: trustedHeaders });
        expect(status.status).toBe(200);
        const statusText = await status.text();
        expect(statusText).not.toContain('value');
        expect(statusText).not.toContain('purpose');
        expect(JSON.parse(statusText)).toMatchObject({ data: { state: 'COMPLETE', result: { pdfSha256, resultRowCount: 1 } } });

        const result = await fetch(`${baseUrl}/v1/jobs/${jobId}/result`, { headers: trustedHeaders });
        expect(result.status).toBe(200);
        expect(Buffer.from(await result.arrayBuffer())).toEqual(pdfBytes);

        const imported = await fetch(`${baseUrl}/v1/jobs/${jobId}/imported`, {
          method: 'POST',
          headers: { ...trustedHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ evidenceId: '00000000-0000-4000-8000-000000000123' }),
        });
        expect(imported.status).toBe(200);
        const gone = await fetch(`${baseUrl}/v1/jobs/${jobId}/status`, { headers: trustedHeaders });
        expect(gone.status).toBe(404);
      }, { resultRoot });
    }
    finally {
      await rm(resultRoot, { recursive: true, force: true });
    }
  });

  it('denies browser-origin access to local jobs and fails closed for unsafe search requests', async () => {
    await withLocalBridge(async (baseUrl, launched) => {
      const invalidRequests = [
        { field: 'PHONE', value: '0800000000', purpose: 'ตรวจสอบตามสำนวนที่ได้รับมอบหมาย', confirmed: false },
        { field: 'UNKNOWN', value: 'ทดสอบ', purpose: 'ตรวจสอบตามสำนวนที่ได้รับมอบหมาย', confirmed: true },
        { field: 'PHONE', value: 'x', purpose: 'ตรวจสอบตามสำนวนที่ได้รับมอบหมาย', confirmed: true },
        { field: 'PHONE', value: '0800000000', purpose: 'สั้น', confirmed: true },
        { field: 'PHONE', value: '0800000000', purpose: 'ตรวจสอบตามสำนวนที่ได้รับมอบหมาย', confirmed: true, token: 'forbidden' },
      ];
      for (const search of invalidRequests) {
        const response = await fetch(`${baseUrl}/v1/command`, {
          method: 'POST',
          headers: { ...trustedHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uri: 'lawirisk-recon://launch?source=HSS_OSS&case_id=case-1&service=HSS_FACILITY&allow_insecure_http=1',
            search,
          }),
        });
        expect(response.status).toBe(400);
      }
      expect(launched).toHaveLength(0);

      const valid = validateLocalSearch(
        { field: 'CITIZEN_ID', value: '0000000000000', purpose: 'ตรวจสอบตามสำนวนทดสอบที่ได้รับมอบหมาย', confirmed: true },
        {
          action: 'launch',
          source: { key: 'HSS_OSS' },
          caseId: 'case-1',
          service: 'HSS_PROFESSIONAL',
        },
      );
      expect(valid).toMatchObject({ field: 'CITIZEN_ID', service: 'HSS_PROFESSIONAL' });

      const validEsta2 = validateLocalSearch(
        { field: 'FACILITY_NAME', value: 'ร้านนวดตัวอย่าง', purpose: 'ตรวจสอบตามสำนวนทดสอบที่ได้รับมอบหมาย', confirmed: true },
        {
          action: 'launch',
          source: { key: 'HSS_ESTA2' },
          caseId: 'case-1',
          service: 'HSS_HEALTH_BUSINESS_APPROVED',
        },
      );
      expect(validEsta2).toMatchObject({
        source: 'HSS_ESTA2',
        field: 'FACILITY_NAME',
        service: 'HSS_HEALTH_BUSINESS_APPROVED',
      });

      const validFdaDbd = validateLocalSearch(
        { field: 'JURISTIC_ID', value: '0100000000001', purpose: 'ตรวจสอบตามสำนวนทดสอบที่ได้รับมอบหมาย', confirmed: true },
        {
          action: 'launch',
          source: { key: 'FDA_SKYNET' },
          caseId: 'case-1',
          service: 'DBD',
        },
      );
      expect(validFdaDbd).toMatchObject({
        source: 'FDA_SKYNET',
        field: 'JURISTIC_ID',
        service: 'DBD',
        value: '0100000000001',
      });
      const validFdaPublic = validateLocalSearch(
        { field: 'FACILITY_TERM', value: 'ร้านยาทดสอบ', purpose: 'ตรวจสอบตามสำนวนทดสอบที่ได้รับมอบหมาย', confirmed: true },
        {
          action: 'launch',
          source: { key: 'FDA_PUBLIC' },
          caseId: 'case-1',
          service: 'FDA_DRUG_REGISTRY',
        },
      );
      expect(validFdaPublic).toMatchObject({
        source: 'FDA_PUBLIC', field: 'FACILITY_TERM', service: 'FDA_DRUG_REGISTRY', value: 'ร้านยาทดสอบ',
      });
      expect(() => validateLocalSearch(
        { field: 'JURISTIC_ID', value: '123', purpose: 'ตรวจสอบตามสำนวนทดสอบที่ได้รับมอบหมาย', confirmed: true },
        {
          action: 'launch',
          source: { key: 'FDA_SKYNET' },
          caseId: 'case-1',
          service: 'DBD',
        },
      )).toThrow('INVALID_SEARCH_VALUE');
      expect(() => validateLocalSearch(
        { field: 'PERSON_NAME', value: 'บุคคล ทดสอบ', purpose: 'ตรวจสอบตามสำนวนทดสอบที่ได้รับมอบหมาย', confirmed: true },
        {
          action: 'launch',
          source: { key: 'FDA_SKYNET' },
          caseId: 'case-1',
          service: 'DOPA',
        },
      )).toThrow('SEARCH_FIELD_NOT_ALLOWED');

      const unauthorized = await fetch(`${baseUrl}/v1/jobs/00000000-0000-4000-8000-000000000000`, {
        headers: { Origin: trustedHeaders.Origin, 'X-LawiRisk-Recon-Job': '00000000-0000-4000-8000-000000000000' },
      });
      expect(unauthorized.status).toBe(403);
    });
  });

  it('deletes an unconsumed search job when its local TTL expires', async () => {
    await withLocalBridge(async (baseUrl, launched) => {
      const response = await fetch(`${baseUrl}/v1/command`, {
        method: 'POST',
        headers: { ...trustedHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uri: 'lawirisk-recon://launch?source=HSS_OSS&case_id=case-1&service=HSS_FACILITY&allow_insecure_http=1',
          search: { field: 'PHONE', value: '0800000000', purpose: 'ตรวจสอบตามสำนวนที่ได้รับมอบหมาย', confirmed: true },
        }),
      });
      expect(response.status).toBe(202);
      const jobId = new URL(launched[0]).searchParams.get('job_id');
      await new Promise((resolve) => setTimeout(resolve, 30));
      const expired = await fetch(`${baseUrl}/v1/jobs/${jobId}`, {
        headers: { 'X-LawiRisk-Recon-Job': jobId! },
      });
      expect(expired.status).toBe(404);
    }, { jobTtlMs: 10 });
  });
});
