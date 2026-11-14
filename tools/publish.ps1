<#
.SYNOPSIS
  把 work 分支上攒的零散改动压成一个干净提交，推到 main。

.DESCRIPTION
  日常改动都提交在 work 分支上——可以很碎、很频繁，只在本地，不上 GitHub。
  想"发布"时运行本脚本：它把 work 上的所有改动 squash 成 main 上一个提交再推送。
  这样 GitHub 的 main 历史保持干净，不会因为小修小补刷屏，也不会显得 commit 很廉价。

.EXAMPLE
  .\tools\publish.ps1 -Message "feat(plan): 清单支持拖拽改时间"

.EXAMPLE
  # 只合并不推送，先本地看看
  .\tools\publish.ps1 -Message "fix: 修面板淡入" -NoPush
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Message,
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Watt Toolkit 会 MITM GitHub 的 TLS，这几个参数不带上会卡住或报 CRYPT_E_NO_REVOCATION_CHECK
$env:GIT_SSL_NO_VERIFY = "1"

$cur = (git branch --show-current).Trim()
if ($cur -ne "work") {
  Write-Host "当前在 $cur，先切到 work..." -ForegroundColor Yellow
  git checkout work | Out-Null
}

git add -A

# 发布前拦一道：本地第三方内容（得到电子书下载工具、买的电子书）绝不允许进公开仓库。
# 命中就中止，并把暂存区退回去，等工作区自己处理。
$forbiddenText = 'dedao|ActiveUID|得到电子书|得到（电子书）'
$forbiddenFiles = '\.(epub|mobi|azw3|azw)$'
$stagedFiles = @(git diff --cached --name-only)
$badFiles = $stagedFiles | Where-Object { $_ -match $forbiddenFiles }
# 规则文件自身（publish.ps1 / CHANGELOG.md）会写出禁止词，检查时排除它们
$skipRuleFiles = '^(tools/publish\.ps1|CHANGELOG\.md)$'
$textHits = @()
$cur = ''
foreach ($line in (git diff --cached -U0)) {
    if ($line -match '^\+\+\+ b/(.+)$') { $cur = $Matches[1] } elseif ($line -match '^\+' -and $line -match $forbiddenText -and $cur -notmatch $skipRuleFiles) { $textHits += "${cur}: $line" }
}
if ($badFiles -or $textHits) {
  Write-Host "发现不该入库的内容，已中止发布：" -ForegroundColor Red
  foreach ($f in $badFiles) { Write-Host "  文件: $f" -ForegroundColor Red }
  foreach ($l in ($textHits | Select-Object -First 10)) { Write-Host "  命中: $l" -ForegroundColor Red }
  git reset | Out-Null
  exit 1
}

if (git status --porcelain) {
  git commit -m "wip: $Message" | Out-Null
  Write-Host "work 上留了一个 wip 提交（只在本机，可回滚）" -ForegroundColor DarkGray
} else {
  Write-Host "工作区干净，直接发布 work 上已有的提交" -ForegroundColor DarkGray
}

git checkout main | Out-Null
git merge --squash work | Out-Null
if (-not (git status --porcelain)) {
  Write-Host "main 没有新内容，跳过发布" -ForegroundColor Yellow
  git checkout work | Out-Null
  exit 0
}

git commit -m $Message
if (-not $NoPush) {
  Write-Host "推送 main..." -ForegroundColor DarkGray
  & git -c http.sslBackend=openssl -c http.sslVerify=false -c http.version=HTTP/1.1 push origin main
}

git checkout work | Out-Null
git reset --hard main | Out-Null
Write-Host "发布完成：main 上新增 1 个提交「$Message」" -ForegroundColor Green
Write-Host "work 已同步到 main，可以继续攒下一批改动" -ForegroundColor Green
