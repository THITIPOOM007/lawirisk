import { spawnSync } from 'node:child_process';

const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || 'keenndeevrwmembphckn';

function runPnpm(args, options = {}) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'pnpm';
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', ['pnpm', ...args].join(' ')]
    : args;

  return spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    ...options,
  });
}

function resolvePublicSupabaseConfig() {
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error('SUPABASE_PROJECT_REF มีรูปแบบไม่ถูกต้อง');
  }

  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (configuredUrl && configuredKey) {
    return { url: configuredUrl, key: configuredKey };
  }

  const result = runPnpm([
    'exec',
    'supabase',
    'projects',
    'api-keys',
    '--project-ref',
    projectRef,
    '--output',
    'json',
  ]);

  if (result.status !== 0) {
    throw new Error(
      `อ่าน Supabase publishable key ไม่สำเร็จ: ${result.stderr?.trim() || result.error?.message || 'unknown error'}`,
    );
  }

  const keys = JSON.parse(result.stdout);
  const publishableKey = keys.find((item) => item.type === 'publishable')?.api_key
    || keys.find((item) => item.name === 'anon')?.api_key;

  if (!publishableKey) {
    throw new Error('ไม่พบ Supabase publishable/anon key สำหรับ staging');
  }

  return {
    url: configuredUrl || `https://${projectRef}.supabase.co`,
    key: configuredKey || publishableKey,
  };
}

try {
  const publicConfig = resolvePublicSupabaseConfig();
  const deployment = runPnpm(
    ['exec', 'vinext-cloudflare', 'deploy', '--env', 'staging'],
    {
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: publicConfig.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: publicConfig.key,
      },
      stdio: 'inherit',
      encoding: undefined,
    },
  );

  process.exitCode = deployment.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'เตรียม staging deployment ไม่สำเร็จ');
  process.exitCode = 1;
}
