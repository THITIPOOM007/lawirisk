import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const originArg = args.find((value) => value.startsWith('--origin='));
const origin = (originArg?.slice('--origin='.length)
  || process.env.APP_ORIGIN
  || 'https://lawirisk-ssk.evidenceverse-th.workers.dev').replace(/\/$/, '');

function linkedProjectRef() {
  const configured = process.env.SUPABASE_PROJECT_REF?.trim();
  if (configured) return configured;
  try {
    return readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  } catch {
    return '';
  }
}

function runPnpm(args) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'pnpm';
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', ['pnpm', ...args].join(' ')]
    : args;
  return spawnSync(command, commandArgs, { cwd: process.cwd(), encoding: 'utf8' });
}

function readApiKeys(projectRef) {
  const result = runPnpm(['exec', 'supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json']);
  if (result.status !== 0) throw new Error('อ่าน Supabase API keys ไม่สำเร็จ');
  const keys = JSON.parse(result.stdout);
  const serviceRoleKey = keys.find((item) => item.name === 'service_role')?.api_key
    || keys.find((item) => item.type === 'secret')?.api_key;
  if (!serviceRoleKey) throw new Error('ไม่พบ Supabase service-role key สำหรับ staging verification');
  return { serviceRoleKey };
}

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

async function main() {
  const projectRef = linkedProjectRef();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('ไม่พบ linked Supabase staging project ref');
  if (new URL(origin).protocol !== 'https:') throw new Error('staging origin ต้องใช้ HTTPS');

  const { serviceRoleKey } = readApiKeys(projectRef);
  const supabase = createClient(`https://${projectRef}.supabase.co`, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `satisfaction-smoke-${Date.now()}@example.invalid`;
  const password = `S!${crypto.randomBytes(24).toString('base64url')}`;
  const interactionId = crypto.randomUUID();
  let userId;

  try {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'Staging Satisfaction Smoke Test' },
    });
    if (createError || !created.user) throw createError || new Error('สร้างบัญชีทดสอบชั่วคราวไม่สำเร็จ');
    userId = created.user.id;

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      name: 'Staging Satisfaction Smoke Test',
      role: 'VIEWER',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (profileError) throw profileError;
    record('TEMP_STAFF_READY', true, 'temporary VIEWER profile created');

    const loginResponse = await fetch(`${origin}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
    });
    const getSetCookie = loginResponse.headers.getSetCookie?.bind(loginResponse.headers);
    const setCookies = getSetCookie ? getSetCookie() : [];
    const cookieHeader = setCookies.map((value) => value.split(';', 1)[0]).join('; ');
    record('STAFF_LOGIN', loginResponse.status === 200 && Boolean(cookieHeader), `HTTP ${loginResponse.status}`);
    if (!loginResponse.ok || !cookieHeader) throw new Error('staging login ไม่คืน session cookie');

    const summaryBeforeResponse = await fetch(`${origin}/api/v1/satisfaction`, {
      headers: { Accept: 'application/json', Cookie: cookieHeader },
    });
    const summaryBefore = await summaryBeforeResponse.json().catch(() => null);
    const beforeTotal = summaryBefore?.data?.totalResponses;
    record('STAFF_SUMMARY_AUTHORIZED', summaryBeforeResponse.status === 200 && Number.isInteger(beforeTotal), `HTTP ${summaryBeforeResponse.status}`);

    const payload = {
      audience: 'STAFF',
      context: 'STAFF_SESSION',
      interactionId,
      convenience: 5,
      speed: 5,
      accuracy: 5,
      overall: 5,
      suggestion: '',
    };
    const staffSubmissionResponse = await fetch(`${origin}/api/v1/satisfaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookieHeader },
      body: JSON.stringify(payload),
    });
    const staffSubmission = await staffSubmissionResponse.json().catch(() => null);
    record(
      'STAFF_SUBMISSION_SAVED',
      staffSubmissionResponse.status === 201 && staffSubmission?.data?.duplicate === false,
      `HTTP ${staffSubmissionResponse.status}`,
    );

    const summaryAfterResponse = await fetch(`${origin}/api/v1/satisfaction`, {
      headers: { Accept: 'application/json', Cookie: cookieHeader },
    });
    const summaryAfter = await summaryAfterResponse.json().catch(() => null);
    const afterTotal = summaryAfter?.data?.totalResponses;
    record(
      'COMBINED_SUMMARY_UPDATED',
      summaryAfterResponse.status === 200 && Number.isInteger(beforeTotal) && afterTotal === beforeTotal + 1,
      `HTTP ${summaryAfterResponse.status}; delta ${Number.isInteger(beforeTotal) && Number.isInteger(afterTotal) ? afterTotal - beforeTotal : 'invalid'}`,
    );
  } finally {
    const { error: responseCleanupError } = await supabase
      .from('satisfaction_responses')
      .delete()
      .eq('interaction_id', interactionId);
    if (responseCleanupError) record('TEMP_RESPONSE_CLEANUP', false, responseCleanupError.code || 'failed');
    else record('TEMP_RESPONSE_CLEANUP', true, 'removed');

    if (userId) {
      const { error: userCleanupError } = await supabase.auth.admin.deleteUser(userId);
      if (userCleanupError) record('TEMP_USER_CLEANUP', false, userCleanupError.name || 'failed');
      else record('TEMP_USER_CLEANUP', true, 'removed');
    }
  }

  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} — ${result.detail}`);
  }
  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} authenticated staff checks passed.`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'ตรวจ satisfaction flow สำหรับเจ้าหน้าที่ไม่สำเร็จ');
  process.exitCode = 1;
});
