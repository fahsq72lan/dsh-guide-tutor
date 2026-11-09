# 键盘鼠标空闲了多少毫秒。用来判断人还在不在电脑前：
# 人走了就别对着空气说话。输出一个整数（毫秒）。
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class GuideIdle {
  [StructLayout(LayoutKind.Sequential)]
  public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")]
  public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
}
"@
$lii = New-Object GuideIdle+LASTINPUTINFO
$lii.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($lii)
if (-not [GuideIdle]::GetLastInputInfo([ref]$lii)) { Write-Output 0; exit 0 }
$idle = [uint32]([Environment]::TickCount - $lii.dwTime)
Write-Output ([int64]$idle)
