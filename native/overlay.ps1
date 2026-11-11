param(
    [string]$DataDir = $env:GUIDE_TUTOR_DATA
)

$ErrorActionPreference = 'Stop'

# The data directory can contain non-ASCII characters; it arrives through an
# environment variable because command-line arguments are decoded with the
# console code page by some launchers.
if ([string]::IsNullOrWhiteSpace($DataDir)) { throw 'GUIDE_TUTOR_DATA / -DataDir is required' }
if (-not (Test-Path (Join-Path $DataDir 'state.json'))) {
    [void](New-Item -ItemType Directory -Path $DataDir -Force)
}

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# --- DPI awareness -------------------------------------------------------
# Declare per-monitor DPI awareness before any window exists. A DPI-unaware
# process gets virtualised metrics back from GetSystemMetrics, so on a scaled
# display the capture would grab only the top-left part of the picture and a
# monitor placed left of the primary one would be cropped away entirely.
# With awareness on, GetSystemMetrics reports real device pixels, WPF keeps
# working in DIPs, and the shot is downscaled onto the annotation grid below.
try {
    if (-not ('GuideDpi' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class GuideDpi
{
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessDPIAware();
}
'@
    }
    # -4 = DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (Windows 10 1703+)
    if (-not [GuideDpi]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))) {
        [void][GuideDpi]::SetProcessDPIAware()
    }
}
catch { }

$StatePath  = Join-Path $DataDir 'state.json'
$EventsPath = Join-Path $DataDir 'events.jsonl'
$LogPath    = Join-Path $DataDir 'overlay.log'
$PidPath    = Join-Path $DataDir 'overlay.pid'

$script:Utf8 = [System.Text.UTF8Encoding]::new($false)

function Write-Log([string]$Message) {
    try {
        $line = '[' + (Get-Date -Format 'HH:mm:ss.fff') + '] ' + $Message + "`r`n"
        [System.IO.File]::AppendAllText($LogPath, $line, $script:Utf8)
    }
    catch { }
}

# --- 设计系统（v0.23 第二档）：颜色 / 字号 / 圆角集中一处 ----------------
# 以前每个窗口各自硬编码 FromArgb(…)，同一个灰能有五种写法；改一处全局生效。
$script:G = @{
    Bg        = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(236, 14, 17, 23))
    BgSoft    = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(224, 20, 24, 31))
    Card      = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 26, 30, 39))
    Line      = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(34, 255, 255, 255))
    Text      = [System.Windows.Media.Brushes]::White
    TextDim   = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(178, 255, 255, 255))
    TextMute  = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(120, 255, 255, 255))
    Accent    = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 10, 132, 255))
    AccentDim = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(44, 10, 132, 255))
    Danger    = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 255, 69, 58))
    Ok        = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 48, 209, 88))
    Warn      = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 255, 159, 10))
    RadWin    = 16.0
    RadCard   = 10.0
    RadBtn    = 8.0
    FsTitle   = 14.0
    FsBody    = 12.0
    FsSmall   = 11.0
}

# 文字按钮：圆角底、hover 淡入浅底、按下缩到 0.96。
# 返回 Border 本身，点击事件由调用方绑（不同窗口的语义不同）。
function New-GTextButton([string]$Text, [string]$ToolTip = '', [double]$FontSize = 12.0) {
    $b = [System.Windows.Controls.Border]::new()
    $b.CornerRadius = [System.Windows.CornerRadius]::new([double]$script:G.RadBtn)
    $b.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(0, 255, 255, 255))
    $b.Padding = [System.Windows.Thickness]::new(5, 2, 5, 2)
    $b.Cursor = [System.Windows.Input.Cursors]::Hand
    $b.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    if (-not [string]::IsNullOrEmpty($ToolTip)) { $b.ToolTip = $ToolTip }
    $t = [System.Windows.Controls.TextBlock]::new()
    $t.Text = $Text
    $t.FontSize = $FontSize
    $t.Foreground = $script:G.TextDim
    $t.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $b.Child = $t
    $b.Add_MouseEnter({
        param($s, $e)
        try {
            $to = [System.Windows.Media.Color]::FromArgb(24, 255, 255, 255)
            $a = [System.Windows.Media.Animation.ColorAnimation]::new($to, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(120)))
            $s.Background.BeginAnimation([System.Windows.Media.SolidColorBrush]::ColorProperty, $a)
            $s.Child.Foreground = $script:G.Text
        } catch { }
    })
    $b.Add_MouseLeave({
        param($s, $e)
        try {
            $to = [System.Windows.Media.Color]::FromArgb(0, 255, 255, 255)
            $a = [System.Windows.Media.Animation.ColorAnimation]::new($to, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(160)))
            $s.Background.BeginAnimation([System.Windows.Media.SolidColorBrush]::ColorProperty, $a)
            $s.Child.Foreground = $script:G.TextDim
        } catch { }
    })
    $b.Add_MouseLeftButtonDown({
        param($s, $e)
        try {
            $s.RenderTransform = [System.Windows.Media.ScaleTransform]::new(0.96, 0.96)
            $s.RenderTransformOrigin = [System.Windows.Point]::new(0.5, 0.5)
        } catch { }
    })
    $b.Add_MouseLeftButtonUp({
        param($s, $e)
        try { $s.RenderTransform = [System.Windows.Media.Transform]::Identity } catch { }
    })
    return $b
}

# 主按钮：实心蓝底，用于「下一步」这类主操作。
function New-GPrimaryButton([string]$Text, [double]$FontSize = 13.0) {
    $b = [System.Windows.Controls.Border]::new()
    $b.CornerRadius = [System.Windows.CornerRadius]::new(9)
    $b.Background = $script:G.Accent
    $b.Padding = [System.Windows.Thickness]::new(0, 7, 0, 7)
    $b.Cursor = [System.Windows.Input.Cursors]::Hand
    $b.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Stretch
    $t = [System.Windows.Controls.TextBlock]::new()
    $t.Text = $Text
    $t.FontSize = $FontSize
    $t.FontWeight = [System.Windows.FontWeights]::SemiBold
    $t.Foreground = [System.Windows.Media.Brushes]::White
    $t.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $t.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $b.Child = $t
    $b.Add_MouseEnter({
        param($s, $e)
        try {
            $to = [System.Windows.Media.Color]::FromArgb(255, 38, 150, 255)
            $a = [System.Windows.Media.Animation.ColorAnimation]::new($to, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(120)))
            $s.Background.BeginAnimation([System.Windows.Media.SolidColorBrush]::ColorProperty, $a)
        } catch { }
    })
    $b.Add_MouseLeave({
        param($s, $e)
        try {
            $to = [System.Windows.Media.Color]::FromArgb(255, 10, 132, 255)
            $a = [System.Windows.Media.Animation.ColorAnimation]::new($to, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(160)))
            $s.Background.BeginAnimation([System.Windows.Media.SolidColorBrush]::ColorProperty, $a)
        } catch { }
    })
    $b.Add_MouseLeftButtonDown({
        param($s, $e)
        try {
            $s.RenderTransform = [System.Windows.Media.ScaleTransform]::new(0.985, 0.96)
            $s.RenderTransformOrigin = [System.Windows.Point]::new(0.5, 0.5)
        } catch { }
    })
    $b.Add_MouseLeftButtonUp({
        param($s, $e)
        try { $s.RenderTransform = [System.Windows.Media.Transform]::Identity } catch { }
    })
    return $b
}

# 给窗口内容加一层柔和外阴影：窗口本身要留出 margin，否则阴影会被窗口边界裁掉。
function Add-GShadow($Element, [double]$Blur = 24.0, [double]$Opacity = 0.45) {
    try {
        $sh = [System.Windows.Media.Effects.DropShadowEffect]::new()
        $sh.BlurRadius = $Blur
        $sh.ShadowDepth = 6
        $sh.Opacity = $Opacity
        $sh.Color = [System.Windows.Media.Color]::FromArgb(255, 0, 0, 0)
        $Element.Effect = $sh
    } catch { }
    return $Element
}

function Send-OverlayEvent([hashtable]$Event) {
    try {
        $json = ($Event | ConvertTo-Json -Compress -Depth 4)
        [System.IO.File]::AppendAllText($EventsPath, $json + "`n", $script:Utf8)
    }
    catch {
        Write-Log ('event failed: ' + $_.Exception.Message)
    }
}

# --- screen capture (same DPI context as the overlay windows) -----------
function Capture-Screen([string]$Path) {
    Add-Type -AssemblyName System.Drawing
    Add-Type -AssemblyName System.Windows.Forms
    $physLeft = [GuideNative]::GetSystemMetrics(76)
    $physTop = [GuideNative]::GetSystemMetrics(77)
    $physWidth = [GuideNative]::GetSystemMetrics(78)
    $physHeight = [GuideNative]::GetSystemMetrics(79)
    if ($physWidth -le 0 -or $physHeight -le 0) { throw 'no screen metrics available' }

    # Annotation coordinates are WPF device-independent pixels; the shot is
    # downscaled to that same grid so model coordinates map 1:1 onto the overlay.
    $dipWidth = [int][math]::Round([System.Windows.SystemParameters]::VirtualScreenWidth)
    $dipHeight = [int][math]::Round([System.Windows.SystemParameters]::VirtualScreenHeight)
    if ($dipWidth -le 0 -or $dipHeight -le 0) { $dipWidth = $physWidth; $dipHeight = $physHeight }

    $raw = New-Object System.Drawing.Bitmap $physWidth, $physHeight
    $graphics = [System.Drawing.Graphics]::FromImage($raw)
    $graphics.CopyFromScreen($physLeft, $physTop, 0, 0, $raw.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
    $graphics.Dispose()

    $target = $raw
    if ($physWidth -ne $dipWidth -or $physHeight -ne $dipHeight) {
        $target = New-Object System.Drawing.Bitmap $dipWidth, $dipHeight
        $scale = [System.Drawing.Graphics]::FromImage($target)
        $scale.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $scale.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $scale.DrawImage($raw, 0, 0, $dipWidth, $dipHeight)
        $scale.Dispose()
        $raw.Dispose()
    }

    $target.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $result = @{ width = $target.Width; height = $target.Height }
    $target.Dispose()
    return $result
}

function Start-Capture([string]$Reason, [int]$RequestId) {
    if ($script:CaptureBusy) {
        Write-Log 'capture ignored: busy'
        return
    }
    $script:CaptureBusy = $true
    $script:PendingCapture = @{ reason = $Reason; id = $RequestId }
    try {
        if (-not $env:GUIDE_TUTOR_KEEP_VISIBLE) {
            $script:AnnWindow.Hide()
            $script:BallWindow.Hide()
            $script:PanelWindow.Hide()
            if ($null -ne $script:SubtitleWindow) { $script:SubtitleWindow.Hide() }
        }
    }
    catch { }

    $script:CaptureTimer = [System.Windows.Threading.DispatcherTimer]::new()
    $script:CaptureTimer.Interval = [TimeSpan]::FromMilliseconds(220)
    $script:CaptureTimer.Add_Tick({
        $script:CaptureTimer.Stop()
        $pending = $script:PendingCapture
        $script:PendingCapture = $null
        $shot = $null
        try {
            $shotsDir = Join-Path $DataDir 'shots'
            if (-not (Test-Path $shotsDir)) { [void](New-Item -ItemType Directory -Path $shotsDir -Force) }
            $file = Join-Path $shotsDir ('shot-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.png')
            $info = Capture-Screen $file
            $shot = @{ path = $file; width = $info.width; height = $info.height }
            Write-Log ('captured {0} {1}x{2}' -f $file, $info.width, $info.height)
        }
        catch {
            Write-Log ('capture failed: ' + $_.Exception.Message)
        }

        $script:Mode = ''
        $script:LastStamp = ''
        try { Update-FromDisk } catch { }

        if ($null -ne $pending) {
            if ($null -ne $shot) {
                Send-OverlayEvent @{
                    type = 'captured'; reason = $pending.reason; requestId = $pending.id
                    path = $shot.path; width = $shot.width; height = $shot.height; left = 0; top = 0
                }
            }
            else {
                Send-OverlayEvent @{ type = 'capture_failed'; reason = $pending.reason; requestId = $pending.id }
            }
        }
        $script:CaptureBusy = $false
    })
    $script:CaptureTimer.Start()
}

# --- single instance per data directory ---------------------------------
# A second copy must never kill the first: the host already serializes its
# spawns, and a mutual-kill fight turns into an endless restart storm. If the
# mutex is still held, wait a little (the previous copy is probably shutting
# down), and give up quietly instead of fighting.
try {
    $script:InstanceMutex = New-Object System.Threading.Mutex($false, 'Local\GuideTutorOverlay')
    try {
        $acquired = $script:InstanceMutex.WaitOne(6000)
    }
    catch [System.Threading.AbandonedMutexException] {
        $acquired = $true
    }
    if (-not $acquired) {
        Write-Log ('another overlay instance is still running, exiting (pid ' + $PID + ')')
        exit 0
    }
    [System.IO.File]::WriteAllText($PidPath, [string]$PID, $script:Utf8)
}
catch {
    Write-Log ('single-instance check failed: ' + $_.Exception.Message)
}

# --- Win32 helpers -------------------------------------------------------
if (-not ('GuideNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class GuideNative
{
    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_LAYERED = 0x80000;
    public const int WS_EX_TRANSPARENT = 0x20;
    public const int WS_EX_TOOLWINDOW = 0x80;
    public const int WS_EX_NOACTIVATE = 0x08000000;

    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOACTIVATE = 0x0010;

    public static void MakeClickThrough(IntPtr handle)
    {
        int style = GetWindowLong(handle, GWL_EXSTYLE);
        SetWindowLong(handle, GWL_EXSTYLE, style | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
    }

    public static void MakeOverlay(IntPtr handle)
    {
        int style = GetWindowLong(handle, GWL_EXSTYLE);
        SetWindowLong(handle, GWL_EXSTYLE, style | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
    }

    // Same as MakeOverlay but activatable: the panel hosts a text box, and
    // WS_EX_NOACTIVATE would prevent it from ever receiving keyboard focus.
    public static void MakePanel(IntPtr handle)
    {
        int style = GetWindowLong(handle, GWL_EXSTYLE);
        SetWindowLong(handle, GWL_EXSTYLE, style | WS_EX_LAYERED | WS_EX_TOOLWINDOW);
    }

    public static void Raise(IntPtr handle)
    {
        SetWindowPos(handle, new IntPtr(-1), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
    }
}
'@
}

# --- helpers -------------------------------------------------------------
function Get-SolidBrush([string]$Hex, [int]$Alpha = 255) {
    try {
        $color = [System.Windows.Media.ColorConverter]::ConvertFromString($Hex)
        if ($Alpha -lt 0) { $Alpha = 0 }
        if ($Alpha -gt 255) { $Alpha = 255 }
        $color = [System.Windows.Media.Color]::FromArgb($Alpha, $color.R, $color.G, $color.B)
        return [System.Windows.Media.SolidColorBrush]::new($color)
    }
    catch {
        return [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromRgb(255, 90, 31))
    }
}

$script:ScreenLeft   = [System.Windows.SystemParameters]::VirtualScreenLeft
$script:ScreenTop    = [System.Windows.SystemParameters]::VirtualScreenTop
$script:ScreenWidth  = [System.Windows.SystemParameters]::VirtualScreenWidth
$script:ScreenHeight = [System.Windows.SystemParameters]::VirtualScreenHeight
# 工作区（扣掉任务栏）：清单卡片只铺工作区，不能盖住任务栏。
$script:WorkLeft   = [System.Windows.SystemParameters]::WorkArea.Left
$script:WorkTop    = [System.Windows.SystemParameters]::WorkArea.Top
$script:WorkWidth  = [System.Windows.SystemParameters]::WorkArea.Width
$script:WorkHeight = [System.Windows.SystemParameters]::WorkArea.Height

# Ratio between device pixels (what Cursor.Position reports) and WPF DIPs
# (what Window.Left/Top use). 1.0 when the process is DPI-unaware.
$script:DragScale = 1.0
# 拖动期间、以及松手后的几秒内，宿主 tick 下发的位置不要覆盖本地位置；
# 否则球/卡片会在「旧位置」和「新位置」之间来回闪。
$script:BallPinUntil = [DateTime]::MinValue
$script:CardDragging = $false
$script:CardPinUntil = [DateTime]::MinValue
try {
    $physW = [GuideNative]::GetSystemMetrics(78)
    if ($physW -gt 0 -and $script:ScreenWidth -gt 0) {
        $scale = $physW / $script:ScreenWidth
        if ($scale -gt 1.01) { $script:DragScale = $scale }
    }
}
catch { }

$script:AccentBrush = Get-SolidBrush '#FF5A1F'
$script:DimBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(185, 205, 214, 226))
$script:PanelBg = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(235, 20, 24, 30))
$script:BulletBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(200, 130, 140, 155))

function Add-TextLabel([double]$X, [double]$Y, [string]$Text) {
    $border = [System.Windows.Controls.Border]::new()
    $border.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(228, 15, 18, 24))
    $border.CornerRadius = [System.Windows.CornerRadius]::new(7)
    $border.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(60, 255, 255, 255))
    $border.BorderThickness = [System.Windows.Thickness]::new(1)
    $border.Padding = [System.Windows.Thickness]::new(8, 4, 8, 4)
    $textBlock = [System.Windows.Controls.TextBlock]::new()
    $textBlock.Text = $Text
    $textBlock.FontSize = 13
    $textBlock.Foreground = [System.Windows.Media.Brushes]::White
    $border.Child = $textBlock
    [System.Windows.Controls.Canvas]::SetLeft($border, $X)
    [System.Windows.Controls.Canvas]::SetTop($border, $Y)
    [void]$script:AnnCanvas.Children.Add($border)
}

function Add-SeqBadge([double]$X, [double]$Y, [int]$N, $Brush) {
    $chars = '①②③④⑤⑥⑦⑧⑨⑩'
    if ($N -lt 1 -or $N -gt $chars.Length) { return }
    $badge = [System.Windows.Controls.Border]::new()
    $badge.Width = 22
    $badge.Height = 22
    $badge.CornerRadius = [System.Windows.CornerRadius]::new(11)
    $badge.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(238, 14, 17, 23))
    $badge.BorderBrush = $Brush
    $badge.BorderThickness = [System.Windows.Thickness]::new(1.6)
    $tb = [System.Windows.Controls.TextBlock]::new()
    $tb.Text = [string]$chars[$N - 1]
    $tb.FontSize = 13
    $tb.FontWeight = [System.Windows.FontWeights]::SemiBold
    $tb.Foreground = [System.Windows.Media.Brushes]::White
    $tb.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $tb.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $badge.Child = $tb
    [System.Windows.Controls.Canvas]::SetLeft($badge, $X - 11)
    [System.Windows.Controls.Canvas]::SetTop($badge, $Y - 11)
    [void]$script:AnnCanvas.Children.Add($badge)
}

function Update-Annots($Annots) {
    $canvas = $script:AnnCanvas
    $list = @()
    if ($null -ne $Annots) { $list = @($Annots | Where-Object { $null -ne $_ }) }
    if ($list.Count -eq 0) {
        # 标注被清空：先 0.3 秒淡出，再真正清掉，收尾不突兀。
        if ($canvas.Children.Count -gt 0 -and -not $script:AnnFading) {
            $script:AnnFading = $true
            $fade = [System.Windows.Media.Animation.DoubleAnimation]::new(1.0, 0.0, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(300)))
            $fade.EasingFunction = [System.Windows.Media.Animation.CubicEase]::new()
            $fade.EasingFunction.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseIn
            $canvas.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $fade)
            if ($null -eq $script:AnnFadeTimer) {
                $script:AnnFadeTimer = [System.Windows.Threading.DispatcherTimer]::new()
                $script:AnnFadeTimer.Interval = [TimeSpan]::FromMilliseconds(320)
                $script:AnnFadeTimer.Add_Tick({
                    $script:AnnFadeTimer.Stop()
                    $script:AnnFading = $false
                    $script:AnnCanvas.Children.Clear()
                    $script:AnnCanvas.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $null)
                    $script:AnnCanvas.Opacity = 1.0
                })
            }
            $script:AnnFadeTimer.Stop()
            $script:AnnFadeTimer.Start()
        }
        return
    }
    if ($script:AnnFading) {
        if ($null -ne $script:AnnFadeTimer) { $script:AnnFadeTimer.Stop() }
        $script:AnnFading = $false
        $canvas.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $null)
        $canvas.Opacity = 1.0
    }
    $canvas.Children.Clear()

    $seq = 0
    foreach ($shape in $list) {
        if ($null -eq $shape) { continue }
        $kind = [string]$shape.kind
        $brush = $script:AccentBrush
        if (-not [string]::IsNullOrWhiteSpace([string]$shape.color)) {
            $brush = Get-SolidBrush ([string]$shape.color)
        }
        $thickness = 5.0
        if ($null -ne $shape.thickness) { $thickness = [double]$shape.thickness }
        $bx = [double]$shape.x
        $by = [double]$shape.y
        if ($kind -eq 'arrow') { $bx = [double]$shape.x1; $by = [double]$shape.y1 }
        if ($kind -ne 'text') { $seq += 1 }

        switch ($kind) {
            'rect' {
                $rect = [System.Windows.Shapes.Rectangle]::new()
                $rect.Width = [double]$shape.w
                $rect.Height = [double]$shape.h
                $rect.Stroke = $brush
                $rect.StrokeThickness = $thickness
                $rect.RadiusX = 8
                $rect.RadiusY = 8
                [System.Windows.Controls.Canvas]::SetLeft($rect, [double]$shape.x)
                [System.Windows.Controls.Canvas]::SetTop($rect, [double]$shape.y)
                [void]$canvas.Children.Add($rect)
                if (-not [string]::IsNullOrWhiteSpace([string]$shape.label)) {
                    Add-TextLabel ([double]$shape.x) (([double]$shape.y) - 32) ([string]$shape.label)
                }
            }
            'circle' {
                $ellipse = [System.Windows.Shapes.Ellipse]::new()
                $ellipse.Width = [double]$shape.w
                $ellipse.Height = [double]$shape.h
                $ellipse.Stroke = $brush
                $ellipse.StrokeThickness = $thickness
                [System.Windows.Controls.Canvas]::SetLeft($ellipse, [double]$shape.x)
                [System.Windows.Controls.Canvas]::SetTop($ellipse, [double]$shape.y)
                [void]$canvas.Children.Add($ellipse)
                if (-not [string]::IsNullOrWhiteSpace([string]$shape.label)) {
                    Add-TextLabel ([double]$shape.x) (([double]$shape.y) - 32) ([string]$shape.label)
                }
            }
            'arrow' {
                $line = [System.Windows.Shapes.Line]::new()
                $line.X1 = [double]$shape.x1
                $line.Y1 = [double]$shape.y1
                $line.X2 = [double]$shape.x2
                $line.Y2 = [double]$shape.y2
                $line.Stroke = $brush
                $line.StrokeThickness = $thickness
                $line.StrokeEndLineCap = [System.Windows.Media.PenLineCap]::Round
                [void]$canvas.Children.Add($line)

                $dx = [double]$shape.x2 - [double]$shape.x1
                $dy = [double]$shape.y2 - [double]$shape.y1
                $length = [math]::Sqrt($dx * $dx + $dy * $dy)
                if ($length -gt 2) {
                    $ux = $dx / $length
                    $uy = $dy / $length
                    $head = 18.0
                    $polygon = [System.Windows.Shapes.Polygon]::new()
                    $polygon.Fill = $brush
                    [void]$polygon.Points.Add([System.Windows.Point]::new([double]$shape.x2, [double]$shape.y2))
                    [void]$polygon.Points.Add([System.Windows.Point]::new(([double]$shape.x2 - $ux * $head - $uy * $head * 0.62), ([double]$shape.y2 - $uy * $head + $ux * $head * 0.62)))
                    [void]$polygon.Points.Add([System.Windows.Point]::new(([double]$shape.x2 - $ux * $head + $uy * $head * 0.62), ([double]$shape.y2 - $uy * $head - $ux * $head * 0.62)))
                    [void]$canvas.Children.Add($polygon)
                }
                if (-not [string]::IsNullOrWhiteSpace([string]$shape.label)) {
                    Add-TextLabel ([double]$shape.x2) (([double]$shape.y2) + 10) ([string]$shape.label)
                }
            }
            'text' {
                Add-TextLabel ([double]$shape.x) ([double]$shape.y) ([string]$shape.text)
            }
            'spotlight' {
                $group = [System.Windows.Media.GeometryGroup]::new()
                $group.FillRule = [System.Windows.Media.FillRule]::EvenOdd
                [void]$group.Children.Add([System.Windows.Media.RectangleGeometry]::new([System.Windows.Rect]::new(0, 0, $script:ScreenWidth, $script:ScreenHeight)))
                [void]$group.Children.Add([System.Windows.Media.RectangleGeometry]::new([System.Windows.Rect]::new([double]$shape.x, [double]$shape.y, [double]$shape.w, [double]$shape.h)))
                $path = [System.Windows.Shapes.Path]::new()
                $path.Data = $group
                $path.Fill = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(135, 0, 0, 0))
                [void]$canvas.Children.Add($path)
            }
        }
        if ($kind -ne 'text') {
            Add-SeqBadge $bx $by $seq $brush
        }
    }
}

function New-AnnotationWindow {
    $window = [System.Windows.Window]::new()
    $window.WindowStyle = [System.Windows.WindowStyle]::None
    $window.AllowsTransparency = $true
    $window.Background = [System.Windows.Media.Brushes]::Transparent
    $window.Topmost = $true
    $window.ShowInTaskbar = $false
    $window.ShowActivated = $false
    $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
    $window.Left = $script:ScreenLeft
    $window.Top = $script:ScreenTop
    $window.Width = $script:ScreenWidth
    $window.Height = $script:ScreenHeight

    $canvas = [System.Windows.Controls.Canvas]::new()
    $canvas.Background = [System.Windows.Media.Brushes]::Transparent
    $window.Content = $canvas
    $window.Show()

    $handle = [System.Windows.Interop.WindowInteropHelper]::new($window).Handle
    [GuideNative]::MakeClickThrough($handle)
    [GuideNative]::Raise($handle)

    $script:AnnWindow = $window
    $script:AnnCanvas = $canvas
}

$script:BallAlpha = 235

function New-BallWindow {
    $window = [System.Windows.Window]::new()
    $window.WindowStyle = [System.Windows.WindowStyle]::None
    $window.AllowsTransparency = $true
    $window.Background = [System.Windows.Media.Brushes]::Transparent
    $window.Topmost = $true
    $window.ShowInTaskbar = $false
    $window.ShowActivated = $false
    $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
    $window.Width = 64
    $window.Height = 88
    $window.Left = $script:ScreenLeft + $script:ScreenWidth - 64 - 48
    $window.Top = $script:ScreenTop + $script:ScreenHeight - 88 - 160

    $grid = [System.Windows.Controls.Grid]::new()

    # 球 + 时钟上下排：球是按钮，时钟是"现在是几点"的常驻信息。
    $ballStack = [System.Windows.Controls.StackPanel]::new()
    $ballStack.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $ballStack.VerticalAlignment = [System.Windows.VerticalAlignment]::Center

    $ball = [System.Windows.Shapes.Ellipse]::new()
    $ball.Width = 58
    $ball.Height = 58
    $ball.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $ball.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $gradient = [System.Windows.Media.LinearGradientBrush]::new()
    $gradient.StartPoint = [System.Windows.Point]::new(0, 0)
    $gradient.EndPoint = [System.Windows.Point]::new(1, 1)
    [void]$gradient.GradientStops.Add([System.Windows.Media.GradientStop]::new([System.Windows.Media.Color]::FromArgb($script:BallAlpha, 255, 110, 40), 0.0))
    [void]$gradient.GradientStops.Add([System.Windows.Media.GradientStop]::new([System.Windows.Media.Color]::FromArgb($script:BallAlpha, 214, 44, 132), 1.0))
    $ball.Fill = $gradient
    $shadow = [System.Windows.Media.Effects.DropShadowEffect]::new()
    $shadow.Color = [System.Windows.Media.Colors]::Black
    $shadow.BlurRadius = 16
    $shadow.ShadowDepth = 3
    $shadow.Opacity = 0.55
    $ball.Effect = $shadow
    # 细白描边：高透明度时也能看出边界，像玻璃球而不是一块色斑。
    $ball.Stroke = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(70, 255, 255, 255))
    $ball.StrokeThickness = 1.2

    $label = [System.Windows.Controls.TextBlock]::new()
    $label.Text = '引'
    $label.FontSize = 24
    $label.FontWeight = [System.Windows.FontWeights]::Bold
    $label.Foreground = [System.Windows.Media.Brushes]::White
    $label.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $label.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $label.IsHitTestVisible = $false

    $ballGrid = [System.Windows.Controls.Grid]::new()
    [void]$ballGrid.Children.Add($ball)
    [void]$ballGrid.Children.Add($label)

    $clock = [System.Windows.Controls.TextBlock]::new()
    $clock.Text = '--:--'
    $clock.FontSize = 12
    $clock.FontWeight = [System.Windows.FontWeights]::SemiBold
    $clock.Foreground = [System.Windows.Media.Brushes]::White
    $clock.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $clock.TextAlignment = [System.Windows.TextAlignment]::Center
    $clock.Margin = [System.Windows.Thickness]::new(0, 3, 0, 0)
    $clockTextShadow = [System.Windows.Media.Effects.DropShadowEffect]::new()
    $clockTextShadow.Color = [System.Windows.Media.Colors]::Black
    $clockTextShadow.BlurRadius = 8
    $clockTextShadow.Opacity = 0.9
    $clock.Effect = $clockTextShadow

    [void]$ballStack.Children.Add($ballGrid)
    [void]$ballStack.Children.Add($clock)

    [void]$grid.Children.Add($ballStack)
    $window.Content = $grid
    $window.Show()

    $handle = [System.Windows.Interop.WindowInteropHelper]::new($window).Handle
    [GuideNative]::MakeOverlay($handle)
    [GuideNative]::Raise($handle)

    # Global hotkey Ctrl+Alt+V via polling: RegisterHotKey + HwndSource hooks are
    # fragile from PowerShell (delegate/ref marshaling), polling is dependable.
    $script:HotkeyHeld = $false
    $script:HotkeyTimer = [System.Windows.Threading.DispatcherTimer]::new()
    $script:HotkeyTimer.Interval = [TimeSpan]::FromMilliseconds(120)
    $script:HotkeyTimer.Add_Tick({
        try {
            $ctrl = ([GuideNative]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0
            $alt = ([GuideNative]::GetAsyncKeyState(0x12) -band 0x8000) -ne 0
            $v = ([GuideNative]::GetAsyncKeyState(0x56) -band 0x8000) -ne 0
            if ($ctrl -and $alt -and $v) {
                if (-not $script:HotkeyHeld) {
                    $script:HotkeyHeld = $true
                    Send-OverlayEvent @{ type = 'listen' }
                    Show-VoiceToast '正在听…（说完会自动结束）'
                }
            }
            else {
                $script:HotkeyHeld = $false
            }
        }
        catch { }
    })
    $script:HotkeyTimer.Start()

    $script:BallWindow = $window
    $script:BallClock = $clock
    $script:BallGradient = $gradient
    $script:BallLabel = $label
    $script:BallShadow = $shadow
    $script:BallStack = $ballStack
    $script:DragState = $null

    $grid.Add_MouseLeftButtonDown({
        $cursor = [System.Windows.Forms.Cursor]::Position
        $script:DragState = @{
            CursorX = $cursor.X
            CursorY = $cursor.Y
            WindowX = $script:BallWindow.Left
            WindowY = $script:BallWindow.Top
            Moved   = $false
        }
        # Capture the mouse: without it the ball slides out from under the
        # cursor and the drag stalls or jumps.
        [void]$script:BallWindow.Content.CaptureMouse()
    })

    $grid.Add_MouseMove({
        if ($null -eq $script:DragState) { return }
        if ([System.Windows.Input.Mouse]::LeftButton -ne [System.Windows.Input.MouseButtonState]::Pressed) { return }
        $cursor = [System.Windows.Forms.Cursor]::Position
        # Cursor.Position is in device pixels; window Left/Top are WPF DIPs.
        # On a 150% display these differ by the DPI scale, which made the ball
        # run away from the pointer while dragging.
        $dx = ($cursor.X - $script:DragState.CursorX) / $script:DragScale
        $dy = ($cursor.Y - $script:DragState.CursorY) / $script:DragScale
        if ([math]::Abs($dx) -gt 3 -or [math]::Abs($dy) -gt 3) { $script:DragState.Moved = $true }
        $newLeft = $script:DragState.WindowX + $dx
        $newTop = $script:DragState.WindowY + $dy
        $minLeft = $script:ScreenLeft
        $minTop = $script:ScreenTop
        $maxLeft = $script:ScreenLeft + $script:ScreenWidth - $script:BallWindow.Width
        $maxTop = $script:ScreenTop + $script:ScreenHeight - $script:BallWindow.Height
        if ($newLeft -lt $minLeft) { $newLeft = $minLeft }
        if ($newTop -lt $minTop) { $newTop = $minTop }
        if ($newLeft -gt $maxLeft) { $newLeft = $maxLeft }
        if ($newTop -gt $maxTop) { $newTop = $maxTop }
        $script:BallWindow.Left = $newLeft
        $script:BallWindow.Top = $newTop
    })

    $grid.Add_MouseLeftButtonUp({
        if ($null -eq $script:DragState) { return }
        $moved = $script:DragState.Moved
        $script:DragState = $null
        try { [void]$script:BallWindow.Content.ReleaseMouseCapture() } catch { }
        if ($moved) {
            $script:BallPinUntil = [DateTime]::UtcNow.AddSeconds(3)
            Send-OverlayEvent @{ type = 'ball_moved'; x = [int]$script:BallWindow.Left; y = [int]$script:BallWindow.Top }
        }
        elseif ($script:BallAction -eq 'panel') {
            # The host can make the bubble a plain panel toggle instead of a
            # capture trigger; the state carries which behaviour is wanted.
            if ($script:PanelWindow.IsVisible) {
                Send-OverlayEvent @{ type = 'mode'; mode = 'ball' }
            }
            else {
                Send-OverlayEvent @{ type = 'mode'; mode = 'panel' }
            }
        }
        else {
            Start-Capture 'ball' 0
        }
    })

    $grid.Add_MouseRightButtonUp({
        Send-OverlayEvent @{ type = 'mode'; mode = 'panel' }
    })

    # Ctrl+滚轮：球和面板一起缩放，跟面板底部的「大小」滑块是同一个值。
    $grid.Add_MouseWheel({
        param($sender, $wheelArgs)
        if (([System.Windows.Input.Keyboard]::Modifiers -band [System.Windows.Input.ModifierKeys]::Control) -eq 0) { return }
        $delta = if ($wheelArgs.Delta -gt 0) { 5 } else { -5 }
        Adjust-UiScale $delta
        $wheelArgs.Handled = $true
    })
}

