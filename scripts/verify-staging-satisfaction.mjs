import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const originArg = args.find((value) => value.startsWith('--origin='));
const origin = (originArg?.slice('--origin='.length)
  || process.env.APP_ORIGIN
  || 'https://lawirisk-ssk.evidenceverse-th.workers.dev').replace(/\/$/, '');

if (new URL(origin).protocol !== 'https:') {
  console.error('FAIL  STAGING_ORIGIN_HTTPS — satisfaction verification requires HTTPS');
  process.exit(1);
}

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });
const interactionId = crypto.randomUUID();

function runPnpm(args) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'pnpm';
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', ['pnpm', ...args].join(' ')]
    : args;
  return spawnSync(command, commandArgs, { cwd: process.cwd(), encoding: 'utf8' });
}

async function cleanupSmokeResponse() {
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim()
    || readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  const result = runPnpm(['exec', 'supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json']);
  if (result.status !== 0) throw new Error('อ่าน Supabase API keys สำหรับ cleanup ไม่สำเร็จ');
  const keys = JSON.parse(result.stdout);
  const serviceRoleKey = keys.find((item) => item.name === 'service_role')?.api_key
    || keys.find((item) => item.type === 'secret')?.api_key;
  if (!serviceRoleKey) throw new Error('ไม่พบ service-role key สำหรับ cleanup');
  const supabase = createClient(`https://${projectRef}.supabase.co`, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.from('satisfaction_responses').delete().eq('interaction_id', interactionId);
  if (error) throw error;
}

async function request(path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(`${origin}${path}`, {
      redirect: 'manual',
      signal: controller.signal,
      ...init,
    });
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const publicPage = await request('/public', { headers: { Accept: 'text/html' } });
  const publicHtml = await publicPage.text();
  record('PUBLIC_PAGE', publicPage.ok && publicHtml.includes('<title>LawiRisk-SSK'), `HTTP ${publicPage.status}`);

  const staffPage = await request('/satisfaction', { headers: { Accept: 'text/html' } });
  record(
    'STAFF_PAGE_PROTECTED',
    [302, 303, 307, 308].includes(staffPage.status) && (staffPage.headers.get('location') || '').includes('/login'),
    `HTTP ${staffPage.status}`,
  );
  await staffPage.body?.cancel();

  const anonymousSummary = await request('/api/v1/satisfaction', { headers: { Accept: 'application/json' } });
  record('SUMMARY_REQUIRES_STAFF', anonymousSummary.status === 401, `HTTP ${anonymousSummary.status}`);
  await anonymousSummary.body?.cancel();

  const untrustedSubmission = await request('/api/v1/satisfaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' },
    body: '{}',
  });
  record('POST_REJECTS_UNTRUSTED_ORIGIN', untrustedSubmission.status === 403, `HTTP ${untrustedSubmission.status}`);
  await untrustedSubmission.body?.cancel();

  const invalidSubmission = await request('/api/v1/satisfaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ audience: 'PUBLIC' }),
  });
  record('POST_VALIDATES_RATINGS', invalidSubmission.status === 400, `HTTP ${invalidSubmission.status}`);
  await invalidSubmission.body?.cancel();

  const payload = {
    audience: 'PUBLIC',
    context: 'PUBLIC_SEARCH',
    interactionId,
    convenience: 5,
    speed: 5,
    accuracy: 5,
    overall: 5,
    suggestion: '',
  };
  const submit = () => request('/api/v1/satisfaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(payload),
  });

  const firstSubmission = await submit();
  const firstBody = await firstSubmission.json().catch(() => null);
  record(
    'PUBLIC_SUBMISSION_SAVED',
    firstSubmission.status === 201 && firstBody?.success === true && firstBody?.data?.duplicate === false,
    `HTTP ${firstSubmission.status}`,
  );

  const duplicateSubmission = await submit();
  const duplicateBody = await duplicateSubmission.json().catch(() => null);
  record(
    'PUBLIC_SUBMISSION_IDEMPOTENT',
    duplicateSubmission.status === 200 && duplicateBody?.success === true && duplicateBody?.data?.duplicate === true,
    `HTTP ${duplicateSubmission.status}`,
  );

  await cleanupSmokeResponse();
  record('PUBLIC_SMOKE_CLEANUP', true, 'removed');
} catch (error) {
  record('SATISFACTION_LIVE_REQUEST', false, error instanceof Error ? error.message : 'request failed');
}

for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} — ${result.detail}`);
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} live satisfaction checks passed.`);
if (failed.length) process.exitCode = 1;
