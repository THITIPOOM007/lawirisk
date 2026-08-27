const args = process.argv.slice(2);
const originArg = args.find((value) => value.startsWith('--origin='));
const origin = (originArg?.slice('--origin='.length)
  || process.env.APP_ORIGIN
  || 'https://lawirisk-ssk.evidenceverse-th.workers.dev').replace(/\/$/, '');

if (new URL(origin).protocol !== 'https:') {
  console.error('FAIL  STAGING_ORIGIN_HTTPS — live staging verification requires HTTPS');
  process.exit(1);
}

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

async function request(path, validate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${origin}${path}`, {
      headers: { Accept: path.startsWith('/api/') ? 'application/json' : 'text/html' },
      redirect: 'manual',
      signal: controller.signal,
    });
    return validate(response);
  }
  catch (error) {
    return { ok: false, detail: error instanceof Error ? error.name : 'request failed' };
  }
  finally {
    clearTimeout(timeout);
  }
}

record('STAGING_ORIGIN_HTTPS', true, origin);

const login = await request('/login', async (response) => {
  const csp = response.headers.get('content-security-policy') || '';
  const hsts = response.headers.get('strict-transport-security') || '';
  const body = await response.text();
  record('LOGIN_PAGE', response.ok && body.includes('เข้าสู่ระบบงานสืบสวน'), `HTTP ${response.status}`);
  record('CONTENT_SECURITY_POLICY', csp.includes("default-src 'self'") && csp.includes("object-src 'none'"), csp ? 'configured' : 'missing');
  record('STRICT_TRANSPORT_SECURITY', /^max-age=\d+/.test(hsts), hsts || 'missing');
  record('FRAME_PROTECTION', response.headers.get('x-frame-options') === 'DENY' || csp.includes("frame-ancestors 'none'"), 'DENY/frame-ancestors');
  return { ok: true, detail: 'expanded checks recorded' };
});
if (!login.ok) record('LOGIN_REQUEST', false, login.detail);

const health = await request('/api/health', async (response) => {
  const body = await response.json().catch(() => null);
  const requiredChecks = ['supabase', 'serviceRole', 'privateEvidenceBucket', 'fileValidation', 'gemini', 'n8nAutomation'];
  record('HEALTH_READY', response.ok && body?.status === 'ready' && Array.isArray(body?.blockers) && body.blockers.length === 0, `HTTP ${response.status}; ${body?.status || 'invalid'}`);
  for (const name of requiredChecks) record(`HEALTH_${name}`, body?.checks?.[name] === true, body?.checks?.[name] === true ? 'ready' : 'not ready');
  return { ok: true, detail: 'expanded checks recorded' };
});
if (!health.ok) record('HEALTH_REQUEST', false, health.detail);

for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} — ${result.detail}`);
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} live staging checks passed.`);
if (failed.length) process.exitCode = 1;
