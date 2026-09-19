<#
.SYNOPSIS
    Starts Vuka on this machine.

.DESCRIPTION
    A convenience for local development on Windows, where the README's `docker compose up -d`
    is not an option because Postgres is installed natively rather than in a container.

    It pins JAVA_HOME and Maven onto PATH for this process only, so it does not depend on
    machine-wide environment variables being set correctly, and it does not change them.

    This script is for a developer laptop. It is not a deployment mechanism, and the
    -DevAuth switch must never be used anywhere reachable by anybody else.

.PARAMETER DevAuth
    Enables the development sign in, which skips Firebase token verification entirely so the
    four role journeys can be walked with no Firebase project attached. The frontend needs
    VITE_DEV_AUTH=true in frontend/.env to match. Off unless asked for.

.PARAMETER SkipSeed
    Starts without loading the seeded entities, allocations and audit outcomes. Useful for
    seeing what the empty states actually look like, which is worth doing once before a demo.

.EXAMPLE
    .\run-local.ps1 -DevAuth
    Then, in a second terminal: cd frontend; npm run dev
#>
param(
    [switch]$DevAuth,
    [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Toolchain. Set for this process only so nothing machine-wide is touched.
# ---------------------------------------------------------------------------

$jdk21 = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$maven = 'C:\Users\mphah\tools\apache-maven-3.9.9'

if (-not (Test-Path $jdk21)) {
    # Any JDK 21 will do. Fall back to whatever is installed rather than failing on a version string.
    $found = Get-ChildItem 'C:\Program Files\Microsoft' -Directory -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -like 'jdk-21*' } | Select-Object -First 1
    if ($null -eq $found) {
        throw "No JDK 21 found. The project targets Java 21. Install it with: winget install Microsoft.OpenJDK.21"
    }
    $jdk21 = $found.FullName
}

if (-not (Test-Path $maven)) {
    $found = Get-ChildItem 'C:\Users\mphah\tools' -Directory -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -like 'apache-maven-*' } | Select-Object -First 1
    if ($null -eq $found) { throw "No Maven found under C:\Users\mphah\tools." }
    $maven = $found.FullName
}

$env:JAVA_HOME = $jdk21
$env:PATH = "$maven\bin;$jdk21\bin;$env:PATH"

# ---------------------------------------------------------------------------
# Database. Native Postgres, not the container in docker-compose.yml.
# ---------------------------------------------------------------------------

$env:DB_URL = 'jdbc:postgresql://localhost:5432/vuka'
$env:DB_USER = 'vuka'
$env:DB_PASSWORD = 'vuka'

# ---------------------------------------------------------------------------
# Karabo, on a model in Microsoft Foundry. Optional.
#
# The values live in karabo.local.ps1 beside this script, which git ignores, so the key never
# reaches a commit. Copy karabo.local.example.ps1 to karabo.local.ps1 and fill it in. Without it
# Karabo says it is not connected and everything else works as before.
# ---------------------------------------------------------------------------

$karaboConfig = Join-Path $PSScriptRoot 'karabo.local.ps1'
if (Test-Path $karaboConfig) {
    . $karaboConfig
    Write-Host "Karabo : $env:AZURE_OPENAI_ENDPOINT, deployment $env:AZURE_DEPLOYMENT_NAME"
} else {
    Write-Host 'Karabo : not configured (see karabo.local.example.ps1)'
}

# ---------------------------------------------------------------------------
# Switches
# ---------------------------------------------------------------------------

$env:SEED_ENABLED = if ($SkipSeed) { 'false' } else { 'true' }

if ($DevAuth) {
    $env:VUKA_DEV_AUTH = 'true'
    Write-Host ''
    Write-Host '  DEVELOPMENT SIGN IN IS ON.' -ForegroundColor Yellow
    Write-Host '  Bearer tokens are not verified and any role can be assumed by anyone who can' -ForegroundColor Yellow
    Write-Host '  reach this port. Local development only.' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  Sign in as DSAC reviewer first, copy an entity uuid from the portfolio, then' -ForegroundColor Gray
    Write-Host '  sign in as a reporter with it. A reporter with no entity id reaches nothing,' -ForegroundColor Gray
    Write-Host '  which is correct and looks exactly like a bug.' -ForegroundColor Gray
    Write-Host ''
} else {
    $env:VUKA_DEV_AUTH = 'false'
}

Write-Host "Java   : $env:JAVA_HOME"
Write-Host "Maven  : $maven"
Write-Host "DB     : $env:DB_URL"
Write-Host "Seed   : $env:SEED_ENABLED"
Write-Host ''
Write-Host 'Citizen view (no login) : http://localhost:8080/public'
Write-Host 'Mobile capture          : http://localhost:8080/m'
Write-Host 'Dashboard, dev server   : http://localhost:5173   (cd frontend; npm run dev)'
Write-Host ''

mvn spring-boot:run
