param()

$ErrorActionPreference = 'Stop'
$bridgeScript = (Resolve-Path (Join-Path $PSScriptRoot 'local-bridge.mjs')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
& $nodePath $bridgeScript
