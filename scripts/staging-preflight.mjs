const args = new Set(process.argv.slice(2));
const runNetworkChecks = args.has('--network');

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PRIVATE_EVIDENCE_BUCKET',
  'MALWARE_SCANNER_URL',
  'MALWARE_SCANNER_TOKEN',
  'APP_ORIGIN',
];

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });
const valueOf = (name) => process.env[name]?.trim() || '';
const looksLikePlaceholder = (value) => !value || /your-|replace-|example\.(com|invalid)|localhost|127\.0\.0\.1/i.test(value);

for (const name of required) {
  const value = valueOf(name);
  record(name, !looksLikePlaceholder(value), value ? 'configured' : 'missing');
}

record('NEXT_PUBLIC_DEMO_MODE', valueOf('NEXT_PUBLIC_DEMO_MODE') === 'false', 'must be false on staging');

for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'MALWARE_SCANNER_URL', 'APP_ORIGIN']) {
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

  const scannerBody = new FormData();
  scannerBody.set('file', new Blob(['EvidenceVerse staging scanner connectivity probe'], { type: 'text/plain' }), 'safe-probe.txt');
  await checkHttp('MALWARE_SCANNER_SAFE_PROBE', {
    url: valueOf('MALWARE_SCANNER_URL'),
    options: {
      method: 'POST',
      headers: { Authorization: `Bearer ${valueOf('MALWARE_SCANNER_TOKEN')}` },
      body: scannerBody,
    },
  }, (response, body) => ({
    ok: response.ok && body?.verdict === 'CLEAN' && typeof body?.scanner === 'string' && typeof body?.signature_version === 'string',
    detail: response.ok ? `verdict ${body?.verdict || 'invalid'}` : `HTTP ${response.status}`,
  }));

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
