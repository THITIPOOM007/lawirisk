param()

$ErrorActionPreference = 'Stop'
$bridgeScript = (Resolve-Path (Join-Path $PSScriptRoot 'local-bridge.mjs')).Path
$installRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$nodePathFile = Join-Path $installRoot 'node-path.txt'
$logPath = Join-Path $installRoot 'bridge.log'

try {
  $nodePath = if (Test-Path -LiteralPath $nodePathFile) {
    (Get-Content -LiteralPath $nodePathFile -Raw).Trim()
  } else {
    (Get-Command node.exe -ErrorAction Stop).Source
  }
  if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw 'ไม่พบ Node.js ที่บันทึกไว้ กรุณาติดตั้ง Recon Companion ซ้ำ'
  }
  & $nodePath $bridgeScript *>> $logPath
}
catch {
  "$(Get-Date -Format o) $($_.Exception.Message)" | Out-File -LiteralPath $logPath -Append -Encoding utf8
  exit 1
}
