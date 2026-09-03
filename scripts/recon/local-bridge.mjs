#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  assertSourceLaunchAllowed,
  parseReconUri,
  resolveFdaPublicSearchContract,
  resolveFdaSearchModel,
  resolveFdaStaffSearchContract,
  isFdaStaffSearchService,
  resolveEsta2SearchOption,
  resolveHssSearchFilter,
} from './companion-contract.mjs';

export const LOCAL_BRIDGE_HOST = '127.0.0.1';
export const LOCAL_BRIDGE_PORT = 32147;
export const LOCAL_BRIDGE_CLIENT_HEADER = 'lawirisk-web-1';
export const LOCAL_SEARCH_JOB_TTL_MS = 2 * 60 * 1000;
export const LOCAL_SEARCH_RESULT_TTL_MS = 15 * 60 * 1000;

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
const resultRoot = path.join(localRoot, 'recon-results');

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

function safeResultFilename(value, jobId, extension) {
  if (typeof value !== 'string' || path.basename(value) !== value
    || !value.endsWith(extension) || !value.includes(jobId)) {
    throw new Error('INVALID_SEARCH_RESULT');
  }
  return value;
}

function cleanResultSummaries(value) {
  if (!Array.isArray(value)) throw new Error('INVALID_SEARCH_RESULT');
  return value.slice(0, 10).map((item) => cleanSearchText(item, 1, 500, 'INVALID_SEARCH_RESULT'));
}

async function validateCompletedResult(body, jobId, job, searchResultRoot = resultRoot) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_SEARCH_RESULT');
  const allowedKeys = new Set([
    'pdfFilename', 'metadataFilename', 'pdfSha256', 'screenshotFilename', 'screenshotSha256', 'resultRowCount', 'resultSummaries',
    'capturedAt', 'sourceUrl', 'adapterVersion', 'searchStrategy', 'searchAttemptCount',
  ]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) throw new Error('INVALID_SEARCH_RESULT');
  const pdfFilename = safeResultFilename(body.pdfFilename, jobId, '.pdf');
  const metadataFilename = safeResultFilename(body.metadataFilename, jobId, '.json');
  const screenshotFilename = safeResultFilename(body.screenshotFilename, jobId, '.png');
  if (typeof body.pdfSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(body.pdfSha256)) throw new Error('INVALID_SEARCH_RESULT');
  if (typeof body.screenshotSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(body.screenshotSha256)) throw new Error('INVALID_SEARCH_RESULT');
  if (!Number.isInteger(body.resultRowCount) || body.resultRowCount < 0 || body.resultRowCount > 10_000) {
    throw new Error('INVALID_SEARCH_RESULT');
  }
  const sourceUrl = new URL(cleanSearchText(body.sourceUrl, 8, 300, 'INVALID_SEARCH_RESULT'));
  const staffContract = job.context.source === 'FDA_SKYNET' && isFdaStaffSearchService(job.context.service)
    ? resolveFdaStaffSearchContract(job.context.service, job.context.field)
    : undefined;
  const allowedResultHost = job.context.source === 'FDA_PUBLIC'
    ? 'meshlog.fda.moph.go.th'
    : staffContract
    ? staffContract.host
    : job.context.source === 'FDA_SKYNET'
    ? 'help.fda.moph.go.th'
    : job.context.source === 'HSS_ESTA2'
      ? 'esta2.hss.moph.go.th'
      : 'oss.hss.moph.go.th';
  if (sourceUrl.hostname !== allowedResultHost || sourceUrl.username || sourceUrl.password
    || (job.context.source !== 'HSS_OSS' && sourceUrl.protocol !== 'https:')
    || (job.context.source === 'HSS_OSS' && sourceUrl.protocol !== 'http:')
    || (staffContract && sourceUrl.pathname !== staffContract.path)) {
    throw new Error('INVALID_SEARCH_RESULT_SOURCE');
  }
  const pdfPath = path.resolve(searchResultRoot, pdfFilename);
  const screenshotPath = path.resolve(searchResultRoot, screenshotFilename);
  const metadataPath = path.resolve(searchResultRoot, metadataFilename);
  const rootPrefix = `${path.resolve(searchResultRoot)}${path.sep}`;
  if (!pdfPath.startsWith(rootPrefix) || !metadataPath.startsWith(rootPrefix) || !screenshotPath.startsWith(rootPrefix)) throw new Error('INVALID_SEARCH_RESULT');
  const [pdfBytes, pdfInfo, screenshotBytes, screenshotInfo] = await Promise.all([readFile(pdfPath), stat(pdfPath), readFile(screenshotPath), stat(screenshotPath)]);
  if (pdfInfo.size < 5 || pdfInfo.size > 200 * 1024 * 1024 || pdfBytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('INVALID_SEARCH_RESULT');
  }
  const actualSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  if (actualSha256 !== body.pdfSha256) throw new Error('INVALID_SEARCH_RESULT_HASH');
  if (screenshotInfo.size < 8 || screenshotInfo.size > 20 * 1024 * 1024 || screenshotBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('INVALID_SEARCH_RESULT');
  }
  if (createHash('sha256').update(screenshotBytes).digest('hex') !== body.screenshotSha256) throw new Error('INVALID_SEARCH_RESULT_HASH');
  return {
    source: job.context.source,
    service: job.context.service,
    searchField: job.context.field,
    pdfFilename,
    metadataFilename,
    pdfSha256: body.pdfSha256,
    pdfSize: pdfInfo.size,
    screenshotFilename,
    screenshotSha256: body.screenshotSha256,
    screenshotSize: screenshotInfo.size,
    resultRowCount: body.resultRowCount,
    resultSummaries: cleanResultSummaries(body.resultSummaries),
    capturedAt: cleanSearchText(body.capturedAt, 10, 40, 'INVALID_SEARCH_RESULT'),
    sourceUrl: sourceUrl.toString(),
    adapterVersion: cleanSearchText(body.adapterVersion, 1, 100, 'INVALID_SEARCH_RESULT'),
    searchStrategy: cleanSearchText(body.searchStrategy, 1, 40, 'INVALID_SEARCH_RESULT'),
    searchAttemptCount: Number.isInteger(body.searchAttemptCount) ? body.searchAttemptCount : 1,
    pdfPath,
    screenshotPath,
  };
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