function New-PanelButton([string]$Text) {
    $button = [System.Windows.Controls.Button]::new()
    $button.Content = $Text
    $button.FontSize = 13
    $button.Padding = [System.Windows.Thickness]::new(8, 3, 8, 3)
    $button.Margin = [System.Windows.Thickness]::new(0, 0, 6, 0)
    $button.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(30, 255, 255, 255))
    $button.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(235, 240, 243, 248))
    $button.BorderThickness = [System.Windows.Thickness]::new(0)
    $button.Cursor = [System.Windows.Input.Cursors]::Hand
    return $button
}

# --- voice (offline Windows SAPI) ---------------------------------------
function Show-VoiceToast([string]$Text) {
    if ($null -eq $script:VoiceToast) {
        $border = [System.Windows.Controls.Border]::new()
        $border.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(238, 16, 20, 26))
        $border.CornerRadius = [System.Windows.CornerRadius]::new(20)
        $border.Padding = [System.Windows.Thickness]::new(18, 9, 18, 9)
        $border.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(80, 255, 255, 255))
        $border.BorderThickness = [System.Windows.Thickness]::new(1)
        $border.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $border.VerticalAlignment = [System.Windows.VerticalAlignment]::Bottom
        $border.Margin = [System.Windows.Thickness]::new(0, 0, 0, 72)
        $border.Visibility = [System.Windows.Visibility]::Collapsed
        $border.IsHitTestVisible = $false
        $toastText = [System.Windows.Controls.TextBlock]::new()
        $toastText.FontSize = 15
        $toastText.Foreground = [System.Windows.Media.Brushes]::White
        $border.Child = $toastText
        [void]$script:AnnCanvas.Children.Add($border)
        $script:VoiceToast = $border
        $script:VoiceToastText = $toastText
        $script:VoiceToastTimer = [System.Windows.Threading.DispatcherTimer]::new()
        $script:VoiceToastTimer.Interval = [TimeSpan]::FromSeconds(3)
        $script:VoiceToastTimer.Add_Tick({
            $script:VoiceToastTimer.Stop()
            $script:VoiceToast.Visibility = [System.Windows.Visibility]::Collapsed
        })
    }
    if ([string]::IsNullOrWhiteSpace($Text)) {
        $script:VoiceToast.Visibility = [System.Windows.Visibility]::Collapsed
        return
    }
    $script:VoiceToastText.Text = $Text
    $script:VoiceToast.Visibility = [System.Windows.Visibility]::Visible
    $script:VoiceToastTimer.Stop()
    $script:VoiceToastTimer.Start()
}

function Send-AskMessage {
    if ($null -eq $script:AskInput) { return }
    $text = $script:AskInput.Text
    if ([string]::IsNullOrWhiteSpace($text)) { return }
    $script:AskInput.Text = ''
    Send-OverlayEvent @{ type = 'ask'; text = $text.Trim() }
    Show-VoiceToast ('已发送：' + $text.Trim())
}

function Copy-PanelText {
    $parts = @()
    if ($null -ne $script:PanelTitle -and $script:PanelTitle.Text) { $parts += [string]$script:PanelTitle.Text }
    if ($null -ne $script:PanelBody -and $script:PanelBody.Text) { $parts += [string]$script:PanelBody.Text }
    if ($null -ne $script:PanelSteps) {
        $index = 0
        foreach ($child in $script:PanelSteps.Children) {
            if ($child -is [System.Windows.Controls.TextBlock]) {
                $index++
                $parts += ('{0}. {1}' -f $index, $child.Text)
            }
        }
    }
    $text = ($parts -join "`r`n").Trim()
    if ([string]::IsNullOrEmpty($text)) {
        Show-VoiceToast '面板里没有可复制的文字'
        return
    }
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            [System.Windows.Clipboard]::SetText($text)
            Show-VoiceToast '已复制面板内容'
            return
        }
        catch {
            Start-Sleep -Milliseconds 60
        }
    }
    Show-VoiceToast '复制失败，剪贴板被占用'
}

function Get-ClipboardText {
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            if ([System.Windows.Clipboard]::ContainsText()) {
                return [System.Windows.Clipboard]::GetText()
            }
            return $null
        }
        catch {
            Start-Sleep -Milliseconds 60
        }
    }
    return $null
}

function Paste-AskInput {
    if ($null -eq $script:AskInput) { return }
    $text = Get-ClipboardText
    if ([string]::IsNullOrEmpty($text)) {
        Show-VoiceToast '剪贴板里没有文字'
        return
    }
    $text = ($text -replace "`r`n", ' ' -replace "`n", ' ' -replace "`r", ' ').Trim()
    if ([string]::IsNullOrEmpty($text)) { return }
    $script:AskInput.SelectedText = $text
    $script:AskInput.CaretIndex = $script:AskInput.Text.Length
    $script:AskInput.Focus() | Out-Null
}

function Initialize-Voice {
    if ($script:VoiceReady) { return $true }
    try {
        Add-Type -AssemblyName System.Speech
        $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
            Where-Object { $_.Culture.Name -eq 'zh-CN' } | Select-Object -First 1
        if ($null -eq $recognizer) {
            $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Select-Object -First 1
        }
        if ($null -eq $recognizer) {
            Write-Log 'voice: no recognizer installed'
            return $false
        }
        $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($recognizer)
        $engine.MaxAlternates = 3
        [void]$engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
        $engine.Add_SpeechRecognized({
            param($sender, $eventArgs)
            $script:PendingVoice = @{
                text = [string]$eventArgs.Result.Text
                confidence = [double]$eventArgs.Result.Confidence
            }
            try {
                $script:AnnWindow.Dispatcher.BeginInvoke([System.Action]{
                    Stop-Voice
                    $pending = $script:PendingVoice
                    $script:PendingVoice = $null
                    if ($null -eq $pending -or [string]::IsNullOrWhiteSpace($pending.text)) {
                        Show-VoiceToast '没听清，再说一次？'
                        return
                    }
                    Show-VoiceToast ('听到：' + $pending.text)
                    Send-OverlayEvent @{ type = 'voice'; text = $pending.text; confidence = $pending.confidence }
                }) | Out-Null
            }
            catch {
                Write-Log ('voice dispatch failed: ' + $_.Exception.Message)
            }
        })
        $script:VoiceEngine = $engine
        $script:VoiceReady = $true
        Write-Log ('voice: engine ready (' + $recognizer.Culture.Name + ')')
        return $true
    }
    catch {
        Write-Log ('voice init failed: ' + $_.Exception.Message)
        return $false
    }
}

function Stop-Voice {
    if ($null -ne $script:VoiceTimer) {
        $script:VoiceTimer.Stop()
        $script:VoiceTimer = $null
    }
    if (-not $script:VoiceListening) { return }
    $script:VoiceListening = $false
    try { $script:VoiceEngine.RecognizeAsyncStop() } catch { }
}

function Start-Voice([int]$Seconds = 9) {
    if ($script:VoiceListening) { return }
    if (-not (Initialize-Voice)) {
        Show-VoiceToast '语音引擎不可用'
        return
    }
    try {
        $script:VoiceEngine.SetInputToDefaultAudioDevice()
    }
    catch {
        Write-Log ('voice: no input device - ' + $_.Exception.Message)
        Show-VoiceToast '没有可用的麦克风'
        return
    }
    $script:VoiceListening = $true
    Show-VoiceToast '正在听…（说完稍等）'
    Write-Log 'voice: listening'
    try {
        $script:VoiceEngine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
    }
    catch {
        Write-Log ('voice: start failed - ' + $_.Exception.Message)
        Stop-Voice
        return
    }
    $script:VoiceTimer = [System.Windows.Threading.DispatcherTimer]::new()
    $script:VoiceTimer.Interval = [TimeSpan]::FromSeconds($Seconds)
    $script:VoiceTimer.Add_Tick({
        $script:VoiceTimer.Stop()
        Stop-Voice
        Show-VoiceToast '没听到声音'
    })
    $script:VoiceTimer.Start()
}

# --- chat log -------------------------------------------------------------
# 「记录」按钮：把插件端的短期对话流水（谁说、从哪说、说什么、几点）列出来。
# 数据由宿主写入 chatlog.json，这里只读，不写。
function Show-ChatLogWindow {
    $path = Join-Path $DataDir 'chatlog.json'
    $entries = @()
    try {
        if (Test-Path $path) {
            $raw = Get-Content -Path $path -Raw -Encoding UTF8
            if (-not [string]::IsNullOrWhiteSpace($raw)) {
                $parsed = $raw | ConvertFrom-Json
                if ($null -ne $parsed) { $entries = @($parsed) }
            }
        }
    } catch {
        $entries = @()
    }

    $sb = [System.Text.StringBuilder]::new()
    foreach ($item in (@($entries) | Select-Object -Last 40)) {
        $when = ''
        try { $when = ([datetime]$item.at).ToLocalTime().ToString('MM-dd HH:mm') } catch { $when = '' }
        [void]$sb.AppendLine(('[{0}]  {1}·{2}' -f $when, $item.role, $item.via))
        [void]$sb.AppendLine($item.text)
        [void]$sb.AppendLine('')
    }
    if ($sb.Length -eq 0) {
        [void]$sb.AppendLine('还没有记录。')
        [void]$sb.AppendLine('')
        [void]$sb.AppendLine('用面板上的「说」说一句，或者在输入框里打字发一条，这里就会出现。')
    }

    if ($null -ne $script:ChatLogWindow) {
        try { $script:ChatLogWindow.Close() } catch { }
        $script:ChatLogWindow = $null
    }

    $gw = New-GWindow ('教学助手 · 对话记录（{0} 条）' -f @($entries).Count) 620 480
    $win = $gw.Window
    $win.FontFamily = 'Microsoft YaHei'

    $box = [System.Windows.Controls.TextBox]::new()
    $box.Text = $sb.ToString()
    $box.IsReadOnly = $true
    $box.AcceptsReturn = $true
    $box.TextWrapping = [System.Windows.TextWrapping]::Wrap
    $box.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Auto
    $box.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 20, 24, 31))
    $box.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 226, 233, 242))
    $box.BorderThickness = [System.Windows.Thickness]::new(0)
    $box.Padding = [System.Windows.Thickness]::new(14, 12, 14, 12)
    $box.FontSize = 13
    $box.VerticalContentAlignment = [System.Windows.VerticalAlignment]::Top
    $gw.Body.Content = $box
    $script:ChatLogWindow = $win
    [void]$win.Show()
}

# --- goals ----------------------------------------------------------------
# 「目标」按钮：一行一个目标，保存后写到 goals.json，插件按这些目标发「都市指令」。
# 这里只读写这一件事，不碰别的状态。
function Show-GoalsWindowLegacy {
    $path = Join-Path $DataDir 'goals.json'
    $texts = @()
    try {
        if (Test-Path $path) {
            $raw = Get-Content -Path $path -Raw -Encoding UTF8
            if (-not [string]::IsNullOrWhiteSpace($raw)) {
                $parsed = $raw | ConvertFrom-Json
                $items = @()
                if ($null -ne $parsed) {
                    if ($null -ne $parsed.goals) { $items = @($parsed.goals) }
                    elseif ($parsed -is [System.Array]) { $items = @($parsed) }
                }
                foreach ($item in $items) {
                    $t = ''
                    if ($item -is [string]) { $t = $item } elseif ($null -ne $item.text) { $t = [string]$item.text }
                    if (-not [string]::IsNullOrWhiteSpace($t)) { $texts += $t.Trim() }
                }
            }
        }
    } catch {
        $texts = @()
        Write-Log ('goals read failed: ' + $_.Exception.Message)
    }

    if ($null -ne $script:GoalsWindow) {
        try { $script:GoalsWindow.Close() } catch { }
        $script:GoalsWindow = $null
    }

    $win = [System.Windows.Window]::new()
    $win.Title = ('教学助手 · 我的目标（{0} 条）' -f @($texts).Count)
    $win.Width = 580
    $win.Height = 440
    $win.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
    $win.Topmost = $true
    $win.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 20, 24, 31))
    $win.FontFamily = 'Microsoft YaHei'

    $grid = [System.Windows.Controls.Grid]::new()
    $grid.Margin = [System.Windows.Thickness]::new(14, 12, 14, 12)
    $rowHint = [System.Windows.Controls.RowDefinition]::new()
    $rowHint.Height = [System.Windows.GridLength]::new(34, [System.Windows.GridUnitType]::Pixel)
    $rowBox = [System.Windows.Controls.RowDefinition]::new()
    $rowBox.Height = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $rowButtons = [System.Windows.Controls.RowDefinition]::new()
    $rowButtons.Height = [System.Windows.GridLength]::new(40, [System.Windows.GridUnitType]::Pixel)
    [void]$grid.RowDefinitions.Add($rowHint)
    [void]$grid.RowDefinitions.Add($rowBox)
    [void]$grid.RowDefinitions.Add($rowButtons)

    $hint = [System.Windows.Controls.TextBlock]::new()
    $hint.Text = '一行一个目标，写清"做什么、什么时候"。保存即生效，不限条数。'
    $hint.FontSize = 12
    $hint.TextWrapping = [System.Windows.TextWrapping]::Wrap
    $hint.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(180, 255, 255, 255))
    [System.Windows.Controls.Grid]::SetRow($hint, 0)
    [void]$grid.Children.Add($hint)

    $box = [System.Windows.Controls.TextBox]::new()
    $box.Text = ($texts -join "`r`n")
    $box.AcceptsReturn = $true
    $box.TextWrapping = [System.Windows.TextWrapping]::Wrap
    $box.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Auto
    $box.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 30, 35, 44))
    $box.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 232, 238, 246))
    $box.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(60, 255, 255, 255))
    $box.BorderThickness = [System.Windows.Thickness]::new(1)
    $box.Padding = [System.Windows.Thickness]::new(10, 8, 10, 8)
    $box.FontSize = 13
    $box.Margin = [System.Windows.Thickness]::new(0, 8, 0, 8)
    $box.VerticalContentAlignment = [System.Windows.VerticalAlignment]::Top
    [System.Windows.Controls.Grid]::SetRow($box, 1)
    [void]$grid.Children.Add($box)

    $row = [System.Windows.Controls.StackPanel]::new()
    $row.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $row.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    [System.Windows.Controls.Grid]::SetRow($row, 2)

    $save = [System.Windows.Controls.Button]::new()
    $save.Content = '保存'
    $save.FontSize = 13
    $save.Padding = [System.Windows.Thickness]::new(18, 6, 18, 6)
    $save.Margin = [System.Windows.Thickness]::new(0, 0, 8, 0)
    $save.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 59, 130, 246))
    $save.Foreground = [System.Windows.Media.Brushes]::White
    $save.BorderThickness = [System.Windows.Thickness]::new(0)
    $save.Cursor = [System.Windows.Input.Cursors]::Hand

    $close = [System.Windows.Controls.Button]::new()
    $close.Content = '关闭'
    $close.FontSize = 13
    $close.Padding = [System.Windows.Thickness]::new(18, 6, 18, 6)
    $close.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 46, 52, 62))
    $close.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 226, 233, 242))
    $close.BorderThickness = [System.Windows.Thickness]::new(0)
    $close.Cursor = [System.Windows.Input.Cursors]::Hand
    $close.Add_Click({ try { $script:GoalsWindow.Close() } catch { } })

    $script:GoalsBox = $box
    $script:GoalsWindow = $win
    $script:GoalsPath = $path
    $save.Add_Click({
        try {
            $lines = @($script:GoalsBox.Text -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
            $nowIso = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
            $goals = @()
            $i = 0
            foreach ($line in $lines) {
                $i++
                $goals += [pscustomobject]@{ id = ('g{0}' -f $i); text = $line; createdAt = $nowIso; status = 'active' }
            }
            $payload = [pscustomobject]@{ updatedAt = $nowIso; goals = @($goals) }
            $json = ($payload | ConvertTo-Json -Depth 6)
            [System.IO.File]::WriteAllText($script:GoalsPath, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
            Show-VoiceToast ('目标已保存（{0} 条）' -f @($goals).Count)
            $script:GoalsWindow.Title = ('教学助手 · 我的目标（{0} 条）' -f @($goals).Count)
        } catch {
            Write-Log ('goals save failed: ' + $_.Exception.Message)
            Show-VoiceToast '保存失败，看日志'
        }
    })

    [void]$row.Children.Add($save)
    [void]$row.Children.Add($close)
    [void]$grid.Children.Add($row)
    $win.Content = $grid
    [void]$win.Show()
    [void]$box.Focus()
}

# --- goals v2 -------------------------------------------------------------
# 目标看板：目标可拆步骤、打勾算进度，改动即落盘 goals.json。
# 插件只读 text/status 发「都市指令」，steps 是给人看的，不影响发令。
$script:GoalsData = @()
$script:GoalsCards = @()
$script:GoalsStack = $null
$script:GoalsScroll = $null
$script:GoalsStepBoxes = @()
$script:GoalsNewBox = $null
$script:EditingGoal = $null
$script:GoalEditBox = $null

function Read-GoalsData {
    $path = Join-Path $DataDir 'goals.json'
    $list = @()
    try {
        if (Test-Path $path) {
            $raw = Get-Content -Path $path -Raw -Encoding UTF8
            if (-not [string]::IsNullOrWhiteSpace($raw)) {
                $parsed = $raw | ConvertFrom-Json
                $items = @()
                if ($null -ne $parsed) {
                    if ($null -ne $parsed.goals) { $items = @($parsed.goals) }
                    elseif ($parsed -is [System.Array]) { $items = @($parsed) }
                }
                $n = 0
                foreach ($item in $items) {
                    $text = ''
                    if ($item -is [string]) { $text = $item } elseif ($null -ne $item.text) { $text = [string]$item.text }
                    $text = $text.Trim()
                    if ([string]::IsNullOrWhiteSpace($text)) { continue }
                    $n++
                    $steps = @()
                    $seq = 0
                    foreach ($st in @($item.steps)) {
                        if ($null -eq $st) { continue }
                        $stText = ''
                        if ($st -is [string]) { $stText = $st } elseif ($null -ne $st.text) { $stText = [string]$st.text }
                        $stText = $stText.Trim()
                        if ([string]::IsNullOrWhiteSpace($stText)) { continue }
                        $seq++
                        $done = $false
                        if ($st -isnot [string] -and $null -ne $st.done) { $done = [bool]$st.done }
                        $steps += [pscustomobject]@{ id = ('s{0}' -f $seq); text = $stText; done = $done }
                    }
                    $created = ''
                    if ($null -ne $item.createdAt) { $created = [string]$item.createdAt }
                    $list += [pscustomobject]@{
                        id = ('g{0}' -f $n)
                        text = $text
                        createdAt = $created
                        status = 'active'
                        steps = @($steps)
                        stepSeq = $seq
                    }
                }
            }
        }
    } catch {
        Write-Log ('goals read failed: ' + $_.Exception.Message)
    }
    return @($list)
}

function Save-GoalsData {
    try {
        $nowIso = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
        $payload = [pscustomobject]@{ updatedAt = $nowIso; goals = [object[]]$script:GoalsData }
        $json = ($payload | ConvertTo-Json -Depth 8)
        [System.IO.File]::WriteAllText($script:GoalsPath, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
        return $true
    } catch {
        Write-Log ('goals save failed: ' + $_.Exception.Message)
        Show-VoiceToast '保存失败，看日志'
        return $false
    }
}

function Rebuild-GoalsPanel {
    if ($null -eq $script:GoalsStack) { return }
    $script:GoalEditBox = $null
    if ($null -ne $script:EditingGoal) {
        $still = $false
        foreach ($gg in @($script:GoalsData)) { if ([string]$gg.id -eq [string]$script:EditingGoal) { $still = $true } }
        if (-not $still) { $script:EditingGoal = $null }
    }
    $script:GoalsStack.Children.Clear()
    $script:GoalsCards = @()
    $script:GoalsStepBoxes = @()
    $gi = -1
    foreach ($g in @($script:GoalsData)) {
        $gi++
        $cardIndex = $gi
        $card = [System.Windows.Controls.Border]::new()
        $card.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 30, 35, 44))
        $card.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(40, 255, 255, 255))
        $card.BorderThickness = [System.Windows.Thickness]::new(1)
        $card.CornerRadius = [System.Windows.CornerRadius]::new(12)
        $card.Padding = [System.Windows.Thickness]::new(14, 12, 14, 12)
        $card.Margin = [System.Windows.Thickness]::new(0, 0, 0, 10)
        $inner = [System.Windows.Controls.StackPanel]::new()
        $card.Child = $inner

        $titleRow = [System.Windows.Controls.Grid]::new()
        $c1 = [System.Windows.Controls.ColumnDefinition]::new()
        $c1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
        $c2 = [System.Windows.Controls.ColumnDefinition]::new()
        $c2.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
        $c3 = [System.Windows.Controls.ColumnDefinition]::new()
        $c3.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
        [void]$titleRow.ColumnDefinitions.Add($c1)
        [void]$titleRow.ColumnDefinitions.Add($c2)
        [void]$titleRow.ColumnDefinitions.Add($c3)
        if ($null -ne $script:EditingGoal -and [string]$script:EditingGoal -eq [string]$g.id) {
            $editor = [System.Windows.Controls.TextBox]::new()
            $editor.Text = [string]$g.text
            $editor.FontSize = 14.5
            $editor.FontWeight = [System.Windows.FontWeights]::SemiBold
            $editor.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(245, 236, 242, 250))
            $editor.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 38, 44, 54))
            $editor.CaretBrush = [System.Windows.Media.Brushes]::White
            $editor.BorderThickness = [System.Windows.Thickness]::new(1)
            $editor.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(120, 90, 160, 255))
            $editor.Padding = [System.Windows.Thickness]::new(4, 1, 4, 1)
            $editor.Tag = [string]$g.id
            $editor.Add_KeyDown({
                param($s, $e)
                if ($e.Key -eq [System.Windows.Input.Key]::Escape) {
                    $e.Handled = $true
                    $script:EditingGoal = $null
                    Rebuild-GoalsPanel
                    return
                }
                if ($e.Key -ne [System.Windows.Input.Key]::Enter) { return }
                $e.Handled = $true
                $id = [string]$s.Tag
                $text = [string]$s.Text
                if (-not [string]::IsNullOrWhiteSpace($text)) {
                    foreach ($gg in @($script:GoalsData)) { if ([string]$gg.id -eq $id) { $gg.text = $text.Trim() } }
                    [void](Save-GoalsData)
                }
                $script:EditingGoal = $null
                Rebuild-GoalsPanel
            })
            $editor.Add_LostFocus({
                param($s, $e)
                if ($null -eq $script:EditingGoal) { return }
                if ([string]$s.Tag -ne [string]$script:EditingGoal) { return }
                $id = [string]$s.Tag
                $text = [string]$s.Text
                if (-not [string]::IsNullOrWhiteSpace($text)) {
                    foreach ($gg in @($script:GoalsData)) { if ([string]$gg.id -eq $id) { $gg.text = $text.Trim() } }
                    [void](Save-GoalsData)
                }
                $script:EditingGoal = $null
                Rebuild-GoalsPanel
            })
            [System.Windows.Controls.Grid]::SetColumn($editor, 0)
            [void]$titleRow.Children.Add($editor)
            $script:GoalEditBox = $editor
        }
        else {
            $titleTb = [System.Windows.Controls.TextBlock]::new()
            $titleTb.Text = [string]$g.text
            $titleTb.FontSize = 14.5
            $titleTb.FontWeight = [System.Windows.FontWeights]::SemiBold
            $titleTb.TextWrapping = [System.Windows.TextWrapping]::Wrap
            $titleTb.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(245, 236, 242, 250))
            [System.Windows.Controls.Grid]::SetColumn($titleTb, 0)
            [void]$titleRow.Children.Add($titleTb)
        }

        $editBtn = [System.Windows.Controls.Border]::new()
        $editBtn.Width = 28
        $editBtn.Height = 28
        $editBtn.Margin = [System.Windows.Thickness]::new(8, 0, 0, 0)
        $editBtn.CornerRadius = [System.Windows.CornerRadius]::new(7)
        $editBtn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(18, 255, 255, 255))
        $editBtn.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $editBtn.Cursor = [System.Windows.Input.Cursors]::Hand
        $editBtn.ToolTip = '改目标文字'
        $editBtn.Tag = $cardIndex
        $editGlyph = [System.Windows.Controls.TextBlock]::new()
        $editGlyph.Text = '✎'
        $editGlyph.FontSize = 16
        $editGlyph.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $editGlyph.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $editGlyph.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(210, 255, 255, 255))
        $editBtn.Child = $editGlyph
        $editBtn.Add_MouseEnter({ param($s, $e) $s.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(42, 255, 255, 255)) })
        $editBtn.Add_MouseLeave({ param($s, $e) $s.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(18, 255, 255, 255)) })
        $editBtn.Add_PreviewMouseLeftButtonUp({
            param($s, $e)
            $e.Handled = $true
            $gIdx = [int]$s.Tag
            if ($gIdx -lt 0 -or $gIdx -ge @($script:GoalsData).Count) { return }
            $goal = $script:GoalsData[$gIdx]
            $script:EditingGoal = [string]$goal.id
            Rebuild-GoalsPanel
        })

        $delBtn = [System.Windows.Controls.Border]::new()
        $delBtn.Width = 28
        $delBtn.Height = 28
        $delBtn.Margin = [System.Windows.Thickness]::new(6, 0, 0, 0)
        $delBtn.CornerRadius = [System.Windows.CornerRadius]::new(7)
        $delBtn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(18, 255, 120, 110))
        $delBtn.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $delBtn.Cursor = [System.Windows.Input.Cursors]::Hand
        $delBtn.ToolTip = '删掉这个目标'
        $delBtn.Tag = $cardIndex
        $delGlyph = [System.Windows.Controls.TextBlock]::new()
        $delGlyph.Text = '×'
        $delGlyph.FontSize = 18
        $delGlyph.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $delGlyph.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $delGlyph.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(220, 255, 120, 110))
        $delBtn.Child = $delGlyph
        $delBtn.Add_MouseEnter({ param($s, $e) $s.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(45, 255, 120, 110)) })
        $delBtn.Add_MouseLeave({ param($s, $e) $s.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(18, 255, 120, 110)) })
        $delBtn.Add_PreviewMouseLeftButtonUp({
            param($s, $e)
            $e.Handled = $true
            $gIdx = [int]$s.Tag
            if ($gIdx -lt 0 -or $gIdx -ge @($script:GoalsData).Count) { return }
            $goal = $script:GoalsData[$gIdx]
            $answer = [System.Windows.MessageBox]::Show(
                ('删掉「{0}」？它下面的步骤会一起删，删了不能恢复。' -f [string]$goal.text),
                '删目标',
                [System.Windows.MessageBoxButton]::YesNo,
                [System.Windows.MessageBoxImage]::Warning)
            if ($answer -ne [System.Windows.MessageBoxResult]::Yes) { return }
            $keep = @()
            foreach ($item in @($script:GoalsData)) {
                if ($item.id -ne $goal.id) { $keep += $item }
            }
            $script:GoalsData = $keep
            if (Save-GoalsData) { Rebuild-GoalsPanel }
        })

        $ops = [System.Windows.Controls.StackPanel]::new()
        $ops.Orientation = [System.Windows.Controls.Orientation]::Horizontal
        $ops.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        [void]$ops.Children.Add($editBtn)
        [void]$ops.Children.Add($delBtn)
        [System.Windows.Controls.Grid]::SetColumn($ops, 2)
        [void]$titleRow.Children.Add($ops)

        $countTb = [System.Windows.Controls.TextBlock]::new()
        $countTb.FontSize = 11
        $countTb.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $countTb.Margin = [System.Windows.Thickness]::new(10, 0, 0, 0)
        $countTb.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(160, 255, 255, 255))
        [System.Windows.Controls.Grid]::SetColumn($countTb, 1)
        [void]$titleRow.Children.Add($countTb)
        [void]$inner.Children.Add($titleRow)

        $bar = [System.Windows.Controls.ProgressBar]::new()
        $bar.Height = 4
        $bar.Margin = [System.Windows.Thickness]::new(0, 8, 0, 8)
        $bar.Minimum = 0
        $bar.Maximum = 100
        $bar.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 42, 48, 58))
        $bar.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 59, 130, 246))
        $bar.BorderThickness = [System.Windows.Thickness]::new(0)
        [void]$inner.Children.Add($bar)

        $stepsPanel = [System.Windows.Controls.StackPanel]::new()
        $si = -1
        foreach ($st in @($g.steps)) {
            $si++
            $stepRow = [System.Windows.Controls.Grid]::new()
            $sc1 = [System.Windows.Controls.ColumnDefinition]::new()
            $sc1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
            $sc2 = [System.Windows.Controls.ColumnDefinition]::new()
            $sc2.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
            [void]$stepRow.ColumnDefinitions.Add($sc1)
            [void]$stepRow.ColumnDefinitions.Add($sc2)
            $cb = [System.Windows.Controls.CheckBox]::new()
            $cb.IsChecked = [bool]$st.done
            $cb.Margin = [System.Windows.Thickness]::new(0, 2, 0, 2)
            $cb.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(230, 226, 233, 242))
            $txt = [System.Windows.Controls.TextBlock]::new()
            $txt.Text = [string]$st.text
            $txt.FontSize = 12.5
            $txt.TextWrapping = [System.Windows.TextWrapping]::Wrap
            $txt.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
            if ($st.done) {
                $txt.TextDecorations = [System.Windows.TextDecorations]::Strikethrough
                $txt.Opacity = 0.55
            }
            $cb.Content = $txt
            $cb.Tag = @{ g = $cardIndex; s = $si }
            $cb.Add_Click({
                param($s, $e)
                $tag = $s.Tag
                $gIdx = [int]$tag.g
                $sIdx = [int]$tag.s
                if ($gIdx -lt 0 -or $gIdx -ge @($script:GoalsData).Count) { return }
                $goal = $script:GoalsData[$gIdx]
                if ($sIdx -lt 0 -or $sIdx -ge @($goal.steps).Count) { return }
                $goal.steps[$sIdx].done = [bool]$s.IsChecked
                $txt = $s.Content
                if ($null -ne $txt) {
                    if ($s.IsChecked) {
                        $txt.TextDecorations = [System.Windows.TextDecorations]::Strikethrough
                        $txt.Opacity = 0.55
                    } else {
                        $txt.TextDecorations = $null
                        $txt.Opacity = 1.0
                    }
                }
                [void](Save-GoalsData)
                $doneCount = @($goal.steps | Where-Object { $_.done }).Count
                $totalCount = @($goal.steps).Count
                $cards = @($script:GoalsCards)
                if ($gIdx -lt $cards.Count) {
                    $cards[$gIdx].count.Text = ('{0}/{1}' -f $doneCount, $totalCount)
                    if ($totalCount -gt 0) { $cards[$gIdx].bar.Value = (100.0 * $doneCount / $totalCount) }
                    else { $cards[$gIdx].bar.Value = 0 }
                }
            })
            [System.Windows.Controls.Grid]::SetColumn($cb, 0)
            [void]$stepRow.Children.Add($cb)

            $delStep = [System.Windows.Controls.Border]::new()
            $delStep.Width = 24
            $delStep.Height = 24
            $delStep.Margin = [System.Windows.Thickness]::new(6, 0, 0, 0)
            $delStep.CornerRadius = [System.Windows.CornerRadius]::new(6)
            $delStep.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(14, 255, 255, 255))
            $delStep.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
            $delStep.Cursor = [System.Windows.Input.Cursors]::Hand
            $delStep.ToolTip = '删掉这步'
            $delStep.Tag = @{ g = $cardIndex; s = $si }
            $delStepGlyph = [System.Windows.Controls.TextBlock]::new()
            $delStepGlyph.Text = '×'
            $delStepGlyph.FontSize = 15
            $delStepGlyph.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
            $delStepGlyph.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
            $delStepGlyph.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
            $delStep.Child = $delStepGlyph
            $delStep.Add_MouseEnter({ param($s, $e) $s.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(38, 255, 255, 255)) })
            $delStep.Add_MouseLeave({ param($s, $e) $s.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(14, 255, 255, 255)) })
            $delStep.Add_PreviewMouseLeftButtonUp({
                param($s, $e)
                $e.Handled = $true
                $tag = $s.Tag
                $gIdx = [int]$tag.g
                $sIdx = [int]$tag.s
                if ($gIdx -lt 0 -or $gIdx -ge @($script:GoalsData).Count) { return }
                $goal = $script:GoalsData[$gIdx]
                $steps = @($goal.steps)
                if ($sIdx -lt 0 -or $sIdx -ge $steps.Count) { return }
                $newSteps = @()
                for ($k = 0; $k -lt $steps.Count; $k++) {
                    if ($k -ne $sIdx) { $newSteps += $steps[$k] }
                }
                $goal.steps = $newSteps
                if (Save-GoalsData) { Rebuild-GoalsPanel }
            })
            [System.Windows.Controls.Grid]::SetColumn($delStep, 1)
            [void]$stepRow.Children.Add($delStep)
            [void]$stepsPanel.Children.Add($stepRow)
        }
        if (@($g.steps).Count -eq 0) {
            $empty = [System.Windows.Controls.TextBlock]::new()
            $empty.Text = '还没拆步骤 —— 加一步，今天就能动。'
            $empty.FontSize = 11.5
            $empty.Margin = [System.Windows.Thickness]::new(0, 2, 0, 2)
            $empty.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(140, 255, 255, 255))
            [void]$stepsPanel.Children.Add($empty)
        }
        [void]$inner.Children.Add($stepsPanel)

        $addRow = [System.Windows.Controls.Grid]::new()
        $addRow.Margin = [System.Windows.Thickness]::new(0, 8, 0, 0)
        $ac1 = [System.Windows.Controls.ColumnDefinition]::new()
        $ac1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
        $ac2 = [System.Windows.Controls.ColumnDefinition]::new()
        $ac2.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
        [void]$addRow.ColumnDefinitions.Add($ac1)
        [void]$addRow.ColumnDefinitions.Add($ac2)
        $stepBox = [System.Windows.Controls.TextBox]::new()
        $stepBox.FontSize = 12
        $stepBox.Height = 28
        $stepBox.Padding = [System.Windows.Thickness]::new(8, 4, 8, 4)
        $stepBox.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 24, 28, 36))
        $stepBox.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(230, 226, 233, 242))
        $stepBox.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(45, 255, 255, 255))
        $stepBox.BorderThickness = [System.Windows.Thickness]::new(1)
        $stepBox.VerticalContentAlignment = [System.Windows.VerticalAlignment]::Center
        $stepBox.Tag = $cardIndex
        $stepBox.ToolTip = '写下一步能直接动手的事，回车添加'
        [System.Windows.Controls.Grid]::SetColumn($stepBox, 0)
        [void]$addRow.Children.Add($stepBox)
        $addBtn = [System.Windows.Controls.Button]::new()
        $addBtn.Content = '＋'
        $addBtn.FontSize = 13
        $addBtn.Width = 34
        $addBtn.Height = 28
        $addBtn.Margin = [System.Windows.Thickness]::new(6, 0, 0, 0)
        $addBtn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 45, 52, 63))
        $addBtn.Foreground = [System.Windows.Media.Brushes]::White
        $addBtn.BorderThickness = [System.Windows.Thickness]::new(0)
        $addBtn.Cursor = [System.Windows.Input.Cursors]::Hand
        $addBtn.Tag = $cardIndex
        $addBtn.Add_Click({
            param($s, $e)
            $gIdx = [int]$s.Tag
            if ($gIdx -lt 0 -or $gIdx -ge @($script:GoalsData).Count) { return }
            $boxes = @($script:GoalsStepBoxes)
            if ($gIdx -ge $boxes.Count -or $null -eq $boxes[$gIdx]) { return }
            $text = [string]$boxes[$gIdx].Text
            if ([string]::IsNullOrWhiteSpace($text)) { return }
            $goal = $script:GoalsData[$gIdx]
            $goal.stepSeq = [int]$goal.stepSeq + 1
            $goal.steps = @($goal.steps) + @([pscustomobject]@{ id = ('s{0}' -f $goal.stepSeq); text = $text.Trim(); done = $false })
            if (Save-GoalsData) {
                $boxes[$gIdx].Text = ''
                Rebuild-GoalsPanel
            }
        })
        [System.Windows.Controls.Grid]::SetColumn($addBtn, 1)
        [void]$addRow.Children.Add($addBtn)
        $stepBox.Add_KeyDown({
            param($s, $e)
            if ($e.Key -ne [System.Windows.Input.Key]::Enter) { return }
            $e.Handled = $true
            $gIdx = [int]$s.Tag
            if ($gIdx -lt 0 -or $gIdx -ge @($script:GoalsData).Count) { return }
            $text = [string]$s.Text
            if ([string]::IsNullOrWhiteSpace($text)) { return }
            $goal = $script:GoalsData[$gIdx]
            $goal.stepSeq = [int]$goal.stepSeq + 1
            $goal.steps = @($goal.steps) + @([pscustomobject]@{ id = ('s{0}' -f $goal.stepSeq); text = $text.Trim(); done = $false })
            if (Save-GoalsData) {
                $s.Text = ''
                Rebuild-GoalsPanel
            }
        })
        [void]$inner.Children.Add($addRow)

        $actions = [System.Windows.Controls.StackPanel]::new()
        $actions.Orientation = [System.Windows.Controls.Orientation]::Horizontal
        $actions.Margin = [System.Windows.Thickness]::new(0, 8, 0, 0)
        $planBtn = [System.Windows.Controls.Button]::new()
        $planBtn.Content = '排进今日清单'
        $planBtn.FontSize = 11
        $planBtn.Padding = [System.Windows.Thickness]::new(10, 3, 10, 3)
        $planBtn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 37, 99, 235))
        $planBtn.Foreground = [System.Windows.Media.Brushes]::White
        $planBtn.BorderThickness = [System.Windows.Thickness]::new(0)
        $planBtn.Cursor = [System.Windows.Input.Cursors]::Hand
        $planBtn.Tag = $cardIndex
        $planBtn.ToolTip = '预填目标标题，时间自己挑'
        $planBtn.Add_Click({
            param($s, $e)
            $gIdx = [int]$s.Tag
            if ($gIdx -lt 0 -or $gIdx -ge @($script:GoalsData).Count) { return }
            Show-AddTaskWindow -PrefillTitle ([string]$script:GoalsData[$gIdx].text)
        })
        [void]$actions.Children.Add($planBtn)
        [void]$inner.Children.Add($actions)

        $doneCount = @($g.steps | Where-Object { $_.done }).Count
        $totalCount = @($g.steps).Count
        $countTb.Text = ('{0}/{1}' -f $doneCount, $totalCount)
        if ($totalCount -gt 0) { $bar.Value = (100.0 * $doneCount / $totalCount) } else { $bar.Value = 0 }
        $script:GoalsCards += @([pscustomobject]@{ bar = $bar; count = $countTb; panel = $stepsPanel })
        $script:GoalsStepBoxes += @($stepBox)
        [void]$script:GoalsStack.Children.Add($card)
    }
    if ($null -ne $script:GoalsScroll) { $script:GoalsScroll.ScrollToEnd() }
    if ($null -ne $script:GoalEditBox) {
        $editorRef = $script:GoalEditBox
        [void]$editorRef.Dispatcher.BeginInvoke([System.Action]{
            try {
                if ($null -ne $script:GoalEditBox) {
                    [void]$script:GoalEditBox.Focus()
                    $script:GoalEditBox.SelectAll()
                    $script:GoalEditBox.BringIntoView()
                }
            } catch { }
        })
    }
}

