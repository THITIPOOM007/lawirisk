param()

$ErrorActionPreference = 'Stop'
$handlerPath = (Resolve-Path (Join-Path $PSScriptRoot 'protocol-handler.ps1')).Path
$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$protocolRoot = 'HKCU:\Software\Classes\lawirisk-recon'
$commandKey = Join-Path $protocolRoot 'shell\open\command'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$bridgeStartPath = (Resolve-Path (Join-Path $PSScriptRoot 'start-bridge.ps1')).Path
$installRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$nodePathFile = Join-Path $installRoot 'node-path.txt'
$bridgePidPath = Join-Path (Join-Path $env:LOCALAPPDATA 'LawiRisk-SSK') 'recon-bridge.pid'

[System.IO.File]::WriteAllText($nodePathFile, $nodePath, [System.Text.UTF8Encoding]::new($false))

New-Item -Path $protocolRoot -Force | Out-Null
Set-ItemProperty -Path $protocolRoot -Name '(Default)' -Value 'URL:LawiRisk Recon Companion' -Force
Set-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value '' -Force
New-Item -Path $commandKey -Force | Out-Null
$command = ('"{0}" -NoProfile -ExecutionPolicy Bypass -File "{1}" "%1"' -f $powershellPath, $handlerPath)
Set-ItemProperty -Path $commandKey -Name '(Default)' -Value $command -Force

New-Item -Path $runKey -Force | Out-Null
$bridgeCommand = ('"{0}" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}"' -f $powershellPath, $bridgeStartPath)
Set-ItemProperty -Path $runKey -Name 'LawiRiskReconBridge' -Value $bridgeCommand -Force

if (Test-Path -LiteralPath $bridgePidPath) {
  $previousPid = 0
  if ([int]::TryParse((Get-Content -LiteralPath $bridgePidPath -Raw).Trim(), [ref]$previousPid)) {
    $previousProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $previousPid" -ErrorAction SilentlyContinue
    if ($previousProcess -and $previousProcess.Name -eq 'node.exe' -and $previousProcess.CommandLine -like '*local-bridge.mjs*') {
      Stop-Process -Id $previousPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 300
    }
  }
  Remove-Item -LiteralPath $bridgePidPath -Force -ErrorAction SilentlyContinue
}

Start-Process -FilePath $powershellPath -ArgumentList @(
  '-NoProfile',
  '-WindowStyle', 'Hidden',
  '-ExecutionPolicy', 'Bypass',
  '-File', ('"{0}"' -f $bridgeStartPath)
) -WindowStyle Hidden

$bridgeReady = $false
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  try {
    $health = Invoke-WebRequest -Uri 'http://127.0.0.1:32147/health' -UseBasicParsing -TimeoutSec 1
    if ($health.StatusCode -eq 200) {
      $bridgeReady = $true
      break
    }
  }
  catch { }
}
if (-not $bridgeReady) {
  throw 'Protocol was registered, but Local Bridge did not become ready. Check bridge.log in the installation folder.'
}

Write-Host 'Installed lawirisk-recon:// for the current Windows user' -ForegroundColor Green
Write-Host "Handler: $handlerPath"
Write-Host 'Local bridge: http://127.0.0.1:32147 (loopback only; starts with Windows)'
Write-Host 'Credentials stay in LocalAppData under Windows DPAPI and are not sent to Cloudflare/Supabase'
