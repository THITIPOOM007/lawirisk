import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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

function readPublishableKey(projectRef) {
  const result = runPnpm(['exec', 'supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json']);
  if (result.status !== 0) throw new Error('อ่าน Supabase publishable key ไม่สำเร็จ');
  const keys = JSON.parse(result.stdout);
  const key = keys.find((item) => item.type === 'publishable')?.api_key
    || keys.find((item) => item.name === 'anon')?.api_key;
  if (!key) throw new Error('ไม่พบ Supabase publishable/anon key');
  return key;
}

async function main() {
  const projectRef = linkedProjectRef();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('ไม่พบ linked Supabase staging project ref');
  const key = readPublishableKey(projectRef);
  const baseUrl = `https://${projectRef}.supabase.co`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const casesResponse = await fetch(`${baseUrl}/rest/v1/cases?select=id&limit=1`, { headers, cache: 'no-store' });
  const cases = await casesResponse.json().catch(() => null);
  const casesHidden = casesResponse.ok && Array.isArray(cases) && cases.length === 0;

  const publicObjectResponse = await fetch(`${baseUrl}/storage/v1/object/public/evidence-vault/__anonymous_probe__`, {
    headers: { apikey: key },
    cache: 'no-store',
  });
  const publicReadDenied = !publicObjectResponse.ok;
  await publicObjectResponse.body?.cancel();

  const satisfactionRowsResponse = await fetch(`${baseUrl}/rest/v1/satisfaction_responses?select=id&limit=1`, {
    headers,
    cache: 'no-store',
  });
  const satisfactionRowsDenied = !satisfactionRowsResponse.ok;
  await satisfactionRowsResponse.body?.cancel();

  const directSatisfactionWriteResponse = await fetch(`${baseUrl}/rest/v1/satisfaction_responses`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      audience: 'PUBLIC',
      response_context: 'PUBLIC_SEARCH',
      interaction_id: crypto.randomUUID(),
      convenience_rating: 5,
      speed_rating: 5,
      accuracy_rating: 5,
      overall_rating: 5,
    }),
  });
  const directSatisfactionWriteDenied = !directSatisfactionWriteResponse.ok;
  await directSatisfactionWriteResponse.body?.cancel();

  const satisfactionSummaryResponse = await fetch(`${baseUrl}/rest/v1/rpc/get_satisfaction_summary`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const satisfactionSummaryDenied = !satisfactionSummaryResponse.ok;
  await satisfactionSummaryResponse.body?.cancel();

  console.log(`${casesHidden ? 'PASS' : 'FAIL'}  anonymous case rows are hidden by RLS (HTTP ${casesResponse.status})`);
  console.log(`${publicReadDenied ? 'PASS' : 'FAIL'}  evidence-vault does not allow anonymous public-object reads (HTTP ${publicObjectResponse.status})`);
  console.log(`${satisfactionRowsDenied ? 'PASS' : 'FAIL'}  raw satisfaction rows deny anonymous reads (HTTP ${satisfactionRowsResponse.status})`);
  console.log(`${directSatisfactionWriteDenied ? 'PASS' : 'FAIL'}  satisfaction writes require the application API (HTTP ${directSatisfactionWriteResponse.status})`);
  console.log(`${satisfactionSummaryDenied ? 'PASS' : 'FAIL'}  satisfaction summary RPC denies anonymous access (HTTP ${satisfactionSummaryResponse.status})`);
  if (!casesHidden || !publicReadDenied || !satisfactionRowsDenied || !directSatisfactionWriteDenied || !satisfactionSummaryDenied) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'ตรวจ anonymous staging boundary ไม่สำเร็จ');
  process.exitCode = 1;
});
