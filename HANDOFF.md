# 交接说明（HANDOFF）

> 给下一个工作区会话看。写于 2026-11-11 19:20，版本 **0.22.37**。
> 详细改动史在 `CHANGELOG.md`（约 100 KB，按日期倒序追加）；这份只写「现在是什么状态、接下来要做什么」。

## 一、这是什么

DSH 桌面插件「教学助手 / guide-tutor」：悬浮球 + 半透明面板 + 桌面清单卡片 + 全屏标注层 + 语音（Edge TTS 晓晓）+ 摄像头巡检 + 都市指令 + 专注环 + 视频库 + 知识库。

- 开发目录：`D:\dsh_TestSpace\guide-tutor`
- 数据目录：`C:\Users\<User>\.dsh\guide-tutor`（`state.json` / `plan.json` / `goals.json` / `daylog-*.jsonl` / `overlay.log` / `plugin.log`）
- U 盘副本：`E:\dsh插件\guide-tutor`（每次大改后同步，旧版在 `guide-tutor.old-20261109`）
- 用户：<姓名>，<学号>，<班级>；课表 `C:\Users\<User>\.dsh\guide-tutor\timetable.json`

## 二、这一版有什么（0.22.37）

| 模块 | 状态 |
|---|---|
| 悬浮球 | 可自由拖动、位置持久化（`state.panel.ballX/ballY`）、滚轮缩放、球下显时钟 |
| 面板 | 620 宽固定、内容靠右 344、底部滑块 70%–180%；标题栏按钮换成 `New-GTextButton`（圆角、hover 底色）、「下一步」是蓝色主按钮；面板带投影，出现时 320ms 淡入 + 10px 右滑；点球与面板同帧切换（不再等动画） |
| 窗口外壳 | `New-GWindow`：无边框、圆角 16、深色底、1px 描边、投影、自绘标题栏、可拖、✕；历史/记录/目标/模板/设置/加任务六个窗口统一 |
| 桌面清单 | **默认收缩 64% 屏高**，底部「く」展开成满屏、字形变「︿」；滚轮滚内容；标题栏可拖、位置持久化（`state.card.x/y`）；每条带 ☐ 打勾 / ✎ 改 / ✕ 删（两段式确认）；空档行右侧有淡「＋」，**双击空档横线可原地输入**（回车保存、Esc 取消、默认 +25 分钟，地点后补） |
| 顶条 | 显示当前/最近一条任务 + 秒级倒计时，位置与缩放持久化 |
| 语音 | Edge TTS 晓晓（`native/tts.ps1` + `py/tts_edge.py`，MCI 播放），合成缓存 + 下一句预合成，失败回落 SAPI |
| 对话记录 | 卡片列表，每条 AI 播报右侧「▶ 重播」→ `replay_say` → `speakText(text,{silent:true})`，不重复写 `chatlog.json` |
| 知识库 | `guide_kb` 支持 `action=search`：空格拆多词、同一行全部命中；md 直读、docx 用 `docxExtract`，返回行号 + 片段 |
| 摄像头 | 120 分钟巡检、指纹去重、**不语音播报** |
| 都市指令 | 按课表+目标派令、催办、`close` 记实 |
| 实验六报告 | 27 步 / 18 页 / 25 图，已生成在 `D:\dsh_TestSpace\guide-tutor\实验六_<学号>_<姓名>_Spring Boot整合MyBatis-Plus.docx` |

## 三、2026-11-09 至 11-11 这轮改了什么

1. **清单条目可改可删**：`✎` 弹预填窗口发 `plan_update`；`✕` 发 `plan_remove`。
2. **空档行「＋」**：点空档右侧的淡加号，直接按该段起始时间预填（结束 +25 分钟）。
3. **清单可收缩**：底部「く」按钮 toggle；内容区套 `ScrollViewer`，滚轮一格 96px。
4. **拖动真正持久化**：删掉 `Update-Card` 里每轮强设的 `CardWindow.Top = WorkTop`，改为读 `state.card.x/y`；删掉三处「球自动让位到清单左边」。
5. **清单条目拖拽改时间**（F02）：按住条目上下拖、松手按 5 分钟吸附改 `from/to`；只有一块跟手，落位在重建后、本地乐观更新。
6. **重复任务与模板**（F03）：每条可设每天/工作日/每周；模板窗口可把某天清单存成模板，铺到今天/明天/后天。
7. **面板与窗口视觉统一**（第二档）：`$script:G` 设计 token、`New-GTextButton`/`New-GPrimaryButton`/`Add-GShadow`/`New-GWindow`；六个窗口换无边框圆角外壳；修「✕ 点不关」（标题栏 `DragMove()` 吞事件）。
8. **双击空档原地输入**：不用弹窗，直接在该行出现输入框，回车即存。
9. **知识库搜索**（F12a）：`guide_kb action=search`，多词同一行命中，md/docx 都搜。
10. **球→面板连贯切换**：同一帧 `Hide()` 球 + `Show()` 面板 + 320ms 淡入，不再等淡出动画跑完。
11. **对话记录重播**：每条 AI 播报右侧「▶ 重播」，重听不重复记 chatlog。

