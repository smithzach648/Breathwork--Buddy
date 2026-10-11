# Local only. Leaves the successful production app, routines and recordings untouched.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Host 'Acoustic Laboratory: http://127.0.0.1:4187/'
Write-Host 'Keep this window open. Press Ctrl+C here to shut the lab down.'
$labPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $labPnpm) {
  $labRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
  $env:PATH = (Join-Path $labRuntime 'node\bin') + ';' + (Join-Path $labRuntime 'bin\fallback') + ';' + $env:PATH
}
pnpm exec vite --config lab/vite.config.mjs --configLoader native