function cleanSearchText(value, minimum, maximum, code) {
  if (typeof value !== 'string') throw new Error(code);
  const cleaned = value.trim();
  if (cleaned.length < minimum || cleaned.length > maximum || /[\0\r\n]/.test(cleaned)) throw new Error(code);
  return cleaned;
}

export function validateLocalSearch(search, command) {
  if (!search || typeof search !== 'object' || Array.isArray(search)) throw new Error('INVALID_SEARCH_REQUEST');
  const allowedKeys = new Set(['field', 'value', 'purpose', 'confirmed']);
  if (Object.keys(search).some((key) => !allowedKeys.has(key))) throw new Error('INVALID_SEARCH_REQUEST');
  if (search.confirmed !== true) throw new Error('SEARCH_CONFIRMATION_REQUIRED');
  if (command.action !== 'launch' || !['FDA_PUBLIC', 'FDA_SKYNET', 'HSS_OSS', 'HSS_ESTA2'].includes(command.source.key)
    || !command.caseId || !command.service) {
    throw new Error('AUTOMATED_SEARCH_NOT_ALLOWED');
  }
  const field = cleanSearchText(search.field, 1, 50, 'INVALID_SEARCH_FIELD');
  if (command.source.key === 'FDA_PUBLIC') resolveFdaPublicSearchContract(command.service, field);
  else if (command.source.key === 'FDA_SKYNET' && isFdaStaffSearchService(command.service)) resolveFdaStaffSearchContract(command.service, field);
  else if (command.source.key === 'FDA_SKYNET') resolveFdaSearchModel(command.service, field);
  else if (command.source.key === 'HSS_OSS') resolveHssSearchFilter(command.service, field);
  else resolveEsta2SearchOption(command.service, field);
  const value = cleanSearchText(search.value, 2, 200, 'INVALID_SEARCH_VALUE');
  if (command.source.key === 'FDA_SKYNET' && !isFdaStaffSearchService(command.service) && !/^\d{13}$/.test(value)) {
    throw new Error('INVALID_SEARCH_VALUE');
  }
  return {
    source: command.source.key,
    service: command.service,
    caseId: command.caseId,
    field,
    value,
    purpose: cleanSearchText(search.purpose, 10, 500, 'INVALID_SEARCH_PURPOSE'),
    createdAt: new Date().toISOString(),
  };
}

