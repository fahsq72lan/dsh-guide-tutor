param(
    [Parameter(Mandatory = $true)][string]$OutPath,
    [int]$Grid = 16
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing

# WinRT 的异步方法在 PowerShell 里要手动 Await，这里只包两种：IAsyncOperation<T> 和 IAsyncAction。
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
    })[0]

function Await($op, $type) {
    $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $t.Wait(-1) | Out-Null
    return $t.Result
}
function AwaitAction($act) {
    $t = $asTaskAction.Invoke($null, @($act))
    $t.Wait(-1) | Out-Null
}

[Windows.Media.Capture.MediaCapture, Windows.Media, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Capture.MediaCaptureInitializationSettings, Windows.Media, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.MediaProperties.ImageEncodingProperties, Windows.Media, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime] | Out-Null

$folder = [System.IO.Path]::GetDirectoryName($OutPath)
if (-not [System.IO.Directory]::Exists($folder)) {
    [void][System.IO.Directory]::CreateDirectory($folder)
}

$capture = New-Object Windows.Media.Capture.MediaCapture
$settings = New-Object Windows.Media.Capture.MediaCaptureInitializationSettings
$settings.StreamingCaptureMode = [Windows.Media.Capture.StreamingCaptureMode]::Video
try {
    AwaitAction ($capture.InitializeAsync($settings))
    $parent = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($folder)) ([Windows.Storage.StorageFolder])
    $file = Await ($parent.CreateFileAsync([System.IO.Path]::GetFileName($OutPath), [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
    $props = [Windows.Media.MediaProperties.ImageEncodingProperties]::CreateJpeg()
    AwaitAction ($capture.CapturePhotoToStorageFileAsync($props, $file))
}
finally {
    try { $capture.Dispose() } catch { }
}

# 本地指纹：缩到 16x16 灰度，节点侧只比这 256 个数。不联网、不调模型。
$bitmap = [System.Drawing.Bitmap]::FromFile($OutPath)
try {
    $width = $bitmap.Width
    $height = $bitmap.Height
    $cell = New-Object System.Drawing.Bitmap -ArgumentList $Grid, $Grid
    $graphics = [System.Drawing.Graphics]::FromImage($cell)
    try { $graphics.DrawImage($bitmap, 0, 0, $Grid, $Grid) } finally { $graphics.Dispose() }
    $values = New-Object System.Collections.Generic.List[int]
    for ($y = 0; $y -lt $Grid; $y++) {
        for ($x = 0; $x -lt $Grid; $x++) {
            $c = $cell.GetPixel($x, $y)
            $values.Add([int][Math]::Round(0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B))
        }
    }
    $cell.Dispose()
}
finally {
    $bitmap.Dispose()
}

$mean = ($values | Measure-Object -Average).Average

[ordered]@{
    ok     = $true
    path   = $OutPath
    width  = [int]$width
    height = [int]$height
    bytes  = [int](Get-Item $OutPath).Length
    mean   = [math]::Round($mean, 1)
    grid   = @($values)
} | ConvertTo-Json -Compress
