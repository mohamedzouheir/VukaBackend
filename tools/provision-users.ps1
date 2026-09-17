<#
.SYNOPSIS
    Creates Vuka accounts in Firebase and sets their role and entityId claims.

.DESCRIPTION
    A wrapper around ProvisionUsers.java. It finds the JDK, builds a classpath from the
    firebase-admin jars Maven has already downloaded, and passes FIREBASE_CREDENTIALS through.

    There is no administration screen for this on purpose. The claims are what the security
    model actually reads, and a form nobody watches during a demo is the first thing the
    build order cuts.

.EXAMPLE
    .\tools\provision-users.ps1 list

.EXAMPLE
    .\tools\provision-users.ps1 set reviewer@dsac.gov.za 'Passw0rd!' DSAC_REVIEWER

.EXAMPLE
    .\tools\provision-users.ps1 set nomsa@iziko.org.za 'Passw0rd!' ENTITY_REPORTER 3f2a...uuid
#>
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

# ---------------------------------------------------------------------------
# Credential
# ---------------------------------------------------------------------------

if (-not $env:FIREBASE_CREDENTIALS) {
    $key = Get-ChildItem $repo -Filter '*firebase-adminsdk*.json' -File -ErrorAction SilentlyContinue |
           Select-Object -First 1
    if ($null -eq $key) {
        throw "No service account JSON found in $repo, and FIREBASE_CREDENTIALS is not set."
    }
    $env:FIREBASE_CREDENTIALS = $key.FullName
    Write-Host "Using credential: $($key.Name)" -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# Toolchain
# ---------------------------------------------------------------------------

$jdk = Get-ChildItem 'C:\Program Files\Microsoft' -Directory -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -like 'jdk-21*' } | Select-Object -First 1
if ($null -eq $jdk) { throw "No JDK 21 found. Install with: winget install Microsoft.OpenJDK.21" }
$java = Join-Path $jdk.FullName 'bin\java.exe'

# ---------------------------------------------------------------------------
# Classpath, from the jars Maven has already fetched. Built to a file because the
# full list is far longer than a Windows command line allows.
# ---------------------------------------------------------------------------

$m2 = Join-Path $env:USERPROFILE '.m2\repository'
if (-not (Test-Path $m2)) { throw "No local Maven repository at $m2. Run 'mvn compile' once first." }

$jars = Get-ChildItem $m2 -Recurse -Filter '*.jar' -File |
        Where-Object { $_.Name -notmatch 'sources|javadoc' } |
        Select-Object -ExpandProperty FullName

if ($jars.Count -eq 0) { throw "No jars in $m2. Run 'mvn compile' once first." }

$cpFile = Join-Path $env:TEMP 'vuka-provision-cp.txt'
Set-Content -Path $cpFile -Value (($jars -join ';')) -Encoding utf8 -NoNewline

# Windows PowerShell 5.1 wraps a native command's stderr in an ErrorRecord and, with
# ErrorActionPreference set to Stop, treats it as a terminating failure. The Firebase Admin
# SDK writes a harmless SLF4J binding warning to stderr on every run, which would abort a
# script that otherwise succeeded. So stop treating stderr as fatal for this one call.
$ErrorActionPreference = 'Continue'

& $java "-cp" "@$cpFile" (Join-Path $PSScriptRoot 'ProvisionUsers.java') @Args
exit $LASTEXITCODE
