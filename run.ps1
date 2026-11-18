$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeBin = Join-Path $projectRoot '.tools\node\node-v22.23.4-win-x64'
$npmCommand = Join-Path $nodeBin 'npm.cmd'
$mavenCommand = Join-Path $projectRoot '.tools\maven\apache-maven-3.10.0\bin\mvn.cmd'

if (-not (Test-Path -LiteralPath $npmCommand)) {
    throw 'Project-local Node.js is missing. Install Node.js 20+ and use the npm commands in README.md.'
}
if (-not (Test-Path -LiteralPath $mavenCommand)) {
    throw 'Project-local Maven is missing. Install Maven 3.9+ and run mvn compile exec:java from this folder.'
}

$env:PATH = "$nodeBin;$env:PATH"
Push-Location (Join-Path $projectRoot 'client')
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        & $npmCommand ci
        if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed.' }
    }
    & $npmCommand run build
    if ($LASTEXITCODE -ne 0) { throw 'The Three.js client build failed.' }
}
finally {
    Pop-Location
}

Push-Location $projectRoot
try {
    & $mavenCommand compile exec:java
    if ($LASTEXITCODE -ne 0) { throw 'The Java server stopped with an error.' }
}
finally {
    Pop-Location
}