function Show-GoalsWindow {
    $script:EditingGoal = $null
    $script:GoalsData = @(Read-GoalsData)
    $script:GoalsPath = (Join-Path $DataDir 'goals.json')

    if ($null -ne $script:GoalsWindow) {
        try { $script:GoalsWindow.Close() } catch { }
        $script:GoalsWindow = $null
    }

    $gw = New-GWindow ('教学助手 · 我的目标（{0} 条）' -f @($script:GoalsData).Count) 640 ([math]::Min(680, [math]::Max(420, $script:WorkHeight - 120))) -NoBar
    $win = $gw.Window
    $win.FontFamily = 'Microsoft YaHei'

    $grid = [System.Windows.Controls.Grid]::new()
    $grid.Margin = [System.Windows.Thickness]::new(16, 14, 16, 14)
    $r0 = [System.Windows.Controls.RowDefinition]::new()
    $r0.Height = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
    $r1 = [System.Windows.Controls.RowDefinition]::new()
    $r1.Height = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
    $r2 = [System.Windows.Controls.RowDefinition]::new()
    $r2.Height = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $r3 = [System.Windows.Controls.RowDefinition]::new()
    $r3.Height = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
    [void]$grid.RowDefinitions.Add($r0)
    [void]$grid.RowDefinitions.Add($r1)
    [void]$grid.RowDefinitions.Add($r2)
    [void]$grid.RowDefinitions.Add($r3)

    $head = [System.Windows.Controls.Grid]::new()
    $hc1 = [System.Windows.Controls.ColumnDefinition]::new()
    $hc1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $hc2 = [System.Windows.Controls.ColumnDefinition]::new()
    $hc2.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
    [void]$head.ColumnDefinitions.Add($hc1)
    [void]$head.ColumnDefinitions.Add($hc2)
    $title = [System.Windows.Controls.TextBlock]::new()
    $title.Text = '我的目标'
    $title.FontSize = 17
    $title.FontWeight = [System.Windows.FontWeights]::SemiBold
    $title.Foreground = [System.Windows.Media.Brushes]::White
    [void]$head.Children.Add($title)
    $sub = [System.Windows.Controls.TextBlock]::new()
    $sub.Text = '拆成步骤，今天只推进一步'
    $sub.FontSize = 11
    $sub.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $sub.Margin = [System.Windows.Thickness]::new(10, 2, 0, 0)
    $sub.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
    [System.Windows.Controls.Grid]::SetColumn($sub, 1)
    [void]$head.Children.Add($sub)
    [System.Windows.Controls.Grid]::SetRow($head, 0)
    [void]$grid.Children.Add($head)

    $addBar = [System.Windows.Controls.Grid]::new()
    $addBar.Margin = [System.Windows.Thickness]::new(0, 12, 0, 12)
    $bc1 = [System.Windows.Controls.ColumnDefinition]::new()
    $bc1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $bc2 = [System.Windows.Controls.ColumnDefinition]::new()
    $bc2.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
    [void]$addBar.ColumnDefinitions.Add($bc1)
    [void]$addBar.ColumnDefinitions.Add($bc2)
    $newBox = [System.Windows.Controls.TextBox]::new()
    $newBox.FontSize = 13
    $newBox.Height = 32
    $newBox.Padding = [System.Windows.Thickness]::new(10, 4, 10, 4)
    $newBox.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 30, 35, 44))
    $newBox.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 232, 238, 246))
    $newBox.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(60, 255, 255, 255))
    $newBox.BorderThickness = [System.Windows.Thickness]::new(1)
    $newBox.VerticalContentAlignment = [System.Windows.VerticalAlignment]::Center
    $newBox.ToolTip = '写清"做什么、什么时候能算完成"，回车添加'
    [System.Windows.Controls.Grid]::SetColumn($newBox, 0)
    [void]$addBar.Children.Add($newBox)
    $newBtn = [System.Windows.Controls.Button]::new()
    $newBtn.Content = '添加目标'
    $newBtn.FontSize = 12
    $newBtn.Padding = [System.Windows.Thickness]::new(16, 6, 16, 6)
    $newBtn.Margin = [System.Windows.Thickness]::new(8, 0, 0, 0)
    $newBtn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 59, 130, 246))
    $newBtn.Foreground = [System.Windows.Media.Brushes]::White
    $newBtn.BorderThickness = [System.Windows.Thickness]::new(0)
    $newBtn.Cursor = [System.Windows.Input.Cursors]::Hand
    [System.Windows.Controls.Grid]::SetColumn($newBtn, 1)
    [void]$addBar.Children.Add($newBtn)
    [System.Windows.Controls.Grid]::SetRow($addBar, 1)
    [void]$grid.Children.Add($addBar)

    $script:GoalsStack = [System.Windows.Controls.StackPanel]::new()
    $script:GoalsScroll = [System.Windows.Controls.ScrollViewer]::new()
    $script:GoalsScroll.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Auto
    $script:GoalsScroll.Padding = [System.Windows.Thickness]::new(0, 0, 4, 0)
    $script:GoalsScroll.Content = $script:GoalsStack
    [System.Windows.Controls.Grid]::SetRow($script:GoalsScroll, 2)
    [void]$grid.Children.Add($script:GoalsScroll)

    $foot = [System.Windows.Controls.StackPanel]::new()
    $foot.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $foot.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    $foot.Margin = [System.Windows.Thickness]::new(0, 10, 0, 0)
    $footHint = [System.Windows.Controls.TextBlock]::new()
    $footHint.Text = '勾选步骤自动保存 · 关窗不丢'
    $footHint.FontSize = 11
    $footHint.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $footHint.Margin = [System.Windows.Thickness]::new(0, 0, 12, 0)
    $footHint.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(140, 255, 255, 255))
    [void]$foot.Children.Add($footHint)
    $close = [System.Windows.Controls.Button]::new()
    $close.Content = '关闭'
    $close.FontSize = 12
    $close.Padding = [System.Windows.Thickness]::new(16, 5, 16, 5)
    $close.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 46, 52, 62))
    $close.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 226, 233, 242))
    $close.BorderThickness = [System.Windows.Thickness]::new(0)
    $close.Cursor = [System.Windows.Input.Cursors]::Hand
    $close.Add_Click({ try { $script:GoalsWindow.Close() } catch { } })
    [void]$foot.Children.Add($close)
    [System.Windows.Controls.Grid]::SetRow($foot, 3)
    [void]$grid.Children.Add($foot)

    $script:GoalsNewBox = $newBox
    $newBtn.Add_Click({
        $text = [string]$script:GoalsNewBox.Text
        if ([string]::IsNullOrWhiteSpace($text)) { return }
        $nowIso = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
        $n = @($script:GoalsData).Count + 1
        $script:GoalsData = @($script:GoalsData) + @([pscustomobject]@{
            id = ('g{0}' -f $n); text = $text.Trim(); createdAt = $nowIso; status = 'active'; steps = @(); stepSeq = 0
        })
        if (Save-GoalsData) {
            $script:GoalsNewBox.Text = ''
            Rebuild-GoalsPanel
            $script:GoalsWindow.Title = ('教学助手 · 我的目标（{0} 条）' -f @($script:GoalsData).Count)
        }
    })
    $newBox.Add_KeyDown({
        param($s, $e)
        if ($e.Key -ne [System.Windows.Input.Key]::Enter) { return }
        $e.Handled = $true
        $text = [string]$s.Text
        if ([string]::IsNullOrWhiteSpace($text)) { return }
        $nowIso = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
        $n = @($script:GoalsData).Count + 1
        $script:GoalsData = @($script:GoalsData) + @([pscustomobject]@{
            id = ('g{0}' -f $n); text = $text.Trim(); createdAt = $nowIso; status = 'active'; steps = @(); stepSeq = 0
        })
        if (Save-GoalsData) {
            $s.Text = ''
            Rebuild-GoalsPanel
            $script:GoalsWindow.Title = ('教学助手 · 我的目标（{0} 条）' -f @($script:GoalsData).Count)
        }
    })

    $gw.Body.Content = $grid
    $win.Add_Closed({
        $script:GoalsWindow = $null
        $script:GoalsStack = $null
        $script:GoalsScroll = $null
        $script:EditingGoal = $null
        $script:GoalEditBox = $null
    })
    $script:GoalsWindow = $win
    [void]$win.Show()
    Rebuild-GoalsPanel
    [void]$newBox.Focus()
}

# 通用窗口外壳：无边框 + 圆角 + 自绘标题栏 + 投影。
# 之前每个窗口都是系统标题栏 + 直角边框，跟深色面板不是一套视觉。
# 返回 @{ Window; Body; Shell; Title; CloseButton }，调用方把内容塞进 Body.Content。
function New-GWindow([string]$Caption, [double]$Width = 640.0, [double]$Height = 460.0, [switch]$NoBar) {
    $win = [System.Windows.Window]::new()
    $win.WindowStyle = [System.Windows.WindowStyle]::None
    $win.AllowsTransparency = $true
    $win.Background = [System.Windows.Media.Brushes]::Transparent
    $win.Topmost = $true
    $win.Width = $Width
    $win.Height = $Height
    $win.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
    $win.FontFamily = 'Microsoft YaHei'
    $win.Foreground = $script:G.Text

    $shell = [System.Windows.Controls.Border]::new()
    $shell.CornerRadius = [System.Windows.CornerRadius]::new([double]$script:G.RadWin)
    $shell.Background = $script:G.Card
    $shell.BorderBrush = $script:G.Line
    $shell.BorderThickness = [System.Windows.Thickness]::new(1)
    $shell.Margin = [System.Windows.Thickness]::new(12)
    Add-GShadow $shell 30 0.55 | Out-Null

    $dock = [System.Windows.Controls.DockPanel]::new()
    $shell.Child = $dock

    $bar = [System.Windows.Controls.Grid]::new()
    $bar.Height = 44
    $bar.Margin = [System.Windows.Thickness]::new(16, 6, 10, 0)
    $bar.Tag = $win
    $bar.Add_MouseLeftButtonDown({
        param($s, $e)
        if ($e.ChangedButton -ne [System.Windows.Input.MouseButton]::Left) { return }
        try { $s.Tag.DragMove() } catch { }
    })
    $tCol = [System.Windows.Controls.ColumnDefinition]::new()
    $tCol.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $bCol = [System.Windows.Controls.ColumnDefinition]::new()
    $bCol.Width = [System.Windows.GridLength]::Auto
    [void]$bar.ColumnDefinitions.Add($tCol)
    [void]$bar.ColumnDefinitions.Add($bCol)

    $title = [System.Windows.Controls.TextBlock]::new()
    $title.Text = $Caption
    $title.FontSize = 14
    $title.FontWeight = [System.Windows.FontWeights]::SemiBold
    $title.Foreground = $script:G.Text
    $title.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $title.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
    [System.Windows.Controls.Grid]::SetColumn($title, 0)
    [void]$bar.Children.Add($title)

    $closeBtn = New-GTextButton '✕' '关闭' 13
    $closeBtn.Tag = $win
    $closeBtn.Add_PreviewMouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        try { $s.Tag.Close() } catch { }
    })
    [System.Windows.Controls.Grid]::SetColumn($closeBtn, 1)
    [void]$bar.Children.Add($closeBtn)

    [System.Windows.Controls.DockPanel]::SetDock($bar, [System.Windows.Controls.Dock]::Top)
    [void]$dock.Children.Add($bar)

    $body = [System.Windows.Controls.ContentControl]::new()
    [System.Windows.Controls.DockPanel]::SetDock($body, [System.Windows.Controls.Dock]::Bottom)
    [void]$dock.Children.Add($body)

    if ($NoBar) {
        $bar.Visibility = [System.Windows.Visibility]::Collapsed
        $bar.Height = 0
    }

    $win.Content = $shell
    return @{ Window = $win; Body = $body; Shell = $shell; Title = $title; CloseButton = $closeBtn; Bar = $bar }
}

# 面板从右侧滑入 + 淡入：只在每次「小球 → 面板」切换时播一次，
# 不放在 tick 里，否则每 1 秒都会重播一次。
function Show-PanelIntro {
    $el = $script:PanelOuter
    if ($null -eq $el) { return }
    try {
        $tt = [System.Windows.Media.TranslateTransform]::new(16.0, 0.0)
        $el.RenderTransform = $tt
        $fade = [System.Windows.Media.Animation.DoubleAnimation]::new(0.0, 1.0, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(170)))
        $ease = [System.Windows.Media.Animation.CubicEase]::new()
        $ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
        $fade.EasingFunction = $ease
        $el.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $fade)
        $slide = [System.Windows.Media.Animation.DoubleAnimation]::new(16.0, 0.0, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(190)))
        $ease2 = [System.Windows.Media.Animation.CubicEase]::new()
        $ease2.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
        $slide.EasingFunction = $ease2
        $tt.BeginAnimation([System.Windows.Media.TranslateTransform]::XProperty, $slide)
    } catch {
        try { $el.Opacity = 1.0 } catch { }
    }
}

