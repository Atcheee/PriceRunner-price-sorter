$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$release = Join-Path $root "release"
$stage = Join-Path $release "stage"
$zip = Join-Path $release "pricerunner-extension-2.0.0.zip"

if (-not $release.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release path escaped project root."
}

if (Test-Path -LiteralPath $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
if (Test-Path -LiteralPath $zip) {
  Remove-Item -LiteralPath $zip -Force
}

New-Item -ItemType Directory -Force -Path $stage | Out-Null

$files = @(
  "manifest.json",
  "background.js",
  "watchlist-loader.js",
  "core.js",
  "page-parser.js",
  "content.js",
  "styles.css",
  "README.md",
  "PRIVACY.md"
)

foreach ($file in $files) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $stage $file)
}

Copy-Item -LiteralPath (Join-Path $root "dist") -Destination (Join-Path $stage "dist") -Recurse
Copy-Item -LiteralPath (Join-Path $root "icons") -Destination (Join-Path $stage "icons") -Recurse

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force

Write-Output "Created $zip"