export function createLocalBridgeServer(options = {}) {
  const launchHandler = options.launchHandler || launchVisibleHandler;
  const jobTtlMs = Number.isFinite(options.jobTtlMs) && options.jobTtlMs > 0
    ? options.jobTtlMs
    : LOCAL_SEARCH_JOB_TTL_MS;
  const resultTtlMs = Number.isFinite(options.resultTtlMs) && options.resultTtlMs > 0
    ? options.resultTtlMs
    : LOCAL_SEARCH_RESULT_TTL_MS;
  const searchResultRoot = typeof options.resultRoot === 'string' ? path.resolve(options.resultRoot) : resultRoot;
  const jobs = new Map();
  const scheduleExpiry = (jobId, job, ttlMs) => {
    clearTimeout(job.timer);
    job.expiresAt = Date.now() + ttlMs;
    job.timer = setTimeout(() => jobs.delete(jobId), ttlMs);
    job.timer.unref?.();
  };
  const pruneJobs = () => {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (job.expiresAt <= now) {
        clearTimeout(job.timer);
        jobs.delete(id);
      }
    }
  };

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

    const jobMatch = request.method === 'GET' ? request.url?.match(/^\/v1\/jobs\/([0-9a-f-]{36})$/i) : undefined;
    if (jobMatch) {
      if (origin || request.headers['x-lawirisk-recon-job'] !== jobMatch[1]) {
        sendJson(response, 403, { error: 'JOB_ACCESS_DENIED' });
        return;
      }
      pruneJobs();
      const job = jobs.get(jobMatch[1]);
      if (!job || job.state !== 'QUEUED' || !job.search) {
        sendJson(response, 404, { error: 'SEARCH_JOB_NOT_FOUND' });
        return;
      }
      const search = job.search;
      job.search = undefined;
      job.state = 'RUNNING';
      scheduleExpiry(jobMatch[1], job, resultTtlMs);
      sendJson(response, 200, { data: search });
      return;
    }

    const companionResultMatch = request.method === 'POST'
      ? request.url?.match(/^\/v1\/jobs\/([0-9a-f-]{36})\/(complete|fail)$/i)
      : undefined;
    if (companionResultMatch) {
      const [, jobId, operation] = companionResultMatch;
      if (origin || request.headers['x-lawirisk-recon-job'] !== jobId) {
        sendJson(response, 403, { error: 'JOB_ACCESS_DENIED' });
        return;
      }
      pruneJobs();
      const job = jobs.get(jobId);
      if (!job || job.state !== 'RUNNING') {
        sendJson(response, 404, { error: 'SEARCH_JOB_NOT_FOUND' });
        return;
      }
      try {
        const body = await readJsonBody(request);
        if (operation === 'fail') {
          const code = cleanSearchText(body?.errorCode, 3, 80, 'INVALID_SEARCH_RESULT');
          if (!/^[A-Z0-9_]+$/.test(code)) throw new Error('INVALID_SEARCH_RESULT');
          job.state = 'FAILED';
          job.errorCode = code;
        }
        else {
          job.result = await validateCompletedResult(body, jobId, job, searchResultRoot);
          job.state = 'COMPLETE';
        }
        scheduleExpiry(jobId, job, resultTtlMs);
        sendJson(response, 200, { accepted: true });
      }
      catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : 'INVALID_SEARCH_RESULT' });
      }
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

    const browserJobMatch = request.url?.match(/^\/v1\/jobs\/([0-9a-f-]{36})\/(status|result|screenshot|imported)$/i);
    if (browserJobMatch) {
      const [, jobId, operation] = browserJobMatch;
      pruneJobs();
      const job = jobs.get(jobId);
      if (!job) {
        sendJson(response, 404, { error: 'SEARCH_JOB_NOT_FOUND' });
        return;
      }
      if (operation === 'status' && request.method === 'GET') {
        sendJson(response, 200, {
          data: {
            jobId,
            state: job.state,
            ...job.context,
            result: job.result ? { ...job.result, pdfPath: undefined } : undefined,
            errorCode: job.errorCode,
          },
        });
        return;
      }
      if (operation === 'result' && request.method === 'GET') {
        if (job.state !== 'COMPLETE' || !job.result) {
          sendJson(response, 409, { error: 'SEARCH_RESULT_NOT_READY' });
          return;
        }
        try {
          const pdfBytes = await readFile(job.result.pdfPath);
          response.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': String(pdfBytes.length),
            'Content-Disposition': `attachment; filename="${job.result.pdfFilename}"`,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(pdfBytes);
        }
        catch {
          sendJson(response, 410, { error: 'SEARCH_RESULT_FILE_UNAVAILABLE' });
        }
        return;
      }
      if (operation === 'screenshot' && request.method === 'GET') {
        if (job.state !== 'COMPLETE' || !job.result) {
          sendJson(response, 409, { error: 'SEARCH_RESULT_NOT_READY' });
          return;
        }
        try {
          const screenshotBytes = await readFile(job.result.screenshotPath);
          response.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': String(screenshotBytes.length),
            'Content-Disposition': `attachment; filename="${job.result.screenshotFilename}"`,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(screenshotBytes);
        }
        catch {
          sendJson(response, 410, { error: 'SEARCH_SCREENSHOT_UNAVAILABLE' });
        }
        return;
      }
      if (operation === 'imported' && request.method === 'POST') {
        try {
          const body = await readJsonBody(request);
          if (!body || !Array.isArray(body.evidenceIds) || body.evidenceIds.length < 1 || body.evidenceIds.length > 2
            || body.evidenceIds.some((id) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
            throw new Error('INVALID_EVIDENCE_ID');
          }
          clearTimeout(job.timer);
          jobs.delete(jobId);
          sendJson(response, 200, { imported: true });
        }
        catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : 'INVALID_EVIDENCE_ID' });
        }
        return;
      }
      sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
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
      let launchUri = body.uri;
      let mode = 'OPEN_FORM';
      let jobId;
      if (body.search !== undefined) {
        const search = validateLocalSearch(body.search, command);
        pruneJobs();
        jobId = randomUUID();
        const job = {
          search,
          state: 'QUEUED',
          context: { source: search.source, service: search.service, field: search.field },
          expiresAt: 0,
          timer: undefined,
        };
        jobs.set(jobId, job);
        scheduleExpiry(jobId, job, jobTtlMs);
        const uri = new URL(body.uri);
        uri.searchParams.set('job_id', jobId);
        launchUri = uri.toString();
        mode = 'LOCAL_SEARCH';
      }
      try {
        launchHandler(launchUri);
      }
      catch (error) {
        const jobId = new URL(launchUri).searchParams.get('job_id');
        const job = jobId ? jobs.get(jobId) : undefined;
        if (jobId) jobs.delete(jobId);
        if (job) clearTimeout(job.timer);
        throw error;
      }
      sendJson(response, 202, { accepted: true, action: command.action, source: command.source.key, mode, job_id: jobId });
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
