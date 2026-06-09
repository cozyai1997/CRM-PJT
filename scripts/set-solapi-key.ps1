$ErrorActionPreference = "Stop"

$workspace = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$target = Join-Path $workspace ".env.local"
$example = Join-Path $workspace ".env.example"

function ConvertTo-PlainText {
  param([Parameter(Mandatory = $true)][Security.SecureString]$SecureString)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Upsert-EnvLine {
  param(
    [Parameter(Mandatory = $true)][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $updated = $false
  $nextLines = foreach ($line in $Lines) {
    if ($line -match "^$([regex]::Escape($Name))=") {
      $updated = $true
      "$Name=$Value"
    } else {
      $line
    }
  }

  if (-not $updated) {
    $nextLines += "$Name=$Value"
  }

  $nextLines
}

$secureApiKey = Read-Host "Enter SOLAPI_API_KEY" -AsSecureString
$secureApiSecret = Read-Host "Enter SOLAPI_API_SECRET" -AsSecureString
$senderNumber = Read-Host "Enter registered SOLAPI_SENDER_NUMBER"

$apiKey = ConvertTo-PlainText $secureApiKey
$apiSecret = ConvertTo-PlainText $secureApiSecret
$normalizedSender = $senderNumber -replace "\D", ""

if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw "SOLAPI_API_KEY cannot be empty."
}

if ([string]::IsNullOrWhiteSpace($apiSecret)) {
  throw "SOLAPI_API_SECRET cannot be empty."
}

if ([string]::IsNullOrWhiteSpace($normalizedSender)) {
  throw "SOLAPI_SENDER_NUMBER cannot be empty."
}

$lines = @()
if (Test-Path -LiteralPath $target) {
  $lines = Get-Content -LiteralPath $target
} elseif (Test-Path -LiteralPath $example) {
  $lines = Get-Content -LiteralPath $example
}

$lines = Upsert-EnvLine -Lines $lines -Name "SOLAPI_API_KEY" -Value $apiKey
$lines = Upsert-EnvLine -Lines $lines -Name "SOLAPI_API_SECRET" -Value $apiSecret
$lines = Upsert-EnvLine -Lines $lines -Name "SOLAPI_SENDER_NUMBER" -Value $normalizedSender

$lines | Set-Content -LiteralPath $target -Encoding UTF8

$apiKey = $null
$apiSecret = $null
[GC]::Collect()
