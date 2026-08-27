param()

$ErrorActionPreference = 'Stop'
$protocolRoot = 'HKCU:\Software\Classes\lawirisk-recon'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (Test-Path -LiteralPath $protocolRoot) {
  Remove-Item -LiteralPath $protocolRoot -Recurse -Force
  Write-Host 'Uninstalled lawirisk-recon://' -ForegroundColor Green
}
else {
  Write-Host 'lawirisk-recon:// is not registered for the current Windows user'
}

Remove-ItemProperty -Path $runKey -Name 'LawiRiskReconBridge' -ErrorAction SilentlyContinue
Write-Host 'Disabled automatic startup for the local Recon bridge'