function New-PanelWindow {
    $window = [System.Windows.Window]::new()
    $window.WindowStyle = [System.Windows.WindowStyle]::None
    $window.AllowsTransparency = $true
    $window.Background = [System.Windows.Media.Brushes]::Transparent
    $window.Topmost = $true
    $window.ShowInTaskbar = $false
    $window.ShowActivated = $false
    $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
    # 窗口尺寸固定在最大档（344×1.8=620），内容靠右、按 LayoutTransform 缩放。
    # 这样拖动「大小」滑块时窗口不会在指针底下变宽/移位，拖动才不会被自己打断。
    $window.Width = 620
    $window.SizeToContent = [System.Windows.SizeToContent]::Height
    $window.MaxHeight = 1260
    $window.Left = $script:ScreenLeft + $script:ScreenWidth - 620 - 48
    $window.Top = $script:ScreenTop + 110

    $outer = [System.Windows.Controls.Border]::new()
    $outer.CornerRadius = [System.Windows.CornerRadius]::new([double]$script:G.RadWin)
    $outer.Background = $script:PanelBg
    $outer.BorderBrush = $script:G.Line
    $outer.BorderThickness = [System.Windows.Thickness]::new(1)
    $outer.Padding = [System.Windows.Thickness]::new(14, 12, 14, 12)
    $outer.Width = 344
    $outer.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    $outer.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
    # 右边与底部留出投影空间，否则窗口边界会把阴影裁成一条硬边。
    $outer.Margin = [System.Windows.Thickness]::new(0, 2, 6, 0)
    Add-GShadow $outer 26 0.5 | Out-Null

    $stack = [System.Windows.Controls.StackPanel]::new()
    $outer.Child = $stack

    # 底部操作条不跟着缩放：否则「大小」滑块会跟着自己变长，形成正反馈，
    # 一拖就直接冲到最大档。缩放只作用在上半部分的 $outer。
    $fixedStack = [System.Windows.Controls.StackPanel]::new()
    $bottom = [System.Windows.Controls.Border]::new()
    $bottom.CornerRadius = [System.Windows.CornerRadius]::new([double]$script:G.RadWin)
    $bottom.Background = $script:PanelBg
    $bottom.BorderBrush = $script:G.Line
    $bottom.BorderThickness = [System.Windows.Thickness]::new(1)
    $bottom.Padding = [System.Windows.Thickness]::new(14, 10, 14, 10)
    $bottom.Margin = [System.Windows.Thickness]::new(0, 6, 6, 12)
    $bottom.Width = 344
    $bottom.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    Add-GShadow $bottom 22 0.45 | Out-Null
    $bottom.Child = $fixedStack

    $root = [System.Windows.Controls.StackPanel]::new()
    $root.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    $root.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
    [void]$root.Children.Add($outer)
    [void]$root.Children.Add($bottom)

    $window.Content = $root
    $script:PanelOuter = $outer
    $script:PanelBottom = $bottom

    $header = [System.Windows.Controls.Grid]::new()
    $titleColumn = [System.Windows.Controls.ColumnDefinition]::new()
    $titleColumn.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $buttonColumn = [System.Windows.Controls.ColumnDefinition]::new()
    $buttonColumn.Width = [System.Windows.GridLength]::Auto
    [void]$header.ColumnDefinitions.Add($titleColumn)
    [void]$header.ColumnDefinitions.Add($buttonColumn)

    $title = [System.Windows.Controls.TextBlock]::new()
    $title.Text = '教学助手'
    $title.FontSize = 14
    $title.FontWeight = [System.Windows.FontWeights]::SemiBold
    $title.Foreground = [System.Windows.Media.Brushes]::White
    $title.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $title.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
    $title.MinWidth = 84
    $title.Cursor = [System.Windows.Input.Cursors]::SizeAll
    [System.Windows.Controls.Grid]::SetColumn($title, 0)
    [void]$header.Children.Add($title)

    $headerButtons = [System.Windows.Controls.StackPanel]::new()
    $headerButtons.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $headerButtons.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    [System.Windows.Controls.Grid]::SetColumn($headerButtons, 1)

    $clockPanel = [System.Windows.Controls.TextBlock]::new()
    $clockPanel.Text = '--:--'
    $clockPanel.FontSize = 12
    $clockPanel.Margin = [System.Windows.Thickness]::new(0, 0, 12, 0)
    $clockPanel.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(210, 255, 196, 120))
    $clockPanel.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $clockPanel.ToolTip = '当前时间（每秒刷新）'
    [void]$headerButtons.Children.Add($clockPanel)

    $chatLog = New-GTextButton '记录' '查看插件端最近的对话记录（谁说、从哪说、几点）'
    $chatLog.Margin = [System.Windows.Thickness]::new(0, 0, 2, 0)
    $chatLog.Add_PreviewMouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        try { Show-ChatLogWindow } catch { Write-Log ('chatlog window failed: ' + $_.Exception.Message) }
    })
    [void]$headerButtons.Children.Add($chatLog)

    # 清单按钮：卡片被 ✕ 收起来之后，靠这里再叫出来（点一下开/关）。
    $cardBtn = New-GTextButton '清单' '显示/收起右侧的今日清单'
    $cardBtn.Margin = [System.Windows.Thickness]::new(0, 0, 2, 0)
    $cardBtn.Add_PreviewMouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        Send-OverlayEvent @{ type = 'card_toggle' }
    })
    [void]$headerButtons.Children.Add($cardBtn)

    # 历史按钮：按天回看清单（数据来自插件的 plan-archive/）。
    $histBtn = New-GTextButton '历史' '按天回看清单：每天几点做了什么、做没做'
    $histBtn.Margin = [System.Windows.Thickness]::new(0, 0, 2, 0)
    $histBtn.Add_PreviewMouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        Write-Log 'history button clicked'
        try { Show-PlanHistoryWindow } catch { Write-Log ('plan history window failed: ' + $_.Exception.Message) }
    })
    [void]$headerButtons.Children.Add($histBtn)

    $goals = New-GTextButton '目标' '设置目标：一行一个，插件会按目标发「都市指令」'
    $goals.Margin = [System.Windows.Thickness]::new(0, 0, 2, 0)
    $goals.Add_PreviewMouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        try { Show-GoalsWindow } catch { Write-Log ('goals window failed: ' + $_.Exception.Message + ' @line ' + $_.InvocationInfo.ScriptLineNumber) }
    })
    [void]$headerButtons.Children.Add($goals)

    # 大小用滑块调（在 footer 下方单独一行），这里不再放按钮。

    $copy = New-GTextButton '⧉' '复制面板内容' 13.0
    $copy.Margin = [System.Windows.Thickness]::new(2, 0, 2, 0)
    $copy.Add_PreviewMouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        Copy-PanelText
    })
    [void]$headerButtons.Children.Add($copy)

    $collapse = New-GTextButton '—' '收起面板，回到小球' 14.0
    $collapse.Margin = [System.Windows.Thickness]::new(0, 0, 0, 0)
    [void]$headerButtons.Children.Add($collapse)
    [void]$header.Children.Add($headerButtons)

    $collapse.Add_PreviewMouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        Send-OverlayEvent @{ type = 'mode'; mode = 'ball' }
    })

    $title.Add_MouseLeftButtonDown({
        try { $script:PanelWindow.DragMove() } catch { }
    })

    [void]$stack.Children.Add($header)

    $body = [System.Windows.Controls.TextBox]::new()
    $body.TextWrapping = [System.Windows.TextWrapping]::Wrap
    $body.AcceptsReturn = $true
    $body.IsReadOnly = $true
    $body.IsReadOnlyCaretVisible = $false
    $body.IsUndoEnabled = $false
    $body.BorderThickness = [System.Windows.Thickness]::new(0)
    $body.Background = [System.Windows.Media.Brushes]::Transparent
    $body.Padding = [System.Windows.Thickness]::new(0)
    $body.FontSize = 13
    $body.Margin = [System.Windows.Thickness]::new(0, 10, 0, 0)
    $body.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Disabled
    $body.Cursor = [System.Windows.Input.Cursors]::IBeam
    $body.ToolTip = '可拖选后 Ctrl+C 复制，右键也有复制菜单'
    $body.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(238, 240, 243, 248))
    $bodyMenu = [System.Windows.Controls.ContextMenu]::new()
    $bodyCopyItem = [System.Windows.Controls.MenuItem]::new()
    $bodyCopyItem.Header = '复制选中'
    $bodyCopyItem.Add_Click({ if ($script:PanelBody.SelectionLength -gt 0) { [System.Windows.Clipboard]::SetText($script:PanelBody.SelectedText) } })
    $bodyCopyAll = [System.Windows.Controls.MenuItem]::new()
    $bodyCopyAll.Header = '复制全部'
    $bodyCopyAll.Add_Click({ Copy-PanelText })
    $bodySelectAll = [System.Windows.Controls.MenuItem]::new()
    $bodySelectAll.Header = '全选'
    $bodySelectAll.Add_Click({ $script:PanelBody.SelectAll() })
    [void]$bodyMenu.Items.Add($bodyCopyItem)
    [void]$bodyMenu.Items.Add($bodyCopyAll)
    [void]$bodyMenu.Items.Add($bodySelectAll)
    $body.ContextMenu = $bodyMenu
    [void]$stack.Children.Add($body)

    $steps = [System.Windows.Controls.StackPanel]::new()
    $stepsScroll = [System.Windows.Controls.ScrollViewer]::new()
    $stepsScroll.MaxHeight = 230
    $stepsScroll.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Auto
    $stepsScroll.Margin = [System.Windows.Thickness]::new(0, 8, 0, 0)
    $stepsScroll.Content = $steps
    [void]$stack.Children.Add($stepsScroll)

    # --- one obvious "next step" button + the always-on voice switch ------
    # The plan lives in panel.steps; this row is the mouse-only way through it
    # without typing anything into the chat box.
    $nextRow = [System.Windows.Controls.Grid]::new()
    $nextRow.Margin = [System.Windows.Thickness]::new(0, 10, 0, 0)
    $listenColumn = [System.Windows.Controls.ColumnDefinition]::new()
    $listenColumn.Width = [System.Windows.GridLength]::Auto
    $nextColumn = [System.Windows.Controls.ColumnDefinition]::new()
    $nextColumn.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    [void]$nextRow.ColumnDefinitions.Add($listenColumn)
    [void]$nextRow.ColumnDefinitions.Add($nextColumn)

    $listenToggle = [System.Windows.Controls.CheckBox]::new()
    $listenToggle.Content = '常听'
    $listenToggle.FontSize = 12
    $listenToggle.Foreground = $script:DimBrush
    $listenToggle.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $listenToggle.Margin = [System.Windows.Thickness]::new(0, 0, 10, 0)
    $listenToggle.ToolTip = '常听：识别完一句就自动继续听下一句，直到你取消勾选'
    [System.Windows.Controls.Grid]::SetColumn($listenToggle, 0)
    $listenToggle.Add_Click({
        $on = [bool]$script:ListenToggle.IsChecked
        if ($null -ne $script:TrayListenItem) { $script:TrayListenItem.Checked = $on }
        Send-OverlayEvent @{ type = 'always_voice'; on = $on }
        if ($on) { Show-VoiceToast '常听已开启，说完自动继续听' } else { Show-VoiceToast '常听已关闭' }
    })
    [void]$nextRow.Children.Add($listenToggle)

    $advance = New-GPrimaryButton '下一步 ›' 13.0
    $advance.Margin = [System.Windows.Thickness]::new(0, 0, 0, 0)
    $advance.ToolTip = '按计划往前一步：面板走到下一步，并请模型标注要做的事'
    $advance.Add_PreviewMouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        Send-OverlayEvent @{ type = 'next_step' }
        Show-VoiceToast '已请求下一步…'
    })
    [System.Windows.Controls.Grid]::SetColumn($advance, 1)
    [void]$nextRow.Children.Add($advance)
    [void]$stack.Children.Add($nextRow)
    $script:ListenToggle = $listenToggle

    $footer = [System.Windows.Controls.Grid]::new()
    $footer.Margin = [System.Windows.Thickness]::new(0, 12, 0, 0)
    $footerLeft = [System.Windows.Controls.ColumnDefinition]::new()
    $footerLeft.Width = [System.Windows.GridLength]::Auto
    $footerRight = [System.Windows.Controls.ColumnDefinition]::new()
    $footerRight.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    [void]$footer.ColumnDefinitions.Add($footerLeft)
    [void]$footer.ColumnDefinitions.Add($footerRight)

    $buttons = [System.Windows.Controls.StackPanel]::new()
    $buttons.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    [System.Windows.Controls.Grid]::SetColumn($buttons, 0)

    $prev = New-PanelButton '◀'
    $prev.Add_Click({ Send-OverlayEvent @{ type = 'step'; delta = -1 } })
    $next = New-PanelButton '▶'
    $next.Add_Click({ Send-OverlayEvent @{ type = 'step'; delta = 1 } })
    $capture = New-PanelButton '读屏'
    $capture.Add_Click({ Start-Capture 'ball' 0 })
    $voice = New-PanelButton '说'
    $voice.Add_Click({ Send-OverlayEvent @{ type = 'listen' }; Show-VoiceToast '正在听…（说完会自动结束）' })
    $done = New-PanelButton '✓'
    $done.ToolTip = '完成'
    $done.Add_Click({ Send-OverlayEvent @{ type = 'done' } })

    [void]$buttons.Children.Add($prev)
    [void]$buttons.Children.Add($next)
    [void]$buttons.Children.Add($capture)
    [void]$buttons.Children.Add($voice)
    [void]$buttons.Children.Add($done)
    [void]$footer.Children.Add($buttons)

    $opacityGroup = [System.Windows.Controls.StackPanel]::new()
    $opacityGroup.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $opacityGroup.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    $opacityGroup.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    [System.Windows.Controls.Grid]::SetColumn($opacityGroup, 1)

    $opacityLabel = [System.Windows.Controls.TextBlock]::new()
    $opacityLabel.Text = '透明'
    $opacityLabel.FontSize = 12
    $opacityLabel.Foreground = $script:DimBrush
    $opacityLabel.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $opacityLabel.Margin = [System.Windows.Thickness]::new(0, 0, 6, 0)
    [void]$opacityGroup.Children.Add($opacityLabel)

    $slider = [System.Windows.Controls.Slider]::new()
    $slider.Minimum = 35
    $slider.Maximum = 100
    $slider.Value = 92
    $slider.Width = 88
    $slider.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    [void]$opacityGroup.Children.Add($slider)
    [void]$footer.Children.Add($opacityGroup)

    # --- size row: drag to resize the panel and the ball together --------
    # 拖动即时生效（-Quiet，不弹提示、不发事件），松手 0.4 秒后才把值发给宿主
    # 存盘，避免拖动过程中把 events.jsonl 刷成几千行。
    $sizeRow = [System.Windows.Controls.Grid]::new()
    $sizeRow.Margin = [System.Windows.Thickness]::new(0, 8, 0, 0)
    $sizeLabelCol = [System.Windows.Controls.ColumnDefinition]::new()
    $sizeLabelCol.Width = [System.Windows.GridLength]::new(28)
    $sizeSliderCol = [System.Windows.Controls.ColumnDefinition]::new()
    $sizeSliderCol.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $sizeValueCol = [System.Windows.Controls.ColumnDefinition]::new()
    $sizeValueCol.Width = [System.Windows.GridLength]::new(42)
    [void]$sizeRow.ColumnDefinitions.Add($sizeLabelCol)
    [void]$sizeRow.ColumnDefinitions.Add($sizeSliderCol)
    [void]$sizeRow.ColumnDefinitions.Add($sizeValueCol)

    $sizeLabel = [System.Windows.Controls.TextBlock]::new()
    $sizeLabel.Text = '大小'
    $sizeLabel.FontSize = 12
    $sizeLabel.Foreground = $script:DimBrush
    $sizeLabel.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    [System.Windows.Controls.Grid]::SetColumn($sizeLabel, 0)
    [void]$sizeRow.Children.Add($sizeLabel)

    $sizeSlider = [System.Windows.Controls.Slider]::new()
    $sizeSlider.Minimum = 70
    $sizeSlider.Maximum = 180
    $sizeSlider.Value = 100
    $sizeSlider.TickFrequency = 10
    $sizeSlider.IsSnapToTickEnabled = $false
    $sizeSlider.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $sizeSlider.Margin = [System.Windows.Thickness]::new(0, 0, 8, 0)
    $sizeSlider.ToolTip = '拖动调整面板和悬浮球的大小（70%–180%），也可以把鼠标放在球上按住 Ctrl 滚滚轮'
    [System.Windows.Controls.Grid]::SetColumn($sizeSlider, 1)
    [void]$sizeRow.Children.Add($sizeSlider)

    $sizeValue = [System.Windows.Controls.TextBlock]::new()
    $sizeValue.Text = '100%'
    $sizeValue.FontSize = 12
    $sizeValue.Foreground = $script:DimBrush
    $sizeValue.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $sizeValue.TextAlignment = [System.Windows.TextAlignment]::Right
    [System.Windows.Controls.Grid]::SetColumn($sizeValue, 2)
    [void]$sizeRow.Children.Add($sizeValue)

    $sizeSlider.Add_ValueChanged({
        if ($script:SuppressSize) { return }
        $pct = [double]$script:SizeSlider.Value
        Apply-UiScale ($pct / 100.0) -Quiet -FromSlider
        if ($null -ne $script:SizeValue) { $script:SizeValue.Text = ('{0:0}%' -f $pct) }
        $script:SizeTimer.Stop()
        $script:SizeTimer.Start()
    })

    $script:SizeTimer = [System.Windows.Threading.DispatcherTimer]::new()
    $script:SizeTimer.Interval = [TimeSpan]::FromMilliseconds(400)
    $script:SizeTimer.Add_Tick({
        $script:SizeTimer.Stop()
        Send-OverlayEvent @{ type = 'ui_scale'; scale = [double]$script:UiScale }
    })

    # --- chat row: type a goal / question, Enter sends to the model ------
    $askRow = [System.Windows.Controls.Grid]::new()
    $askRow.Margin = [System.Windows.Thickness]::new(0, 10, 0, 0)
    $askLeft = [System.Windows.Controls.ColumnDefinition]::new()
    $askLeft.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $askRight = [System.Windows.Controls.ColumnDefinition]::new()
    $askRight.Width = [System.Windows.GridLength]::Auto
    [void]$askRow.ColumnDefinitions.Add($askLeft)
    [void]$askRow.ColumnDefinitions.Add($askRight)

    $inputBox = [System.Windows.Controls.TextBox]::new()
    $inputBox.FontSize = 13
    $inputBox.Height = 30
    $inputBox.Padding = [System.Windows.Thickness]::new(8, 4, 8, 4)
    $inputBox.BorderThickness = [System.Windows.Thickness]::new(0)
    $inputBox.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(38, 255, 255, 255))
    $inputBox.Foreground = [System.Windows.Media.Brushes]::White
    $inputBox.CaretBrush = [System.Windows.Media.Brushes]::White
    $inputBox.VerticalContentAlignment = [System.Windows.VerticalAlignment]::Center
    [System.Windows.Controls.Grid]::SetColumn($inputBox, 0)

    $ghost = [System.Windows.Controls.TextBlock]::new()
    $ghost.Text = '说点什么，或写下目标…（回车发送）'
    $ghost.FontSize = 12
    $ghost.Margin = [System.Windows.Thickness]::new(9, 0, 0, 0)
    $ghost.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $ghost.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(120, 210, 220, 235))
    $ghost.IsHitTestVisible = $false
    [System.Windows.Controls.Grid]::SetColumn($ghost, 0)
    [void]$askRow.Children.Add($inputBox)
    [void]$askRow.Children.Add($ghost)

    $send = New-PanelButton '发送'
    $send.Margin = [System.Windows.Thickness]::new(6, 0, 0, 0)
    [System.Windows.Controls.Grid]::SetColumn($send, 1)
    [void]$askRow.Children.Add($send)
    [void]$fixedStack.Children.Add($askRow)

    $script:AskInput = $inputBox
    $script:AskGhost = $ghost

    $inputBox.Add_TextChanged({
        if ([string]::IsNullOrEmpty($script:AskInput.Text)) {
            $script:AskGhost.Visibility = [System.Windows.Visibility]::Visible
        }
        else {
            $script:AskGhost.Visibility = [System.Windows.Visibility]::Collapsed
        }
    })
    $inputBox.Add_KeyDown({
        param($sender, $keyArgs)
        if ($keyArgs.Key -eq [System.Windows.Input.Key]::Return) {
            Send-AskMessage
            $keyArgs.Handled = $true
        }
    })
    # Ctrl+V: WPF handles it natively once the box has focus, but a layered
    # topmost window can be picky, so paste explicitly instead.
    $inputBox.Add_PreviewKeyDown({
        param($sender, $keyArgs)
        if ($keyArgs.Key -eq [System.Windows.Input.Key]::V -and
            ([System.Windows.Input.Keyboard]::Modifiers -band [System.Windows.Input.ModifierKeys]::Control)) {
            Paste-AskInput
            $keyArgs.Handled = $true
        }
    })
    $askMenu = [System.Windows.Controls.ContextMenu]::new()
    foreach ($entry in @(
            @{ label = '粘贴'; action = { Paste-AskInput } },
            @{ label = '复制'; action = { if ($script:AskInput.SelectionLength -gt 0) { [System.Windows.Clipboard]::SetText($script:AskInput.SelectedText) } } },
            @{ label = '全选'; action = { $script:AskInput.SelectAll() } },
            @{ label = '清空'; action = { $script:AskInput.Text = '' } })) {
        $item = [System.Windows.Controls.MenuItem]::new()
        $item.Header = $entry.label
        $handler = $entry.action
        $item.Add_Click($handler)
        [void]$askMenu.Items.Add($item)
    }
    $inputBox.ContextMenu = $askMenu
    $inputBox.ToolTip = '右键可粘贴 / 复制；回车发送'
    $inputBox.Add_PreviewMouseLeftButtonDown({
        param($sender, $mouseArgs)
        try { $script:PanelWindow.Activate() } catch { }
        $script:AskInput.Focus() | Out-Null
    })
    $send.Add_Click({ Send-AskMessage })

    [void]$fixedStack.Children.Add($footer)
    [void]$fixedStack.Children.Add($sizeRow)

    $window.Show()
    $handle = [System.Windows.Interop.WindowInteropHelper]::new($window).Handle
    [GuideNative]::MakePanel($handle)
    [GuideNative]::Raise($handle)

    $script:PanelWindow = $window
    $script:PanelTitle = $title
    $script:PanelBody = $body
    $script:PanelSteps = $steps
    $script:PanelClock = $clockPanel
    $script:PanelOuter = $outer
    $script:SizeSlider = $sizeSlider
    $script:SizeValue = $sizeValue
    $script:SuppressSize = $false
    $script:OpacitySlider = $slider
    $script:SuppressSlider = $false

    $script:OpacityTimer = [System.Windows.Threading.DispatcherTimer]::new()
    $script:OpacityTimer.Interval = [TimeSpan]::FromMilliseconds(350)
    $script:OpacityTimer.Add_Tick({
        $script:OpacityTimer.Stop()
        Send-OverlayEvent @{ type = 'opacity'; value = [double]($script:OpacitySlider.Value / 100.0) }
    })

    $slider.Add_ValueChanged({
        if ($script:SuppressSlider) { return }
        $value = [double]$script:OpacitySlider.Value
        $alpha = [byte][math]::Round(($value / 100.0) * 255.0)
        $script:PanelBg.Color = [System.Windows.Media.Color]::FromArgb($alpha, 20, 24, 30)
        $script:OpacityTimer.Stop()
        $script:OpacityTimer.Start()
    })
}

# --- subtitle window -----------------------------------------------------
# Spoken replies raise a caption that grows character by character in step with
# the audio. It parks next to whatever the screen currently points at (the last
# annotation box, else the panel) and falls back to the bottom centre of the
# virtual desktop when nothing is marked.
# --- 大小（缩放）与时钟 ---------------------------------------------------
# 面板和球共用一个缩放值：面板底部的「大小」滑块拖动，球上 Ctrl+滚轮微调。
# 值会发给宿主存进 state.json（panel.uiScale），重启后还在。
$script:UiScale = 1.0

function Apply-UiScale([double]$scale, [switch]$Quiet, [switch]$FromSlider) {
    if ($scale -lt 0.7) { $scale = 0.7 }
    if ($scale -gt 1.8) { $scale = 1.8 }
    $script:UiScale = $scale

    # 只改内容缩放：面板窗口固定 620 宽、靠右锚定，窗口本身不动，
    # 否则拖动滑块时窗口会在指针下变宽挪位，把拖动打断。
    if ($null -ne $script:PanelOuter) {
        $script:PanelOuter.LayoutTransform = [System.Windows.Media.ScaleTransform]::new($scale, $scale)
    }
    if ($null -ne $script:BallStack) {
        $script:BallStack.LayoutTransform = [System.Windows.Media.ScaleTransform]::new($scale, $scale)
    }
    if ($null -ne $script:BallWindow) {
        $script:BallWindow.Width = [double][math]::Round(64 * $scale)
        $script:BallWindow.Height = [double][math]::Round(88 * $scale)
    }
    # 滑块与百分数跟着走（来自 state 或滚轮时也要同步）。
    # 拖动滑块自己触发时不能回写 Value：一写就把 Thumb 的拖动状态打断，
    # 表现为"拖一下只动 1%"。那种情况下只更新右边的百分数。
    if ($null -ne $script:SizeSlider -and -not $FromSlider) {
        $script:SuppressSize = $true
        try {
            $script:SizeSlider.Value = [double][math]::Round($scale * 100)
        }
        finally { $script:SuppressSize = $false }
    }
    if ($null -ne $script:SizeValue) { $script:SizeValue.Text = ('{0:0}%' -f ($scale * 100)) }
    if (-not $Quiet) {
        Send-OverlayEvent @{ type = 'ui_scale'; scale = $scale }
    }
}

# 滚轮微调：一档 5%，走同一条 Apply-UiScale。
function Adjust-UiScale([double]$deltaPercent) {
    $next = [math]::Round(($script:UiScale * 100) + $deltaPercent)
    Apply-UiScale ($next / 100.0)
}



# --- plan history ---------------------------------------------------------
# 「历史」按钮：按天回看清单。数据由插件写进 plan-history.json，这里只读。
# 卡片只管今天；昨天/前天的清单要能翻出来，靠的就是这份归档。
# 「昨天 / 前天 / N 天前」：让历史里的日期一眼能对上日子。
function Get-PlanDayLabel($dateStr) {
    try {
        $d = [datetime]::ParseExact([string]$dateStr, 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture)
        $n = ([datetime]::Now.Date - $d.Date).Days
        if ($n -lt 0) { return '' }
        if ($n -eq 0) { return '今天' }
        if ($n -eq 1) { return '昨天' }
        if ($n -eq 2) { return '前天' }
        if ($n -le 6) { return ('{0} 天前' -f $n) }
        return ''
    } catch { return '' }
}

function New-HistoryDayButton($day) {
    $btn = [System.Windows.Controls.Border]::new()
    $btn.CornerRadius = [System.Windows.CornerRadius]::new(8)
    $btn.Padding = [System.Windows.Thickness]::new(10, 7, 10, 7)
    $btn.Margin = [System.Windows.Thickness]::new(0, 0, 0, 6)
    $btn.Cursor = [System.Windows.Input.Cursors]::Hand
    $btn.Tag = $day

    $grid = [System.Windows.Controls.Grid]::new()
    $c0 = [System.Windows.Controls.ColumnDefinition]::new()
    $c0.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $c1 = [System.Windows.Controls.ColumnDefinition]::new()
    $c1.Width = [System.Windows.GridLength]::new(46, [System.Windows.GridUnitType]::Pixel)
    [void]$grid.ColumnDefinitions.Add($c0)
    [void]$grid.ColumnDefinitions.Add($c1)

    $d = [System.Windows.Controls.TextBlock]::new()
    $d.FontSize = 12.5
    $d.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
    $d.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(235, 255, 255, 255))
    [void]$d.Inlines.Add([System.Windows.Documents.Run]::new([string]$day.date))
    $rel = Get-PlanDayLabel $day.date
    if (-not [string]::IsNullOrWhiteSpace($rel)) {
        $runRel = [System.Windows.Documents.Run]::new('　' + $rel)
        $runRel.FontSize = 10.5
        $runRel.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(175, 255, 196, 120))
        [void]$d.Inlines.Add($runRel)
    }
    [System.Windows.Controls.Grid]::SetColumn($d, 0)
    [void]$grid.Children.Add($d)

    $c = [System.Windows.Controls.TextBlock]::new()
    $c.Text = ('{0}/{1}' -f [int]$day.done, [int]$day.total)
    $c.FontSize = 11
    $c.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    $c.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 196, 120))
    [System.Windows.Controls.Grid]::SetColumn($c, 1)
    [void]$grid.Children.Add($c)

    $btn.Child = $grid
    return $btn
}

function Show-PlanDayDetail($day, $detailPanel) {
        $detailPanel.Children.Clear()
        $head = [System.Windows.Controls.TextBlock]::new()
        $rel = Get-PlanDayLabel $day.date
        if ([string]::IsNullOrWhiteSpace($rel)) {
            $head.Text = ('{0}　完成 {1}/{2}' -f $day.date, [int]$day.done, [int]$day.total)
        } else {
            $head.Text = ('{0}（{1}）　完成 {2}/{3}' -f $day.date, $rel, [int]$day.done, [int]$day.total)
        }
        $head.FontSize = 13
        $head.FontWeight = [System.Windows.FontWeights]::SemiBold
        $head.Margin = [System.Windows.Thickness]::new(0, 0, 0, 8)
        [void]$detailPanel.Children.Add($head)

        $items = @()
        if ($null -ne $day.items) { $items = @($day.items) }
        if ($items.Count -eq 0) {
            $none = [System.Windows.Controls.TextBlock]::new()
            $none.Text = '这天没有排清单。'
            $none.FontSize = 12
            $none.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(140, 255, 255, 255))
            [void]$detailPanel.Children.Add($none)
            return
        }

        foreach ($it in $items) {
            $row = [System.Windows.Controls.Grid]::new()
            $row.Margin = [System.Windows.Thickness]::new(0, 0, 0, 7)
            $g0 = [System.Windows.Controls.ColumnDefinition]::new()
            $g0.Width = [System.Windows.GridLength]::new(18, [System.Windows.GridUnitType]::Pixel)
            $g1 = [System.Windows.Controls.ColumnDefinition]::new()
            $g1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
            [void]$row.ColumnDefinitions.Add($g0)
            [void]$row.ColumnDefinitions.Add($g1)

            $mark = [System.Windows.Controls.TextBlock]::new()
            $mark.Text = if ($it.done -eq $true) { '☑' } else { '☐' }
            $mark.FontSize = 12
            $mark.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
            $mark.Foreground = if ($it.done -eq $true) {
                [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(200, 110, 214, 140))
            } else {
                [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(210, 255, 196, 120))
            }
            [System.Windows.Controls.Grid]::SetColumn($mark, 0)
            [void]$row.Children.Add($mark)

            $wrap = [System.Windows.Controls.StackPanel]::new()
            $line1 = [System.Windows.Controls.TextBlock]::new()
            $span = ''
            if (-not [string]::IsNullOrWhiteSpace([string]$it.from)) {
                $span = [string]$it.from
                if (-not [string]::IsNullOrWhiteSpace([string]$it.to)) { $span = $span + '–' + [string]$it.to }
            }
            $where = ''
            if (-not [string]::IsNullOrWhiteSpace([string]$it.place)) { $where = ' @ ' + [string]$it.place }
            $line1.Text = ($span + $where)
            $line1.FontSize = 10.5
            $line1.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
            [void]$wrap.Children.Add($line1)

            $line2 = [System.Windows.Controls.TextBlock]::new()
            $line2.Text = [string]$it.title
            $line2.FontSize = 12.5
            $line2.TextWrapping = [System.Windows.TextWrapping]::Wrap
            if ($it.done -eq $true) {
                $line2.TextDecorations = [System.Windows.TextDecorations]::Strikethrough
                $line2.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(130, 255, 255, 255))
            }
            [void]$wrap.Children.Add($line2)

            [System.Windows.Controls.Grid]::SetColumn($wrap, 1)
            [void]$row.Children.Add($wrap)
            [void]$detailPanel.Children.Add($row)
        }
    }


function Show-PlanHistoryWindow {
    $path = Join-Path $DataDir 'plan-history.json'
    $days = @()
    try {
        if (Test-Path $path) {
            $raw = Get-Content -Path $path -Raw -Encoding UTF8
            if (-not [string]::IsNullOrWhiteSpace($raw)) {
                $parsed = $raw | ConvertFrom-Json
                if ($null -ne $parsed -and $null -ne $parsed.days) { $days = @($parsed.days) }
            }
        }
    } catch {
        $days = @()
    }

    if ($null -ne $script:PlanHistoryWindow) {
        try { $script:PlanHistoryWindow.Close() } catch { }
        $script:PlanHistoryWindow = $null
    }

    $gw = New-GWindow ('教学助手 · 清单历史（{0} 天）' -f $days.Count) 700 520
    $win = $gw.Window
    $win.FontFamily = 'Microsoft YaHei'

    $root = [System.Windows.Controls.Grid]::new()
    $root.Margin = [System.Windows.Thickness]::new(14, 12, 14, 12)
    $rc0 = [System.Windows.Controls.ColumnDefinition]::new()
    $rc0.Width = [System.Windows.GridLength]::new(205, [System.Windows.GridUnitType]::Pixel)
    $rc1 = [System.Windows.Controls.ColumnDefinition]::new()
    $rc1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    [void]$root.ColumnDefinitions.Add($rc0)
    [void]$root.ColumnDefinitions.Add($rc1)

    # 左：日期列表
    $leftScroll = [System.Windows.Controls.ScrollViewer]::new()
    $leftScroll.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Auto
    $leftScroll.Margin = [System.Windows.Thickness]::new(0, 0, 10, 0)
    $dayList = [System.Windows.Controls.StackPanel]::new()
    $leftScroll.Content = $dayList
    [System.Windows.Controls.Grid]::SetColumn($leftScroll, 0)
    [void]$root.Children.Add($leftScroll)

    # 右：当天明细
    $rightScroll = [System.Windows.Controls.ScrollViewer]::new()
    $rightScroll.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Auto
    $detail = [System.Windows.Controls.StackPanel]::new()
    $rightScroll.Content = $detail
    [System.Windows.Controls.Grid]::SetColumn($rightScroll, 1)
    [void]$root.Children.Add($rightScroll)

    $script:HistoryButtons = @()
    $script:HistoryDetailPanel = $detail

    if ($days.Count -eq 0) {
        $empty = [System.Windows.Controls.TextBlock]::new()
        $empty.Text = '还没有历史。今天排好清单、或跨过一天之后，这里就会有记录。'
        $empty.FontSize = 12
        $empty.TextWrapping = [System.Windows.TextWrapping]::Wrap
        $empty.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
        [void]$detail.Children.Add($empty)
    } else {
        $first = $null
        foreach ($day in $days) {
            $btn = New-HistoryDayButton $day
            $btn.Tag = $day
            $btn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(22, 255, 255, 255))
            $btn.Add_MouseLeftButtonUp({
                param($s, $e)
                try {
                    $picked = $s.Tag
                    foreach ($b in @($script:HistoryButtons)) {
                        if ($null -eq $b) { continue }
                        $b.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(22, 255, 255, 255))
                    }
                    $s.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(60, 255, 120, 60))
                    Write-Log ('history day picked: ' + [string]$picked.date)
                    Show-PlanDayDetail $picked $script:HistoryDetailPanel
                }
                catch {
                    Write-Log ('history day failed: ' + $_.Exception.Message)
                }
            })
            [void]$dayList.Children.Add($btn)
            $script:HistoryButtons += $btn
            if ($null -eq $first) { $first = $day }
        }
        $script:HistoryDetail = $detail
        Show-PlanDayDetail $first $detail
    }

    $script:HistoryDetail = $detail
    $gw.Body.Content = $root
    $win.Add_Closed({ $script:PlanHistoryWindow = $null })
    $script:PlanHistoryWindow = $win
    [void]$win.Show()
}

# 卡片上的「＋」按钮：让用户自己往清单里加一条，不用等模型排。
function New-AddField([string]$label, [string]$value, [string]$hint) {
    $row = [System.Windows.Controls.Grid]::new()
    $row.Margin = [System.Windows.Thickness]::new(0, 0, 0, 9)
    $c0 = [System.Windows.Controls.ColumnDefinition]::new()
    $c0.Width = [System.Windows.GridLength]::new(52, [System.Windows.GridUnitType]::Pixel)
    $c1 = [System.Windows.Controls.ColumnDefinition]::new()
    $c1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    [void]$row.ColumnDefinitions.Add($c0)
    [void]$row.ColumnDefinitions.Add($c1)

    $name = [System.Windows.Controls.TextBlock]::new()
    $name.Text = $label
    $name.FontSize = 12
    $name.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $name.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(160, 255, 255, 255))
    [System.Windows.Controls.Grid]::SetColumn($name, 0)
    [void]$row.Children.Add($name)

    $box = [System.Windows.Controls.TextBox]::new()
    $box.Text = $value
    $box.FontSize = 12.5
    $box.Padding = [System.Windows.Thickness]::new(7, 5, 7, 5)
    $box.BorderThickness = [System.Windows.Thickness]::new(0)
    $box.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 32, 36, 44))
    $box.Foreground = [System.Windows.Media.Brushes]::White
    $box.CaretBrush = [System.Windows.Media.Brushes]::White
    $box.ToolTip = $hint
    [System.Windows.Controls.Grid]::SetColumn($box, 1)
    [void]$row.Children.Add($box)

    return @{ Row = $row; Box = $box }
}

