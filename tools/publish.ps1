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
