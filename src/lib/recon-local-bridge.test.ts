import { describe, expect, it } from 'vitest';
import {
  LOCAL_BRIDGE_CLIENT_HEADER,
  LOCAL_BRIDGE_HOST,
  LOCAL_BRIDGE_PORT,
  createLocalBridgeServer,
  isAllowedReconOrigin,
} from '../../scripts/recon/local-bridge.mjs';

async function withLocalBridge(run: (baseUrl: string) => Promise<void>) {
  const server = createLocalBridgeServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOCAL_BRIDGE_HOST, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP bridge address');
  try {
    await run(`http://${LOCAL_BRIDGE_HOST}:${address.port}`);
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
});
