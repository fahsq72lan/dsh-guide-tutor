# Speech synthesis for the guide-tutor host plugin.
#
# 两条路：
#   edge —— 用 edge-tts（微软神经网络音色，声音自然，需要联网）合成 mp3，再用 MCI 播放。
#   sapi —— Windows 自带的 System.Speech（离线，声音机械，但断网也能用）。
#
# 默认走 edge，合成失败（断网、没装包、超时）自动回落到 sapi，保证"不会因为没网就不出声"。
#
# 文本走环境变量（GUIDE_TTS_TEXT）：命令行参数会被某些启动器按控制台代码页解码，中文会坏。
# 播放进度按 mp3 时长换算成字符位置，输出成 JSON 行，宿主据此逐字显示字幕：
#
#   {"type":"start"}
#   {"type":"progress","char":12,"count":2}
#   {"type":"end"}
param(
    [string]$Voice = $env:GUIDE_TTS_VOICE,
    [int]$Rate = 0,
    [int]$Volume = 100
)

$ErrorActionPreference = 'Stop'

$text = $env:GUIDE_TTS_TEXT
if ([string]::IsNullOrWhiteSpace($text)) {
    [Console]::Out.WriteLine('{"type":"error","message":"empty text"}')
    exit 2
}

if ($env:GUIDE_TTS_RATE) {
    [void][int]::TryParse($env:GUIDE_TTS_RATE, [ref]$Rate)
}

if ($env:GUIDE_TTS_VOLUME) {
    [void][int]::TryParse($env:GUIDE_TTS_VOLUME, [ref]$Volume)
}
if ($Volume -lt 0) { $Volume = 0 }
if ($Volume -gt 100) { $Volume = 100 }

function Write-TtsEvent([string]$json) {
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

# ------------------------------------------------------------------ edge 分支
# 合成 + 播放都在这一个函数里完成；返回 $true 表示"已经说完了"，
# 返回 $false 表示这条路走不通，交给下面的 SAPI。
function Invoke-EdgeTts {
    param([string]$Text, [int]$RateValue, [int]$VolumeValue)

    $python = $env:GUIDE_TTS_PYTHON
    if ([string]::IsNullOrWhiteSpace($python) -or -not (Test-Path $python)) { return $false }

    $synth = Join-Path $PSScriptRoot 'tts_edge.py'
    if (-not (Test-Path $synth)) { return $false }

    $libs = Join-Path (Split-Path $PSScriptRoot -Parent) 'py\libs'

    $prevPythonPath = $env:PYTHONPATH
    $prevVoice = $env:GUIDE_TTS_VOICE
    $env:PYTHONPATH = if ($prevPythonPath) { $libs + [IO.Path]::PathSeparator + $prevPythonPath } else { $libs }
    if ($env:GUIDE_TTS_EDGE_VOICE) { $env:GUIDE_TTS_VOICE = $env:GUIDE_TTS_EDGE_VOICE }

    # 合成结果按（文本|音色|语速|音量）缓存：同一句第二次播放直接读 mp3，
    # 不再起 python、不再等 edge 连接，起播通常在几十毫秒内。
    $voiceForCache = if ($env:GUIDE_TTS_EDGE_VOICE) { $env:GUIDE_TTS_EDGE_VOICE } else { $Voice }
    $cacheDir = $env:GUIDE_TTS_CACHE
    if ([string]::IsNullOrWhiteSpace($cacheDir)) { $cacheDir = Join-Path $env:LOCALAPPDATA 'guide-tutor\tts-cache' }
    try { [void](New-Item -ItemType Directory -Path $cacheDir -Force) } catch { }

    $cachePath = $null
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $seed = [System.Text.Encoding]::UTF8.GetBytes($Text + '|' + $voiceForCache + '|' + $RateValue + '|' + $VolumeValue)
        $hash = -join ($sha.ComputeHash($seed) | ForEach-Object { $_.ToString('x2') })
        $sha.Dispose()
        $cachePath = Join-Path $cacheDir ($hash.Substring(0, 20) + '.mp3')
    }
    catch { $cachePath = $null }

    $file = $null
    if ($cachePath -and (Test-Path $cachePath) -and ((Get-Item $cachePath).Length -gt 800)) {
        $file = $cachePath
    }
    else {
        $out = Join-Path $env:TEMP ('guide-tts-' + [guid]::NewGuid().ToString('N') + '.mp3')
        $raw = $null
        $errReader = $null
        try {
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $python
            $psi.Arguments = '"' + $synth + '" --out "' + $out + '" --rate ' + $RateValue + ' --volume ' + $VolumeValue
            $psi.UseShellExecute = $false
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $psi.CreateNoWindow = $true
            $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
            $proc = [System.Diagnostics.Process]::Start($psi)
            $reader = $proc.StandardOutput.ReadToEndAsync()
            # stderr 也要读走：不读的话管道写满会把 python 卡住。
            $errReader = $proc.StandardError.ReadToEndAsync()
            # 超时保护：edge 连接卡住时不让用户干等，10 秒没结果就放弃、回落 SAPI。
            if ($proc.WaitForExit(10000)) { $raw = $reader.Result }
            else { try { $proc.Kill() } catch { } }
        }
        catch { $raw = $null }

        $line = ($raw -split "`n") | Where-Object { $_ -match '"type"\s*:' } | Select-Object -Last 1
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            try { $res = $line | ConvertFrom-Json } catch { $res = $null }
            if ($res -and $res.type -eq 'file' -and (Test-Path $res.path)) {
                if ($cachePath) {
                    try {
                        Move-Item -LiteralPath $out -Destination $cachePath -Force -ErrorAction Stop
                        $file = $cachePath
                    }
                    catch { $file = $out }
                }
                else { $file = $out }
            }
        }
        if (-not $file) { try { Remove-Item $out -Force -ErrorAction SilentlyContinue } catch { } }
    }

    $env:PYTHONPATH = $prevPythonPath
    $env:GUIDE_TTS_VOICE = $prevVoice
    if (-not $file) { return $false }

    # ---- 用 MCI 播放 mp3：wav 以外的格式 System.Media.SoundPlayer 播不了 ----
    if (-not ('GuideMci.Win32' -as [type])) {
        Add-Type -Namespace GuideMci -Name Win32 -MemberDefinition @'
[DllImport("winmm.dll", CharSet = CharSet.Unicode)]
public static extern int mciSendString(string command, System.Text.StringBuilder ret, int retLen, IntPtr hwnd);
'@
    }

    $alias = 'gtts' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $buf = New-Object System.Text.StringBuilder 128

    function Invoke-Mci([string]$cmd) {
        [void][GuideMci.Win32]::mciSendString($cmd, $null, 0, [IntPtr]::Zero)
    }
    function Query-Mci([string]$cmd) {
        [void]$buf.Clear()
        [void][GuideMci.Win32]::mciSendString($cmd, $buf, 128, [IntPtr]::Zero)
        return $buf.ToString().Trim()
    }

    try {
        $open = Invoke-Mci ('open "' + $file + '" type mpegvideo alias ' + $alias)
        $lengthMs = 0
        [void][int]::TryParse((Query-Mci ('status ' + $alias + ' length')), [ref]$lengthMs)
        if ($lengthMs -le 0) { return $false }

        Invoke-Mci ('play ' + $alias)
        Write-TtsEvent '{"type":"start"}'

        $total = $Text.Length
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        $lastChar = -1
        $hardLimit = [math]::Min(120000, [int]($lengthMs * 1.6) + 4000)

        while ($true) {
            $posMs = 0
            [void][int]::TryParse((Query-Mci ('status ' + $alias + ' position')), [ref]$posMs)
            $mode = Query-Mci ('status ' + $alias + ' mode')

            $char = [int][math]::Floor($total * [math]::Min(1.0, $posMs / [double]$lengthMs))
            if ($char -gt $lastChar) {
                $lastChar = $char
                Write-TtsEvent ('{"type":"progress","char":' + $char + ',"count":1}')
            }

            if ($mode -ne 'playing' -or $watch.ElapsedMilliseconds -gt $hardLimit) { break }
            Start-Sleep -Milliseconds 100
        }

        Write-TtsEvent '{"type":"end"}'
        return $true
    }
    catch {
        return $false
    }
    finally {
        try { Invoke-Mci ('close ' + $alias) } catch { }
        # 缓存文件留着给下一次；只清理临时合成结果。
        if ($file -and -not ($cachePath -and $file -eq $cachePath)) {
            try { Remove-Item $file -Force -ErrorAction SilentlyContinue } catch { }
        }
    }
}