function Show-AddTaskWindow {
    param($EditItem, $DefaultFrom, $PrefillTitle)
    if ($null -ne $script:AddTaskWindow -and $script:AddTaskWindow.IsVisible) {
        $script:AddTaskWindow.Activate()
        return
    }

    # 默认时间：现在往后 5 分钟，向上取到 5 的整数倍。
    $now = Get-Date
    $baseMin = ($now.Hour * 60 + $now.Minute) + 5
    $baseMin = [int]([math]::Ceiling($baseMin / 5.0) * 5)
    if ($baseMin -gt (23 * 60 + 59)) { $baseMin = 23 * 60 }
    $h = [int][math]::Floor($baseMin / 60)
    $m = [int]($baseMin % 60)
    $fromText = ('{0:00}:{1:00}' -f $h, $m)
    $endMin = [math]::Min($baseMin + 25, 23 * 60 + 59)
    $toText = ('{0:00}:{1:00}' -f [int][math]::Floor($endMin / 60), [int]($endMin % 60))

    # 传了 $EditItem 就是"改这条"：用它的时间/地点/标题预填，保存时发 plan_update。
    $editing = $null -ne $EditItem
    $initPlace = ''
    $initTitle = ''
    $initNote = ''
    $initPri = ''
    $initRepeat = ''
    if ($editing) {
        if (-not [string]::IsNullOrWhiteSpace([string]$EditItem.from)) { $fromText = [string]$EditItem.from }
        if (-not [string]::IsNullOrWhiteSpace([string]$EditItem.to)) { $toText = [string]$EditItem.to }
        $initPlace = [string]$EditItem.place
        $initTitle = [string]$EditItem.title
        $initNote = [string]$EditItem.note
        $initPri = [string]$EditItem.priority
        $initRepeat = [string]$EditItem.repeat
    }
    if (-not $editing -and -not [string]::IsNullOrWhiteSpace([string]$PrefillTitle)) { $initTitle = [string]$PrefillTitle }

    # 从空档行的「＋」进来时，用那一段的开始时间当默认值。
    if (-not $editing -and -not [string]::IsNullOrWhiteSpace([string]$DefaultFrom)) {
        if ($DefaultFrom -match '^([01]?\d|2[0-3]):([0-5]\d)$') {
            $dfMin = [int]$Matches[1] * 60 + [int]$Matches[2]
            $fromText = ('{0:00}:{1:00}' -f [int][math]::Floor($dfMin / 60), [int]($dfMin % 60))
            $dfEnd = [math]::Min($dfMin + 25, 23 * 60 + 59)
            $toText = ('{0:00}:{1:00}' -f [int][math]::Floor($dfEnd / 60), [int]($dfEnd % 60))
        }
    }

    $win = [System.Windows.Window]::new()
    $win.WindowStyle = [System.Windows.WindowStyle]::None
    $win.AllowsTransparency = $true
    $win.Background = [System.Windows.Media.Brushes]::Transparent
    $win.Topmost = $true
    $win.Width = 420
    $win.SizeToContent = [System.Windows.SizeToContent]::Height
    $win.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
    $win.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $win.FontFamily = 'Microsoft YaHei'

    $shell = [System.Windows.Controls.Border]::new()
    $shell.CornerRadius = [System.Windows.CornerRadius]::new([double]$script:G.RadWin)
    $shell.Background = $script:G.Card
    $shell.BorderBrush = $script:G.Line
    $shell.BorderThickness = [System.Windows.Thickness]::new(1)
    $shell.Margin = [System.Windows.Thickness]::new(12)
    Add-GShadow $shell 26 0.5 | Out-Null

    $stack = [System.Windows.Controls.StackPanel]::new()
    $stack.Margin = [System.Windows.Thickness]::new(18, 14, 18, 16)

    $hint = [System.Windows.Controls.TextBlock]::new()
    $hint.Text = '时间写 HH:mm。跨度超过 25 分钟就按真实区间存，否则按番茄钟对齐。'
    $hint.FontSize = 11
    $hint.TextWrapping = [System.Windows.TextWrapping]::Wrap
    $hint.Margin = [System.Windows.Thickness]::new(0, 0, 0, 10)
    $hint.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
    [void]$stack.Children.Add($hint)

    $fFrom = New-AddField '开始' $fromText '例如 14:00'
    [void]$stack.Children.Add($fFrom.Row)
    $fTo = New-AddField '结束' $toText '可以留空，默认开始后 25 分钟'
    [void]$stack.Children.Add($fTo.Row)
    $fPlace = New-AddField '地点' $initPlace '例如 励志楼乙102 / 宿舍 / 机房'
    [void]$stack.Children.Add($fPlace.Row)
    $fTitle = New-AddField '做什么' $initTitle '写具体能动手的事，不超过 18 字'
    [void]$stack.Children.Add($fTitle.Row)
    $fNote = New-AddField '备注' $initNote '例如 带电脑、水杯（可留空）'
    [void]$stack.Children.Add($fNote.Row)

    $priRow = [System.Windows.Controls.Grid]::new()
    $priRow.Margin = [System.Windows.Thickness]::new(0, 0, 0, 9)
    $pc0 = [System.Windows.Controls.ColumnDefinition]::new()
    $pc0.Width = [System.Windows.GridLength]::new(52, [System.Windows.GridUnitType]::Pixel)
    $pc1 = [System.Windows.Controls.ColumnDefinition]::new()
    $pc1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    [void]$priRow.ColumnDefinitions.Add($pc0)
    [void]$priRow.ColumnDefinitions.Add($pc1)
    $priName = [System.Windows.Controls.TextBlock]::new()
    $priName.Text = '优先级'
    $priName.FontSize = 12
    $priName.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $priName.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(160, 255, 255, 255))
    [System.Windows.Controls.Grid]::SetColumn($priName, 0)
    [void]$priRow.Children.Add($priName)
    # 优先级用一排自绘小块，不用 ComboBox：WPF 默认下拉是白底白字，深色窗口里看不清。
    $priBox = [System.Windows.Controls.StackPanel]::new()
    $priBox.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $priBox.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $script:AddFrmPriValue = [string]$initPri
    $script:AddFrmPriBtns = @()
    $script:AddFrmPriColors = @{}
    $priDefs = @(
        @{ v = ''; t = '不设'; c = [System.Windows.Media.Color]::FromArgb(150, 255, 255, 255) },
        @{ v = 'P0'; t = 'P0'; c = [System.Windows.Media.Color]::FromArgb(230, 229, 72, 77) },
        @{ v = 'P1'; t = 'P1'; c = [System.Windows.Media.Color]::FromArgb(230, 245, 165, 36) },
        @{ v = 'P2'; t = 'P2'; c = [System.Windows.Media.Color]::FromArgb(210, 76, 141, 255) },
        @{ v = 'P3'; t = 'P3'; c = [System.Windows.Media.Color]::FromArgb(210, 48, 164, 108) }
    )
    $priPaint = {
        param($chip, $on)
        $cc = [System.Windows.Media.Color]$script:AddFrmPriColors[[string]$chip.Tag]
        if ($on) {
            $chip.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(70, $cc.R, $cc.G, $cc.B))
            $chip.BorderBrush = [System.Windows.Media.SolidColorBrush]::new($cc)
        } else {
            $chip.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 32, 36, 44))
            $chip.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(40, 255, 255, 255))
        }
    }
    $script:AddFrmPriPaint = $priPaint
    foreach ($d in $priDefs) {
        $chip = [System.Windows.Controls.Border]::new()
        $chip.Width = 44
        $chip.Height = 24
        $chip.Margin = [System.Windows.Thickness]::new(0, 0, 6, 0)
        $chip.CornerRadius = [System.Windows.CornerRadius]::new(5)
        $chip.BorderThickness = [System.Windows.Thickness]::new(1)
        $chip.Cursor = [System.Windows.Input.Cursors]::Hand
        $chip.Tag = [string]$d.v
        $script:AddFrmPriColors[[string]$d.v] = $d.c
        $chipText = [System.Windows.Controls.TextBlock]::new()
        $chipText.Text = [string]$d.t
        $chipText.FontSize = 11
        $chipText.Foreground = [System.Windows.Media.Brushes]::White
        $chipText.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $chipText.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $chip.Child = $chipText
        $chip.Add_PreviewMouseLeftButtonUp({
            param($s, $e)
            $e.Handled = $true
            $script:AddFrmPriValue = [string]$s.Tag
            foreach ($b in $script:AddFrmPriBtns) { & $script:AddFrmPriPaint $b ([string]$b.Tag -eq $script:AddFrmPriValue) }
        })
        [void]$priBox.Children.Add($chip)
        $script:AddFrmPriBtns += $chip
        & $priPaint $chip ([string]$d.v -eq $script:AddFrmPriValue)
    }
    [System.Windows.Controls.Grid]::SetColumn($priBox, 1)
    [void]$priRow.Children.Add($priBox)
    [void]$stack.Children.Add($priRow)

    # F03：重复。四个小块：不重复 / 每天 / 工作日 / 每周。
    $repRow = [System.Windows.Controls.Grid]::new()
    $repRow.Margin = [System.Windows.Thickness]::new(0, 0, 0, 9)
    $rc0 = [System.Windows.Controls.ColumnDefinition]::new()
    $rc0.Width = [System.Windows.GridLength]::new(52, [System.Windows.GridUnitType]::Pixel)
    $rc1 = [System.Windows.Controls.ColumnDefinition]::new()
    $rc1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    [void]$repRow.ColumnDefinitions.Add($rc0)
    [void]$repRow.ColumnDefinitions.Add($rc1)
    $repName = [System.Windows.Controls.TextBlock]::new()
    $repName.Text = '重复'
    $repName.FontSize = 12
    $repName.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $repName.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(160, 255, 255, 255))
    [System.Windows.Controls.Grid]::SetColumn($repName, 0)
    [void]$repRow.Children.Add($repName)
    $repBox = [System.Windows.Controls.StackPanel]::new()
    $repBox.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $repBox.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $script:AddFrmRepValue = [string]$initRepeat
    $script:AddFrmRepBtns = @()
    $repPaint = {
        param($chip, $on)
        if ($on) {
            $chip.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(70, 76, 141, 255))
            $chip.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(210, 76, 141, 255))
        } else {
            $chip.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 32, 36, 44))
            $chip.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(40, 255, 255, 255))
        }
    }
    $script:AddFrmRepPaint = $repPaint
    foreach ($d in @(@{ v = ''; t = '不重复' }, @{ v = 'daily'; t = '每天' }, @{ v = 'weekdays'; t = '工作日' }, @{ v = 'weekly'; t = '每周' })) {
        $chip = [System.Windows.Controls.Border]::new()
        $chip.Width = 50
        $chip.Height = 24
        $chip.Margin = [System.Windows.Thickness]::new(0, 0, 6, 0)
        $chip.CornerRadius = [System.Windows.CornerRadius]::new(5)
        $chip.BorderThickness = [System.Windows.Thickness]::new(1)
        $chip.Cursor = [System.Windows.Input.Cursors]::Hand
        $chip.Tag = [string]$d.v
        $chipText = [System.Windows.Controls.TextBlock]::new()
        $chipText.Text = [string]$d.t
        $chipText.FontSize = 11
        $chipText.Foreground = [System.Windows.Media.Brushes]::White
        $chipText.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
        $chipText.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $chip.Child = $chipText
        $chip.Add_PreviewMouseLeftButtonUp({
            param($s, $e)
            $e.Handled = $true
            $script:AddFrmRepValue = [string]$s.Tag
            foreach ($b in $script:AddFrmRepBtns) { & $script:AddFrmRepPaint $b ([string]$b.Tag -eq $script:AddFrmRepValue) }
        })
        [void]$repBox.Children.Add($chip)
        $script:AddFrmRepBtns += $chip
        & $repPaint $chip ([string]$d.v -eq $script:AddFrmRepValue)
    }
    [System.Windows.Controls.Grid]::SetColumn($repBox, 1)
    [void]$repRow.Children.Add($repBox)
    [void]$stack.Children.Add($repRow)

    # WPF 事件委托执行时局部变量可能已经出栈，统一存到 $script: 里给 handler 用。
    $script:AddFrmFrom = $fFrom.Box
    $script:AddFrmTo = $fTo.Box
    $script:AddFrmPlace = $fPlace.Box
    $script:AddFrmTitle = $fTitle.Box
    $script:AddFrmNote = $fNote.Box

    $err = [System.Windows.Controls.TextBlock]::new()
    $err.FontSize = 11
    $err.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 255, 120, 110))
    $err.Margin = [System.Windows.Thickness]::new(0, 0, 0, 6)
    $err.Visibility = [System.Windows.Visibility]::Collapsed
    [void]$stack.Children.Add($err)

    $btns = [System.Windows.Controls.StackPanel]::new()
    $btns.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $btns.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    $btns.Margin = [System.Windows.Thickness]::new(0, 4, 0, 0)

    $cancel = [System.Windows.Controls.Button]::new()
    $cancel.Content = '取消'
    $cancel.FontSize = 12
    $cancel.Padding = [System.Windows.Thickness]::new(14, 5, 14, 5)
    $cancel.Margin = [System.Windows.Thickness]::new(0, 0, 8, 0)
    $cancel.Add_Click({ param($s, $e) $script:AddTaskWindow.Close() })

    $save = [System.Windows.Controls.Button]::new()
    $save.Content = '保存'
    $save.FontSize = 12
    $save.Padding = [System.Windows.Thickness]::new(18, 5, 18, 5)
    $save.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromRgb(255, 92, 40))
    $save.Foreground = [System.Windows.Media.Brushes]::White
    $save.BorderThickness = [System.Windows.Thickness]::new(0)
    $save.Add_Click({
        param($s, $e)
        try {
            $title = ([string]$script:AddFrmTitle.Text).Trim()
            $from = ([string]$script:AddFrmFrom.Text).Trim()
            $to = ([string]$script:AddFrmTo.Text).Trim()
            $place = ([string]$script:AddFrmPlace.Text).Trim()
            $note = ([string]$script:AddFrmNote.Text).Trim()
            $pri = [string]$script:AddFrmPriValue
            $rep = [string]$script:AddFrmRepValue
            $bad = $null
            if ($title -eq '') { $bad = '做什么不能空着。' }
            elseif ($from -notmatch '^([01]?\d|2[0-3]):[0-5]\d$') { $bad = '开始时间要写成 HH:mm，例如 14:00。' }
            elseif ($to -ne '' -and $to -notmatch '^([01]?\d|2[0-3]):[0-5]\d$') { $bad = '结束时间也要写成 HH:mm，或者留空。' }
            if ($null -ne $bad) {
                if ($null -ne $script:AddFrmErr) {
                    $script:AddFrmErr.Text = $bad
                    $script:AddFrmErr.Visibility = [System.Windows.Visibility]::Visible
                }
                return
            }
            if ($script:AddFrmEditId -ne '') {
                Send-OverlayEvent @{ type = 'plan_update'; id = $script:AddFrmEditId; from = $from; to = $to; place = $place; title = $title; note = $note; priority = $pri; repeat = $rep }
                Write-Log ('task update sent: ' + $script:AddFrmEditId + ' ' + $from + '-' + $to + ' ' + $title + ' ' + $pri + ' ' + $rep)
            } else {
                Send-OverlayEvent @{ type = 'plan_add'; from = $from; to = $to; place = $place; title = $title; note = $note; priority = $pri; repeat = $rep }
                Write-Log ('add task sent: ' + $from + '-' + $to + ' ' + $title + ' ' + $pri + ' ' + $rep)
            }
            if ($null -ne $script:AddTaskWindow) { $script:AddTaskWindow.Close() }
        }
        catch {
            Write-Log ('add task save failed: ' + $_.Exception.Message)
        }
    })

    [void]$btns.Children.Add($cancel)
    [void]$btns.Children.Add($save)
    [void]$stack.Children.Add($btns)

    $shell.Child = $stack
    $win.Content = $shell
    $script:AddTaskWindow = $win
    $script:AddFrmErr = $err
    if ($editing) { $script:AddFrmEditId = [string]$EditItem.id } else { $script:AddFrmEditId = '' }
    $fTitle.Box.Add_KeyDown({ param($s, $e); if ($e.Key -eq [System.Windows.Input.Key]::Enter) { $save.RaiseEvent([System.Windows.RoutedEventArgs]::new([System.Windows.Controls.Button]::ClickEvent)) } })
    [void]$win.Show()
    [void]$fTitle.Box.Focus()
}

# 悬浮球透明度：0.2–1.0，改的是球体渐变与文字的 alpha，不是整个窗口的 Opacity
# （窗口级 Opacity 会连时钟一起糊掉，这里只动笔画）。
function Apply-BallOpacity([double]$value) {
    if ($value -lt 0.2) { $value = 0.2 }
    if ($value -gt 1.0) { $value = 1.0 }
    $script:BallAlpha = [int][math]::Round($value * 255)
    if ($null -ne $script:BallGradient -and $script:BallGradient.GradientStops.Count -ge 2) {
        $script:BallGradient.GradientStops[0].Color = [System.Windows.Media.Color]::FromArgb($script:BallAlpha, 255, 110, 40)
        $script:BallGradient.GradientStops[1].Color = [System.Windows.Media.Color]::FromArgb($script:BallAlpha, 214, 44, 132)
    }
    if ($null -ne $script:BallLabel) {
        $script:BallLabel.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb([math]::Min(255, [int]($script:BallAlpha * 1.05)), 255, 255, 255))
    }
    if ($null -ne $script:BallShadow) { $script:BallShadow.Opacity = 0.55 * $value }
}
function Update-Clock {
    $now = Get-Date
    if ($null -ne $script:PanelClock) { $script:PanelClock.Text = $now.ToString('HH:mm:ss') }
    if ($null -ne $script:BallClock) { $script:BallClock.Text = $now.ToString('HH:mm') }
}

function Get-Annot-Box($shape) {
    if ($null -eq $shape) { return $null }
    $kind = [string]$shape.kind
    if ($kind -eq 'arrow') {
        $x1 = [double]$shape.x1; $y1 = [double]$shape.y1
        $x2 = [double]$shape.x2; $y2 = [double]$shape.y2
        $w = [math]::Abs($x2 - $x1); $h = [math]::Abs($y2 - $y1)
        if ($w -le 0 -and $h -le 0) { return $null }
        return @{ x = [math]::Min($x1, $x2); y = [math]::Min($y1, $y2); w = $w; h = $h }
    }
    if ($null -eq $shape.x -or $null -eq $shape.w -or $null -eq $shape.h) { return $null }
    if ([double]$shape.w -le 0 -or [double]$shape.h -le 0) { return $null }
    return @{ x = [double]$shape.x; y = [double]$shape.y; w = [double]$shape.w; h = [double]$shape.h }
}

function Position-Subtitle($state) {
    $window = $script:SubtitleWindow
    if ($null -eq $window -or -not $window.IsVisible) { return }
    $window.UpdateLayout()
    $width = $window.ActualWidth
    $height = $window.ActualHeight
    if ($width -le 1 -or $height -le 1) { return }
    $left = $script:ScreenLeft
    $top = $script:ScreenTop
    $right = $left + $script:ScreenWidth
    $bottom = $top + $script:ScreenHeight
    $gap = 14.0

    $box = $null
    if ($null -ne $state.annots) {
        foreach ($shape in @($state.annots)) {
            $candidate = Get-Annot-Box $shape
            if ($null -ne $candidate) { $box = $candidate }
        }
    }
    if ($null -ne $box) {
        $centerX = $left + $box.x + $box.w / 2
        $x = $centerX - $width / 2
        $y = $top + $box.y + $box.h + $gap
        if (($y + $height) -gt ($bottom - 10)) { $y = $top + $box.y - $height - $gap }
    }
    elseif ($script:PanelWindow.IsVisible) {
        $x = $script:PanelWindow.Left
        $y = $script:PanelWindow.Top + $script:PanelWindow.ActualHeight + $gap
        if (($y + $height) -gt ($bottom - 10)) { $y = $script:PanelWindow.Top - $height - $gap }
    }
    else {
        $x = $left + ($script:ScreenWidth - $width) / 2
        $y = $bottom - $height - 80
    }
    if ($x -lt ($left + 8)) { $x = $left + 8 }
    if (($x + $width) -gt ($right - 8)) { $x = $right - 8 - $width }
    if ($y -lt ($top + 8)) { $y = $top + 8 }
    if (($y + $height) -gt ($bottom - 8)) { $y = $bottom - 8 - $height }
    $window.Left = $x
    $window.Top = $y
    $script:SubtitlePlacedWidth = $width
}

function Update-Subtitle($subtitle, $state) {
    $window = $script:SubtitleWindow
    if ($null -eq $window) { return }
    $active = $null -ne $subtitle -and $subtitle.active -eq $true -and -not [string]::IsNullOrEmpty([string]$subtitle.text)
    if (-not $active -or $script:Mode -eq 'hidden' -or $script:CaptureBusy) {
        if ($window.IsVisible) { $window.Hide() }
        return
    }
    $text = [string]$subtitle.text
    $reveal = 0
    if ($null -ne $subtitle.reveal) { $reveal = [int]$subtitle.reveal }
    if ($reveal -lt 0) { $reveal = 0 }
    if ($reveal -gt $text.Length) { $reveal = $text.Length }
    # Trailing punctuation stays hidden until the next syllable lands; pull the
    # marks forward so the line never ends on a bare comma.
    while ($reveal -lt $text.Length -and '，。！？、；：,.!?;:'.IndexOf($text[$reveal]) -ge 0) { $reveal += 1 }
    $visible = $text.Substring(0, $reveal)
    $rest = $text.Substring($reveal)
    $block = $script:SubtitleText
    $size = 24
    if ($null -ne $subtitle.size) { $size = [double]$subtitle.size }
    if ($size -lt 12) { $size = 12 }
    if ($size -gt 48) { $size = 48 }
    if ([math]::Abs($block.FontSize - $size) -gt 0.1) {
        $block.FontSize = $size
        $block.LineHeight = [math]::Round($size * 1.42)
    }
    $block.Inlines.Clear()
    if ($visible.Length -gt 0) {
        [void]$block.Inlines.Add([System.Windows.Documents.Run]::new($visible))
    }
    if ($rest.Length -gt 0) {
        # Transparent run keeps the box the size of the finished sentence, so the
        # caption does not reflow on every revealed word.
        $ghost = [System.Windows.Documents.Run]::new($rest)
        $ghost.Foreground = [System.Windows.Media.Brushes]::Transparent
        [void]$block.Inlines.Add($ghost)
    }
    if (-not $window.IsVisible) { $window.Show() }
    Position-Subtitle $state
}

function New-SubtitleWindow {
    $window = [System.Windows.Window]::new()
    $window.WindowStyle = [System.Windows.WindowStyle]::None
    $window.AllowsTransparency = $true
    $window.Background = [System.Windows.Media.Brushes]::Transparent
    $window.Topmost = $true
    $window.ShowInTaskbar = $false
    $window.ShowActivated = $false
    $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
    $window.SizeToContent = [System.Windows.SizeToContent]::WidthAndHeight
    $window.MaxWidth = [math]::Max(280.0, $script:ScreenWidth * 0.74)
    $window.IsHitTestVisible = $false

    $border = [System.Windows.Controls.Border]::new()
    $border.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(232, 12, 15, 21))
    $border.CornerRadius = [System.Windows.CornerRadius]::new(12)
    $border.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(80, 255, 140, 60))
    $border.BorderThickness = [System.Windows.Thickness]::new(1.4)
    $border.Padding = [System.Windows.Thickness]::new(20, 12, 20, 12)

    $text = [System.Windows.Controls.TextBlock]::new()
    $text.FontFamily = [System.Windows.Media.FontFamily]::new('Microsoft YaHei UI')
    $text.FontSize = 21
    $text.LineHeight = 30
    $text.TextAlignment = [System.Windows.TextAlignment]::Center
    $text.TextWrapping = [System.Windows.TextWrapping]::Wrap
    $text.Foreground = [System.Windows.Media.Brushes]::White
    $text.MaxWidth = $window.MaxWidth - 44
    $border.Child = $text
    $window.Content = $border
    $window.Show()
    $window.Hide()

    $handle = [System.Windows.Interop.WindowInteropHelper]::new($window).Handle
    [GuideNative]::MakeClickThrough($handle)

    $script:SubtitleWindow = $window
    $script:SubtitleText = $text
}

# --- state application ---------------------------------------------------
# --- 桌面清单卡片（伪融入桌面） -----------------------------------------
# 不往 WorkerW 里塞（资源管理器一重启就掉），用无边框 + 强半透明 + 无标题栏，
# 让它看起来像桌面的一部分。点 ☐ 发 plan_done，拖标题栏发 card_moved，点 ✕ 发 card_close。
# 版式：贴右缘、满屏高；正文是按小时排的时间轴（06:00–24:00），没安排的小时留空。
$script:CardWidth = 360
$script:CardScrollThumb = $null
$script:ScrollDragStart = $null
$script:CardAlpha = 235
$script:DayStartHour = 6
$script:DayEndHour = 22
$script:DayEndMinute = 30

function Update-CardScrollThumb {
    try {
        $sv = $script:CardScroll
        $thumb = $script:CardScrollThumb
        if ($null -eq $sv -or $null -eq $thumb) { return }
        $h = [double]$sv.ActualHeight
        $extent = [double]$sv.ExtentHeight
        $viewport = [double]$sv.ViewportHeight
        # 内容装得下就不显示滑块；装不下时按视口/总高的比例算滑块长度。
        if ($h -lt 10 -or $extent -le $viewport + 0.5) {
            $thumb.Visibility = [System.Windows.Visibility]::Collapsed
            return
        }
        $thumb.Visibility = [System.Windows.Visibility]::Visible
        $ratio = $viewport / $extent
        if ($ratio -gt 1) { $ratio = 1 }
        $th = [math]::Max(26.0, $h * $ratio)
        if ($th -gt $h) { $th = $h }
        $scrollable = [double]$sv.ScrollableHeight
        $top = 0.0
        if ($scrollable -gt 0) {
            $top = ($h - $th) * ([double]$sv.VerticalOffset / $scrollable)
        }
        $thumb.Height = $th
        $thumb.Margin = [System.Windows.Thickness]::new(0, $top, 2, 0)
    } catch { }
}

# --- 条目拖拽（F02）：按住条目上下拖，松手把 from/to 改到新位置 ------------
# 不复制影子：直接把原条目抬起（Scale + Translate）跟着鼠标走，松手后它自己滑到新位置。
# 屏幕上始终只有一块，不会出现「拖影 + 原位占位」两个虚影。

function Get-CardDragMinute([double]$yCanvas) {
    $px = [double]$script:CardDragPx
    if ($px -le 0) { return $null }
    $base = [double]$script:CardDragBaseY
    $delta = ($yCanvas - $base) / $px
    $raw = [double]$script:CardDragFromMin + $delta
    return [math]::Round($raw / 5.0) * 5.0
}

function Clear-CardDrag([bool]$restore = $true) {
    if ($null -ne $script:CardDragTimer) { try { $script:CardDragTimer.Stop() } catch { } }
    $b = $script:CardDragBody
    if ($null -ne $b) {
        # 落下成功时不要复原：旧条目紧接着会被重建替换，复原会让它在重建前跳回原位。
        if ($restore) {
            try { $b.RenderTransform = [System.Windows.Media.Transform]::Identity } catch { }
            try { [System.Windows.Controls.Panel]::SetZIndex($b, 0) } catch { }
            try { $b.Opacity = 1.0 } catch { }
        }
        try { [void]$b.ReleaseMouseCapture() } catch { }
    }
    if ($null -ne $script:CardDragBadge) {
        try { [void]$script:CardDragLayer.Children.Remove($script:CardDragBadge) } catch { }
    }
    $script:CardDragBody = $null
    $script:CardDragBadge = $null
    $script:CardDragBadgeText = $null
    $script:CardDragTimer = $null
    $script:CardDragTranslate = $null
    $script:CardDragScale = $null
    $script:CardDragBlur = $null
    $script:CardDragRect = $null
    $script:CardDragActive = $false
    $script:CardDragMoved = $false
    $script:CardDragSettled = $false
    $script:CardDragFinishing = $false
    $script:CardDragItemId = ''
}

function Set-CardDragLift([double]$scale, [double]$blur, [double]$shadow) {
    if ($null -eq $script:CardDragScale) { return }
    $dur = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(150))
    $ease = [System.Windows.Media.Animation.CubicEase]::new()
    $ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
    $sx = [System.Windows.Media.Animation.DoubleAnimation]::new([double]$script:CardDragScale.ScaleX, $scale, $dur)
    $sx.EasingFunction = $ease
    $sy = [System.Windows.Media.Animation.DoubleAnimation]::new([double]$script:CardDragScale.ScaleY, $scale, $dur)
    $sy.EasingFunction = $ease
    $script:CardDragScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $sx)
    $script:CardDragScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $sy)
}

function Begin-CardDrag {
    $body = $script:CardDragBody
    $layer = $script:CardDragLayer
    if ($null -eq $body -or $null -eq $layer) { return }
    $script:CardDragActive = $true
    $pos = $body.TranslatePoint([System.Windows.Point]::new(0, 0), $layer)
    $script:CardDragBaseY = [double]$pos.Y
    $script:CardDragOriginTop = [double]$pos.Y
    $tt = [System.Windows.Media.TranslateTransform]::new(0.0, 0.0)
    $st = [System.Windows.Media.ScaleTransform]::new(1.0, 1.0)
    $tg = [System.Windows.Media.TransformGroup]::new()
    [void]$tg.Children.Add($st)
    [void]$tg.Children.Add($tt)
    $body.RenderTransformOrigin = [System.Windows.Point]::new(0.5, 0.5)
    $body.RenderTransform = $tg
    [System.Windows.Controls.Panel]::SetZIndex($body, 60)
    $script:CardDragTranslate = $tt
    $script:CardDragScale = $st
    $script:CardDragBadge = $null
    $script:CardDragSettled = $false
    # 用布局的每分钟像素，不能拿条目高度反推：短条目有最小高度，反推会偏。
    if ([double]$script:CardPxPerMin -gt 0) {
        $script:CardDragPx = [double]$script:CardPxPerMin
    } elseif ([double]$script:CardDragDur -gt 0 -and $body.ActualHeight -gt 0) {
        $script:CardDragPx = [double]$body.ActualHeight / [double]$script:CardDragDur
    } else { $script:CardDragPx = 1.0 }
    $script:CardDragGrab = [System.Windows.Point]::new($script:CardDragMouse.X - $pos.X, $script:CardDragMouse.Y - $pos.Y)
    try { [void]$body.CaptureMouse() } catch { }
    Set-CardDragLift 1.035 16 0.45
    Write-Log 'drag begin'
    Start-CardDragTimer
}

function Settle-CardDrag {
    # 鼠标停住 180ms：浮起感收一点，表示"停在这儿、可以松手了"。
    Set-CardDragLift 1.0 8 0.28
}

function Update-CardDragBadge {
    if ($null -eq $script:CardDragBadge) { return }
    if ($null -eq $script:CardDragTranslate) { return }
    $ly = [double]$script:CardDragBaseY + [double]$script:CardDragTranslate.Y
    $m = Get-CardDragMinute $ly
    if ($null -eq $m) { return }
    $dur = [double]$script:CardDragDur
    $from = [double]$m
    if ($from -lt [double]$script:CardDayStart) { $from = [double]$script:CardDayStart }
    if ($from -gt ([double]$script:CardDayEnd - $dur)) { $from = [double]$script:CardDayEnd - $dur }
    $to = $from + $dur
    $txt = '{0:00}:{1:00}–{2:00}:{3:00}' -f [math]::Floor($from / 60), ($from % 60), [math]::Floor($to / 60), ($to % 60)
    if ($null -eq $script:CardDragBadge) {
        $b = [System.Windows.Controls.Border]::new()
        $b.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(235, 30, 36, 48))
        $b.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(90, 255, 196, 120))
        $b.BorderThickness = [System.Windows.Thickness]::new(1)
        $b.CornerRadius = [System.Windows.CornerRadius]::new(7)
        $b.Padding = [System.Windows.Thickness]::new(8, 3, 8, 3)
        $tb = [System.Windows.Controls.TextBlock]::new()
        $tb.FontSize = 10.5
        $tb.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(240, 255, 210, 150))
        $b.Child = $tb
        [void]$script:CardDragLayer.Children.Add($b)
        $script:CardDragBadge = $b
        $script:CardDragBadgeText = $tb
    }
    $script:CardDragBadgeText.Text = $txt
    $script:CardDragBadge.UpdateLayout()
    [System.Windows.Controls.Canvas]::SetLeft($script:CardDragBadge, 8)
    [System.Windows.Controls.Canvas]::SetTop($script:CardDragBadge, [math]::Max(2, $ly - 22))
}

function Start-CardDragTimer {
    if ($null -ne $script:CardDragTimer) { return }
    $timer = [System.Windows.Threading.DispatcherTimer]::new()
    $timer.Interval = [TimeSpan]::FromMilliseconds(16)
    $timer.Add_Tick({
        try {
            if (-not $script:CardDragActive) { return }
            # 松手后进入落位动画，timer 不能再改位置，否则会把动画值顶回去。
            if ($script:CardDragFinishing) { return }
            if (-not $script:CardDragSettled -and ([datetime]::Now - $script:CardDragLastMove).TotalMilliseconds -gt 180) {
                $script:CardDragSettled = $true
                Settle-CardDrag
            }
            # 拖动期间不自动滚动：滚动会改 ScrollViewer 偏移，重建后条目位置和手里看到的不一致，就成了跳变。
            Update-CardDragBadge
        } catch { }
    })
    $script:CardDragTimer = $timer
    $timer.Start()
}

function Start-CardDrag($body, $e) {
    Clear-CardDrag
    $script:CardDragBody = $body
    $script:CardDragMouse = $e.GetPosition($script:CardDragLayer)
    $script:CardDragStart = $script:CardDragMouse
    $script:CardDragLastMove = [datetime]::Now
    $script:CardDragMoved = $false
    $script:CardDragActive = $false
    Write-Log ('drag start: ' + [string]$body.Tag)
}

function Update-CardDrag($body, $e) {
    if ($script:CardDragFinishing) { return }
    if ($null -eq $script:CardDragBody -or $body -ne $script:CardDragBody) { return }
    if ($e.LeftButton -ne [System.Windows.Input.MouseButtonState]::Pressed) { return }
    $p = $e.GetPosition($script:CardDragLayer)
    $script:CardDragMouse = $p
    if (-not $script:CardDragActive) {
        $dx = [math]::Abs($p.X - [double]$script:CardDragStart.X)
        $dy = [math]::Abs($p.Y - [double]$script:CardDragStart.Y)
        if ($dx -lt 4 -and $dy -lt 4) { return }
        $script:CardDragMoved = $true
        Begin-CardDrag
    }
    if ($null -ne $script:CardDragTranslate) {
        $script:CardDragTranslate.Y = $p.Y - [double]$script:CardDragStart.Y
    }
    $script:CardDragLastMove = [datetime]::Now
    if ($script:CardDragSettled) {
        $script:CardDragSettled = $false
        Set-CardDragLift 1.035 16 0.45
    }
    Update-CardDragBadge
}

function Complete-CardDragDrop {
    try {
        $it = $script:CardDragDropItem
        if ($null -ne $it) {
            # 乐观更新：先在本地把这条的 from/to 改掉并立即重建，避免等宿主往返的卡顿。
            try {
                $ls = $script:LastState
                if ($null -ne $ls -and $null -ne $ls.plan -and $null -ne $ls.plan.items) {
                    foreach ($row in $ls.plan.items) {
                        if ([string]$row.id -eq $script:CardDragDropId) {
                            $row.from = $script:CardDragDropFrom
                            $row.to = $script:CardDragDropTo
                            break
                        }
                    }
                    $script:CardDragActive = $false
                    Update-Card $ls
                }
            } catch { }
            Send-OverlayEvent @{
                type = 'plan_update'; id = $script:CardDragDropId
                from = $script:CardDragDropFrom; to = $script:CardDragDropTo
                title = [string]$it.title; place = [string]$it.place
                note = [string]$it.note; priority = [string]$it.priority
                repeat = [string]$it.repeat
            }
        }
        Write-Log ('card drag update: ' + $script:CardDragDropId + ' -> ' + $script:CardDragDropFrom + '-' + $script:CardDragDropTo)
    } catch { }
    # 不复原 RenderTransform：条目会停在新行上，等宿主重建替换，避免重建前闪回原位。
    Clear-CardDrag $false
}

