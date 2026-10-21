# Runs one k6 load-test configuration against a fresh local API instance.
#   .\loadtest\run.ps1 -Label baseline            # Redis off, batching off
#   .\loadtest\run.ps1 -Label redis -Redis mock   # Redis on (in-memory mock)
#   .\loadtest\run.ps1 -Label upstash -Redis env  # Redis on (REDIS_URL from .env)
#   .\loadtest\run.ps1 -Label redis-batch -Redis mock -Batch
# Needs LOADTEST_DATABASE_URL (a throwaway Neon branch), ML on ML_SERVICE_URL, and k6.
param(
  [Parameter(Mandatory = $true)][string]$Label,
  [string]$Redis = '',
  [switch]$Batch,
  [int]$Port = 3101
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$env:DATABASE_URL = $env:LOADTEST_DATABASE_URL
$env:DATABASE_URL_UNPOOLED = if ($env:LOADTEST_DATABASE_URL_UNPOOLED) { $env:LOADTEST_DATABASE_URL_UNPOOLED } else { $env:LOADTEST_DATABASE_URL }
$env:PORT = "$Port"
$env:NODE_ENV = 'production'
if ($Redis -eq 'env') { Remove-Item Env:REDIS_URL -ErrorAction SilentlyContinue } # the real server from .env
elseif ($Redis) { $env:REDIS_URL = $Redis } else { $env:REDIS_URL = 'off' } # 'off', not unset: unset would fall through to .env
$env:ML_BATCH_VERIFY = if ($Batch) { 'true' } else { 'false' }

# After REDIS_URL is set, so the reset also clears this configuration's Redis keys
node loadtest/reset.mjs

$log = Join-Path $PSScriptRoot "server-$Label.log"
Remove-Item (Join-Path $PSScriptRoot "k6-$Label.log") -ErrorAction SilentlyContinue
$api = Start-Process node -ArgumentList 'server.js' -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
try {
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    try { if ((Invoke-WebRequest "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) { break } } catch {}
  }
  k6 run -q --log-output="file=$(Join-Path $PSScriptRoot "k6-$Label.log")" -e BASE="http://127.0.0.1:$Port" -e LABEL=$Label loadtest/checkin.js
  # Batch statistics from the API itself
  (Invoke-WebRequest "http://127.0.0.1:$Port/health" -UseBasicParsing).Content | Out-File -Encoding utf8 (Join-Path $PSScriptRoot "health-$Label.json")
} finally {
  Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
}
