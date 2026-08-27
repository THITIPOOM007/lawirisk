param()

$ErrorActionPreference = 'Stop'
$handlerPath = (Resolve-Path (Join-Path $PSScriptRoot 'protocol-handler.ps1')).Path
$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$protocolRoot = 'HKCU:\Software\Classes\lawirisk-recon'
$commandKey = Join-Path $protocolRoot 'shell\open\command'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$bridgeStartPath = (Resolve-Path (Join-Path $PSScriptRoot 'start-bridge.ps1')).Path

New-Item -Path $protocolRoot -Force | Out-Null
Set-ItemProperty -Path $protocolRoot -Name '(Default)' -Value 'URL:LawiRisk Recon Companion' -Force
Set-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value '' -Force
New-Item -Path $commandKey -Force | Out-Null
$command = ('"{0}" -NoProfile -ExecutionPolicy Bypass -File "{1}" "%1"' -f $powershellPath, $handlerPath)
Set-ItemProperty -Path $commandKey -Name '(Default)' -Value $command -Force

New-Item -Path $runKey -Force | Out-Null
$bridgeCommand = ('"{0}" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}"' -f $powershellPath, $bridgeStartPath)
Set-ItemProperty -Path $runKey -Name 'LawiRiskReconBridge' -Value $bridgeCommand -Force

Start-Process -FilePath $powershellPath -ArgumentList @(
  '-NoProfile',
  '-WindowStyle', 'Hidden',
  '-ExecutionPolicy', 'Bypass',
  '-File', ('"{0}"' -f $bridgeStartPath)
) -WindowStyle Hidden

Write-Host 'Installed lawirisk-recon:// for the current Windows user' -ForegroundColor Green
Write-Host "Handler: $handlerPath"
Write-Host 'Local bridge: http://127.0.0.1:32147 (loopback only; starts with Windows)'
Write-Host 'Credentials stay in LocalAppData under Windows DPAPI and are not sent to Cloudflare/Supabase'