function Finish-CardDrag {
    if ($script:CardDragFinishing) { return }
    $moved = $script:CardDragMoved
    $itemId = [string]$script:CardDragItemId
    $body = $script:CardDragBody
    if (-not $moved) { Clear-CardDrag; return }
    if ($null -eq $body -or $null -eq $script:CardDragTranslate) { Clear-CardDrag; return }
    $script:CardDragFinishing = $true
    if ($null -ne $script:CardDragTimer) { try { $script:CardDragTimer.Stop() } catch { } }
    $visualY = [double]$script:CardDragBaseY + [double]$script:CardDragTranslate.Y
    $m = Get-CardDragMinute $visualY
    $dur = [double]$script:CardDragDur
    if ($null -eq $m) { $m = [double]$script:CardDayStart }
    $from = [double]$m
    if ($from -lt [double]$script:CardDayStart) { $from = [double]$script:CardDayStart }
    if ($from -gt ([double]$script:CardDayEnd - $dur)) { $from = [double]$script:CardDayEnd - $dur }
    $to = $from + $dur
    $item = $script:CardItemsById[$itemId]
    $targetY = [double]$script:CardDragBaseY + (($from - [double]$script:CardDragFromMin) * [double]$script:CardDragPx)
    $dropOffset = $targetY - [double]$script:CardDragBaseY
    $script:CardDragDropId = $itemId
    $script:CardDragDropFrom = '{0:00}:{1:00}' -f [math]::Floor($from / 60), ($from % 60)
    $script:CardDragDropTo = '{0:00}:{1:00}' -f [math]::Floor($to / 60), ($to % 60)
    $script:CardDragDropItem = $item
    # 动画不在这里演：把「松手时的视觉位置」交给重建后的新条目，由它滑到自己的真实布局位置。
    # 这样动画终点就是最终排版位置，演完不会再有第二跳。
    $script:CardDropHint = @{ id = $itemId; fromY = $visualY }
    Write-Log ('drag land: from=' + [int]$visualY + ' target=' + [int]$targetY + ' min=' + [int]$from)
    Complete-CardDragDrop
}


function New-CardWindow {
    $window = [System.Windows.Window]::new()
    $window.WindowStyle = [System.Windows.WindowStyle]::None
    $window.AllowsTransparency = $true
    $window.Background = [System.Windows.Media.Brushes]::Transparent
    $window.Topmost = $true
    $window.ShowInTaskbar = $false
    $window.ShowActivated = $false
    $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
    # 满屏高、贴右边缘：整块右侧都是清单，像桌面自带的侧栏。
    $window.Width = $script:CardWidth
    $window.SizeToContent = [System.Windows.SizeToContent]::Manual
    if ($null -eq $script:CardExpanded) { $script:CardExpanded = $false }
    $script:CardCompactHeight = [int][math]::Round($script:WorkHeight * 0.64)
    if ($script:CardExpanded) { $window.Height = [double]$script:WorkHeight }
    else { $window.Height = [double]$script:CardCompactHeight }
    $window.Left = $script:WorkLeft + $script:WorkWidth - $script:CardWidth
    $window.Top = $script:WorkTop

    $root = [System.Windows.Controls.Border]::new()
    $root.CornerRadius = [System.Windows.CornerRadius]::new(14)
    $root.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(222, 16, 19, 25))
    $root.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(45, 255, 255, 255))
    $root.BorderThickness = [System.Windows.Thickness]::new(1)
    $root.Padding = [System.Windows.Thickness]::new(14, 11, 14, 13)

    # 四行：标题 / 分割线 / 内容(可变高，装不下就滚) / 底部「く」
    $stack = [System.Windows.Controls.Grid]::new()
    foreach ($rh in @('Auto', 'Auto', '*', 'Auto')) {
        $cd = [System.Windows.Controls.RowDefinition]::new()
        if ($rh -eq '*') { $cd.Height = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star) }
        else { $cd.Height = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Auto) }
        [void]$stack.RowDefinitions.Add($cd)
    }
    # 拖拽层：条目拖动时用 VisualBrush 复制一份影子，放在所有内容之上，不受 ScrollViewer 裁剪。
    $outer = [System.Windows.Controls.Grid]::new()
    [void]$outer.Children.Add($stack)
    $dragLayer = [System.Windows.Controls.Canvas]::new()
    $dragLayer.IsHitTestVisible = $false
    $dragLayer.ClipToBounds = $false
    [System.Windows.Controls.Panel]::SetZIndex($dragLayer, 99)
    [void]$outer.Children.Add($dragLayer)
    $script:CardDragLayer = $dragLayer
    $root.Child = $outer

    $head = [System.Windows.Controls.Grid]::new()
    $colA = [System.Windows.Controls.ColumnDefinition]::new()
    $colA.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $colB = [System.Windows.Controls.ColumnDefinition]::new()
    $colB.Width = [System.Windows.GridLength]::Auto
    [void]$head.ColumnDefinitions.Add($colA)
    [void]$head.ColumnDefinitions.Add($colB)

    $headText = [System.Windows.Controls.StackPanel]::new()
    $headText.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $title = [System.Windows.Controls.TextBlock]::new()
    $title.Text = '今日清单'
    $title.FontSize = 13
    $title.FontWeight = [System.Windows.FontWeights]::SemiBold
    $title.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(235, 255, 255, 255))
    $date = [System.Windows.Controls.TextBlock]::new()
    $date.FontSize = 10.5
    $date.Margin = [System.Windows.Thickness]::new(8, 1, 0, 0)
    $date.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $date.TextWrapping = [System.Windows.TextWrapping]::NoWrap
    $date.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
    $date.MaxWidth = 130
    $date.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(140, 255, 255, 255))
    [void]$headText.Children.Add($title)
    [void]$headText.Children.Add($date)
    [System.Windows.Controls.Grid]::SetColumn($headText, 0)
    [void]$head.Children.Add($headText)

    # 右侧两个按钮：⚙ 打开设置，✕ 收起卡片。
    $headBtns = [System.Windows.Controls.StackPanel]::new()
    $headBtns.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $headBtns.VerticalAlignment = [System.Windows.VerticalAlignment]::Center

    $plus = [System.Windows.Controls.TextBlock]::new()
    $plus.Text = '＋'
    $plus.FontSize = 15
    $plus.Margin = [System.Windows.Thickness]::new(0, 0, 12, 0)
    $plus.Cursor = [System.Windows.Input.Cursors]::Hand
    $plus.ToolTip = '加一条任务'
    $plus.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(160, 255, 255, 255))
    $plus.Add_PreviewMouseLeftButtonDown({
        param($s, $e)
        $e.Handled = $true
        try { Show-AddTaskWindow } catch { Write-Log ('add task window failed: ' + $_.Exception.Message) }
    })
    [void]$headBtns.Children.Add($plus)
    $tplBtn = [System.Windows.Controls.TextBlock]::new()
    $tplBtn.Text = '模板'
    $tplBtn.FontSize = 10.5
    $tplBtn.Margin = [System.Windows.Thickness]::new(0, 0, 12, 0)
    $tplBtn.Cursor = [System.Windows.Input.Cursors]::Hand
    $tplBtn.ToolTip = '清单模板：把某一天存下来，铺到明天/后天'
    $tplBtn.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(160, 255, 255, 255))
    $tplBtn.Add_PreviewMouseLeftButtonDown({
        param($s, $e)
        $e.Handled = $true
        try { Show-TemplatesWindow } catch { Write-Log ('templates window failed: ' + $_.Exception.Message) }
    })
    [void]$headBtns.Children.Add($tplBtn)
    $gear = [System.Windows.Controls.TextBlock]::new()
    $gear.Text = '⚙'
    $gear.FontSize = 14
    $gear.Margin = [System.Windows.Thickness]::new(0, 0, 12, 0)
    $gear.Cursor = [System.Windows.Input.Cursors]::Hand
    $gear.ToolTip = '设置：清单透明度、宽度，面板透明度、大小，语气'
    $gear.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(160, 255, 255, 255))
    $gear.Add_PreviewMouseLeftButtonDown({
        param($s, $e)
        $e.Handled = $true
        try { Show-SettingsWindow } catch { Write-Log ('settings window failed: ' + $_.Exception.Message) }
    })
    [void]$headBtns.Children.Add($gear)

    $close = [System.Windows.Controls.TextBlock]::new()
    $close.Text = '✕'
    $close.FontSize = 12
    $close.Cursor = [System.Windows.Input.Cursors]::Hand
    $close.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
    # 用 Preview 挡住标题栏的 DragMove：否则按下就被拖走，MouseUp 的关闭收不到。
    $close.Add_PreviewMouseLeftButtonDown({
        param($s, $e)
        $e.Handled = $true
        Send-OverlayEvent @{ type = 'card_close' }
    })
    [void]$headBtns.Children.Add($close)

    [System.Windows.Controls.Grid]::SetColumn($headBtns, 1)
    [void]$head.Children.Add($headBtns)

    $head.Add_MouseLeftButtonDown({
        param($s, $e)
        $hit = $e.OriginalSource
        if ($null -ne $hit -and $hit -is [System.Windows.Controls.TextBlock] -and $hit.Text -eq '✕') { return }
        try {
            $script:CardDragging = $true
            try { $script:CardWindow.DragMove() } finally {
                $script:CardDragging = $false
                $script:CardPinUntil = [DateTime]::UtcNow.AddSeconds(3)
            }
            # 边界检查：拖出工作区就拉回来，别让清单卡在屏幕外找不回。
            $cw = $script:CardWindow
            $minL = $script:WorkLeft
            $minT = $script:WorkTop
            $maxL = $script:WorkLeft + $script:WorkWidth - $cw.Width
            $maxT = $script:WorkTop + $script:WorkHeight - $cw.Height
            if ($cw.Left -lt $minL) { $cw.Left = $minL }
            if ($cw.Top -lt $minT) { $cw.Top = $minT }
            if ($cw.Left -gt $maxL) { $cw.Left = $maxL }
            if ($cw.Top -gt $maxT) { $cw.Top = $maxT }
            Send-OverlayEvent @{ type = 'card_moved'; x = [int]$script:CardWindow.Left; y = [int]$script:CardWindow.Top }
        } catch { }
    })

    [System.Windows.Controls.Grid]::SetRow($head, 0)
    [void]$stack.Children.Add($head)

    $rule = [System.Windows.Controls.Border]::new()
    $rule.Height = 1
    $rule.Margin = [System.Windows.Thickness]::new(0, 8, 0, 6)
    $rule.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(28, 255, 255, 255))
    [System.Windows.Controls.Grid]::SetRow($rule, 1)
    [void]$stack.Children.Add($rule)

    $items = [System.Windows.Controls.StackPanel]::new()
    # 内容区套一层 ScrollViewer：收缩态装不下一天时用滚轮看，展开态正好满屏。
    $sv = [System.Windows.Controls.ScrollViewer]::new()
    $sv.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Hidden
    $sv.HorizontalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Disabled
    $sv.PanningMode = [System.Windows.Controls.PanningMode]::VerticalOnly
    $sv.Focusable = $false
    $sv.Add_PreviewMouseWheel({
        param($s, $e)
        $e.Handled = $true
        $target = [double]$s.VerticalOffset - ([double]$e.Delta / 120.0) * 96.0
        if ($target -lt 0) { $target = 0 }
        if ($target -gt $s.ScrollableHeight) { $target = $s.ScrollableHeight }
        $s.ScrollToVerticalOffset($target)
    })
    $sv.Content = $items
    [System.Windows.Controls.Grid]::SetRow($sv, 2)
    [void]$stack.Children.Add($sv)
    $script:CardScroll = $sv

    # 右侧滚动指示滑块：内容超出视口时按比例显示，可拖动。
    $sv.Padding = [System.Windows.Thickness]::new(0, 0, 10, 0)
    $thumb = [System.Windows.Controls.Border]::new()
    $thumb.Width = 5
    $thumb.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    $thumb.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
    $thumb.CornerRadius = [System.Windows.CornerRadius]::new(2.5)
    $thumb.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(46, 255, 255, 255))
    $thumb.Cursor = [System.Windows.Input.Cursors]::Hand
    $thumb.ToolTip = '拖动查看清单'
    $thumb.Visibility = [System.Windows.Visibility]::Collapsed
    $thumb.Add_MouseLeftButtonDown({
        param($s, $e)
        $e.Handled = $true
        [void]$s.CaptureMouse()
        $sv = $script:CardScroll
        if ($null -ne $sv) {
            $script:ScrollDragStart = @{ y = $e.GetPosition($sv).Y; offset = [double]$sv.VerticalOffset }
        }
    })
    $thumb.Add_MouseMove({
        param($s, $e)
        if (-not $s.IsMouseCaptured -or $null -eq $script:ScrollDragStart) { return }
        $sv = $script:CardScroll
        if ($null -eq $sv) { return }
        $h = [double]$sv.ActualHeight
        $range = $h - [double]$s.Height
        if ($range -le 1) { return }
        $dy = $e.GetPosition($sv).Y - $script:ScrollDragStart.y
        $target = $script:ScrollDragStart.offset + ($dy / $range) * [double]$sv.ScrollableHeight
        if ($target -lt 0) { $target = 0 }
        if ($target -gt $sv.ScrollableHeight) { $target = $sv.ScrollableHeight }
        $sv.ScrollToVerticalOffset($target)
    })
    $thumb.Add_MouseLeftButtonUp({
        param($s, $e)
        if ($s.IsMouseCaptured) { [void]$s.ReleaseMouseCapture() }
        $script:ScrollDragStart = $null
    })
    $sv.Add_ScrollChanged({
        param($s, $e)
        Update-CardScrollThumb
    })
    $script:CardScrollThumb = $thumb
    [System.Windows.Controls.Grid]::SetRow($thumb, 2)
    [void]$stack.Children.Add($thumb)

    # 底部「く」：点一下在「收缩」和「全展开」之间切换。
    $foot = [System.Windows.Controls.Grid]::new()
    $foot.Margin = [System.Windows.Thickness]::new(0, 5, 0, 0)
    $footBtn = [System.Windows.Controls.Border]::new()
    $footBtn.CornerRadius = [System.Windows.CornerRadius]::new(9)
    $footBtn.Padding = [System.Windows.Thickness]::new(30, 1, 30, 1)
    $footBtn.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $footBtn.Cursor = [System.Windows.Input.Cursors]::Hand
    $footBtn.ToolTip = '展开 / 收起到整屏'
    $footBtn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(1, 0, 0, 0))
    $footGlyph = [System.Windows.Controls.TextBlock]::new()
    $footGlyph.Text = 'く'
    $footGlyph.FontSize = 12
    $footGlyph.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
    $footBtn.Child = $footGlyph
    [void]$foot.Children.Add($footBtn)
    $footBtn.Add_PreviewMouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        $script:CardExpanded = -not $script:CardExpanded
        Write-Log ('card expand toggled: ' + $script:CardExpanded)
        if ($null -ne $script:CardWindow) {
            $script:CardAnimTo = if ($script:CardExpanded) { [double]$script:WorkHeight } else { [double]$script:CardCompactHeight }
            $fromH = [double]$script:CardWindow.Height
            if ([math]::Abs($fromH - $script:CardAnimTo) -lt 1) {
                $script:CardWindow.Height = [double]$script:CardAnimTo
                $script:CardAnimating = $false
            } else {
                $script:CardAnimating = $true
                $targetH = [double]$script:CardAnimTo
                $anim = [System.Windows.Media.Animation.DoubleAnimation]::new($fromH, $targetH, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(250)))
                $ease = [System.Windows.Media.Animation.CubicEase]::new()
                $ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
                $anim.EasingFunction = $ease
                $anim.FillBehavior = [System.Windows.Media.Animation.FillBehavior]::Stop
                $anim.add_Completed({
                    try { $script:CardAnimating = $false } catch { }
                })
                $script:CardWindow.BeginAnimation([System.Windows.Window]::HeightProperty, $anim)
                $script:CardWindow.Height = [double]$script:CardAnimTo
            }
        }
        if ($null -ne $script:CardFootGlyph) {
            if ($script:CardExpanded) { $script:CardFootGlyph.Text = '︿' } else { $script:CardFootGlyph.Text = 'く' }
        }
    })
    [System.Windows.Controls.Grid]::SetRow($foot, 3)
    [void]$stack.Children.Add($foot)
    $script:CardFootGlyph = $footGlyph

    $window.Content = $root
    [void]$window.Show()
    $handle = [System.Windows.Interop.WindowInteropHelper]::new($window).Handle
    [GuideNative]::MakePanel($handle)
    [GuideNative]::Raise($handle)

    $script:CardWindow = $window
    $script:CardRoot = $root
    $script:CardDate = $date
    $script:CardItems = $items
}

function Update-Card($state) {
    if ($null -eq $script:CardWindow) { New-CardWindow }
    # F02：拖动期间别重建条目，否则抓着的块会被 tick 换掉。
    if ($script:CardDragActive) { return }
    try {
    $card = $state.card
    $plan = $state.plan
    $items = @()
    if ($null -ne $plan -and $null -ne $plan.items) { $items = @($plan.items) }
    if ($null -eq $card -or $card.visible -eq $false) {
        $script:CardWindow.Hide()
        if ($null -ne $script:BallWindow) {
        }
        return
    }

    # 工作区变了（任务栏挪位、分辨率变化）也跟着收，别盖住任务栏。
    if (-not $script:CardAnimating) {
        if ($script:CardExpanded) { $script:CardWindow.Height = [double]$script:WorkHeight } else { $script:CardWindow.Height = [double]$script:CardCompactHeight }
    }

    # 宽度：右边缘钉住，变宽就往左长。
    $want = $script:CardWidth
    if ($null -ne $card.width) { $want = [int]$card.width }
    if ($want -lt 240) { $want = 240 }
    if ($want -gt 640) { $want = 640 }
    if ($want -ne $script:CardWidth) {
        $script:CardWidth = $want
        $script:CardWindow.Width = [double]$want
    }

    # 位置：用户拖到哪就停在哪（state.card.x/y 持久化），没设过才用默认右上角。
    $posX = $null; $posY = $null
    if ($null -ne $card.x -and $null -ne $card.y) { $posX = [double]$card.x; $posY = [double]$card.y }
    if ($null -eq $posX) { $posX = $script:WorkLeft + $script:WorkWidth - $script:CardWindow.Width }
    if ($null -eq $posY) { $posY = $script:WorkTop }
    # 只做边界保护，不拽回默认位置
    $maxX = $script:WorkLeft + $script:WorkWidth - $script:CardWindow.Width
    $maxY = $script:WorkTop + $script:WorkHeight - $script:CardWindow.Height
    if ($posX -lt $script:WorkLeft) { $posX = $script:WorkLeft }
    if ($posX -gt $maxX) { $posX = $maxX }
    if ($posY -lt $script:WorkTop) { $posY = $script:WorkTop }
    if ($posY -gt $maxY) { $posY = $maxY }
    if (-not $script:CardDragging -and [DateTime]::UtcNow -gt $script:CardPinUntil) {
        if ([math]::Abs($script:CardWindow.Left - $posX) -gt 0.5) { $script:CardWindow.Left = $posX }
        if ([math]::Abs($script:CardWindow.Top - $posY) -gt 0.5) { $script:CardWindow.Top = $posY }
    }

    # 每轮清空条目索引：删掉的/改过的不会留旧对象。
    $script:CardItemsById = @{}
    $script:CardBodyById = @{}
    $alpha = $script:CardAlpha
    if ($null -ne $card.opacity) {
        $a = [double]$card.opacity
        if ($a -lt 0.2) { $a = 0.2 }
        if ($a -gt 1) { $a = 1 }
        $alpha = [int][math]::Round($a * 255)
        $script:CardAlpha = $alpha
    }
    $script:CardRoot.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb($alpha, 16, 19, 25))

    # 时间轴按真实时间排：有安排的地方画成实块（高度按时长等比），空档用 25 分钟番茄钟格填。
    # 这样 08:30–10:10 的课就是一个跨三格高的实块，不会再"10:10 排在 09:25 上面"。
    $dayStartMin = $script:DayStartHour * 60
    $dayEndMin = $script:DayEndHour * 60 + $script:DayEndMinute
    $scheduled = New-Object System.Collections.ArrayList
    $whenever = New-Object System.Collections.ArrayList
    $doneCount = 0
    $total = 0
    foreach ($item in $items) {
        if ($null -eq $item) { continue }
        $total++
        if ($item.done -eq $true) { $doneCount++ }
        $fm = -1
        $tm = -1
        if (([string]$item.from) -match '^(\d{1,2}):(\d{2})') { $fm = [int]$matches[1] * 60 + [int]$matches[2] }
        if ($fm -lt 0) { [void]$whenever.Add($item); continue }
        if (([string]$item.to) -match '^(\d{1,2}):(\d{2})') { $tm = [int]$matches[1] * 60 + [int]$matches[2] }
        if ($tm -le $fm) { $tm = $fm + 25 }
        [void]$scheduled.Add([pscustomobject]@{ Item = $item; From = $fm; To = $tm })
    }
    $scheduled = @($scheduled | Sort-Object From)

    # 标题栏空间有限：日期去掉年份，只留 MM-dd，避免和右侧按钮挤在一起。
    $shortDate = ([string]$plan.date) -replace '^\d{4}-', ''
    $script:CardDate.Text = '{0} · {1}/{2}' -f $shortDate, $doneCount, $total
    $script:CardItems.Children.Clear()

    # 时间轴按真实时间排：有安排的地方画成实块（高度按真实时长等比拉伸），空档用半点格填。
    # 这样 08:30–10:10 的课就是一个跨两小时高的实块，位置和长度都跟时间对得上。
    $availH = $script:WorkHeight - 96
    if ($availH -lt 240) { $availH = 240 }
    $pxPerMin = $availH / [double]($dayEndMin - $dayStartMin)
    # F02：拖拽时按同一套时间轴换算像素，存一份给拖拽函数用。
    $script:CardPxPerMin = $pxPerMin
    $script:CardDayStart = $dayStartMin
    $script:CardDayEnd = $dayEndMin

    # 按钮用 Border 包一层，把可点区域撑到 18x18——纯 TextBlock 只有字形大小，很难点中。
        $mkBtn = {
            param($glyph, $tip, $margin)
            $b = [System.Windows.Controls.Border]::new()
            $b.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(1, 0, 0, 0))
            $b.CornerRadius = [System.Windows.CornerRadius]::new(3)
            $b.Padding = [System.Windows.Thickness]::new(4, 1, 4, 1)
            $b.Margin = $margin
            $b.Cursor = [System.Windows.Input.Cursors]::Hand
            $b.ToolTip = $tip
            $tb = [System.Windows.Controls.TextBlock]::new()
            $tb.Text = $glyph
            $tb.FontSize = 11
            $tb.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(190, 255, 255, 255))
            $b.Child = $tb
            $b
        }
    $addItemRow = {
        param($parent, $item, $fromMin, $toMin)

        $isDone = ($item.done -eq $true)
        $rowH = [math]::Max(24, [math]::Round(($toMin - $fromMin) * $pxPerMin))
        $cardRow = [System.Windows.Controls.Grid]::new()
        $cardRow.Height = [double]$rowH
        $cardRow.Margin = [System.Windows.Thickness]::new(0, 1, 0, 2)
        $cc0 = [System.Windows.Controls.ColumnDefinition]::new()
        $cc0.Width = [System.Windows.GridLength]::new(46, [System.Windows.GridUnitType]::Pixel)
        $cc1 = [System.Windows.Controls.ColumnDefinition]::new()
        $cc1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
        $cc2 = [System.Windows.Controls.ColumnDefinition]::new()
        $cc2.Width = [System.Windows.GridLength]::new(40, [System.Windows.GridUnitType]::Pixel)
        [void]$cardRow.ColumnDefinitions.Add($cc0)
        [void]$cardRow.ColumnDefinitions.Add($cc1)
        [void]$cardRow.ColumnDefinitions.Add($cc2)

        $hourText = [System.Windows.Controls.TextBlock]::new()
        $hourText.Text = ('{0:00}:{1:00}' -f [math]::Floor($fromMin / 60), ($fromMin % 60))
        $hourText.FontSize = 9
        $hourText.Margin = [System.Windows.Thickness]::new(0, 2, 0, 0)
        $hourText.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(165, 255, 255, 255))
        [System.Windows.Controls.Grid]::SetColumn($hourText, 0)
        [void]$cardRow.Children.Add($hourText)

        $body = [System.Windows.Controls.Border]::new()
        $body.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(26, 255, 255, 255))
        $body.CornerRadius = [System.Windows.CornerRadius]::new(8)
        $body.Padding = [System.Windows.Thickness]::new(8, 3, 8, 3)
        $body.Cursor = [System.Windows.Input.Cursors]::Hand
        # 标题被截断时，鼠标悬停能看到全文；有备注就一起带上。
        $tipText = [string]$item.title
        if (-not [string]::IsNullOrEmpty([string]$item.note)) { $tipText = $tipText + ' ｜ ' + [string]$item.note }
        if (-not [string]::IsNullOrEmpty([string]$item.repeat)) {
            $tipRep = switch ([string]$item.repeat) { 'daily' { '每天' } 'weekdays' { '工作日' } 'weekly' { '每周' } default { '' } }
            $tipText = $tipText + ' ｜ ↻' + $tipRep
        }
        $body.ToolTip = $tipText
        [System.Windows.Controls.Grid]::SetColumn($body, 1)

        $itemId = [string]$item.id
        $body.Tag = $itemId
        $script:CardItemsById[$itemId] = $item
        $script:CardBodyById[$itemId] = $body
        $checkHandler = {
            # 刚刚是拖动（松手改时间），别再当成打勾。
            if ($script:CardDragMoved) { return }
            Send-OverlayEvent @{ type = 'plan_done'; id = $itemId; done = (-not $isDone) }
        }.GetNewClosure()

        $box = [System.Windows.Controls.TextBlock]::new()
        $box.Text = if ($isDone) { '☑' } else { '☐' }
        $box.FontSize = 11
        $box.Margin = [System.Windows.Thickness]::new(0, 0, 5, 0)
        if ($isDone) {
            $box.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(200, 110, 214, 140))
        } else {
            $box.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(210, 255, 196, 120))
        }

        # 文案用条目自己的 from/to（真实区间）；高度才用绘制段落 fromMin/toMin——两条时间重叠时，
        # 段落会被裁短，但标签不该跟着变，否则课表时间会显示错。
        $realFrom = $fromMin
        $realTo = $toMin
        if ($item.from -match '^(\d{1,2}):(\d{2})$') { $realFrom = [int]$Matches[1] * 60 + [int]$Matches[2] }
        if ($item.to -match '^(\d{1,2}):(\d{2})$') { $realTo = [int]$Matches[1] * 60 + [int]$Matches[2] }
        if ($realTo -le $realFrom) { $realTo = $realFrom + 25 }
        $meta = '{0:00}:{1:00}–{2:00}:{3:00} · {4} 分' -f [math]::Floor($realFrom / 60), ($realFrom % 60), [math]::Floor($realTo / 60), ($realTo % 60), ($realTo - $realFrom)
        if (-not [string]::IsNullOrEmpty([string]$item.place)) { $meta = '{0} · {1}' -f $meta, [string]$item.place }

        $when = [System.Windows.Controls.TextBlock]::new()
        $when.Text = $meta
        $when.FontSize = 8
        # meta 必须只占一行：折行的话「时间 · 时长 · 地点」会挤成两行，整个块就变三行了。
        $when.TextWrapping = [System.Windows.TextWrapping]::NoWrap
        $when.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
        $when.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(140, 255, 255, 255))

        $what = [System.Windows.Controls.TextBlock]::new()
        $what.Text = [string]$item.title
        $what.FontSize = 11
        if ($isDone) {
            $what.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(120, 255, 255, 255))
            $what.TextDecorations = [System.Windows.TextDecorations]::Strikethrough
        } else {
            $what.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(240, 255, 255, 255))
        }

        if ($rowH -lt 46) {
            # 短块（25 分钟那种）：☐ + 标题同一行，但标题必须放进「有确定宽度」的列里，
            # 否则 StackPanel 给的是无限宽，TextWrapping 永远不触发、文字直接被裁掉。
            if (-not [string]::IsNullOrEmpty([string]$item.repeat)) {
                $repText = switch ([string]$item.repeat) { 'daily' { '每天' } 'weekdays' { '工作日' } 'weekly' { '每周' } default { '' } }
                $what.Text = [string]$item.title + ' ↻' + $repText
            }
            $line = [System.Windows.Controls.Grid]::new()
            $line.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
            $lc0 = [System.Windows.Controls.ColumnDefinition]::new()
            $lc0.Width = [System.Windows.GridLength]::new(18, [System.Windows.GridUnitType]::Pixel)
            $lc1 = [System.Windows.Controls.ColumnDefinition]::new()
            $lc1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
            [void]$line.ColumnDefinitions.Add($lc0)
            [void]$line.ColumnDefinitions.Add($lc1)
            $box.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
            [System.Windows.Controls.Grid]::SetColumn($box, 0)
            [void]$line.Children.Add($box)
            $what.FontSize = 10
            $what.TextWrapping = [System.Windows.TextWrapping]::Wrap
            $what.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
            $what.MaxHeight = [double][math]::Max(12, $rowH - 5)
            [System.Windows.Controls.Grid]::SetColumn($what, 1)
            [void]$line.Children.Add($what)
            $content = $line
        } else {
            $stack = [System.Windows.Controls.StackPanel]::new()
            $kindRow = [System.Windows.Controls.StackPanel]::new()
            $kindRow.Orientation = [System.Windows.Controls.Orientation]::Horizontal
            [void]$kindRow.Children.Add($box)
            [void]$kindRow.Children.Add($when)
            if (-not [string]::IsNullOrEmpty([string]$item.repeat)) {
                $rep = [System.Windows.Controls.TextBlock]::new()
                $repText = switch ([string]$item.repeat) { 'daily' { '每天' } 'weekdays' { '工作日' } 'weekly' { '每周' } default { '' } }
                $rep.Text = '↻' + $repText
                $rep.FontSize = 8
                $rep.Margin = [System.Windows.Thickness]::new(4, 0, 0, 0)
                $rep.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(170, 150, 210, 255))
                [void]$kindRow.Children.Add($rep)
            }
            [void]$stack.Children.Add($kindRow)
            $what.TextWrapping = [System.Windows.TextWrapping]::Wrap
            $what.Margin = [System.Windows.Thickness]::new(0, 1, 0, 0)
            [void]$stack.Children.Add($what)
            # F05：备注一行（「带电脑、课本」），只在块够高时显示，短块用 ToolTip 兜底。
            if (-not [string]::IsNullOrEmpty([string]$item.note)) {
                $noteText = [System.Windows.Controls.TextBlock]::new()
                $noteText.Text = [string]$item.note
                $noteText.FontSize = 9
                $noteText.Margin = [System.Windows.Thickness]::new(0, 1, 0, 0)
                $noteText.TextWrapping = [System.Windows.TextWrapping]::NoWrap
                $noteText.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
                $noteText.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 214, 140))
                [void]$stack.Children.Add($noteText)
            }
            $content = $stack
        }

        # 长块里每 30 分钟画一条极淡的刻度线：块高还是按真实时长，但里面不再是空白的。
        $inner = [System.Windows.Controls.Grid]::new()
        # 底部优先级条是叠在内容上的，给内容留出条的高度，短块也不会压字。
        $content.Margin = [System.Windows.Thickness]::new(0, 0, 0, [math]::Min(6, [math]::Max(2, $rowH - 15)))
        [void]$inner.Children.Add($content)
        if ($rowH -ge 60) {
            $mark = [math]::Floor($fromMin / 30.0) * 30 + 30
            while ($mark -lt $toMin) {
                $off = [math]::Round(($mark - $fromMin) * $pxPerMin) - 2
                if ($off -gt 6 -and $off -lt ($rowH - 8)) {
                    $tick = [System.Windows.Controls.Border]::new()
                    $tick.BorderThickness = [System.Windows.Thickness]::new(0, 0, 0, 1)
                    $tick.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(22, 255, 255, 255))
                    $tick.Height = 1
                    $tick.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
                    $tick.Margin = [System.Windows.Thickness]::new(0, $off, 0, 0)
                    $tick.IsHitTestVisible = $false
                    [void]$inner.Children.Add($tick)
                }
                $mark += 30
            }
        }
        # F05：优先级色条放块底部，横着一条，不压文字。
        # 没设优先级也给一条浅灰，表示"普通"，免得用户以为功能只在个别条目上生效。
        $prioColor = $null
        switch ([string]$item.priority) {
            'P0' { $prioColor = [System.Windows.Media.Color]::FromArgb(230, 229, 72, 77) }
            'P1' { $prioColor = [System.Windows.Media.Color]::FromArgb(230, 245, 165, 36) }
            'P2' { $prioColor = [System.Windows.Media.Color]::FromArgb(210, 76, 141, 255) }
            'P3' { $prioColor = [System.Windows.Media.Color]::FromArgb(210, 48, 164, 108) }
            default { $prioColor = [System.Windows.Media.Color]::FromArgb(60, 255, 255, 255) }
        }
        $bar = [System.Windows.Controls.Border]::new()
        if ($rowH -lt 46) {
            # 短块只留一条更细的线，贴块底，避免和文字挤在一起。
            $bar.Height = 1.5
            $bar.Margin = [System.Windows.Thickness]::new(0, 0, 0, 1)
        } else {
            $bar.Height = 2
            $bar.Margin = [System.Windows.Thickness]::new(0, 0, 0, 2)
        }
        $bar.CornerRadius = [System.Windows.CornerRadius]::new(1.5)
        $bar.Background = [System.Windows.Media.SolidColorBrush]::new($prioColor)
        $bar.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Stretch
        $bar.VerticalAlignment = [System.Windows.VerticalAlignment]::Bottom
        $bar.IsHitTestVisible = $false
        [void]$inner.Children.Add($bar)
        $body.Child = $inner

        # F02：按住条目上下拖 → 改 from/to；拖 4px 以内松开仍算点击（走 checkHandler）。
        $body.Add_PreviewMouseLeftButtonDown({
            param($s, $e)
            $row = $script:CardItemsById[[string]$s.Tag]
            $f = 0; $t = 25
            if ($null -ne $row) {
                if (([string]$row.from) -match '^(\d{1,2}):(\d{2})') { $f = [int]$matches[1] * 60 + [int]$matches[2] }
                if (([string]$row.to) -match '^(\d{1,2}):(\d{2})') { $t = [int]$matches[1] * 60 + [int]$matches[2] }
            }
            if ($t -le $f) { $t = $f + 25 }
            $script:CardDragFromMin = $f
            $script:CardDragDur = $t - $f
            # Start-CardDrag 会先 Clear（清掉 id），所以 id 要放在它后面设。
            Start-CardDrag $s $e
            $script:CardDragItemId = [string]$s.Tag
            $script:CardDragDropItem = $row
        })
        $body.Add_PreviewMouseMove({
            param($s, $e)
            Update-CardDrag $s $e
        })
        $body.Add_PreviewMouseLeftButtonUp({
            param($s, $e)
            if ($script:CardDragMoved) {
                $e.Handled = $true
                Finish-CardDrag
            }
        })
        $body.Add_LostMouseCapture({
            param($s, $e)
            if ($script:CardDragActive) { Finish-CardDrag }
        })

        $body.Add_MouseLeftButtonUp([System.Windows.Input.MouseButtonEventHandler]$checkHandler)
        [void]$cardRow.Children.Add($body)

        # 右侧「✎ 改 / ✕ 删」：✎ 弹回同一个表单窗口（预填），✕ 直接发事件。
        # 用 Tag 传 id 再回查 $script:CardItemsById，避免闭包捕获对象（b106 崩溃的根因）。
        $acts = [System.Windows.Controls.StackPanel]::new()
        $acts.Orientation = [System.Windows.Controls.Orientation]::Horizontal
        $acts.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
        $acts.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
        $acts.Margin = [System.Windows.Thickness]::new(2, 2, 2, 0)
        $acts.Opacity = 0.72

        $pencil = & $mkBtn '✎' '改这一条' ([System.Windows.Thickness]::new(0, 0, 4, 0))
        $pencil.Tag = $itemId
        $pencil.Add_PreviewMouseLeftButtonUp({
            param($s, $e)
            $e.Handled = $true
            Write-Log ('edit button clicked: ' + [string]$s.Tag)
            $row = $script:CardItemsById[[string]$s.Tag]
            if ($null -ne $row) { try { Show-AddTaskWindow -EditItem $row } catch { Write-Log ('edit task window failed: ' + $_.Exception.Message) } }
        })

        $cross = & $mkBtn '✕' '删掉这一条' ([System.Windows.Thickness]::new(0))
        $cross.Tag = $itemId
        $cross.Add_PreviewMouseLeftButtonUp({
            param($s, $e)
            $e.Handled = $true
            # B01：第一次点只「上膛」，2.5 秒内再点同一条才真删。
            # 旧版 1.2 秒防抖根本挡不住误触，日志里三次连删 4–5 条就是它。
            if ($null -eq $script:DeleteArmed) { $script:DeleteArmed = @{} }
            $id = [string]$s.Tag
            $nowDel = Get-Date
            $armedAt = $null
            if ($script:DeleteArmed.ContainsKey($id)) { $armedAt = $script:DeleteArmed[$id] }
            if ($null -ne $armedAt -and ($nowDel - $armedAt).TotalMilliseconds -le 2500) {
                $script:DeleteArmed.Remove($id)
                Write-Log ('delete confirmed: ' + $id)
                Send-OverlayEvent @{ type = 'plan_remove'; id = $id }
                return
            }
            $script:DeleteArmed[$id] = $nowDel
            Write-Log ('delete armed: ' + $id)
            $s.Child.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 255, 92, 92))
            $s.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(60, 255, 80, 80))
            $s.ToolTip = '再点一次才真的删（2.5 秒内）'
        })

        [void]$acts.Children.Add($pencil)
        [void]$acts.Children.Add($cross)
        [System.Windows.Controls.Grid]::SetColumn($acts, 2)
        [void]$cardRow.Children.Add($acts)

        [void]$parent.Children.Add($cardRow)
    }

    $cursor = $dayStartMin
    while ($cursor -lt $dayEndMin) {
        $hit = $null
        foreach ($s in $scheduled) {
            if ($s.From -le $cursor -and $s.To -gt $cursor) { $hit = $s; break }
        }
        if ($null -ne $hit) {
            $segEnd = [math]::Min($hit.To, $dayEndMin)
            & $addItemRow $script:CardItems $hit.Item $cursor $segEnd
            $cursor = $segEnd
            continue
        }
        $base = [math]::Floor($cursor / 30.0) * 30
        $nextB = $base + 30
        if ($nextB -le $cursor) { $nextB = $cursor + 30 }
        # 空档别越过下一条的开始时间（否则 10:10 之后那条 10:20 的课会被推进 10:30 的格子里）
        $nextStart = $dayEndMin
        foreach ($s2 in $scheduled) {
            if ($s2.From -gt $cursor -and $s2.From -lt $nextStart) { $nextStart = $s2.From }
        }
        if ($nextStart -lt $nextB) { $nextB = $nextStart }
        $segEnd = [math]::Min($nextB, $dayEndMin)
        # 只剩几分钟的尾巴不单独成行，直接跳过，让两块贴着。
        if (($segEnd - $cursor) -lt 8) { $cursor = $segEnd; continue }
        $gapRow = [System.Windows.Controls.Grid]::new()
        $gapH = [double][math]::Max(14, [math]::Round(($segEnd - $cursor) * $pxPerMin))
        $gapRow.Height = $gapH
        # 太矮的空档（比如一条结束后到下一条只剩 5–10 分钟）放不下 9pt 的时间字和 ＋，
        # 硬塞会把字压到下一条的块上，看起来像重叠。矮的只留一条线。
        $showGapLabel = $true
        $showGapAdd = ($gapH -ge 18)
        $gc0 = [System.Windows.Controls.ColumnDefinition]::new()
        $gc0.Width = [System.Windows.GridLength]::new(46, [System.Windows.GridUnitType]::Pixel)
        $gc1 = [System.Windows.Controls.ColumnDefinition]::new()
        $gc1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
        $gc2 = [System.Windows.Controls.ColumnDefinition]::new()
        $gc2.Width = [System.Windows.GridLength]::new(40, [System.Windows.GridUnitType]::Pixel)
        [void]$gapRow.ColumnDefinitions.Add($gc0)
        [void]$gapRow.ColumnDefinitions.Add($gc1)
        [void]$gapRow.ColumnDefinitions.Add($gc2)
        $gl = [System.Windows.Controls.TextBlock]::new()
        $gl.Text = ('{0:00}:{1:00}' -f [math]::Floor($cursor / 60), ($cursor % 60))
        $gl.FontSize = 8
        if ($gapH -ge 24) { $gl.FontSize = 9 }
        if (-not $showGapLabel) { $gl.Visibility = [System.Windows.Visibility]::Collapsed }
        $gl.Margin = [System.Windows.Thickness]::new(0, -1, 0, 0)
        $gl.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
        $gl.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(120, 255, 255, 255))
        [System.Windows.Controls.Grid]::SetColumn($gl, 0)
        [void]$gapRow.Children.Add($gl)
        $line = [System.Windows.Controls.Border]::new()
        $line.BorderThickness = [System.Windows.Thickness]::new(0, 0, 0, 1)
        $line.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(16, 255, 255, 255))
        [System.Windows.Controls.Grid]::SetColumn($line, 1)
        [void]$gapRow.Children.Add($line)
        # 空档右边给个「＋」：点了就用这一段的开始时间当默认值开表单。
        $gapTime = $gl.Text
        $gapAdd = & $mkBtn '＋' '在这个时间加一条' ([System.Windows.Thickness]::new(0))
        $gapAdd.Opacity = 0.42
        $gapAdd.Tag = $gapTime
        $gapAdd.Add_PreviewMouseLeftButtonUp({
            param($s, $e)
            $e.Handled = $true
            $when = [string]$s.Tag
            Write-Log ('gap add clicked: ' + $when)
            try { Show-AddTaskWindow -DefaultFrom $when } catch { Write-Log ('gap add window failed: ' + $_.Exception.Message) }
        })
        if ($showGapAdd) {
            [System.Windows.Controls.Grid]::SetColumn($gapAdd, 2)
            [void]$gapRow.Children.Add($gapAdd)
        }
        [void]$script:CardItems.Children.Add($gapRow)
        $cursor = $segEnd
    }

    if ($whenever.Count -gt 0) {
        $sep = [System.Windows.Controls.TextBlock]::new()
        $sep.Text = '没定时间的'
        $sep.FontSize = 9
        $sep.Margin = [System.Windows.Thickness]::new(0, 10, 0, 4)
        $sep.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(120, 255, 255, 255))
        [void]$script:CardItems.Children.Add($sep)
        foreach ($w in $whenever) { & $addItemRow $script:CardItems $w -1 -1 }
    }

    if (-not $script:CardWindow.IsVisible) { $script:CardWindow.Show() }

    # 拖拽刚落下：新条目从松手位置滑到自己的真实布局位置（终点就是布局位置，演完不会跳）。
    $dropHint = $script:CardDropHint
    $script:CardDropHint = $null
    if ($null -ne $dropHint) {
        $hb = $script:CardBodyById[[string]$dropHint.id]
        if ($null -ne $hb -and $null -ne $script:CardDragLayer) {
            try {
                $script:CardItems.UpdateLayout()
                $ny = $hb.TranslatePoint([System.Windows.Point]::new(0, 0), $script:CardDragLayer).Y
                $dy = [double]$dropHint.fromY - $ny
                # 落点与松手位置重合时，从上方 8px 落下来，保留「放下」的观感；
                # 动画终点仍是布局位置，所以演完不会跳。
                if ([math]::Abs($dy) -lt 1.0) { $dy = -8.0 }
                $tt = [System.Windows.Media.TranslateTransform]::new(0.0, $dy)
                $hb.RenderTransformOrigin = [System.Windows.Point]::new(0.5, 0.5)
                $an = [System.Windows.Media.Animation.DoubleAnimation]::new($dy, 0.0, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(220)))
                $ease = [System.Windows.Media.Animation.CubicEase]::new()
                $ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
                $an.EasingFunction = $ease
                $tt.BeginAnimation([System.Windows.Media.TranslateTransform]::YProperty, $an)
                # 落地压一下再弹回，作为「放下去」的反馈。
                $sk = [System.Windows.Media.Animation.DoubleAnimationUsingKeyFrames]::new()
                $k1 = [System.Windows.Media.Animation.EasingDoubleKeyFrame]::new(0.94, [System.Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds(110)))
                $eIn = [System.Windows.Media.Animation.CubicEase]::new()
                $eIn.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseIn
                $k1.EasingFunction = $eIn
                [void]$sk.KeyFrames.Add($k1)
                $k2 = [System.Windows.Media.Animation.EasingDoubleKeyFrame]::new(1.0, [System.Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds(260)))
                $eBack = [System.Windows.Media.Animation.BackEase]::new()
                $eBack.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
                $eBack.Amplitude = 0.3
                $k2.EasingFunction = $eBack
                [void]$sk.KeyFrames.Add($k2)
                $st = [System.Windows.Media.ScaleTransform]::new(1.0, 1.0)
                $tg = [System.Windows.Media.TransformGroup]::new()
                [void]$tg.Children.Add($st)
                $hb.RenderTransform = $tg
                [void]$tg.Children.Add($tt)
                $st.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $sk)
            } catch { }
        }
    }
    if ($null -ne $script:BallWindow) {
    }
    } catch { Write-Log ('card render failed: ' + $_.Exception.Message + ' @' + $_.InvocationInfo.ScriptLineNumber) }
}

