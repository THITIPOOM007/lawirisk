param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Set', 'Get', 'Remove', 'Exists', 'SelfTest')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [ValidateSet('FDA_SKYNET', 'HSS_OSS', 'HSS_ESTA2')]
  [string]$Source
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$storeRoot = Join-Path $env:LOCALAPPDATA 'LawiRisk-SSK\recon-credentials'
$credentialPath = Join-Path $storeRoot "$Source.dpapi"

function Convert-SecureStringToPlainText([Security.SecureString]$SecureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

switch ($Action) {
  'Set' {
    New-Item -ItemType Directory -Path $storeRoot -Force | Out-Null
    $username = Read-Host "Username for $Source"
    if ([string]::IsNullOrWhiteSpace($username)) {
      throw 'Username must not be empty'
    }
    $securePassword = Read-Host "Password for $Source (input is hidden)" -AsSecureString
    $password = Convert-SecureStringToPlainText $securePassword
    if ([string]::IsNullOrEmpty($password)) {
      throw 'Password must not be empty'
    }
    try {
      $payload = @{ username = $username; password = $password } | ConvertTo-Json -Compress
      $payloadBytes = [Text.Encoding]::UTF8.GetBytes($payload)
      $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
        $payloadBytes,
        $null,
        [Security.Cryptography.DataProtectionScope]::CurrentUser
      )
      $cipherText = [Convert]::ToBase64String($protectedBytes)
      [IO.File]::WriteAllText($credentialPath, $cipherText, [Text.UTF8Encoding]::new($false))
      Write-Host "Saved $Source credential with DPAPI for the current Windows user"
    }
    finally {
      $password = $null
      $payload = $null
    }
  }
  'Get' {
    if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
      exit 3
    }
    $cipherText = [IO.File]::ReadAllText($credentialPath, [Text.Encoding]::UTF8)
    $protectedBytes = [Convert]::FromBase64String($cipherText)
    $payloadBytes = [Security.Cryptography.ProtectedData]::Unprotect(
      $protectedBytes,
      $null,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $payload = [Text.Encoding]::UTF8.GetString($payloadBytes)
    [Console]::Out.Write($payload)
    $payload = $null
  }
  'Remove' {
    if (Test-Path -LiteralPath $credentialPath -PathType Leaf) {
      Remove-Item -LiteralPath $credentialPath -Force
      Write-Host "Removed $Source credential from this computer"
    }
  }
  'Exists' {
    if (Test-Path -LiteralPath $credentialPath -PathType Leaf) {
      [Console]::Out.Write('true')
    }
    else {
      [Console]::Out.Write('false')
    }
  }
  'SelfTest' {
    $testPayload = '{"username":"dpapi-self-test","password":"ephemeral-test-value"}'
    $payloadBytes = [Text.Encoding]::UTF8.GetBytes($testPayload)
    $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
      $payloadBytes,
      $null,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $roundTripBytes = [Security.Cryptography.ProtectedData]::Unprotect(
      $protectedBytes,
      $null,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $roundTrip = [Text.Encoding]::UTF8.GetString($roundTripBytes)
    if ($roundTrip -ne $testPayload) {
      throw 'DPAPI self-test failed'
    }
    $roundTrip = $null
    $testPayload = $null
    [Console]::Out.Write('DPAPI self-test passed')
  }
}
