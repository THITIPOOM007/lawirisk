param(
  [Parameter(Mandatory = $true)]
  [string]$Uri
)

$ErrorActionPreference = 'Stop'
$handlerPath = (Resolve-Path (Join-Path $PSScriptRoot 'protocol-handler.ps1')).Path
$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', ('"{0}"' -f $handlerPath),
  ('"{0}"' -f $Uri)
)
Start-Process -FilePath $powershellPath -ArgumentList $arguments -WindowStyle Normal