# T10：截图与巡检照片的存储统计 / 清理。数据目录固定为 ~/.dsh/guide-tutor。
function Get-ShotStorage {
    $root = Join-Path $env:USERPROFILE '.dsh\guide-tutor\shots'
    $count = 0
    $bytes = 0
    foreach ($dir in @($root, (Join-Path $root 'cam'))) {
        if (-not (Test-Path -LiteralPath $dir)) { continue }
        Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue | ForEach-Object {
            $count++
            $bytes += $_.Length
        }
    }
    return [pscustomobject]@{ Count = $count; Bytes = $bytes; Root = $root }
}

function Clear-OldShots {
    param([int]$days = 7)
    $root = Join-Path $env:USERPROFILE '.dsh\guide-tutor\shots'
    $cut = (Get-Date).AddDays(-$days)
    $removed = 0
    foreach ($dir in @($root, (Join-Path $root 'cam'))) {
        if (-not (Test-Path -LiteralPath $dir)) { continue }
        Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cut } | ForEach-Object {
            try {
                Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
                $removed++
            } catch { }
        }
    }
    Write-Log ('shot cleanup: removed ' + $removed)
    return $removed
}

function Read-TemplatesFile {
    $path = Join-Path $DataDir 'plan-templates.json'
    if (-not (Test-Path -LiteralPath $path)) { return @() }
    try {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        $obj = $raw | ConvertFrom-Json
        if ($null -eq $obj -or $null -eq $obj.templates) { return @() }
        $out = @()
        foreach ($prop in $obj.templates.PSObject.Properties) {
            $items = @($prop.Value.items)
            $out += [pscustomobject]@{
                Name = [string]$prop.Name
                Count = [int]$items.Count
                SavedAt = [string]$prop.Value.savedAt
                Date = [string]$prop.Value.date
            }
        }
        return @($out | Sort-Object SavedAt -Descending)
    } catch {
        Write-Log ('templates read failed: ' + $_.Exception.Message)
        return @()
    }
}

function Show-TemplatesWindow {
    if ($null -ne $script:TemplatesWindow -and $script:TemplatesWindow.IsVisible) {
        $script:TemplatesWindow.Activate()
        return
    }

    $gw = New-GWindow '教学助手 · 清单模板' 520 ([math]::Min(620, [math]::Max(400, $script:WorkHeight - 140))) -NoBar
    $win = $gw.Window
    $win.FontFamily = 'Microsoft YaHei'
    $script:TemplatesWindow = $win
    $script:TplDeleteArmed = $null

    $grid = [System.Windows.Controls.Grid]::new()
    $grid.Margin = [System.Windows.Thickness]::new(16, 14, 16, 14)
    foreach ($h in @('Auto', 'Auto', '*', 'Auto')) {
        $rd = [System.Windows.Controls.RowDefinition]::new()
        if ($h -eq '*') { $rd.Height = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star) }
        else { $rd.Height = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto) }
        [void]$grid.RowDefinitions.Add($rd)
    }
    $gw.Body.Content = $grid

    $head = [System.Windows.Controls.Grid]::new()
    $h1 = [System.Windows.Controls.ColumnDefinition]::new()
    $h1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $h2 = [System.Windows.Controls.ColumnDefinition]::new()
    $h2.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
    [void]$head.ColumnDefinitions.Add($h1)
    [void]$head.ColumnDefinitions.Add($h2)
    $title = [System.Windows.Controls.TextBlock]::new()
    $title.Text = '清单模板'
    $title.FontSize = 17
    $title.FontWeight = [System.Windows.FontWeights]::SemiBold
    $title.Foreground = [System.Windows.Media.Brushes]::White
    [void]$head.Children.Add($title)
    $sub = [System.Windows.Controls.TextBlock]::new()
    $sub.Text = '把某一天的清单存下来，铺到今天 / 明天 / 后天'
    $sub.FontSize = 11
    $sub.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $sub.Margin = [System.Windows.Thickness]::new(10, 2, 0, 0)
    $sub.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
    [System.Windows.Controls.Grid]::SetColumn($sub, 1)
    [void]$head.Children.Add($sub)
    [System.Windows.Controls.Grid]::SetRow($head, 0)
    [void]$grid.Children.Add($head)

    $hint = [System.Windows.Controls.TextBlock]::new()
    $hint.Text = '「铺到」会直接把模板写进那一天的清单；明天/后天的条目到当天第一次打开清单时出现。'
    $hint.FontSize = 10.5
    $hint.TextWrapping = [System.Windows.TextWrapping]::Wrap
    $hint.Margin = [System.Windows.Thickness]::new(0, 8, 0, 10)
    $hint.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(130, 255, 255, 255))
    [System.Windows.Controls.Grid]::SetRow($hint, 1)
    [void]$grid.Children.Add($hint)

    $script:TemplateListStack = [System.Windows.Controls.StackPanel]::new()
    $scroll = [System.Windows.Controls.ScrollViewer]::new()
    $scroll.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Auto
    $scroll.Padding = [System.Windows.Thickness]::new(0, 0, 4, 0)
    $scroll.Content = $script:TemplateListStack
    [System.Windows.Controls.Grid]::SetRow($scroll, 2)
    [void]$grid.Children.Add($scroll)

    $refresh = {
        $stack = $script:TemplateListStack
        if ($null -eq $stack) { return }
        $stack.Children.Clear()
        $tpls = @(Read-TemplatesFile)
        if (-not $tpls.Count) {
            $empty = [System.Windows.Controls.TextBlock]::new()
            $empty.Text = '还没有模板。在下面输入名字，点「把今天存为模板」；明天要用时，一键铺过去。'
            $empty.TextWrapping = [System.Windows.TextWrapping]::Wrap
            $empty.Margin = [System.Windows.Thickness]::new(0, 4, 0, 0)
            $empty.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(140, 255, 255, 255))
            [void]$stack.Children.Add($empty)
            return
        }
        foreach ($tpl in $tpls) {
            $row = [System.Windows.Controls.Border]::new()
            $row.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 28, 33, 41))
            $row.CornerRadius = [System.Windows.CornerRadius]::new(8)
            $row.Padding = [System.Windows.Thickness]::new(12, 9, 12, 9)
            $row.Margin = [System.Windows.Thickness]::new(0, 0, 0, 8)

            $rg = [System.Windows.Controls.Grid]::new()
            $c0 = [System.Windows.Controls.ColumnDefinition]::new()
            $c0.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
            $c1 = [System.Windows.Controls.ColumnDefinition]::new()
            $c1.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
            $c2 = [System.Windows.Controls.ColumnDefinition]::new()
            $c2.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
            [void]$rg.ColumnDefinitions.Add($c0)
            [void]$rg.ColumnDefinitions.Add($c1)
            [void]$rg.ColumnDefinitions.Add($c2)

            $ts = [System.Windows.Controls.StackPanel]::new()
            $nameTb = [System.Windows.Controls.TextBlock]::new()
            $nameTb.Text = [string]$tpl.Name
            $nameTb.FontSize = 13
            $nameTb.FontWeight = [System.Windows.FontWeights]::SemiBold
            $nameTb.Foreground = [System.Windows.Media.Brushes]::White
            $nameTb.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
            [void]$ts.Children.Add($nameTb)
            $metaTb = [System.Windows.Controls.TextBlock]::new()
            $savedDay = [string]$tpl.SavedAt
            if ($savedDay.Length -ge 10) { $savedDay = $savedDay.Substring(0, 10) }
            $metaTb.Text = ('{0} 条 · 存于 {1}' -f $tpl.Count, $savedDay)
            $metaTb.FontSize = 10.5
            $metaTb.Margin = [System.Windows.Thickness]::new(0, 3, 0, 0)
            $metaTb.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(135, 255, 255, 255))
            [void]$ts.Children.Add($metaTb)
            [System.Windows.Controls.Grid]::SetColumn($ts, 0)
            [void]$rg.Children.Add($ts)

            $apply = [System.Windows.Controls.Button]::new()
            $apply.Content = '铺到 ▾'
            $apply.FontSize = 11
            $apply.Padding = [System.Windows.Thickness]::new(10, 4, 10, 4)
            $apply.Margin = [System.Windows.Thickness]::new(8, 0, 6, 0)
            $apply.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
            $apply.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 46, 52, 62))
            $apply.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 226, 233, 242))
            $apply.BorderThickness = [System.Windows.Thickness]::new(0)
            $apply.Cursor = [System.Windows.Input.Cursors]::Hand
            $apply.Tag = [string]$tpl.Name
            $apply.Add_Click({
                param($s, $e)
                $name = [string]$s.Tag
                $menu = [System.Windows.Controls.ContextMenu]::new()
                foreach ($opt in @(@('今天', 0), @('明天', 1), @('后天', 2))) {
                    $mi = [System.Windows.Controls.MenuItem]::new()
                    $mi.Header = ('铺到' + $opt[0])
                    $mi.Tag = @{ Name = $name; Offset = [int]$opt[1] }
                    $mi.Add_Click({
                        param($m, $ev)
                        $t = $m.Tag
                        Send-OverlayEvent @{ type = 'template_apply'; name = [string]$t.Name; dayOffset = [int]$t.Offset }
                        Start-Sleep -Milliseconds 300
                        & $script:RefreshTemplates
                    })
                    [void]$menu.Items.Add($mi)
                }
                $menu.PlacementTarget = $s
                $menu.Placement = [System.Windows.Controls.Primitives.PlacementMode]::Bottom
                $menu.IsOpen = $true
            })
            [System.Windows.Controls.Grid]::SetColumn($apply, 1)
            [void]$rg.Children.Add($apply)

            $del = [System.Windows.Controls.TextBlock]::new()
            $del.Text = '×'
            $del.FontSize = 14
            $del.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
            $del.Cursor = [System.Windows.Input.Cursors]::Hand
            $del.ToolTip = '删除这个模板（点两次确认）'
            $del.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
            $del.Tag = [string]$tpl.Name
            $del.Add_PreviewMouseLeftButtonDown({
                param($s, $e)
                $e.Handled = $true
                $name = [string]$s.Tag
                $now = [DateTime]::UtcNow
                $armed = $script:TplDeleteArmed
                if ($null -ne $armed -and $armed.Name -eq $name -and ($now - $armed.At).TotalSeconds -lt 2.5) {
                    $script:TplDeleteArmed = $null
                    Send-OverlayEvent @{ type = 'template_remove'; name = $name }
                    Start-Sleep -Milliseconds 300
                    & $script:RefreshTemplates
                } else {
                    $script:TplDeleteArmed = @{ Name = $name; At = $now }
                    $s.Text = '确认删'
                    $s.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 248, 113, 113))
                }
            })
            [System.Windows.Controls.Grid]::SetColumn($del, 2)
            [void]$rg.Children.Add($del)

            $row.Child = $rg
            [void]$stack.Children.Add($row)
        }
    }
    $script:RefreshTemplates = $refresh
    & $refresh

    $foot = [System.Windows.Controls.Grid]::new()
    $foot.Margin = [System.Windows.Thickness]::new(0, 10, 0, 0)
    $f0 = [System.Windows.Controls.ColumnDefinition]::new()
    $f0.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    $f1 = [System.Windows.Controls.ColumnDefinition]::new()
    $f1.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
    $f2 = [System.Windows.Controls.ColumnDefinition]::new()
    $f2.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
    [void]$foot.ColumnDefinitions.Add($f0)
    [void]$foot.ColumnDefinitions.Add($f1)
    [void]$foot.ColumnDefinitions.Add($f2)
    $script:TplNameBox = [System.Windows.Controls.TextBox]::new()
    $script:TplNameBox.FontSize = 12
    $script:TplNameBox.Height = 30
    $script:TplNameBox.Padding = [System.Windows.Thickness]::new(8, 3, 8, 3)
    $script:TplNameBox.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 30, 35, 44))
    $script:TplNameBox.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 232, 238, 246))
    $script:TplNameBox.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(60, 255, 255, 255))
    $script:TplNameBox.BorderThickness = [System.Windows.Thickness]::new(1)
    $script:TplNameBox.VerticalContentAlignment = [System.Windows.VerticalAlignment]::Center
    $script:TplNameBox.ToolTip = '给模板起个名字，比如「晚间」「周末」'
    [System.Windows.Controls.Grid]::SetColumn($script:TplNameBox, 0)
    [void]$foot.Children.Add($script:TplNameBox)
    $saveBtn = [System.Windows.Controls.Button]::new()
    $saveBtn.Content = '把今天存为模板'
    $saveBtn.FontSize = 11.5
    $saveBtn.Padding = [System.Windows.Thickness]::new(12, 5, 12, 5)
    $saveBtn.Margin = [System.Windows.Thickness]::new(8, 0, 0, 0)
    $saveBtn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 59, 130, 246))
    $saveBtn.Foreground = [System.Windows.Media.Brushes]::White
    $saveBtn.BorderThickness = [System.Windows.Thickness]::new(0)
    $saveBtn.Cursor = [System.Windows.Input.Cursors]::Hand
    $saveBtn.Add_Click({
        $name = ([string]$script:TplNameBox.Text).Trim()
        if (-not $name) {
            $script:TplNameBox.ToolTip = '先给模板起个名字'
            return
        }
        Send-OverlayEvent @{ type = 'template_save'; name = $name }
        Start-Sleep -Milliseconds 300
        $script:TplNameBox.Text = ''
        & $script:RefreshTemplates
    })
    [System.Windows.Controls.Grid]::SetColumn($saveBtn, 1)
    [void]$foot.Children.Add($saveBtn)
    $close = [System.Windows.Controls.Button]::new()
    $close.Content = '关闭'
    $close.FontSize = 11.5
    $close.Padding = [System.Windows.Thickness]::new(12, 5, 12, 5)
    $close.Margin = [System.Windows.Thickness]::new(8, 0, 0, 0)
    $close.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 46, 52, 62))
    $close.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(255, 226, 233, 242))
    $close.BorderThickness = [System.Windows.Thickness]::new(0)
    $close.Cursor = [System.Windows.Input.Cursors]::Hand
    $close.Add_Click({ try { $script:TemplatesWindow.Close() } catch { } })
    [System.Windows.Controls.Grid]::SetColumn($close, 2)
    [void]$foot.Children.Add($close)
    [System.Windows.Controls.Grid]::SetRow($foot, 3)
    [void]$grid.Children.Add($foot)

    $win.Add_Closed({
        $script:TemplatesWindow = $null
        $script:TemplateListStack = $null
        $script:RefreshTemplates = $null
        $script:TplNameBox = $null
    })
    $win.Show()
}

