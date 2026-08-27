const args = new Set(process.argv.slice(2));
const runNetworkChecks = args.has('--network');

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PRIVATE_EVIDENCE_BUCKET',
  'APP_ORIGIN',
  'GEMINI_API_KEY',
  'N8N_AUTOMATION_WEBHOOK_URL',
  'N8N_DISPATCH_TOKEN',
  'N8N_CALLBACK_TOKEN',
];

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });
const valueOf = (name) => process.env[name]?.trim() || '';
const looksLikePlaceholder = (value) => !value || /your-|replace-|example\.(com|invalid)|localhost|127\.0\.0\.1/i.test(value);

if (required.every((name) => !valueOf(name))) {
  console.log('INFO  ไม่พบ .env.staging.local: ผลด้านล่างตรวจเฉพาะ configuration ใน process นี้ ไม่ได้อ่าน Cloudflare secrets');
  console.log('INFO  หาก deploy ด้วย Cloudflare secret store ให้ใช้ pnpm staging:live:verify และ pnpm staging:anonymous:verify ตรวจระบบที่ deploy แล้ว\n');
}

for (const name of required) {
  const value = valueOf(name);
  record(name, !looksLikePlaceholder(value), value ? 'configured' : 'missing');
}

record('NEXT_PUBLIC_DEMO_MODE', valueOf('NEXT_PUBLIC_DEMO_MODE') === 'false', 'must be false on staging');

for (const name of ['N8N_DISPATCH_TOKEN', 'N8N_CALLBACK_TOKEN']) {
  record(`${name}_STRENGTH`, valueOf(name).length >= 32, 'must contain at least 32 characters');
}
record(
  'N8N_TOKENS_SEPARATED',
  Boolean(valueOf('N8N_DISPATCH_TOKEN')) && valueOf('N8N_DISPATCH_TOKEN') !== valueOf('N8N_CALLBACK_TOKEN'),
  'dispatch and callback tokens must be different',
);
record(
  'SUPABASE_KEYS_SEPARATED',
  Boolean(valueOf('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
    && valueOf('NEXT_PUBLIC_SUPABASE_ANON_KEY') !== valueOf('SUPABASE_SERVICE_ROLE_KEY'),
  'anon and service-role keys must be different',
);

for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'APP_ORIGIN', 'N8N_AUTOMATION_WEBHOOK_URL']) {
  try {
    const url = new URL(valueOf(name));
    record(`${name}_HTTPS`, url.protocol === 'https:', url.protocol === 'https:' ? url.hostname : 'must use https');
  } catch {
    record(`${name}_HTTPS`, false, 'invalid URL');
  }
}

record(
  'PRIVATE_EVIDENCE_BUCKET_NAME',
  valueOf('PRIVATE_EVIDENCE_BUCKET') === 'evidence-vault',
  'expected evidence-vault',
);

async function checkHttp(name, request, validate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(request.url, { ...request.options, signal: controller.signal });
    const body = await response.json().catch(() => null);
    const validation = validate(response, body);
    record(name, validation.ok, validation.detail);
  } catch (error) {
    record(name, false, error instanceof Error ? error.name : 'request failed');
  } finally {
    clearTimeout(timeout);
  }
}

if (runNetworkChecks && results.every((item) => item.ok)) {
  const supabaseUrl = valueOf('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const anonKey = valueOf('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceKey = valueOf('SUPABASE_SERVICE_ROLE_KEY');

  await checkHttp('SUPABASE_PUBLIC_API', {
    url: `${supabaseUrl}/auth/v1/settings`,
    options: { headers: { apikey: anonKey } },
  }, (response) => ({ ok: response.ok, detail: `HTTP ${response.status}` }));

  await checkHttp('SUPABASE_ADMIN_API', {
    url: `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`,
    options: { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  }, (response) => ({ ok: response.ok, detail: `HTTP ${response.status}` }));

  await checkHttp('STAGING_HEALTH', {
    url: `${valueOf('APP_ORIGIN').replace(/\/$/, '')}/api/health`,
    options: { headers: { Accept: 'application/json' } },
  }, (response, body) => ({
    ok: response.ok && body?.status === 'ready',
    detail: `HTTP ${response.status}; status ${body?.status || 'invalid'}`,
  }));
}

for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} — ${result.detail}`);
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${runNetworkChecks ? ' (including network)' : ' (configuration only)'}.`);
if (failed.length) process.exitCode = 1;
