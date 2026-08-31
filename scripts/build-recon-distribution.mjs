import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'public', 'recon');
const runtime = path.join(output, 'runtime', 'scripts', 'recon');
const files = [
  'companion-contract.mjs', 'companion.mjs', 'credential-store.ps1', 'install-protocol.ps1',
  'launch-visible.ps1', 'local-bridge.mjs', 'protocol-handler.ps1', 'start-bridge.ps1', 'uninstall-protocol.ps1',
];

await rm(output, { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
for (const file of files) {
  await copyFile(path.join(root, 'scripts', 'recon', file), path.join(runtime, file));
}
await writeFile(path.join(output, 'runtime', 'package.json'), JSON.stringify({
  name: 'lawirisk-recon-companion', private: true, type: 'module', version: '1.0.0',
  dependencies: { '@playwright/test': '1.62.1' },
}, null, 2), 'utf8');

const installer = `param()
$ErrorActionPreference = 'Stop'
$baseUrl = 'https://lawirisk-ssk.evidenceverse-th.workers.dev/recon/runtime'
$installRoot = Join-Path $env:LOCALAPPDATA 'LawiRisk-SSK\\ReconCompanion'
$scriptRoot = Join-Path $installRoot 'scripts\\recon'
$runtimeFiles = @(${files.map((file) => `'${file}'`).join(', ')})

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw 'ต้องติดตั้ง Node.js 20 LTS หรือใหม่กว่าจาก https://nodejs.org ก่อนติดตั้ง Recon Companion'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw 'ไม่พบ npm กรุณาติดตั้ง Node.js 20 LTS ใหม่แล้วลองอีกครั้ง'
}

New-Item -ItemType Directory -Path $scriptRoot -Force | Out-Null
Invoke-WebRequest -Uri "$baseUrl/package.json" -OutFile (Join-Path $installRoot 'package.json') -UseBasicParsing
foreach ($file in $runtimeFiles) {
  Invoke-WebRequest -Uri "$baseUrl/scripts/recon/$file" -OutFile (Join-Path $scriptRoot $file) -UseBasicParsing
}

Push-Location $installRoot
try {
  & npm.cmd install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'ติดตั้งส่วนประกอบ Recon Companion ไม่สำเร็จ' }
  & npx.cmd playwright install chromium
  if ($LASTEXITCODE -ne 0) { throw 'ติดตั้ง Chromium สำหรับ Recon Companion ไม่สำเร็จ' }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptRoot 'install-protocol.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'ลงทะเบียน Recon Companion ไม่สำเร็จ' }
}
finally { Pop-Location }

Write-Host 'Recon Companion พร้อมใช้งานบนเครื่องนี้ กรุณากลับไป LAW-i-RISK แล้วกดตรวจสอบอีกครั้ง' -ForegroundColor Green
Read-Host 'กด Enter เพื่อปิดหน้าต่าง'
`;
await writeFile(path.join(output, 'install.ps1'), installer, 'utf8');
console.log(`Prepared Recon Companion distribution in ${output}`);
