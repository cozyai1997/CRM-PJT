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

$secureKey = Read-Host "Enter OPENAI_API_KEY" -AsSecureString
$plainKey = ConvertTo-PlainText $secureKey

if ([string]::IsNullOrWhiteSpace($plainKey)) {
  throw "OPENAI_API_KEY cannot be empty."
}

if (-not $plainKey.StartsWith("sk-")) {
  throw "OPENAI_API_KEY must start with sk-."
}

$lines = @()
if (Test-Path -LiteralPath $target) {
  $lines = Get-Content -LiteralPath $target
} elseif (Test-Path -LiteralPath $example) {
  $lines = Get-Content -LiteralPath $example
}

$updated = $false
$nextLines = foreach ($line in $lines) {
  if ($line -match "^OPENAI_API_KEY=") {
    $updated = $true
    "OPENAI_API_KEY=$plainKey"
  } else {
    $line
  }
}

if (-not $updated) {
  $nextLines += "OPENAI_API_KEY=$plainKey"
}

$nextLines | Set-Content -LiteralPath $target -Encoding UTF8

$plainKey = $null
[GC]::Collect()