$engine = $env:GUIDE_TTS_ENGINE
if ([string]::IsNullOrWhiteSpace($engine)) { $engine = 'edge' }

if ($engine -eq 'edge') {
    $edgeText = $text
    if ($edgeText.Length -gt 600) { $edgeText = $edgeText.Substring(0, 600) }
    if (Invoke-EdgeTts -Text $edgeText -RateValue $Rate -VolumeValue $Volume) {
        [Console]::Error.WriteLine("[tts] edge ok")
        exit 0
    }
    [Console]::Error.WriteLine("[tts] edge failed, fallback to sapi")
    # 走不通就往下走 SAPI，不给宿主报错——能出声比用哪个引擎重要。
}

# ------------------------------------------------------------------ sapi 分支
Add-Type -AssemblyName System.Speech
$speechAssembly = [System.Speech.Synthesis.SpeechSynthesizer].Assembly.Location

$source = @'
using System;
using System.Speech.Synthesis;

public static class GuideTts
{
    private static void Emit(string line)
    {
        Console.Out.WriteLine(line);
        Console.Out.Flush();
    }

    public static void Speak(string text, string voice, int rate, int volume)
    {
        using (SpeechSynthesizer synth = new SpeechSynthesizer())
        {
            if (!string.IsNullOrEmpty(voice))
            {
                try { synth.SelectVoice(voice); }
                catch { }
            }
            synth.Rate = rate;
            synth.Volume = volume;
            synth.SpeakProgress += delegate (object sender, SpeakProgressEventArgs e)
            {
                Emit("{\"type\":\"progress\",\"char\":" + e.CharacterPosition +
                     ",\"count\":" + e.CharacterCount + "}");
            };
            Emit("{\"type\":\"start\"}");
            synth.Speak(text);
            Emit("{\"type\":\"end\"}");
        }
    }
}
'@

if (-not ('GuideTts' -as [type])) {
    Add-Type -TypeDefinition $source -ReferencedAssemblies $speechAssembly
}

# Pick a Chinese voice when the caller did not name one: the default voice on an
# English Windows speaks Chinese through an English engine and sounds wrong.
if ([string]::IsNullOrWhiteSpace($Voice)) {
    $probe = New-Object System.Speech.Synthesis.SpeechSynthesizer
    try {
        $match = $probe.GetInstalledVoices() |
            Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'zh*' } |
            Select-Object -First 1
        if ($null -ne $match) { $Voice = $match.VoiceInfo.Name }
    }
    finally {
        $probe.Dispose()
    }
}

try {
    [GuideTts]::Speak($text, $Voice, $Rate, $Volume)
}
catch {
    $message = $_.Exception.Message.Replace('\', '\\').Replace('"', '\"')
    [Console]::Out.WriteLine('{"type":"error","message":"' + $message + '"}')
    exit 1
}
