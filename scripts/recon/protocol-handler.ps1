param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Uri
)

$ErrorActionPreference = 'Stop'
$companionScript = Join-Path $PSScriptRoot 'companion.mjs'
$nodePath = (Get-Command node -ErrorAction Stop).Source
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))
& $nodePath $companionScript $Uri
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'Recon Companion stopped. Review the message above.' -ForegroundColor Red
  Read-Host 'Press Enter to close this window'
}
