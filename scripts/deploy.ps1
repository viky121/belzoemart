<#
.SYNOPSIS
  Deploy the current local source to the Belzo production EC2 host.

.DESCRIPTION
  Packages the working tree (excluding build artifacts, deps and secrets),
  uploads it to the server, extracts it over ~/belzo, then rebuilds and
  restarts the Docker Compose services. By default only the `web` image is
  rebuilt (fast); pass -All to rebuild api/worker/web.

.EXAMPLE
  pnpm deploy            # or:  powershell -File scripts/deploy.ps1
  powershell -File scripts/deploy.ps1 -All
#>
param(
  [string]$Server = 'ubuntu@13.48.85.9',
  [string]$Key = "$PSScriptRoot\..\Belzo-key.pem",
  [switch]$All
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

$tgz = Join-Path $root 'belzo-src.tgz'
Write-Host '==> Packaging source…' -ForegroundColor Cyan
tar --exclude=node_modules --exclude=.git --exclude=.next --exclude=dist `
  --exclude=.pnpm-store --exclude='*.pem' --exclude='*.tgz' `
  --exclude=.env --exclude=.env.local --exclude=tsconfig.tsbuildinfo `
  -czf $tgz .

Write-Host '==> Uploading to server…' -ForegroundColor Cyan
scp -i $Key -o StrictHostKeyChecking=accept-new $tgz "${Server}:/home/ubuntu/belzo-src.tgz"

$cmp = 'sudo docker compose --env-file .env.prod -f docker-compose.prod.yml'
$svc = if ($All) { '' } else { 'web' }

$remote = @"
set -e
cd ~/belzo
tar -xzf ~/belzo-src.tgz
echo '==> Building images ($svc)…'
$cmp build $svc
echo '==> Restarting services…'
$cmp up -d
$cmp ps
rm -f ~/belzo-src.tgz
echo '==> Done.'
"@

Write-Host '==> Remote build + restart (this can take a few minutes)…' -ForegroundColor Cyan
ssh -i $Key -o StrictHostKeyChecking=accept-new $Server $remote

Remove-Item $tgz -Force -ErrorAction SilentlyContinue
Write-Host '==> Deployed. Open http://13.48.85.9' -ForegroundColor Green
