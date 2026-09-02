import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
  const source = path.join(root, 'scripts', 'recon', file);
  const destination = path.join(runtime, file);
  if (file.endsWith('.ps1')) {
    const contents = await readFile(source, 'utf8');
    await writeFile(destination, `\uFEFF${contents}`, 'utf8');
  } else {
    await copyFile(source, destination);
  }
}
await writeFile(path.join(output, 'runtime', 'package.json'), JSON.stringify({
  name: 'lawirisk-recon-companion', private: true, type: 'module', version: '1.0.0',
  dependencies: { '@playwright/test': '1.62.1' },
}, null, 2), 'utf8');

const installer = `param([switch]$NoPause)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$baseUrl = 'https://lawirisk-ssk.evidenceverse-th.workers.dev/recon/runtime'
$installRoot = Join-Path $env:LOCALAPPDATA 'LawiRisk-SSK\\ReconCompanion'
$scriptRoot = Join-Path $installRoot 'scripts\\recon'
$logPath = Join-Path $installRoot 'install.log'
$runtimeFiles = @(${files.map((file) => `'${file}'`).join(', ')})

New-Item -ItemType Directory -Path $scriptRoot -Force | Out-Null
try {
  Start-Transcript -LiteralPath $logPath -Append | Out-Null
  $nodeCommand = Get-Command node.exe -ErrorAction Stop
  $npmCommand = Get-Command npm.cmd -ErrorAction Stop
  $nodeVersion = (& $nodeCommand.Source --version)
  if ($nodeVersion -notmatch '^v(\\d+)\\.' -or [int]$Matches[1] -lt 20) {
    throw 'ต้องติดตั้ง Node.js 20 LTS หรือใหม่กว่าจาก https://nodejs.org ก่อนติดตั้ง Recon Companion'
  }

  Invoke-WebRequest -Uri "$baseUrl/package.json" -OutFile (Join-Path $installRoot 'package.json') -UseBasicParsing
  foreach ($file in $runtimeFiles) {
    $destination = Join-Path $scriptRoot $file
    Invoke-WebRequest -Uri "$baseUrl/scripts/recon/$file" -OutFile $destination -UseBasicParsing
    if ((Get-Item -LiteralPath $destination).Length -lt 1) { throw "ดาวน์โหลด $file ไม่สมบูรณ์" }
  }

  Push-Location $installRoot
  try {
    & $npmCommand.Source install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'ติดตั้งส่วนประกอบ Recon Companion ไม่สำเร็จ' }
    & (Join-Path (Split-Path $npmCommand.Source) 'npx.cmd') playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'ติดตั้ง Chromium สำหรับ Recon Companion ไม่สำเร็จ' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptRoot 'install-protocol.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'ลงทะเบียน Recon Companion ไม่สำเร็จ' }
  }
  finally { Pop-Location }

  Write-Host 'Recon Companion พร้อมใช้งาน กรุณากลับไป LAW-i-RISK แล้วกด “ตรวจอีกครั้ง”' -ForegroundColor Green
}
catch {
  Write-Host ''
  Write-Host "ติดตั้งไม่สำเร็จ: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "รายละเอียด: $logPath" -ForegroundColor Yellow
  if (-not $NoPause) { Read-Host 'กด Enter เพื่อปิดหน้าต่าง' }
  exit 1
}
finally {
  try { Stop-Transcript | Out-Null } catch { }
}

if (-not $NoPause) { Read-Host 'กด Enter เพื่อปิดหน้าต่าง' }
`;
await writeFile(path.join(output, 'install.ps1'), `\uFEFF${installer}`, 'utf8');

const launcher = `@echo off
setlocal
chcp 65001 >nul
set "INSTALLER=%TEMP%\\LAW-i-RISK-Recon-Installer.ps1"
echo Downloading LAW-i-RISK Recon Companion...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri 'https://lawirisk-ssk.evidenceverse-th.workers.dev/recon/install.ps1' -OutFile $env:INSTALLER; Unblock-File -LiteralPath $env:INSTALLER; & $env:INSTALLER -NoPause"
if errorlevel 1 (
  echo.
  echo Installation failed. Review the message and install.log shown above.
) else (
  echo.
  echo Installation completed. Return to LAW-i-RISK and click Check again.
)
if /I not "%~1"=="--no-pause" pause
endlocal
`;
await writeFile(path.join(output, 'install.cmd'), launcher, 'utf8');
console.log(`Prepared Recon Companion distribution in ${output}`);
