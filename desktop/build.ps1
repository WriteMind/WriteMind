# Builds desktop\Zen.exe with the site files bundled inside. Run from anywhere: powershell -File desktop\build.ps1
$root = Split-Path $PSScriptRoot
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$files = @('index.html', 'app.js', 'styles.css') + (Get-ChildItem "$root\audio\*.mp3" | ForEach-Object { "audio/$($_.Name)" })
$resources = $files | ForEach-Object { "/resource:$root\$($_ -replace '/', '\'),site/$_" }
& $csc /nologo /target:winexe /optimize /out:"$PSScriptRoot\Zen.exe" /reference:System.Windows.Forms.dll $resources "$PSScriptRoot\Zen.cs"
