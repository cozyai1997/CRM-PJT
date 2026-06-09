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

$secureApiKey = Read-Host "Enter CALLBRIDGE_API_KEY" -AsSecureString
$displayNumber = Read-Host "Enter CALLBRIDGE_DISPLAY_NUMBER"
$apiKey = ConvertTo-PlainText $secureApiKey

if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw "CALLBRIDGE_API_KEY cannot be empty."
}

if ([string]::IsNullOrWhiteSpace($displayNumber)) {
  throw "CALLBRIDGE_DISPLAY_NUMBER cannot be empty."
}

$lines = @()
if (Test-Path -LiteralPath $target) {
  $lines = Get-Content -LiteralPath $target
} elseif (Test-Path -LiteralPath $example) {
  $lines = Get-Content -LiteralPath $example
}

$lines = Upsert-EnvLine -Lines $lines -Name "CALLBRIDGE_API_KEY" -Value $apiKey
$lines = Upsert-EnvLine -Lines $lines -Name "CALLBRIDGE_AGENT_API_KEY" -Value $apiKey
$lines = Upsert-EnvLine -Lines $lines -Name "CALLBRIDGE_BASE_URL" -Value "https://bnd.happytalk.io/api/openapi"
$lines = Upsert-EnvLine -Lines $lines -Name "CALLBRIDGE_DISPLAY_NUMBER" -Value $displayNumber.Trim()
$lines = Upsert-EnvLine -Lines $lines -Name "OPENAI_REALTIME_TRANSCRIPTION_MODEL" -Value "gpt-realtime-whisper"

$lines | Set-Content -LiteralPath $target -Encoding UTF8

$apiKey = $null
[GC]::Collect()
