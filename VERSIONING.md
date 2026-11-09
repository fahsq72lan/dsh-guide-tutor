# 版本管理规范

本仓库用 git 管理。目标只有一个：**动刀之前先有回滚点**。

## 分支

- `main`：始终可运行。热重载能起来、`node --check` 能过，才允许留在 `main`。
- 改多个文件、拆模块、动 `overlay.ps1` 这类高风险改动：开 `refactor/<主题>` 分支，验证通过再合回。
- 小修小补（文案、一行 bug）可以直接在 `main` 提交。

## 提交

格式：`type(scope): 摘要`

- `type`：`feat` / `fix` / `refactor` / `docs` / `chore` / `perf`
- `scope`：`t01`、`overlay`、`goals`、`plan` 之类，能一眼看出动的是哪块
- 正文写**为什么**，不写“改了哪些行”——行由 diff 说

例：

```
refactor(t01): 抽出 lib/video.js

八个 video_* 工具从 apply(ctx) 闭包里搬出，
为后续冒烟测试提供可单独 import 的入口。
```

## 一刀的流程

1. `git status` 确认工作区干净；不干净先 `git stash` 或提交。
2. 开分支（或直接在 `main`）。
3. 改代码。
4. 验证：`node --check` / PowerShell `ParseFile`；改 `overlay.ps1` 必须查 BOM 再 parse；热重载看 `plugin.log`。
5. 写 `CHANGELOG.md`（四段：改了什么 / 为什么 / 怎么验证 / 怎么恢复）。
6. `git add -A` → `git commit`。
7. 高风险改动打 tag：`git tag -a v0.21.1 -m '...'`。

## 回滚

- 撤销某次提交（保留历史）：`git revert <sha>`
- 回到某个基线（丢弃之后所有提交）：`git reset --hard v0.21.0`
- 只丢工作区未提交改动：`git checkout -- <file>` 或 `git restore <file>`

回滚前先 `git status` 看清有没有未提交的东西。

## 版本号

`package.json` 的 `version` 是插件版本，不是 git 版本：

- 加功能 → patch +1（0.21.0 → 0.21.1）
- 修 bug → patch +1
- 破坏性改动（改数据格式、改工具签名）→ minor +1

发版时同步更新 `CHANGELOG.md` 顶部和 tag。

## 不进库的东西

`.gitignore` 已排除：`models/`、`py/libs/`、`py/wheels/`、`tmp/`、`kb-backup-*/`、`__pycache__/`、Office 锁文件、日志。

这些是运行时资产，重装依赖/重新下载即可恢复；放进 git 只会把仓库撑大。

## 远端

目前只有本地仓库。要异地备份时再加 remote（GitHub 私有库或自建），加之前先确认大文件已排除。