function Show-SettingsWindow {
    if ($null -ne $script:SettingsWindow -and $script:SettingsWindow.IsVisible) {
        $script:SettingsWindow.Activate()
        return
    }
    $win = [System.Windows.Window]::new()
    $win.WindowStyle = [System.Windows.WindowStyle]::None
    $win.AllowsTransparency = $true
    $win.Background = [System.Windows.Media.Brushes]::Transparent
    $win.Topmost = $true
    $win.Width = 420
    $win.SizeToContent = [System.Windows.SizeToContent]::Height
    $win.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
    $win.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $win.FontFamily = 'Microsoft YaHei'

    $shell = [System.Windows.Controls.Border]::new()
    $shell.CornerRadius = [System.Windows.CornerRadius]::new([double]$script:G.RadWin)
    $shell.Background = $script:G.Card
    $shell.BorderBrush = $script:G.Line
    $shell.BorderThickness = [System.Windows.Thickness]::new(1)
    $shell.Margin = [System.Windows.Thickness]::new(12)
    Add-GShadow $shell 28 0.5 | Out-Null

    $stack = [System.Windows.Controls.StackPanel]::new()
    $stack.Margin = [System.Windows.Thickness]::new(18, 14, 18, 16)

    $hint = [System.Windows.Controls.TextBlock]::new()
    $hint.Text = '拖滑块即时预览，松手才写盘。'
    $hint.FontSize = 11
    $hint.Margin = [System.Windows.Thickness]::new(0, 0, 0, 8)
    $hint.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(150, 255, 255, 255))
    [void]$stack.Children.Add($hint)

    function New-SettingBlock([string]$label, [double]$min, [double]$max, [double]$value, [string]$fmt) {
        $grid = [System.Windows.Controls.Grid]::new()
        $grid.Margin = [System.Windows.Thickness]::new(0, 5, 0, 5)
        $c0 = [System.Windows.Controls.ColumnDefinition]::new()
        $c0.Width = [System.Windows.GridLength]::new(92, [System.Windows.GridUnitType]::Pixel)
        $c1 = [System.Windows.Controls.ColumnDefinition]::new()
        $c1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
        $c2 = [System.Windows.Controls.ColumnDefinition]::new()
        $c2.Width = [System.Windows.GridLength]::new(56, [System.Windows.GridUnitType]::Pixel)
        [void]$grid.ColumnDefinitions.Add($c0)
        [void]$grid.ColumnDefinitions.Add($c1)
        [void]$grid.ColumnDefinitions.Add($c2)

        $lab = [System.Windows.Controls.TextBlock]::new()
        $lab.Text = $label
        $lab.FontSize = 12
        $lab.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $lab.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(215, 255, 255, 255))
        [System.Windows.Controls.Grid]::SetColumn($lab, 0)
        [void]$grid.Children.Add($lab)

        $sl = [System.Windows.Controls.Slider]::new()
        $sl.Minimum = $min
        $sl.Maximum = $max
        $sl.Value = $value
        $sl.IsSnapToTickEnabled = $false
        $sl.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        [System.Windows.Controls.Grid]::SetColumn($sl, 1)
        [void]$grid.Children.Add($sl)

        $val = [System.Windows.Controls.TextBlock]::new()
        $val.FontSize = 11
        $val.Margin = [System.Windows.Thickness]::new(6, 0, 0, 0)
        $val.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $val.Text = ($fmt -f $value)
        $val.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(185, 255, 255, 255))
        [System.Windows.Controls.Grid]::SetColumn($val, 2)
        [void]$grid.Children.Add($val)

        [void]$stack.Children.Add($grid)
        return [pscustomobject]@{ Slider = $sl; Value = $val }
    }

    # 清单透明度
    $cardOp = New-SettingBlock '清单透明度' 20 100 ([math]::Round($script:CardAlpha / 255.0 * 100)) '{0:0}%'
    $cardOp.Slider.Add_ValueChanged({
        param($s, $e)
        $script:CardAlpha = [int][math]::Round($e.NewValue / 100.0 * 255)
        if ($null -ne $script:CardRoot) {
            $script:CardRoot.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb($script:CardAlpha, 16, 19, 25))
        }
        $script:SetCardOpValue.Text = ('{0:0}%' -f $e.NewValue)
    })
    $cardOp.Slider.AddHandler([System.Windows.UIElement]::MouseLeftButtonUpEvent, [System.Windows.Input.MouseButtonEventHandler]{ Send-OverlayEvent @{ type = 'card_opacity'; opacity = ($script:CardAlpha / 255.0) } }, $true)
    $script:SetCardOpValue = $cardOp.Value

    # 清单宽度
    $cardW = New-SettingBlock '清单宽度' 240 640 $script:CardWidth '{0:0}'
    $cardW.Slider.Add_ValueChanged({
        param($s, $e)
        $w = [int]$e.NewValue
        $script:CardWidth = $w
        if ($null -ne $script:CardWindow) {
            $script:CardWindow.Width = [double]$w
            $script:CardWindow.Left = $script:WorkLeft + $script:WorkWidth - [double]$w
        }
        $script:SetCardWValue.Text = ('{0:0}' -f $e.NewValue)
    })
    $cardW.Slider.AddHandler([System.Windows.UIElement]::MouseLeftButtonUpEvent, [System.Windows.Input.MouseButtonEventHandler]{ Send-OverlayEvent @{ type = 'card_width'; width = $script:CardWidth } }, $true)
    $script:SetCardWValue = $cardW.Value

    # 悬浮球透明度
    $ballOp = New-SettingBlock '悬浮球透明度' 20 100 ([math]::Round($script:BallAlpha / 255.0 * 100)) '{0:0}%'
    $ballOp.Slider.Add_ValueChanged({
        param($s, $e)
        Apply-BallOpacity ($e.NewValue / 100.0)
        $script:SetBallOpValue.Text = ('{0:0}%' -f $e.NewValue)
    })
    $ballOp.Slider.AddHandler([System.Windows.UIElement]::MouseLeftButtonUpEvent, [System.Windows.Input.MouseButtonEventHandler]{ Send-OverlayEvent @{ type = 'ball_opacity'; opacity = ($script:BallAlpha / 255.0) } }, $true)
    $script:SetBallOpValue = $ballOp.Value

    # 面板透明度
    $panelOp = New-SettingBlock '面板透明度' 35 100 92 '{0:0}%'
    $panelOp.Slider.Add_ValueChanged({
        param($s, $e)
        $alpha = [byte][math]::Round($e.NewValue / 100.0 * 255.0)
        $script:PanelBg.Color = [System.Windows.Media.Color]::FromArgb($alpha, 20, 24, 30)
        if ($null -ne $script:PanelOuter) { $script:PanelOuter.Background = $script:PanelBg }
        $script:SetPanelOpValue.Text = ('{0:0}%' -f $e.NewValue)
    })
    $panelOp.Slider.AddHandler([System.Windows.UIElement]::MouseLeftButtonUpEvent, [System.Windows.Input.MouseButtonEventHandler]{ Send-OverlayEvent @{ type = 'opacity'; value = ([double]($script:SetPanelOpValue.Text.TrimEnd('%')) / 100.0) } }, $true)
    $script:SetPanelOpValue = $panelOp.Value

    # 面板大小
    $panelSz = New-SettingBlock '面板大小' 70 180 ([math]::Round($script:UiScale * 100)) '{0:0}%'
    $panelSz.Slider.Add_ValueChanged({
        param($s, $e)
        Apply-UiScale ($e.NewValue / 100.0) -Quiet -FromSlider
        $script:SetPanelSzValue.Text = ('{0:0}%' -f $e.NewValue)
    })
    $panelSz.Slider.AddHandler([System.Windows.UIElement]::MouseLeftButtonUpEvent, [System.Windows.Input.MouseButtonEventHandler]{ Send-OverlayEvent @{ type = 'ui_scale'; scale = $script:UiScale } }, $true)
    $script:SetPanelSzValue = $panelSz.Value

    # 语气
    $toneLab = [System.Windows.Controls.TextBlock]::new()
    $toneLab.Text = '提醒语气'
    $toneLab.FontSize = 12
    $toneLab.Margin = [System.Windows.Thickness]::new(0, 12, 0, 6)
    [void]$stack.Children.Add($toneLab)

    $toneRow = [System.Windows.Controls.StackPanel]::new()
    $toneRow.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    foreach ($pair in @(@('strict', '严厉'), @('normal', '正常'), @('buddy', '损友'), @('minimal', '极简'))) {
        $btn = [System.Windows.Controls.Button]::new()
        $btn.Content = $pair[1]
        $btn.FontSize = 12
        $btn.Padding = [System.Windows.Thickness]::new(10, 4, 10, 4)
        $btn.Margin = [System.Windows.Thickness]::new(0, 0, 8, 0)
        $btn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(38, 255, 255, 255))
        $btn.Foreground = [System.Windows.Media.Brushes]::White
        $btn.BorderThickness = [System.Windows.Thickness]::new(0)
        $btn.Cursor = [System.Windows.Input.Cursors]::Hand
        $key = $pair[0]
        $handler = {
            Send-OverlayEvent @{ type = 'tone'; tone = $key }
        }.GetNewClosure()
        $btn.Add_Click([System.Windows.RoutedEventHandler]$handler)
        [void]$toneRow.Children.Add($btn)
    }
    [void]$stack.Children.Add($toneRow)

    # T10：截图与巡检照片存了多少、留多久，都在这里说清楚。
    $shotLab = [System.Windows.Controls.TextBlock]::new()
    $shotLab.Text = '截图与巡检（保留 7 天）'
    $shotLab.FontSize = 12
    $shotLab.Margin = [System.Windows.Thickness]::new(0, 12, 0, 4)
    [void]$stack.Children.Add($shotLab)

    $shotInfo = [System.Windows.Controls.TextBlock]::new()
    $shotInfo.FontSize = 11
    $shotInfo.TextWrapping = [System.Windows.TextWrapping]::Wrap
    $shotInfo.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(185, 255, 255, 255))
    [void]$stack.Children.Add($shotInfo)
    $script:SetShotInfo = $shotInfo

    $refreshShotInfo = {
        $st = Get-ShotStorage
        $mb = [math]::Round($st.Bytes / 1MB, 1)
        $script:SetShotInfo.Text = ('共 {0} 张、{1} MB；超过 7 天的会自动删除。' -f $st.Count, $mb)
    }
    & $refreshShotInfo

    $cleanBtn = [System.Windows.Controls.Button]::new()
    $cleanBtn.Content = '清理 7 天前的'
    $cleanBtn.FontSize = 11
    $cleanBtn.Padding = [System.Windows.Thickness]::new(10, 3, 10, 3)
    $cleanBtn.Margin = [System.Windows.Thickness]::new(0, 6, 0, 0)
    $cleanBtn.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Left
    $cleanBtn.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(38, 255, 255, 255))
    $cleanBtn.Foreground = [System.Windows.Media.Brushes]::White
    $cleanBtn.BorderThickness = [System.Windows.Thickness]::new(0)
    $cleanBtn.Cursor = [System.Windows.Input.Cursors]::Hand
    $cleanBtn.Add_Click({
        param($s, $e)
        try {
            $n = Clear-OldShots 7
            $st = Get-ShotStorage
            $mb = [math]::Round($st.Bytes / 1MB, 1)
            $script:SetShotInfo.Text = ('已清理 {0} 个；现在 {1} 张、{2} MB。' -f $n, $st.Count, $mb)
        } catch {
            Write-Log ('shot cleanup failed: ' + $_.Exception.Message)
            $script:SetShotInfo.Text = '清理失败，看 overlay.log。'
        }
    })
    [void]$stack.Children.Add($cleanBtn)


    $closeBtn = [System.Windows.Controls.Button]::new()
    $closeBtn.Content = '关闭'
    $closeBtn.FontSize = 12
    $closeBtn.Margin = [System.Windows.Thickness]::new(0, 16, 0, 0)
    $closeBtn.Padding = [System.Windows.Thickness]::new(0, 6, 0, 6)
    $closeBtn.Add_Click({ param($s, $e) $script:SettingsWindow.Close() })
    [void]$stack.Children.Add($closeBtn)

    $shell.Child = $stack
    $win.Content = $shell
    $script:SettingsWindow = $win
    [void]$win.Show()
    [void]$win.Activate()
}

# --- 顶部当前任务条 ------------------------------------------------------
# 屏幕顶端一行，显示"现在这个时段该干的事"。可拖（拖文字）、可调大小（Ctrl+滚轮），
# 位置与大小记在 state.topbar 里，重启还在。
function New-TopBarWindow {
    $window = [System.Windows.Window]::new()
    $window.WindowStyle = [System.Windows.WindowStyle]::None
    $window.AllowsTransparency = $true
    $window.Background = [System.Windows.Media.Brushes]::Transparent
    $window.Topmost = $true
    $window.ShowInTaskbar = $false
    $window.ShowActivated = $false
    $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
    $window.SizeToContent = [System.Windows.SizeToContent]::WidthAndHeight
    $window.Left = $script:WorkLeft + ($script:WorkWidth - 420) / 2
    $window.Top = $script:WorkTop + 6

    $border = [System.Windows.Controls.Border]::new()
    $border.CornerRadius = [System.Windows.CornerRadius]::new(14)
    $border.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(238, 16, 19, 25))
    $border.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(60, 255, 255, 255))
    $border.BorderThickness = [System.Windows.Thickness]::new(1)
    $border.Padding = [System.Windows.Thickness]::new(16, 7, 16, 7)
    $border.Cursor = [System.Windows.Input.Cursors]::Hand
    $border.ToolTip = '拖动可移动；右端「−/＋」或滚轮调大小'

    $row = [System.Windows.Controls.StackPanel]::new()
    $row.Orientation = [System.Windows.Controls.Orientation]::Horizontal

    $text = [System.Windows.Controls.TextBlock]::new()
    $text.FontSize = 13
    $text.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $text.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(240, 255, 255, 255))
    [void]$row.Children.Add($text)

    # 右端两个小按钮：比"按住 Ctrl 滚轮"好找多了。
    $mini = {
        param([string]$glyph)
        $b = [System.Windows.Controls.TextBlock]::new()
        $b.Text = $glyph
        $b.FontSize = 13
        $b.Margin = [System.Windows.Thickness]::new(10, 0, 0, 0)
        $b.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
        $b.Cursor = [System.Windows.Input.Cursors]::Hand
        $b.Foreground = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(165, 255, 255, 255))
        return $b
    }
    $minus = & $mini '−'
    $plus = & $mini '＋'
    $minus.ToolTip = '缩小'
    $plus.ToolTip = '放大'
    $minus.Add_MouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        Apply-TopBarScale ([math]::Round(($script:TopBarScale - 0.1) * 10) / 10)
    })
    $plus.Add_MouseLeftButtonUp({
        param($s, $e)
        $e.Handled = $true
        Apply-TopBarScale ([math]::Round(($script:TopBarScale + 0.1) * 10) / 10)
    })
    [void]$row.Children.Add($minus)
    [void]$row.Children.Add($plus)

    $border.Child = $row
    $window.Content = $border

    $border.Add_MouseLeftButtonDown({
        param($s, $e)
        if ($e.OriginalSource -is [System.Windows.Controls.TextBlock] -and ($e.OriginalSource.Text -eq '−' -or $e.OriginalSource.Text -eq '＋')) { return }
        try {
            $script:TopBarWindow.DragMove()
            Send-OverlayEvent @{ type = 'topbar_moved'; x = $script:TopBarWindow.Left; y = $script:TopBarWindow.Top }
        }
        catch { }
    })
    $border.Add_MouseWheel({
        param($s, $e)
        $delta = if ($e.Delta -gt 0) { 0.1 } else { -0.1 }
        Apply-TopBarScale ([math]::Round(($script:TopBarScale + $delta) * 10) / 10)
    })

    $window.Show()
    $handle = [System.Windows.Interop.WindowInteropHelper]::new($window).Handle
    [GuideNative]::MakeOverlay($handle)
    [GuideNative]::Raise($handle)

    $script:TopBarWindow = $window
    $script:TopBarBorder = $border
    $script:TopBarText = $text
    $script:TopBarSig = ''
    $window.Hide()
}

function Apply-TopBarScale([double]$scale) {
    if ($scale -lt 0.7) { $scale = 0.7 }
    if ($scale -gt 2.0) { $scale = 2.0 }
    $script:TopBarScale = $scale
    if ($null -ne $script:TopBarBorder) {
        $script:TopBarBorder.LayoutTransform = [System.Windows.Media.ScaleTransform]::new($scale, $scale)
    }
    Send-OverlayEvent @{ type = 'topbar_scale'; scale = $scale }
}

# 取"现在这个时段"的条目；没有就退而显示 30 分钟内即将开始的一条。
function Update-TopBar($state) {
    if ($null -eq $script:TopBarWindow) { return }
    $now = Get-Date
    $nowMin = $now.Hour * 60 + $now.Minute
    $items = @()
    if ($null -ne $state -and $null -ne $state.plan -and $null -ne $state.plan.items) { $items = @($state.plan.items) }

    # 现在没有正在进行的条目时，往前看多久去找"下一条"（分钟）。
    # 以前写死 30 分钟，课间/饭点一空就整条消失，看着像坏了；默认放宽到 90 分钟。
    $look = 90
    if ($null -ne $state -and $null -ne $state.topbar -and $null -ne $state.topbar.lookahead) {
        $look = [int]$state.topbar.lookahead
    }

    $cur = $null
    $next = $null
    $curTo = 0
    foreach ($it in $items) {
        if ($it.done -eq $true) { continue }
        $mf = [regex]::Match([string]$it.from, '^(\d{1,2}):(\d{2})$')
        if (-not $mf.Success) { continue }
        $fm = [int]$mf.Groups[1].Value * 60 + [int]$mf.Groups[2].Value
        $tm = $fm + 25
        $mt = [regex]::Match([string]$it.to, '^(\d{1,2}):(\d{2})$')
        if ($mt.Success) { $tm = [int]$mt.Groups[1].Value * 60 + [int]$mt.Groups[2].Value }
        if ($fm -le $nowMin -and $nowMin -lt $tm) { $cur = $it; $curTo = $tm; break }
        if ($fm -gt $nowMin -and $fm -le ($nowMin + $look)) {
            if ($null -eq $next -or $fm -lt $next.fm) { $next = [pscustomobject]@{ item = $it; fm = $fm } }
        }
    }

    $target = $cur
    $prefix = ''
    $countdown = ''
    $nowSec = $now.Hour * 3600 + $now.Minute * 60 + $now.Second
    # 倒计时精确到秒：一小时以上显示 1:25:00，一小时内显示 25:00。
    $fmtLeft = {
        param([int]$sec)
        if ($sec -lt 0) { $sec = 0 }
        $h = [math]::Floor($sec / 3600)
        $m = [math]::Floor(($sec % 3600) / 60)
        $s = $sec % 60
        if ($h -gt 0) { return ('{0}:{1:00}:{2:00}' -f $h, $m, $s) }
        return ('{0:00}:{1:00}' -f $m, $s)
    }
    if ($null -ne $cur) {
        $countdown = '剩 {0}' -f (& $fmtLeft ([int]($curTo * 60 - $nowSec)))
    }
    elseif ($null -ne $next) {
        $target = $next.item
        $prefix = '接着 '
        $countdown = '{0} 后' -f (& $fmtLeft ([int]($next.fm * 60 - $nowSec)))
    }

    if ($null -eq $target) {
        if ($script:TopBarWindow.IsVisible) { $script:TopBarWindow.Hide() }
        return
    }

    $sig = '{0}|{1}|{2}|{3}|{4}' -f $prefix, $target.from, $target.to, $target.title, $countdown
    if ($sig -ne $script:TopBarSig) {
        $script:TopBarSig = $sig
        $line = '{0}{1}–{2}　{3}' -f $prefix, [string]$target.from, [string]$target.to, [string]$target.title
        if (-not [string]::IsNullOrEmpty([string]$target.place)) { $line = '{0}　@ {1}' -f $line, [string]$target.place }
        if (-not [string]::IsNullOrEmpty($countdown)) { $line = '{0}　·　{1}' -f $line, $countdown }
        $script:TopBarText.Text = $line
    }
    $script:TopBarWindow.Show()
    if (($script:TopBarWindow.Left -lt $script:WorkLeft) -or ($script:TopBarWindow.Left -gt ($script:WorkLeft + $script:WorkWidth - 40))) {
        $script:TopBarWindow.Left = $script:WorkLeft + ($script:WorkWidth - $script:TopBarWindow.ActualWidth) / 2
    }
    [GuideNative]::Raise(([System.Windows.Interop.WindowInteropHelper]::new($script:TopBarWindow)).Handle)
}

function Apply-State($state) {
    if ($null -eq $state) { return }
    $script:LastState = $state
    $panel = $state.panel
    if ($null -eq $panel) { return }

    Update-Annots $state.annots

    $script:BallAction = [string]$panel.ballAction
    if ([string]::IsNullOrEmpty($script:BallAction)) { $script:BallAction = 'capture' }

    if ($state.captureMode -eq $true) {
        $script:AnnWindow.Hide()
        $script:BallWindow.Hide()
        $script:PanelWindow.Hide()
        if ($null -ne $script:SubtitleWindow) { $script:SubtitleWindow.Hide() }
        if ($null -ne $script:CardWindow) { $script:CardWindow.Hide() }
        return
    }

    $mode = [string]$panel.mode
    if ($panel.visible -eq $false) { $mode = 'hidden' }
    if ($mode -ne 'panel' -and $mode -ne 'hidden') { $mode = 'ball' }

    if ($mode -ne $script:Mode) {
        $script:Mode = $mode
        switch ($mode) {
            'ball' {
                $script:PanelWindow.Hide()
                $script:AnnWindow.Show()
                $script:BallWindow.Show()
            }
            'panel' {
                $script:BallWindow.Hide()
                $script:AnnWindow.Show()
                # 先压到 0 再 Show：否则 Show 到 BeginAnimation 之间会有一帧全不透明，看着像闪一下。
                if ($null -ne $script:PanelOuter) { $script:PanelOuter.Opacity = 0.0 }
                $script:PanelWindow.Show()
                Show-PanelIntro
            }
            default {
                $script:AnnWindow.Hide()
                $script:BallWindow.Hide()
                $script:PanelWindow.Hide()
            }
        }
        Write-Log ('mode={0} ann={1} ball={2} panel={3} panel@({4},{5}) {6}x{7}' -f $mode, $script:AnnWindow.IsVisible, $script:BallWindow.IsVisible, $script:PanelWindow.IsVisible, [int]$script:PanelWindow.Left, [int]$script:PanelWindow.Top, [int]$script:PanelWindow.ActualWidth, [int]$script:PanelWindow.ActualHeight)
    }

    Update-Card $state
    if ($null -eq $script:TopBarWindow) { try { New-TopBarWindow } catch { Write-Log ('topbar init failed: ' + $_.Exception.Message) } }
    if ($null -ne $state -and $null -ne $state.topbar) {
        if ($null -ne $state.topbar.x -and $null -ne $state.topbar.y) {
            $script:TopBarWindow.Left = [double]$state.topbar.x
            $script:TopBarWindow.Top = [double]$state.topbar.y
        }
        if ($null -ne $state.topbar.scale -and [math]::Abs([double]$state.topbar.scale - $script:TopBarScale) -gt 0.001) {
            $script:TopBarBorder.LayoutTransform = [System.Windows.Media.ScaleTransform]::new([double]$state.topbar.scale, [double]$state.topbar.scale)
            $script:TopBarScale = [double]$state.topbar.scale
        }
    }
    Update-TopBar $state

    if ($null -eq $script:DragState -and [DateTime]::UtcNow -gt $script:BallPinUntil -and $null -ne $panel.ballX -and $null -ne $panel.ballY) {
        if ([math]::Abs($script:BallWindow.Left - [double]$panel.ballX) -gt 0.5) { $script:BallWindow.Left = [double]$panel.ballX }
        if ([math]::Abs($script:BallWindow.Top - [double]$panel.ballY) -gt 0.5) { $script:BallWindow.Top = [double]$panel.ballY }
    }

    # 清单占满右侧时，球往左让开，别压在时间轴上（放在上面的定位之后才不会被覆盖）。
    if ($null -ne $state.card -and $state.card.visible -eq $true -and $null -ne $script:BallWindow) {
    }

    if ($null -ne $panel.uiScale) {
        $scale = [double]$panel.uiScale
        if ([math]::Abs($scale - $script:UiScale) -gt 0.001) { Apply-UiScale $scale -Quiet }
    }

    if ($null -ne $state.ball -and $null -ne $state.ball.opacity) {
        $ballOp = [double]$state.ball.opacity
        if ([math]::Abs($ballOp * 255 - $script:BallAlpha) -gt 1) { Apply-BallOpacity $ballOp }
    }

    if ($null -ne $panel.title) { $script:PanelTitle.Text = [string]$panel.title }
    if ($null -ne $panel.text) { $script:PanelBody.Text = [string]$panel.text }

    $script:PanelSteps.Children.Clear()
    if ($null -ne $panel.steps) {
        $current = 0
        if ($null -ne $panel.stepIndex) { $current = [int]$panel.stepIndex }
        $index = 0
        foreach ($step in @($panel.steps)) {
            $line = [System.Windows.Controls.TextBlock]::new()
            $line.Text = ('{0}. {1}' -f ($index + 1), [string]$step)
            $line.TextWrapping = [System.Windows.TextWrapping]::Wrap
            $line.FontSize = 12
            $line.LineHeight = 18
            $line.Margin = [System.Windows.Thickness]::new(0, 3, 0, 0)
            if ($index -eq $current) {
                $line.Foreground = $script:AccentBrush
                $line.FontWeight = [System.Windows.FontWeights]::SemiBold
            }
            else {
                $line.Foreground = $script:DimBrush
            }
            [void]$script:PanelSteps.Children.Add($line)
            $index += 1
        }
    }

    $opacity = 0.92
    if ($null -ne $panel.opacity) { $opacity = [double]$panel.opacity }
    if ($opacity -lt 0.3) { $opacity = 0.3 }
    if ($opacity -gt 1.0) { $opacity = 1.0 }
    $alpha = [byte][math]::Round($opacity * 255.0)
    $script:PanelBg.Color = [System.Windows.Media.Color]::FromArgb($alpha, 20, 24, 30)
    $script:SuppressSlider = $true
    $script:OpacitySlider.Value = $opacity * 100.0
    $script:SuppressSlider = $false

    # Both the panel checkbox and the tray menu item mirror the host's switch.
    # Assigning IsChecked/Checked never raises Click, so this cannot loop back.
    $alwaysListen = $panel.alwaysListen -eq $true
    if ($null -ne $script:ListenToggle -and [bool]$script:ListenToggle.IsChecked -ne $alwaysListen) {
        $script:ListenToggle.IsChecked = $alwaysListen
    }
    if ($null -ne $script:TrayListenItem -and [bool]$script:TrayListenItem.Checked -ne $alwaysListen) {
        $script:TrayListenItem.Checked = $alwaysListen
    }

    # The tray "朗读回复" item mirrors the host's auto-speak switch.
    $autoSpeak = $panel.autoSpeak -eq $true
    if ($null -ne $script:TraySpeakItem -and [bool]$script:TraySpeakItem.Checked -ne $autoSpeak) {
        $script:TraySpeakItem.Checked = $autoSpeak
    }

    Update-Subtitle $state.subtitle $state
}

function Update-FromDisk {
    try {
        $info = [System.IO.FileInfo]::new($StatePath)
        if (-not $info.Exists) { return }
        $stamp = '{0}:{1}' -f $info.LastWriteTimeUtc.Ticks, $info.Length
        if ($stamp -eq $script:LastStamp) { return }
        $script:LastStamp = $stamp
        # 用共享读写 + 允许删除的方式打开：宿主每帧都会 rename 覆盖 state.json，
        # ReadAllText 默认只给 FileShare.Read，会把宿主的 rename 顶成 EPERM 并让宿主退出。
        $text = $null
        $stream = [System.IO.FileStream]::new(
            $StatePath,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
        )
        try {
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
            $text = $reader.ReadToEnd()
        }
        finally {
            if ($null -ne $reader) { $reader.Dispose() }
            $stream.Dispose()
        }
        $state = $text | ConvertFrom-Json
        Apply-State $state

        $requestId = 0
        if ($null -ne $state.captureRequest) { $requestId = [int]$state.captureRequest }
        if ($requestId -gt $script:LastCaptureRequest) {
            $script:LastCaptureRequest = $requestId
            Start-Capture 'tool' $requestId
        }
    }
    catch {
        Write-Log ('state update failed: ' + $_.Exception.Message)
    }
}

function On-Tick {
    $script:Tick += 1
    try { Update-FromDisk } catch { }
    # 时钟：每秒整刷一次，120ms 的 tick 里只比秒数，别每拍都建 DateTime。
    try {
        $second = [int](Get-Date).Second
        if ($second -ne $script:LastClockSecond) {
            $script:LastClockSecond = $second
            Update-Clock
            # 倒计时精确到秒，所以每秒都刷一次；内容没变时 Update-TopBar 内部按 $sig 跳过写控件。
            if ($script:TopBarWindow -and $script:TopBarWindow.IsVisible) { try { Update-TopBar $script:LastState } catch { } }
        }
    }
    catch { }
    if ($null -ne $script:SubtitleWindow -and $script:SubtitleWindow.IsVisible -and $null -ne $script:LastState) {
        try {
            if ([math]::Abs($script:SubtitleWindow.ActualWidth - $script:SubtitlePlacedWidth) -gt 0.5) {
                Position-Subtitle $script:LastState
            }
        }
        catch { }
    }
    if (($script:Tick % 8) -eq 0) {
        try {
            if ($script:BallWindow.IsVisible) {
                [GuideNative]::Raise(([System.Windows.Interop.WindowInteropHelper]::new($script:BallWindow)).Handle)
            }
            if ($script:PanelWindow.IsVisible) {
                [GuideNative]::Raise(([System.Windows.Interop.WindowInteropHelper]::new($script:PanelWindow)).Handle)
            }
            if ($script:AnnWindow.IsVisible) {
                [GuideNative]::Raise(([System.Windows.Interop.WindowInteropHelper]::new($script:AnnWindow)).Handle)
            }
            if ($null -ne $script:SubtitleWindow -and $script:SubtitleWindow.IsVisible) {
                [GuideNative]::Raise(([System.Windows.Interop.WindowInteropHelper]::new($script:SubtitleWindow)).Handle)
            }
        }
        catch { }
    }
}

# --- tray icon -----------------------------------------------------------
# A permanent home in the notification area: left click reopens the panel, the
# menu mirrors the panel buttons, so hiding the bubble does not mean losing the
# assistant. The icon is drawn at runtime, no extra asset to ship or load.
function New-TrayIcon {
    if ($null -ne $script:Tray) { return }
    try {
        $size = 32
        $bitmap = New-Object System.Drawing.Bitmap $size, $size
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
        $bounds = New-Object System.Drawing.Rectangle 1, 1, ($size - 2), ($size - 2)
        $fill = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bounds, ([System.Drawing.Color]::FromArgb(255, 255, 110, 40)), ([System.Drawing.Color]::FromArgb(255, 214, 44, 132)), 45.0
        $graphics.FillEllipse($fill, $bounds)
        $font = New-Object System.Drawing.Font 'Microsoft YaHei UI', 17, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
        $format = New-Object System.Drawing.StringFormat
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $format.LineAlignment = [System.Drawing.StringAlignment]::Center
        $graphics.DrawString('引', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 1, 0, ($size - 2), $size), $format)
        $graphics.Dispose()

        $script:TrayBitmap = $bitmap
        $tray = New-Object System.Windows.Forms.NotifyIcon
        $tray.Icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
        $tray.Text = '教学助手：点击打开面板'
        $tray.Visible = $true

        $menu = New-Object System.Windows.Forms.ContextMenuStrip
        $openItem = New-Object System.Windows.Forms.ToolStripMenuItem '打开面板'
        $openItem.Add_Click({ Send-OverlayEvent @{ type = 'mode'; mode = 'panel' } })
        $captureItem = New-Object System.Windows.Forms.ToolStripMenuItem '读屏一次'
        $captureItem.Add_Click({ Start-Capture 'ball' 0 })
        $listenItem = New-Object System.Windows.Forms.ToolStripMenuItem '常听（自动连听）'
        $listenItem.CheckOnClick = $true
        $script:TrayListenItem = $listenItem
        $listenItem.Add_Click({
            $on = [bool]$script:TrayListenItem.Checked
            if ($null -ne $script:ListenToggle) { $script:ListenToggle.IsChecked = $on }
            Send-OverlayEvent @{ type = 'always_voice'; on = $on }
        })
        $speakItem = New-Object System.Windows.Forms.ToolStripMenuItem '朗读回复（语音+字幕）'
        $speakItem.CheckOnClick = $true
        $speakItem.Checked = $true
        $script:TraySpeakItem = $speakItem
        $speakItem.Add_Click({
            $on = [bool]$script:TraySpeakItem.Checked
            Send-OverlayEvent @{ type = 'auto_speak'; on = $on }
        })
        $sizeMenu = New-Object System.Windows.Forms.ToolStripMenuItem '字幕大小'
        foreach ($entry in @(@{ label = '小'; value = 18 }, @{ label = '中'; value = 24 }, @{ label = '大'; value = 30 }, @{ label = '特大'; value = 38 })) {
            $sizeItem = New-Object System.Windows.Forms.ToolStripMenuItem $entry.label
            $sizeItem.Tag = [int]$entry.value
            $sizeItem.Add_Click({
                param($sender, $eventArgs)
                Send-OverlayEvent @{ type = 'subtitle_size'; size = [int]$sender.Tag }
            })
            [void]$sizeMenu.DropDownItems.Add($sizeItem)
        }
        $volumeMenu = New-Object System.Windows.Forms.ToolStripMenuItem '朗读音量'
        foreach ($entry in @(@{ label = '轻'; value = 45 }, @{ label = '中'; value = 75 }, @{ label = '响'; value = 100 })) {
            $volumeItem = New-Object System.Windows.Forms.ToolStripMenuItem $entry.label
            $volumeItem.Tag = [int]$entry.value
            $volumeItem.Add_Click({
                param($sender, $eventArgs)
                Send-OverlayEvent @{ type = 'volume'; value = [int]$sender.Tag }
            })
            [void]$volumeMenu.DropDownItems.Add($volumeItem)
        }
        $hideItem = New-Object System.Windows.Forms.ToolStripMenuItem '隐藏悬浮层'
        $hideItem.Add_Click({ Send-OverlayEvent @{ type = 'hide' } })
        $quitItem = New-Object System.Windows.Forms.ToolStripMenuItem '退出教学助手'
        $quitItem.Add_Click({
            Send-OverlayEvent @{ type = 'quit' }
            try {
                $script:Tray.Visible = $false
                $script:Tray.Dispose()
            }
            catch { }
            try { [System.Windows.Application]::Current.Shutdown() } catch { }
        })
        [void]$menu.Items.Add($openItem)
        [void]$menu.Items.Add($captureItem)
        [void]$menu.Items.Add($listenItem)
        [void]$menu.Items.Add($speakItem)
        [void]$menu.Items.Add($sizeMenu)
        [void]$menu.Items.Add($volumeMenu)
        [void]$menu.Items.Add($hideItem)
        [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
        [void]$menu.Items.Add($quitItem)
        $tray.ContextMenuStrip = $menu
        $tray.Add_MouseClick({
            param($sender, $mouseArgs)
            if ($mouseArgs.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
                Send-OverlayEvent @{ type = 'mode'; mode = 'panel' }
            }
        })
        $script:Tray = $tray
        Write-Log 'tray icon ready'
    }
    catch {
        Write-Log ('tray icon failed: ' + $_.Exception.Message)
    }
}

# --- main ----------------------------------------------------------------
$script:LastStamp = ''
$script:Mode = ''
$script:Tick = 0
$script:CaptureBusy = $false
$script:LastCaptureRequest = 0
$script:PendingCapture = $null

$app = [System.Windows.Application]::new()
$app.ShutdownMode = [System.Windows.ShutdownMode]::OnExplicitShutdown

New-AnnotationWindow
New-BallWindow
New-PanelWindow
New-SubtitleWindow
New-TrayIcon

# 起手：时钟先填上，缩放按上次存的值（Apply-State 里也会再对齐一次）。
$script:LastClockSecond = -1
Update-Clock
Apply-UiScale $script:UiScale -Quiet

Update-FromDisk
if ($script:Mode -eq '') {
    $script:BallWindow.Show()
    $script:AnnWindow.Show()
}

Send-OverlayEvent @{ type = 'ready'; pid = $PID }
Write-Log 'overlay started'

$timer = [System.Windows.Threading.DispatcherTimer]::new()
$timer.Interval = [TimeSpan]::FromMilliseconds(120)
$timer.Add_Tick({ On-Tick })
$timer.Start()

# 任何 UI 线程上的未处理异常都不要带崩整个悬浮层：
# 以前日期按钮里一个 Null 引用就会让 $app.Run() 抛出、进程退出、插件重启 overlay（看着像"重启了一遍"）。
$app.Add_DispatcherUnhandledException({
    param($s, $e)
    try { Write-Log ('dispatcher unhandled: ' + $e.Exception.Message) } catch { }
    $e.Handled = $true
})

$app.Run()
