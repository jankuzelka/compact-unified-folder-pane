$ErrorActionPreference = "Stop"

$project = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$manifest = Get-Content (Join-Path $project "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version
$out = Join-Path $project ("compact-unified-folder-pane-{0}.xpi" -f $version)
$tmp = Join-Path $env:TEMP ("compact-unified-folder-pane-" + [guid]::NewGuid())

New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    Copy-Item (Join-Path $project "manifest.json") $tmp
    Copy-Item (Join-Path $project "LICENSE") $tmp
    Copy-Item (Join-Path $project "api") $tmp -Recurse

    $zip = [System.IO.Path]::ChangeExtension($out, ".zip")
    Remove-Item $zip, $out -ErrorAction SilentlyContinue
    Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zip
    Move-Item $zip $out
    Write-Host "Created $out"
}
finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
