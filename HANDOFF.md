# 交接说明（HANDOFF）

> 给下一个工作区会话看。写于 2026-11-09 17:35，版本 **0.21.0**。
> 详细改动史在 `CHANGELOG.md`（77 KB，按日期倒序追加）；这份只写「现在是什么状态、接下来要做什么」。

## 一、这是什么

DSH 桌面插件「教学助手 / guide-tutor」：悬浮球 + 半透明面板 + 桌面清单卡片 + 全屏标注层 + 语音（Edge TTS 晓晓）+ 摄像头巡检 + 都市指令 + 专注环 + 视频库 + 知识库。

- 开发目录：`D:\dsh_TestSpace\guide-tutor`
- 数据目录：`C:\Users\<User>\.dsh\guide-tutor`（`state.json` / `plan.json` / `goals.json` / `daylog-*.jsonl` / `overlay.log` / `plugin.log`）
- U 盘副本：`E:\dsh插件\guide-tutor`（每次大改后同步，旧版在 `guide-tutor.old-20261109`）
- 用户：<姓名>，<学号>，<班级>；课表 `C:\Users\<User>\.dsh\guide-tutor\timetable.json`

## 二、这一版有什么（0.21.0）

| 模块 | 状态 |
|---|---|
| 悬浮球 | 可自由拖动、位置持久化（`state.panel.ballX/ballY`）、滚轮缩放、球下显时钟 |
| 面板 | 620 宽固定、内容靠右 344、底部滑块 70%–180%、标题栏秒表、历史/清单/目标/记录按钮 |
| 桌面清单 | **默认收缩 64% 屏高**，底部「く」展开成满屏、字形变「︿」；滚轮滚内容；标题栏可拖、位置持久化（`state.card.x/y`）；每条带 ☐ 打勾 / ✎ 改 / ✕ 删；空档行右侧有淡「＋」按那段起始时间加任务 |
| 顶条 | 显示当前/最近一条任务 + 秒级倒计时，位置与缩放持久化 |
| 语音 | Edge TTS 晓晓（`native/tts.ps1` + `py/tts_edge.py`，MCI 播放），失败回落 SAPI |
| 摄像头 | 120 分钟巡检、指纹去重、**不语音播报** |
| 都市指令 | 按课表+目标派令、催办、`close` 记实 |
| 实验六报告 | 27 步 / 18 页 / 25 图，已生成在 `D:\dsh_TestSpace\guide-tutor\实验六_<学号>_<姓名>_Spring Boot整合MyBatis-Plus.docx` |

## 三、2026-11-09 这轮改了什么

1. **清单条目可改可删**：`✎` 弹预填窗口发 `plan_update`；`✕` 发 `plan_remove`。
2. **空档行「＋」**：点空档右侧的淡加号，直接按该段起始时间预填（结束 +25 分钟）。
3. **清单可收缩**：底部「く」按钮 toggle；内容区套 `ScrollViewer`，滚轮一格 96px。
4. **拖动真正持久化**：删掉 `Update-Card` 里每轮强设的 `CardWindow.Top = WorkTop`，改为读 `state.card.x/y`；删掉三处「球自动让位到清单左边」。

## 四、还没做 / 待用户拍板

- **删除无二次确认**：现在只有 1.2 秒防抖（`$script:LastDeleteAt`）。用户没答要不要「再点一次才真删」。
- **球不再自动躲清单**：拖到清单底下会被盖住。可选：点球置顶 / 重叠时轻推。
- **AI 协作功能**：三选项（本机装 ollama / 给免费 API key / 只做分流提示）用户未选，功能未实现；方案在 `AI协作功能方案-2026-11-09.xlsx`。
- **清单条目被误删过两次**（16:33、16:58，各 4–5 条），已按 daylog 恢复为：17:40 通读实验六报告 / 18:10 整理实验六截图文件夹 / 19:30 Spring Boot：给 BookController 加两个接口 / 20:30 Python 脚本读一段、能改一处。**新会话先核对一遍 `plan.json`。**

## 五、改这个插件的操作手册

```
# 改 native/*.ps1（必须带 UTF-8 BOM，编辑器会丢）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\dsh_TestSpace\guide-tutor\tmp\check-ps.ps1
# 看到 "PARSE OK: overlay.ps1" 才算过
guide_overlay restart

# 改 index.js（改了不会自动热重载）
# 要动 C:\Users\<User>\.dsh\profiles\desktop\cordis.patch.yml 第 44 行的 reload: 文本
# 判断成功的标志：plugin.log 出现 guide-tutor disposed → ready

# 看悬浮层日志
C:\Users\<User>\.dsh\guide-tutor\overlay.log
```

## 六、踩过的坑（新会话别重复）

- **`String.Replace` 做多行替换会静默 MISS**：改用 `[System.IO.File]::ReadAllLines` + `List.InsertRange`，插入前 `.Contains()` 校验目标行。
- **WPF 事件订阅**：`$x.PreviewMouseWheel += {…}` 会报「找不到属性」，必须 `$x.Add_PreviewMouseWheel({…})`。
- **误插代码到别的函数**：这轮把「く」按钮那段误插进了面板窗口，面板底部多一个「く」；改完一定看窗口层次。
- **`-like` 里的 `[`** 是通配符字符集，匹配含 `[System.Windows…]` 的字符串要用 `.Contains()`。
- **分层窗口**：`ShowActivated=false` 时未激活窗口可能收不到 `WM_MOUSEWHEEL`；`guide_screen` 会主动隐藏悬浮层，截图验证要用 `CopyFromScreen`。
- **坐标**：overlay 进程 1 逻辑单位 = 1.5 物理像素；窗口枚举出来的 `GetWindowRect` 是物理像素，`state.json` 里存的是逻辑像素。
- **MySQL 没开机自启**：`D:\mysql8\bin\mysqld.exe --defaults-file=D:\mysql8\my.ini`。

## 七、验证基线（交付前跑一遍）

```powershell
# 1) 清单还是 4 条
(Get-Content C:\Users\<User>\.dsh\guide-tutor\plan.json -Raw -Encoding UTF8 | ConvertFrom-Json).items | % { "$($_.from)-$($_.to) $($_.title)" }
# 2) 窗口位置对得上 state
#    card.x/y、panel.ballX/ballY 与 EnumWindows 的 GetWindowRect 应能对上（×1.5）
# 3) 无异常日志
Get-Content C:\Users\<User>\.dsh\guide-tutor\overlay.log -Tail 20 -Encoding UTF8
```