## 三·五、T01 拆分进度（0.22.10）

`index.js` 从 4,872 行降到 **2,762 行**，已拆出 8 个模块：

| 模块 | 文件 | 内容 |
|---|---|---|
| 日志 | `lib/log.js` | 写入 + 5 MB 轮转 |
| 状态 | `lib/state.js` | `state.json` 原子写、读写 |
| 视频库 | `lib/video.js` | 9 个 `video_*` 工具、WBI 签名、字幕 |
| 知识库 | `lib/kb.js` | `guide_kb`、md/docx 读写 |
| 专注环 | `lib/focus.js` | `guide_focus`、tick |
| 摄像头 | `lib/camera.js` | `guide_camera`、巡检 tick |
| 都市指令 | `lib/edict.js` | `guide_directive`、调度 |
| 桌面清单 | `lib/plan.js` | `guide_plan`、自然语言解析、软删除恢复、换天归档 |

`index.js` 仍保留：悬浮层进程管理、面板/标注/语音（TTS + 字幕）、HTTP `apiHandler`、事件分发与工具注册——这些是装配层，按 T01 原方案不拆。

## 四、还没做 / 待用户拍板

- ~~删除无二次确认~~：已做（B01 两次点击、B02 24h 软删除恢复、B03 已随换天过期）。
- **球不再自动躲清单**：拖到清单底下会被盖住。可选：点球置顶 / 重叠时轻推。
- **AI 协作功能**：三选项（本机装 ollama / 给免费 API key / 只做分流提示）用户未选，功能未实现；方案在 `AI协作功能方案-2026-11-09.xlsx`。
- **F12b 知识库版本回滚**：F12 只做了搜索，回滚（保存历史版本、可恢复）还没做，P2/M。
- **F10b 箭头沿线流光**：F10 只做了编号 + 淡出；流光要求「只动 StrokeDashOffset 或一个小光点，不逐层重绘」，P3/M。
- **「下一步」卡死**：`index.js` `handleNextStep()` 先写 `busy:true` 再 `followup`，回合被打断时没有超时兜底，面板会永久停在「收到，正在准备下一步…」。用户报告过（m00201），尚未修；建议 90–120 秒 watchdog。
- **清单条目被误删过两次**（16:33、16:58，各 4–5 条），已按 daylog 恢复。**新会话先核对一遍 `plan.json`。**

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
- **`$script:G.*` 是画刷不是颜色**：token 里存的是 `SolidColorBrush`，直接赋值给 `Background`/`Foreground`；不要再 `[SolidColorBrush]::new($script:G.Card)` 包一层（报「无法将 SolidColorBrush 转换为 Color」）。
- **别用 python / 批量替换改 `native/overlay.ps1`**：`Get-Content -Raw` + `WriteAllText` 会把文件写成 GBK 或丢 BOM，解析报几十条假错；只用 `edit` 工具，改完补 `EF BB BF`，再 `Parser::ParseFile`。
- **DispatcherTimer 在脚本块里不可靠**：`Tick` 不触发过，导致球不隐藏、面板延迟；需要同帧切换就直接 `Hide()`/`Show()`，别排延迟。
- **`ShowActivated=false` 的窗口收不到点击**：测按钮前先点一下激活，或用 UIA 的 `InvokePattern`。
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

## 八、和用户协作的约定

- **计划表开着时不要干等**：用户 2026-11-10 明确要求——发现 `~$打磨计划-2026-11.xlsx` 锁着，就先把 Excel 关掉（COM `Quit()`，不行再 `Stop-Process excel`），趁空档改表，改完 `Start-Process` 重新打开；两边都不影响。不要再问「你关一下表」。
- **两份表必须同步**：根目录 `打磨计划-2026-11.xlsx` 与 `planning\打磨计划-2026-11.xlsx`，改一份就要改另一份。
- **改表后看换行**：`openpyxl` 保存不会破坏格式，但 `edit` 工具会把 `native/*.ps1` 转成 CRLF，改完要 `node` 转回 LF 再提交。
