#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assertSourceLaunchAllowed, parseReconUri } from './companion-contract.mjs';

export const LOCAL_BRIDGE_HOST = '127.0.0.1';
export const LOCAL_BRIDGE_PORT = 32147;
export const LOCAL_BRIDGE_CLIENT_HEADER = 'lawirisk-web-1';

const allowedOrigins = new Set([
  'https://lawirisk-ssk.evidenceverse-th.workers.dev',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const visibleLauncherPath = path.join(scriptDir, 'launch-visible.ps1');
const localRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'LawiRisk-SSK');
const pidPath = path.join(localRoot, 'recon-bridge.pid');

export function isAllowedReconOrigin(origin) {
  return typeof origin === 'string' && allowedOrigins.has(origin);
}

function applyCors(response, origin) {
  if (!isAllowedReconOrigin(origin)) return;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-LawiRisk-Recon-Client');
  response.setHeader('Access-Control-Allow-Private-Network', 'true');
  response.setHeader('Access-Control-Max-Age', '600');
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function launchVisibleHandler(uri) {
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-WindowStyle',
    'Hidden',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    visibleLauncherPath,
    '-Uri',
    uri,
  ], {
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

export function createLocalBridgeServer() {
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    applyCors(response, origin);

    if (request.method === 'OPTIONS') {
      response.writeHead(isAllowedReconOrigin(origin) ? 204 : 403, { 'Cache-Control': 'no-store' });
      response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { status: 'ready', transport: 'loopback-only' });
      return;
    }

    if (!isAllowedReconOrigin(origin)) {
      sendJson(response, 403, { error: 'ORIGIN_NOT_ALLOWED' });
      return;
    }

    if (request.headers['x-lawirisk-recon-client'] !== LOCAL_BRIDGE_CLIENT_HEADER) {
      sendJson(response, 403, { error: 'CLIENT_HEADER_REQUIRED' });
      return;
    }

    if (request.method !== 'POST' || request.url !== '/v1/command') {
      sendJson(response, 404, { error: 'NOT_FOUND' });
      return;
    }

    try {
      const body = await readJsonBody(request);
      if (!body || typeof body.uri !== 'string' || body.uri.length > 512) throw new Error('INVALID_COMMAND');
      const command = parseReconUri(body.uri);
      if (command.action === 'launch') assertSourceLaunchAllowed(command);
      launchVisibleHandler(body.uri);
      sendJson(response, 202, { accepted: true, action: command.action, source: command.source.key });
    }
    catch (error) {
      const code = error instanceof Error ? error.message : 'INVALID_COMMAND';
      sendJson(response, 400, { error: code });
    }
  });
}

async function main() {
  await mkdir(localRoot, { recursive: true });
  const server = createLocalBridgeServer();
  server.on('error', (error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') process.exit(0);
    throw error;
  });
  server.listen(LOCAL_BRIDGE_PORT, LOCAL_BRIDGE_HOST, async () => {
    await writeFile(pidPath, String(process.pid), 'utf8');
    console.log(`LawiRisk Recon Bridge ready on http://${LOCAL_BRIDGE_HOST}:${LOCAL_BRIDGE_PORT}`);
  });

  const close = () => server.close(async () => {
    await rm(pidPath, { force: true }).catch(() => undefined);
    process.exit(0);
  });
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
