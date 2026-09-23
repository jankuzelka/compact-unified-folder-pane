$ErrorActionPreference = "Stop"

# Build an XPI (ZIP) with forward-slash entry names.
# PowerShell's Compress-Archive can create entries with Windows backslashes,
# which Thunderbird's jar: loader does not resolve as normal XPI paths.
Add-Type -AssemblyName System.IO.Compression

$project = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$manifestPath = Join-Path $project "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
$out = Join-Path $project ("compact-unified-folder-pane-{0}.xpi" -f $version)
$tmp = Join-Path $env:TEMP ("compact-unified-folder-pane-" + [guid]::NewGuid())

New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    Copy-Item $manifestPath $tmp
    Copy-Item (Join-Path $project "LICENSE") $tmp
    Copy-Item (Join-Path $project "api") $tmp -Recurse

    if (Test-Path (Join-Path $project "icons")) {
        Copy-Item (Join-Path $project "icons") $tmp -Recurse
    }

    Remove-Item $out -Force -ErrorAction SilentlyContinue

    $fileStream = [System.IO.File]::Open(
        $out,
        [System.IO.FileMode]::Create,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )

    $archive = $null
    try {
        $archive = [System.IO.Compression.ZipArchive]::new(
            $fileStream,
            [System.IO.Compression.ZipArchiveMode]::Create,
            $false
        )

        Get-ChildItem -Path $tmp -File -Recurse | ForEach-Object {
            $file = $_

            # Path inside XPI must always use '/', even when building on Windows.
            $relativePath = $file.FullName.Substring($tmp.Length).TrimStart([char[]]"\/")
            $entryName = $relativePath.Replace('\', '/')

            $entry = $archive.CreateEntry(
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            )

            $sourceStream = $null
            $entryStream = $null
            try {
                $sourceStream = [System.IO.File]::OpenRead($file.FullName)
                $entryStream = $entry.Open()
                $sourceStream.CopyTo($entryStream)
            }
            finally {
                if ($entryStream) { $entryStream.Dispose() }
                if ($sourceStream) { $sourceStream.Dispose() }
            }
        }
    }
    finally {
        if ($archive) { $archive.Dispose() }
        $fileStream.Dispose()
    }

    # Sanity check: no ZIP/XPI entry may contain a Windows backslash.
    $checkStream = [System.IO.File]::OpenRead($out)
    $checkArchive = $null
    try {
        $checkArchive = [System.IO.Compression.ZipArchive]::new(
            $checkStream,
            [System.IO.Compression.ZipArchiveMode]::Read,
            $false
        )

        $badEntries = @(
            $checkArchive.Entries | Where-Object { $_.FullName.Contains('\') }
        )

        if ($badEntries.Count -gt 0) {
            $names = ($badEntries | ForEach-Object { $_.FullName }) -join ", "
            throw "XPI contains invalid entry paths with backslashes: $names"
        }
    }
    finally {
        if ($checkArchive) { $checkArchive.Dispose() }
        $checkStream.Dispose()
    }

    Write-Host "Created $out"
}
finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
