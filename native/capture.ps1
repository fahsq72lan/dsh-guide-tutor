param(
    [Parameter(Mandatory = $true)][string]$OutPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$virtual = [System.Windows.Forms.SystemInformation]::VirtualScreen

$bitmap = [System.Drawing.Bitmap]::new([int]$virtual.Width, [int]$virtual.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.CopyFromScreen($virtual.Left, $virtual.Top, 0, 0, [System.Drawing.Size]::new([int]$virtual.Width, [int]$virtual.Height))
}
finally {
    $graphics.Dispose()
}

$folder = [System.IO.Path]::GetDirectoryName($OutPath)
if (-not [System.IO.Directory]::Exists($folder)) {
    [void][System.IO.Directory]::CreateDirectory($folder)
}

$bitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

[ordered]@{
    path   = $OutPath
    width  = [int]$virtual.Width
    height = [int]$virtual.Height
    left   = [int]$virtual.Left
    top    = [int]$virtual.Top
} | ConvertTo-Json -Compress
