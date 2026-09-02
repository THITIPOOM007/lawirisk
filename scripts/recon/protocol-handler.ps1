param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Uri
)

$ErrorActionPreference = 'Stop'
$companionScript = Join-Path $PSScriptRoot 'companion.mjs'
$installRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$nodePathFile = Join-Path $installRoot 'node-path.txt'

try {
  $nodePath = if (Test-Path -LiteralPath $nodePathFile) {
    (Get-Content -LiteralPath $nodePathFile -Raw).Trim()
  } else {
    (Get-Command node.exe -ErrorAction Stop).Source
  }
  if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw 'ไม่พบ Node.js ที่ใช้ติดตั้ง กรุณาติดตั้ง Recon Companion ซ้ำ'
  }
  Set-Location $installRoot
  & $nodePath $companionScript $Uri
  if ($LASTEXITCODE -ne 0) { throw "Recon Companion exited with code $LASTEXITCODE" }
}
catch {
  Write-Host ''
  Write-Host "เปิด Recon Companion ไม่สำเร็จ: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host 'กด Enter เพื่อปิดหน้าต่าง'
  exit 1
}
