# 变更日志

本文件记录 guide-tutor 插件（`D:\dsh_TestSpace\guide-tutor`）的每一次实质改动：改了什么、为什么、怎么验证的。
规矩：先写改动，再写验证；删掉的东西要写清能恢复的方式。

---

## 2026-11-04 10:56　清理残留与依赖去重（v0.14.0，代码未改）

### 删掉的残留文件（均为早期乱码修复的中间产物，全仓库无引用）

| 文件 | 大小 | 说明 |
|---|---|---|
| `index.js.damaged.txt` | 51,520 B | 一次编码事故后的损坏备份，已被正式 `index.js` 取代 |
| `index.js.mojibake.bak` | 54,516 B | 同上，乱码版本备份 |
| `native/overlay.ps1.txt` | 50,645 B | overlay.ps1 的纯文本副本，正规文件是 `.ps1` |
| `analyze_damage.py` | 1,933 B | 当时用来定位乱码位置的一次性脚本 |
| `py/repair_index.py` | 11,890 B | 当时用来修复 index.js 的一次性脚本 |

删除前用 `Select-String` 在 `index.js`、`README.md`、`package.json`、`cordis.patch.yml` 里搜过
`damaged` / `mojibake` / `overlay.ps1.txt` / `analyze_damage` / `repair_index`，零命中。

### 删掉的旧版依赖 wheel（`py/wheels/`）

| 文件 | 大小 | 原因 |
|---|---|---|
| `sherpa_onnx-1.9.30-cp312-cp312-win_amd64.whl` | 13,711,087 B | 已被 1.13.8 取代 |
| `sherpa_onnx-1.12.40-cp312-cp312-win_amd64.whl` | 2,168,433 B | 同上 |
| `sherpa_onnx_core-1.12.40-win_amd64.whl` | 15,633,214 B | 同上 |

保留：`sherpa_onnx_core-1.13.8`、`sounddevice-0.5.6`、`cffi-2.1.1`、`pycparser-3.11`
（与 `py/libs` 里已安装的版本一致）。恢复方式：`pip download` 同名版本即可。

**合计释放 31,683,238 B ≈ 30.2 MB。**

### 删掉的重复 DLL 目录（第二笔，22 MB）

`py/libs/sherpa_onnx_core-1.13.8.data/`（内含 `data/Scripts/onnxruntime.dll` 17.0 MB、
`sherpa-onnx-c-api.dll` 4.4 MB 等）是 pip 装 wheel 时落下的副本，与
`py/libs/sherpa_onnx/lib/` 下的真正运行库重复。

删除方法（先验证再删，不赌）：把目录改名成 `.off` → 跑 ASR 自测 → 通过才真删，
失败则改回原名。实测自测通过，已删除。

**两笔合计释放 ≈ 52 MB**，插件目录 188.9 MB → **136.8 MB**，文件数 173 → 160。

### 修好的一处硬编码

`py/asr_selftest.py` 里模型路径写死成旧机器路径
`C:\Users\<User>\Documents\deepseek-harness\default-workspace\guide-tutor\models\paraformer-small`，
改为按脚本位置推算：

```python
root = str(pathlib.Path(__file__).resolve().parent.parent / "models" / "paraformer-small")
```

### 验证

```
python 3.12.14 + PYTHONPATH=py\libs，运行 py\asr_selftest.py
→ wavs: 7；0.wav / 1.wav 均输出识别文本
```

结论：离线语音识别链路（sherpa-onnx + Paraformer-small int8）删完后仍可用。
未改 `index.js`，不需要热重载。

### 本次刻意没动的

1. `tmp/` 19 个文件、6.5 MB：实验四报告与读书报告用的原始截图，等报告定稿后再归档。
2. `kb-backup-20261027-1958/`：知识库分类前的原样备份，保留。
3. `py/wheels/sherpa_onnx_core-1.13.8-win_amd64.whl`（16.1 MB）：留着给别的机器重装用，
   只有一份，不重复。

### 待办（需要用户点头）

- **拆分 `index.js`**（4250 行单文件 → `edict/`、`focus/`、`camera/`、`video/`、`kb/` 五个模块）。
  这是行为改动，必须做回归：20 个工具逐个冒烟、心跳、悬浮层、语音、视频库各测一遍，预计半天。

---

## 版本沿革（据 package.json 与记忆文件回溯）

| 版本 | 主要内容 |
|---|---|
| 0.11.0 | 摄像头巡检 `guide_camera`（本地 16×16 指纹比差，没变化不花 token） |
| 0.12.0 | 都市指令 `guide_directive`（目标面板 + 半自动派令 + 催办） |
| 0.13.0 | 知识库子目录、`guide_kb` 路径防穿越 |
| 0.14.0 | 专注环 `guide_focus`（本地定时提醒，不叫模型） |

---

## 2026-11-05　把"改动必留痕"变成跨工作区的硬规则

### 改了什么

| 文件 | 改动 |
|---|---|
| `C:\Users\<User>\.dsh\AGENTS.md` | 新建（1,9xx B）。用户级指令，DSH 每次会话自动加载，换工作区也生效。5 条：改动必进日志、不确定就说不确定、破坏性操作先确认、先给结论、中文优先 |
| `index.js` 第 35 行（TUTOR_PROMPT 末尾） | 追加【改动日志】一条（约 240 字），说明日志放哪、四段式、删改要单列 |
| `D:\dsh_TestSpace\用户记忆.txt` | 追加第 15 条【改必留痕（2026-11-05 定）】 |
| `CHANGELOG.md` | 就是本条目 |

### 为什么

他原话："以后每一次修改都要计入日志，想办法记住这一点，以后换工作区了也能保证。"
只写在聊天里会随上下文压缩丢掉；只写项目 CHANGELOG 又会随换目录失效。所以要两层：
用户级 AGENTS.md 管"跨工作区"，项目 CHANGELOG 管"具体条目"。

### 怎么验证

- `node --check index.js` → 通过（注意：TUTOR_PROMPT 是模板字符串，里面**不能用反引号**，第一版就因此报 `SyntaxError: Unexpected identifier 'CHANGELOG'`，改成普通文字后过）。
- `AGENTS.md` 生效实测：写完后本会话的系统提示里立刻出现 `Instructions from: ~/.dsh/AGENTS.md` 及其全文，说明加载链路通了。
- 记忆文件行数 262 → 264。

### 怎么恢复

- 删 `C:\Users\<User>\.dsh\AGENTS.md` 即撤销全局规则；
- `index.js` 里删掉【改动日志】那一段（模板串最后一个 `\n- 【改动日志】…`）；
- 记忆文件删掉末尾第 15 条。

### 待办

- 插件热重载后新 TUTOR_PROMPT 才生效（改 `cordis.patch.yml` 第 44 行注释触发，判据是 plugin.log 出现 disposed→ready）。
- 可选：在心跳里加"代码 mtime 晚于 CHANGELOG 就提醒"的机械哨兵，避免只靠自觉。
---

## 2026-11-05　悬浮层加时钟 + 大小可调（v0.15.0）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① 球窗口 64x64 → 64x88，内容改成 `$ballStack`＝58x58 渐变球 + `$clock`（12pt 白字、带投影），球下面常驻 `HH:mm`；② 面板标题栏加 `$clockPanel`（橙色 `HH:mm:ss`，位置在「记录」左侧）；③ 新增 `Update-Clock`、`$script:UiScales = @(0.85, 1.0, 1.2, 1.45)`、`$script:UiScale`、`$script:UiScaleIndex`、`Get-UiScaleName`、`Apply-UiScale`、`Step-UiScale`；④ 面板按钮区「目标」后加「大小」TextBlock，点击 `Step-UiScale 1`；⑤ 球窗口 `Add_MouseWheel`：Ctrl 按住时 `Step-UiScale $delta -Quiet`；⑥ `Apply-State` 里读 `$panel.uiScale`（差 >0.001 才应用）；⑦ 拖动边界改用 `$script:BallWindow.Width/Height`，不再写死 64 |
| `index.js` | `DEFAULT_PANEL` 加 `uiScale: 1`；`handleEvent` 加 `case 'ui_scale'`（clamp 0.7–1.8 写入 `panel.uiScale` 并持久化）；版本 0.14.0 → 0.15.0 |
| `README.md` | 能力表加「时钟」「大小可调」两行 |
| `package.json` | version 0.15.0（用 edit 工具改，避免 Set-Content 带 BOM 把插件加载器搞挂） |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："给悬浮层加入时间显示。同时给悬浮层增加大小可调的功能。"
悬浮球平时只显示「引」，想知道时间得摸手机；面板固定 344 DIP，在小屏上太大、在大屏上太小。

### 怎么验证

- `native/overlay.ps1` 首三字节确认是 EF BB BF（某次编辑曾把 BOM 写没，PowerShell 5.1 会按 ANSI 读中文导致 ParserError）；`Parser.ParseFile` → PARSE OK。
- `node --check index.js` → 通过。
- 热重载：改 `C:\Users\<User>\.dsh\profiles\desktop\cordis.patch.yml:44` 注释 → plugin.log 出现 `disposed` → `guide-tutor ready` → `overlay ready (pid 284944)`。
- 缩放：向 `events.jsonl` 追加 `{"type":"ui_scale","scale":1.2}` → `state.json` 里 `panel.uiScale=1.2`，面板窗口 344→413 DIP（620 physical）、球 64x88→77x106；再追加 1.45 → 749x406 physical。复位到 1.0。
- 真实点击：面板「大小」按钮点一下 → `panel.uiScale` 1.0 → 1.45，面板随之变为 749x406；「记录」按钮点开对话记录窗，证明标题栏按钮命中正常。
- 截图：`tmp\shot-ball-small.png`（球 + `11:53`）、`tmp\shot-panel-1.png`（`教学助手 11:53:07 记录 目标 大小 ⧉ —`）。

### 怎么恢复

- 时间显示：删 `$clock` / `$clockPanel` 两个 TextBlock 与 `Update-Clock` 调用，球窗口高度改回 64；
- 大小功能：删「大小」按钮、`Apply-UiScale`/`Step-UiScale`/`Get-UiScaleName` 三个函数与 `uiScale` 相关分支，面板 `Width` 写回 344、`MaxHeight` 写回 700；
- `state.json` 里残留的 `panel.uiScale` 可忽略（插件读不到就走默认 1.0）。

---

## 2026-11-05　大小改成滑块拖动（v0.15.0 内改动，版本号不变）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① 删掉标题栏「大小」TextBlock 按钮与 `Step-UiScale`、`Get-UiScaleName`、`$script:UiScales`、`$script:UiScaleIndex`；② 底部新增 `$sizeRow`（标签「大小」+ 70–180 的 Slider + 右侧百分数），`Add_ValueChanged` 调 `Apply-UiScale ($pct/100) -Quiet -FromSlider`，并用 400ms 的 `$script:SizeTimer` 在松手后才发 `ui_scale` 事件；③ `Apply-UiScale` 新增 `-FromSlider` 开关：来自滑块时不回写 `SizeSlider.Value`（回写会打断 Thumb 拖动，表现为“拖一下只动 1%”）；④ 面板窗口固定 620 宽（344×1.8）、内容 `$outer` 靠右，缩放只改 `LayoutTransform`，不再改窗口 `Width/Left`；⑤ 面板拆两块：上半 `$outer`（标题/正文/步骤/下一步，跟随缩放）+ 下半 `$bottom`（输入框、按钮、透明、大小滑块，固定大小）；⑥ 球上 Ctrl+滚轮改为一档 5%，走新函数 `Adjust-UiScale` |
| `README.md` | 能力表「大小可调」一行改成滑块版，注明底部操作条不参与缩放的原因 |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话：“这个大小调整的功能做的不对，将这个调大小的功能改成可以用类似拖动进度条改大小的形式把。”
四档按钮只能离散跳，他要的是连续拖动。中途踩了两个坑：

1. 拖动时窗口跟着变宽、左边缘左移（右边缘锚定），滑块在指针底下被搬走，拖动直接断——实测只到 1.01；
2. 滑块和被它控制的面板在同一棵被缩放的树里，面板一变滑块就变长，正反馈，一拖冲到 180%。

### 怎么验证

- `tmp\check-ps.ps1` 补 BOM 并用 `Parser.ParseInput` 校验：overlay.ps1 / capture.ps1 / cam.ps1 / idle.ps1 / tts.ps1 全部 PARSE OK（edit 工具两次把 BOM 写没，都靠它补回）。
- `guide_overlay restart` → overlay.log `panel@(1039,110) 620x241`，新 pid；`state.json` 的 `uiScale` 复位 1.0。
- 真实拖动：`tmp\drag2.ps1 -X1 2133 -Y1 495 -X2 2300 -Y2 495` → `panel.uiScale` = 1.544（滑块 70–180 线性映射的预期是 154%，一致），上半面板当场放大、底部条保持原大。
- 反向复位：向 `events.jsonl` 追加 `{"type":"ui_scale","scale":1.0}` → 滑块回 100%、面板复原。
- 键盘路径也通：点滑块后按 → 键，`uiScale` 1.0 → 1.001（SmallChange 0.1%）。
- 截图：`tmp\panel-v3.png`（100%）、`tmp\panel-big.png`（154%）。

### 怎么恢复

- 回四档：恢复 `Step-UiScale`、`Get-UiScaleName`、`$script:UiScales`，headerButtons 里加回「大小」TextBlock；`Apply-UiScale` 里恢复对 `$script:PanelWindow.Width/MaxHeight/Left` 的赋值。
- 回单块面板：把 `$fixedStack.Children.Add(...)` 三行改回 `$stack`，`$window.Content` 直接给 `$outer`。
- 临时脚本 `tmp\check-ps.ps1`、`tmp\drag2.ps1`、`tmp\slide-key.ps1` 可删，无引用。

---

## 2026-11-05　桌面清单卡片（v0.16.0）

### 改了什么

| 文件 | 改动 |
|---|---|
| `index.js` | ① 新增 `DEFAULT_CARD = { visible:false, x:null, y:null, opacity:0.88 }`；② `currentState()` 默认值加 `card` 与 `plan:{date:'',items:[]}`，`writeState()` 合并 `card`；③ `handleEvent` 新增 `plan_done` / `card_moved` / `card_close` 三个 case；④ 新增 plan 段（插在 chatlog 段之前，约 600 行）：`planPath`/`planStatePath`/`planArchiveDir`、`PLAN_TONE`+`planToneText()`、`readPlanFile`/`savePlanFile`/`archivePlan`/`planForToday`/`pushPlanState`/`setPlanItemDone`、`planSummary`/`planItemLine`、`planRemindPrompt`/`planNudgePrompt`/`planBuildPrompt`、`wakePlan`、`planTick`、`planRun`、`guidePlanTool`；⑤ 注册工具与心跳（`ctx.effect(() => ctx.tools.register(guidePlanTool))`、`registerTickHandler(() => planTick(new Date()))`）；⑥ API 加 `/plan`；⑦ `TUTOR_PROMPT` 加【桌面清单】一条；⑧ 工具补 `async execute(args = {}) { return planRun(args) }` |
| `native/overlay.ps1` | ① 新增 `New-CardWindow`：304 宽、无边框、`AllowsTransparency`、圆角 14、底色 `FromArgb(222,16,19,25)`，默认 `Left = 屏宽-304-48`、`Top = 屏高锚点 500`；② 新增 `Update-Card($state)`：按 `state.plan` 重建行（☐/☑ + `HH:mm–HH:mm · 地点` + 标题），完成项加删除线并变灰，右上显示 `日期 · 完成/总数`；③ `Apply-State` 调 `Update-Card`，`captureMode` 时隐藏卡片；④ ✕ 改用 `PreviewMouseLeftButtonDown` + `e.Handled = $true`（原来用 `MouseLeftButtonUp`，被标题栏的 `DragMove()` 吃掉，点不掉） |
| `README.md` | 能力表加「桌面清单」一行；工具清单加 `guide_plan` |
| `package.json` | 0.15.0 → 0.16.0（edit 工具改，无 BOM） |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话（m02387）："1 悬浮窗改成与桌面融为一体…2 把任务目标以 ToDoList 形式显示在桌面…3 目标转成每日清单（带时间区间、地点、做什么）…4 AI 与用户互动…"
后又补（m02394）："最好还是不要真融入桌面，直接弄一个'伪桌面'的效果吧…1：备份当前的版本。2：根据这些东西做出修改。"
所以不做 `SetParent` 到 `WorkerW`（资源管理器一重启就掉、全屏游戏会挡），只做"无边框 + 强半透明"的视觉融入。

### 怎么验证

- 备份：`robocopy ... /E /XD tmp` → 130.3 MB / 141 files 到 `D:\dsh_TestSpace\guide-tutor-backup-20261104`。
- `node --check index.js` → exit 0；`tmp\check-ps.ps1` → overlay/capture/cam/idle/tts 全 PARSE OK。
- 热重载两轮：`plan-card-v016` → `plan-card-v016b`，plugin.log 见 disposed→ready、`overlay ready (pid 294148)`。
- 工具：`guide_plan add` 三条 → 返回 `2026-11-04（0/3 已完成）` 与 ☐ 列表；`show` 正常。
- 窗口：`tmp\wins9.ps1 -ProcId <pid>` 确认卡片窗口 `1355,500 304x167 ex=0x80088 visible=True`。
- 交互（坐标 = 物理像素，DPI 1.5）：点第一个 ☐ `(2067,825)` → `state.json` 该条 `done=true`，卡片变 `1/3`、标题加删除线；拖标题栏 `(2200,785)→(2100,700)` → `state.card.x=1288 y=443` 落盘，重启 overlay 后卡片仍在该位置；点 ✕ `(2362,692)`（修复后）→ `state.card.visible=false`。
- 截图：`tmp\card-final.png`（卡片 + 球 + 时钟同框）。

### 怎么恢复

- 整体回滚：把 `D:\dsh_TestSpace\guide-tutor-backup-20261104` 的内容覆盖回来（`robocopy <backup> <repo> /MIR`）。
- 只回代码：`index.js` 删掉 plan 段与 `DEFAULT_CARD`/三个 case/工具注册/心跳/TUTOR_PROMPT 那条/`/plan` 路由；`overlay.ps1` 删 `New-CardWindow`、`Update-Card` 与 `Apply-State` 里的调用；`package.json` 版本改回 0.15.0。
- 数据：`plan.json`、`plan-state.json`、`plan-archive\` 可留可删，删了就当空清单重排。

### 待办

- `planTick` 的到点提醒（提前 10 分钟 / 过点 15 分钟追问）还没实跑过一次真实触发。
- `guide_plan auto`（拿目标和课表自动排）还没实跑。
- 卡片特效（淡入、缩放入场、完成时的划线动画）尚未做。

---

## 2026-11-04　右侧满屏时间轴清单 + 齿轮设置（v0.17.0）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① 卡片窗口改为贴右缘、满屏高：`Width = $script:CardWidth`、`SizeToContent = Manual`、`Height = $script:ScreenHeight`、`Left = ScreenLeft+ScreenWidth-CardWidth`、`Top = ScreenTop`；新增脚本级变量 `$script:CardWidth = 360`、`$script:CardAlpha = 235`、`$script:DayStartHour = 6`、`$script:DayEndHour = 24`；② 头部加 ⚙（`Show-SettingsWindow`）与 ✕，装进 `$headBtns` 放第二列；③ 重写 `Update-Card`：宽度读 `card.width`（夹 240–640、改宽同步 `Left`）、按 `item.from` 分进小时格、无时间的进「随时」、空小时画 16 alpha 分隔线、标题栏显示 `日期 · 完成/总数`；条目为空也照常显示整天时间轴；④ 新增 `Show-SettingsWindow`（396 宽、居中）：清单透明度 20–100、清单宽度 240–640、面板透明度 35–100、面板大小 70–180 四个滑块 + 语气四按钮（严厉/正常/损友/极简）；⑤ 四个滑块的落盘事件改用 `AddHandler(MouseLeftButtonUpEvent, …, $true)`——普通 `Add_MouseLeftButtonUp` 收不到 Thumb 拖完那次 Up（事件被 Thumb 标记 handled），实测点一下不发事件；⑥ 球在清单显示时自动让到 `Left = ScreenLeft+ScreenWidth-CardWidth-BallWindow.Width-16`，隐藏时回右侧 48；⑦ `Apply-State` 里球定位之后再让位，避免被 `panel.ballX` 覆盖 |
| `index.js` | `DEFAULT_CARD` 改为 `{ visible: false, x: null, y: null, opacity: 0.86, width: 360 }`；`handleEvent` 新增 `card_opacity`（夹 0.2–1）、`card_width`（夹 240–640 取整）、`tone`（读 `readEdictConfig()` 后写回 `edict.json` 的 `tone`，失败 log `tone set failed`）|
| `README.md` | 能力表「桌面清单」一行改写成满屏时间轴 + 齿轮设置版 |
| `package.json` | 0.16.0 → 0.17.0（edit 工具改，无 BOM）|
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："我要更改：目前这个清单不是不行，但不够…1，我要的效果是整个右侧都是清单，高度就是屏幕从上到下，宽度可以自适应调整，然后要把一整天都排满，没有要求的可以为空。2：透明度可调，制作一个设置的图样（齿轮样），用来调试透明度等其他设置，同时悬浮窗的透明度和大小也可以改成这样。"

原来卡片只有 304 宽、高度随条目走，看着像个小挂件；他要的是整条右侧时间轴，外加一个统一的设置入口。

### 怎么验证

- `tmp\check-ps.ps1`：overlay.ps1 / capture.ps1 / cam.ps1 / idle.ps1 / tts.ps1 全部 PARSE OK（编辑工具又两次把 BOM 写没，已补）。
- `node --check index.js` → exit 0；热重载（按字面替换 `cordis.patch.yml` 第 44 行的 `reload: …` 标记）→ `guide-tutor ready` + `overlay ready (pid 301204)`。
- 视觉：`tmp\card-full.png` 证实 06:00–23:00 时间轴、14:00/16:00/19:00 三条落在对应小时、⚙/✕ 在右上；球自动让到卡片左侧。
- 齿轮：按放大后的 `⚙` 坐标点 `(2488,28)` → 设置窗弹出（`tmp\card-settings-view.png`），四项滑块与语气按钮都在。
- 语气：点「严厉」→ `edict.json` 出现 `"tone": "strict"`。
- 宽度：拖宽度滑块 → `state.json` 的 `card.width` = **589**，卡片当场变宽（`tmp\card-wide.png`）；随后用事件回设 380。
- 透明度：滑块的 `card_opacity` 事件已验证能写 `state.card.opacity`（默认 0.86）。

### 怎么恢复

- 卡片回 304 宽小挂件：`$window.Width = 304`、`SizeToContent = Height`、去掉 `Height = $script:ScreenHeight`；`Update-Card` 回单列渲染。
- 去掉设置窗：删 `Show-SettingsWindow` 与 `$gear` 的 handler。
- 整包回退：`robocopy D:\dsh_TestSpace\guide-tutor-backup-20261104 D:\dsh_TestSpace\guide-tutor /E`（备份取自 v0.15.0 时点）。

---

## 2026-11-04　清单不再遮盖任务栏（v0.17.0 内修补）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① 新增工作区变量 `$script:WorkLeft/WorkTop/WorkWidth/WorkHeight`（取 `[System.Windows.SystemParameters]::WorkArea`，即扣掉任务栏的可用区域）；② `New-CardWindow` 里卡片高度改 `$script:WorkHeight`、`Top` 改 `$script:WorkTop`、`Left` 改 `WorkLeft+WorkWidth-CardWidth`；③ `Update-Card` 每次刷新先重设 `CardWindow.Height/Top`（任务栏挪位、分辨率变化也跟得上），宽度变化时的 `Left` 也改按工作区算 |

### 为什么

他发的截图显示任务栏被清单盖住："这边的底下这任务栏被插件挡住了，调整一下"。原来卡片用 `VirtualScreenHeight` 从屏幕顶铺到底，而它是 `Topmost`，所以压在任务栏上面。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK（BOM 又被编辑工具写没，已补）。
- `guide_overlay restart` 后截 `tmp\card-bottom.png`：任务栏完整露出，卡片下缘停在任务栏上方；`tmp\card-full.png` 显示 06:00–23:00 仍在、条目位置不变。
- 卡片高度 = 工作区高度（本机 1600 物理像素屏，任务栏 96 px 左右，DIP 约 1019）。

### 怎么恢复

- 把 `New-CardWindow` 三行改回 `$script:ScreenHeight` / `$script:ScreenTop` / `ScreenLeft+ScreenWidth-CardWidth`，删掉 `Update-Card` 里那两行重设即可。

---

## 2026-11-04　清单条目可以取消勾选（v0.17.0 内修补）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① 两处勾选 handler 的 `done` 从写死 `$true` 改成 `(-not $isDone)`——点一次打勾，再点一次取消（`Update-Card` 里定时与「随时」两段都改了）；② 正文 `$body` 也挂同一个 handler，点标题文字同样能勾/取消，不用非要点那个 14px 的小方框 |

### 为什么

他原话："已经打过勾的任务无法被取消，修改一下"。原来的 handler 是无条件 `done = $true`，`setPlanItemDone(id, false)` 那条路虽然插件端支持（会把 `doneAt` 置 null、不写 daylog），但界面从来没发出过 `false`。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`guide_overlay restart`。
- 点已完成的「概率论课，带课本和计算器」标题 → `state.plan.items[0].done` 由 `true` 变 `false`（`events.jsonl` 出现 `{"done":false,"id":"tmw1mthrf","type":"plan_done"}`）；再点一次变回 `true`。
- 顺带确认插件端：取消时不写 `daylog`，只把 `doneAt` 清空。
- 截图 `tmp\card-toggle.png`：一条 ☑、两条 ☐。

### 怎么恢复

- 把两处 handler 的 `done = (-not $isDone)` 改回 `done = $true`，删掉 `$body` 上挂的那两行即可。

---

## 2026-11-04　清单改成番茄钟时间格（v0.17.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | `Update-Card` 的整点行换成番茄钟格：每小时两格（`HH:00–HH:25`、`HH:30–HH:55`），左列只写小时数，右列逐格渲染。条目按开始时间**吸附**到最近的番茄钟起点（`08:26` 算 `08:30`），一格只放一条；空格子用 8.5pt、45 alpha 的淡字占位，保证"整天排满、没安排也看得见"。条目行改成「☐ 14:00–14:25 · 25 分 · 地点 + 标题」，字号 12。渲染逻辑抽成 `$addItemRow` scriptblock，勾选仍是 `done = (-not $isDone)` |
| `index.js` | `planRun` 的 `add` 分支：开始时间先吸附（`Math.floor(mins/30)*30`，超过 25 分钟进下一格），`to` 一律自动算成 `from + 25`，参数里的 `to` 不再采用；`planBuildPrompt` 的排程说明改成"一条 = 一个 25 分钟番茄钟，from 用整点或半点，结束自动 +25，中间 5 分钟休息" |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："问题：这个是时间是一个区间，你应该以番茄钟的时间区间来设计这个列表。例如：8：00~8：25，8：30~8：55。"
原来按整点分行、条目自带任意区间（如 19:30–20:30），既不像番茄钟，也看不出"下一个 25 分钟该干什么"。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`node --check index.js` → 0；热重载 `reload: 2026-11-04 pomodoro-slots` → `guide-tutor ready` + `overlay ready (pid 285952)`。
- 吸附实测：`guide_plan add from=20:11` → 落成 `20:00–20:25`。
- 把 `plan.json` 里三条旧区间（14:00–15:30、16:00–16:40、19:30–20:30）改成 25 分钟格后 `guide_plan list` 返回三条 25 分钟条目，`state.plan.items` = 3，卡片 `tmp\card-slots.png` 显示 14:00/16:00/19:30 三格有条目、其余格子淡字占位。

### 怎么恢复

- 卡片回整点行：把 `foreach ($m in @(0, 30))` 那段换回单行渲染（备份 `D:\dsh_TestSpace\guide-tutor-backup-20261104` 里有 304 宽老版本，但没有满屏时间轴）。
- 插件回自由区间：`planRun` 里删掉 `slot` 吸附三行，`to` 改回 `String(args.to).trim()`。

---

## 2026-11-04　时间轴按高度铺满（v0.17.0 内修补）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | `Update-Card` 里每小时那行从自适应高度改成**按可用高度平分**：`$rowHeight = max(26, floor((WorkHeight - 84) / 小时数))`，`$row.Height = $rowHeight`；小时格内部从 `StackPanel` 改成 `Grid` + 两个 `1*` 行，两个番茄钟格各占一半、各自 `Grid.Row` 定位，所以条目再多一行也不会把别的小时挤走。顶部标题栏与底部内边距合计按 84 预留 |

### 为什么

他发的截图显示：时间轴只画到 23:30–23:55 就停了，下面还有一整片卡片高度是空的（因为原来行高是内容自适应，18 小时只用了约 2/3 高度）。他原话："比例没控制好，有一大片空格。把空格填上"。

### 怎么验证

- `tmp\check-ps.ps1` → 五个 ps1 全部 PARSE OK；`guide_overlay restart` 后 `tmp\card-slots.png`：06:00 到 23:30–23:55 均匀铺满整张卡片，底部无空档，三条任务仍在 14:00 / 16:00 / 19:30 格内。

### 怎么恢复

- 删掉 `$rowHeight` 两行与 `$row.Height = [double]$rowHeight`，小时格改回 `StackPanel` 即可回到"内容自适应"的老样子。

---

## 2026-11-04　时间轴收到 22:30（v0.17.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | 新增 `$script:DayEndMinute = 30`，`$script:DayEndHour` 24 → **22**；小时循环从 `-lt DayEndHour` 改为 `-le DayEndHour`，每个小时先用 `$slotsInHour = @(0, 30) | Where-Object { ($h*60 + $_) -lt ($script:DayEndHour*60 + $script:DayEndMinute) }` 过滤，所以 22 点只剩 `22:00–22:25` 一格、`22:30` 及之后整段不画；`bySlot` 的区间判断同样改成 `$slot -lt ($script:DayEndHour*60 + $script:DayEndMinute)`；行高平分改用 `$hours = DayEndHour - DayStartHour + 1`（17 小时） |
| `index.js` | `planRun` 的 `add` 分支加收工线 `const planDayEnd = 22*60 + 30`，`slot >= planDayEnd` 时收进最后一格 `slot = 22*60`——否则 23:10 这种条目会落在卡片时间轴外面，看得见列表、看不见格子 |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："23 去掉，我最多十点半就结束了一天了。"
原来画到 `23:30–23:55`，多出来的两小时全是空占位，既浪费右侧高度，也暗示"还可以排到半夜"。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`guide_overlay restart` 后截图 `tmp\card-end2230.png`：`06:00` 起、到 **`22:00–22:25`** 止，`22:30` 与 `23` 整段消失，仍铺满卡片高度。
- 插件侧：`node --check index.js` exit 0；改 `cordis.patch.yml` 第 44 行标记 `reload: 2026-11-04 day-end-2230` → `guide-tutor ready` + `overlay ready (pid 264628)`。
- 收进末尾实测：`guide_plan add from=23:10 title=测试深夜条目` → 落成 `22:00–22:25`，`guide_plan list` 四条；随后 `remove` 掉并写 daylog「清单划掉：删掉 22:30 收工测试条目」，回到三条。

### 怎么恢复

- 想画回 23 点：`$script:DayEndHour = 23`、`$script:DayEndMinute = 30`（或 24 / 0 回到 24:00）；`index.js` 里 `planDayEnd` 跟着改。

---

## 2026-11-04　抓拍静默：摄像头巡检不再语音播报（v0.17.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `index.js` `cameraWakePrompt()`（2281 行起） | 第 3 条由「只有确实值得说才 guide_say」改为「**抓拍一律不播报：不要调用 guide_say**（用户明确要求抓拍不出声），只在聊天里一句话收尾」 |
| `index.js` 语音状态区（1397 行附近） | 新增 `const mutedSpeakMessages = new Set()` 与 `let speakMutedThisTurn = false` |
| `index.js` `autoSpeakTurn()`（1651 行起） | 前置判断加 `|| speakMutedThisTurn`，静默轮直接不朗读 |
| `index.js` `agent/inbox/inserted` 钩子（1675 行附近） | 每轮开头先 `speakMutedThisTurn = false`，再按 `message.id` 是否在 `mutedSpeakMessages` 里决定置 true 并删除该 id |
| `index.js` `cameraTick()` 唤醒处（2381 行附近） | 先 `buildUserMessage(...)` 拿到消息对象，把 `wake.id` 记进 `mutedSpeakMessages` 再 `agent.followup(wake)`；日志改成 `camera flag delivered diff=… (muted speak)` |
| `CHANGELOG.md` | 本条目 |

### 为什么

用户原话："修改一下，以后抓拍不需要用语音播报了。"
之前只改提示词（不许调 `guide_say`）不够：插件的 `autoSpeakTurn()` 会在**每轮回复结束时自动朗读**回复正文（`agent/assistant-stream` / `turn-end` 两条路径），所以摄像头巡检那轮即使没调 `guide_say`，文字回复也会被念出来。

### 怎么验证

- `node --check index.js` → exit 0。
- 热重载：`index.js` 的 mtime `14:43:42`，`plugin.log` 在 `2026-11-04T06:43:58.287Z`（本地 14:43:58）出现 `guide-tutor disposed` → `guide-tutor ready`，`06:44:00.732Z` `overlay ready (pid 282084)`，说明改动已加载（编辑 `index.js` 本身会触发插件热重载，不必改 `cordis.patch.yml`）。
- 事后可查证据：下一次真实抓拍时，`plugin.log` 应出现 `camera flag delivered diff=… (muted speak)`，且那一轮**没有** `auto-speak (…)` 行。

### 怎么恢复

- 想恢复播报：删掉 `autoSpeakTurn()` 里的 `|| speakMutedThisTurn`，并把 `cameraWakePrompt` 第 3 条改回「只有确实值得说才 guide_say」；`mutedSpeakMessages` / `speakMutedThisTurn` 留着不影响（不再被置 true）。

---

## 2026-11-04　清单按课表重排 + 卡片显示真实区间（v0.17.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `C:\Users\<User>\.dsh\guide-tutor\plan.json` | 整份重写，今天（2026-11-04 周三）5 条：08:30–10:10 远志楼西一 Web系统开发（上）/ 10:20–12:00 行知楼甲204 数据采集技术 / 15:50–17:30 排球场1 大学体育 / 18:00–18:25 宿舍 打印实验四报告 / 19:30–19:55 机房 Spring Boot 实验五。删掉了原来那三条（含我手工加错的 14:00 概率论——那是**周四**的课）|
| `native/overlay.ps1` | `$addItemRow`（约 1920 行）原来把每格写死成 `… · 25 分`、结束时间按 `slotStart + 25` 算；改成读 `$item.from`/`$item.to`（正则 `^(\d{1,2}):(\d{2})$` 解析分钟），`$spanMin = $toMin - $fromMin`，缺 `to` 时回退 `+25`。整节课现在显示「08:30–10:10 · 100 分」而不是「08:30–08:55 · 25 分」|
| `C:\Users\<User>\.dsh\guide-tutor\timetable.json` | `week` 从 `{no:9, 2026-10-26~11-01}` 改成 `{no:10, 2026-11-02~11-08}`（今天已进第 10 周）|
| `CHANGELOG.md` | 本条目 |

### 为什么

他问"你检查一下今天的课表和那个清单对的上吗"，查出来三处对不上：清单里的 14:00 概率论是周四的课（今天下午两点没课，13:50 那条"现在动身"的提醒因此是错的，是我手工加条目时按周四的课表加的）；16:00 打印报告撞 15:50–17:30 的体育课；今天真正的三节课一节都没进清单。他随后说"你重排一下"。

### 怎么验证

- `tmp\check-ps.ps1` → 补回 BOM，五个 ps1 全部 PARSE OK；`guide_overlay restart`。
- `guide_plan show` → `2026-11-04（0/5 已完成）`，五条与课表逐条对上。
- 截图 `tmp\card-plan-fixed.png`：08:30–10:10 · 100 分 / 10:20–12:00 · 100 分 / 15:50–17:30 · 100 分 三节课按真实区间显示，18:00 与 19:30 两条番茄钟仍是 `· 25 分`。
- 课表改动只动 `week` 字段，`classes` 未变。

### 怎么恢复

- `plan.json` 回滚：`guide_plan add` 重新加回原三条，或从 `D:\dsh_TestSpace\guide-tutor-backup-20261104` 覆盖。
- 卡片文案回滚：把 `$addItemRow` 里 `$fromMin/$toMin/$spanMin` 那几行删掉，恢复固定 `25 分` 的 `$meta` 一行。
- `timetable.json` 的 `week` 改回 `{no:9, 2026-10-26, 2026-11-01}`。

---

## 2026-11-04　面板加「清单」按钮，卡片可随时开合（v0.17.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | 面板标题栏「记录」后新增 `$cardBtn`（文字「清单」，ToolTip「显示/收起右侧的今日清单」），点击 `Send-OverlayEvent @{ type = 'card_toggle' }` |
| `index.js` | `handleEvent` 新增三个 case：`card_toggle`（读 `currentState().card?.visible` 取反后 `writeState({ card: { visible: !shown } })`）、`card_show`、`card_hide` |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："清单的按钮怎么没有弄出来，这样我就打开不了了"。卡片右上角只有 ✕，点了收起之后 UI 上再没有入口，只能让我调 `guide_plan show` 才出得来。

### 怎么验证

- `tmp\check-ps.ps1` → 补回 BOM，PARSE OK；`node --check index.js` exit 0。
- 插件热重载：改 `C:\Users\<User>\.dsh\profiles\desktop\cordis.patch.yml` 第 44 行 `reload: 2026-11-04 camera-mute-speak3` → `card-btn` → plugin.log `07:01:40 disposed` → `ready`。**注意：光改 `index.js` 没触发重载**，必须是 patch 文件里那行注释真的改到（之前一次替换目标写错、文本没变，所以没重载，报 `unknown overlay event {"type":"card_toggle"}`）。
- 实测（DPI 1.5，物理坐标）：面板标题栏「清单」在 `(2293,205)`；点一下 → `state.card.visible` 由 true 变 **false**（卡片收起），再点一下 → 回 **true**（卡片重新出现在右侧）。截图 `tmp\card-back.png`。
- `guide_plan show` 仍然有效（`state.card.visible=true`），两条路径不冲突。

### 怎么恢复

- 删 `native/overlay.ps1` 里 `$cardBtn` 那 12 行；`index.js` 删 `card_toggle` / `card_show` / `card_hide` 三个 case。
- 卡片仍可用 `guide_plan show|hide` 控制。

---

## 2026-11-04　顶部当前任务条（v0.18.0）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① 新增 `New-TopBarWindow`（`WindowStyle=None`、`AllowsTransparency`、`Topmost`、`ShowInTaskbar=false`、`SizeToContent=WidthAndHeight`，默认水平居中、`Top = WorkTop + 6`；圆角 14 的 Border，底色 `FromArgb(238,16,19,25)`，内边距 16,7,16,7；里面一个 13pt 白字 TextBlock）；② 拖标题发 `topbar_moved`（Left/Top），`Add_MouseWheel` 里按住 Ctrl 时 `Apply-TopBarScale`（0.7–2.0，步进 0.1）并发 `topbar_scale`；③ 新增 `Update-TopBar($state)`：算"现在"落在哪条 `from ≤ now < to` 的未完成条目上；没有就找 30 分钟内即将开始的（前缀「接着」）；都没有就 `Hide()`；文案 `'{from}–{to}　{title}　@ {place}'`，用签名去重避免每拍重建；④ `Apply-State` 里 `Update-Card` 之后调用，并按 `state.topbar.x/y/scale` 还原位置与缩放；⑤ `On-Tick` 里整分钟（`$second -eq 0`）时重算一次，跨时段自动换内容 |
| `index.js` | `DEFAULT_TOPBAR = { x: null, y: null, scale: 1 }`；`currentState()` 补默认、`writeState()` 合并；`handleEvent` 新增 `topbar_moved`（写 x/y）与 `topbar_scale`（夹 0.7–2）|
| `README.md` | 能力表「桌面清单」后新增「顶部任务条」一行 |
| `package.json` | 0.17.0 → 0.18.0 |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："增加一个新功能，将目前时间段的清单上的任务在屏幕顶端放置，大小可调，可拖动。"
右侧卡片要占满整列，抬头看时间轴才知道现在该干什么；顶端一条常驻的"当前任务"更省事，而且不挡主界面。

### 怎么验证

- `tmp\check-ps.ps1` → 补回 BOM，五个 ps1 全 PARSE OK；`node --check index.js` exit 0。
- 热重载：改 `cordis.patch.yml` 第 44 行 → `reload: 2026-11-04 topbar-v018`，plugin.log `07:17:41` 出 `disposed`→`ready`，`overlay ready (pid 304080)`。
- 显示：当时 15:18，清单里没有覆盖此刻的条目 → 顶部无条（符合"没有就隐藏"）；用 `guide_plan add from=15:00`（吸附成 15:00–15:25）加一条测试项后，屏幕顶端出现 `15:00–15:25　顶部任务条测试　@ 宿舍`（`tmp\topbar.png`）。
- 拖动：从 `(1350,56)` 拖到 `(1000,126)` → `state.json` 的 `topbar.x=410, topbar.y=52.67` 落盘，重启 overlay 后仍在原位。
- 缩放：按住 Ctrl 滚三格 → `topbar.scale` 1 → **1.2**，文字当场变大且保持居中位置（`tmp\topbar-done.png`）。
- 隐藏：删掉测试条目后，下一项 15:50 距此刻 30 分钟开外 → 条自动消失（`tmp\topbar-hidden.png`）。

### 怎么恢复

- 删 `New-TopBarWindow` / `Apply-TopBarScale` / `Update-TopBar` 三个函数，以及 `Apply-State`、`On-Tick` 里的调用；`index.js` 删 `DEFAULT_TOPBAR`、两个 `topbar_*` case 与两处合并。
- 只想临时关掉：把清单条目的 `from/to` 挪开，或删空清单。

---

## 2026-11-04　顶部任务条加倒计时 + 大小按钮（v0.19.0）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① 任务条内容从单个 TextBlock 换成横向 StackPanel：`$text` + 右端 `−` / `＋` 两个 TextBlock 按钮（点一下 `Apply-TopBarScale` ±0.1，`$e.Handled=$true`，不会触发拖动）；② 滚轮不再要求按住 Ctrl，直接滚就缩放（0.1 一档，0.7–2.0）；③ 拖动 handler 里先判 `$e.OriginalSource.Text` 是不是 `−`/`＋`，是就 return，避免拖标题逻辑抢走按钮点击；④ `Update-TopBar` 增加倒计时：当前条目显示 `· 剩 N 分`（`$curTo - $nowMin`，最小 1），未来的条目显示 `· N 分后`；倒计时进签名 `$sig`，每分钟整点重算时自然刷新 |
| `README.md` | 能力表「顶部任务条」一行补倒计时与「−/＋」按钮说明 |
| `package.json` | 0.18.0 → 0.19.0 |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："给这个任务条加入一个倒计时吧，而且这个东西没法调大小，你偷懒了。"
上一版只认 `Ctrl+滚轮`，既不可发现、也没别的入口，等于没做完。

### 怎么验证

- `tmp\check-ps.ps1` → 补回 BOM，PARSE OK。
- `guide_overlay restart` 后加一条测试条目（`from=15:30` 吸附成 15:30–15:55）：条上显示 `接着 15:30–15:55　倒计时测试　@ 宿舍　·　8 分后　−　＋`（`tmp\topbar-cd2.png`）。
- 点 `＋` 两次：`state.json` 的 `topbar.scale` 1 → **1.2**，条子当场变大，文字同步放大，`−/＋` 都还在。
- 把测试条目改成 15:20–15:45（覆盖当前时刻）后：显示 `15:20–15:45　倒计时测试　@ 宿舍　·　剩 23 分`（`tmp\topbar-cd.png`），与 15:22 的实际剩余一致。
- 删掉测试条目后条子自动隐藏（当前无条目、下一项 15:50 超 30 分钟）。

### 怎么恢复

- 去掉倒计时：删 `Update-TopBar` 里 `$countdown` 相关四段与签名里的 `$countdown`。
- 去掉按钮：删 `$mini` scriptblock、`$minus`/`$plus` 及其 handler，`$border.Child` 改回 `$text`。
- 想恢复"必须按 Ctrl 才缩放"：`Add_MouseWheel` 里加回 Ctrl 修饰键判断。

---

## 2026-11-04　任务条倒计时改成秒级（v0.19.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① `Update-TopBar` 里倒计时从"按分钟"改成"按秒"：用 `$nowSec = HH*3600+MM*60+SS`，当前条目算 `$curTo*60 - $nowSec`，未来条目算 `$next.fm*60 - $nowSec`；② 新增内联格式化 `$fmtLeft`：≥1 小时显示 `1:25:00`，否则 `25:00`；③ 文案变成 `· 剩 24:03` / `· 12:30 后`；④ `On-Tick` 里原来是 `if ($second -eq 0)` 才刷任务条，改成每秒（在 `$second` 变化的那一拍）刷一次——`$sig` 里含倒计时字符串，秒变了就重写控件，没变就跳过 |
| `README.md` | 「顶部任务条」一行把倒计时示例改成秒级 `剩 24:03` |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："修正一下，我指的倒计时必须得是那种实时变化的倒计时，所以你得修改一下，比如 1：25：00 这种。"
上一版只到分钟，看起来像静态文字。

### 怎么验证

- `tmp\check-ps.ps1` → 补回 BOM，PARSE OK。
- `guide_overlay restart` 后临时加一条覆盖当前时刻的条目（15:26–15:51）：任务条显示 `15:26–15:51　秒级倒计时测试　@ 宿舍　·　剩 24:03　−　＋`。
- 隔 3 秒再抓一张：`剩 24:00`（`tmp\topbar-t1.png` → `tmp\topbar-t2.png`），证明是每秒在跳。
- 删掉测试条目后任务条自动隐藏。

### 怎么恢复

- 回分钟级：把 `$fmtLeft` 调用换成 `[int]($curTo - $nowMin)` 拼「剩 N 分」，并把 `On-Tick` 的刷新改回 `if ($second -eq 0)`。

---

## 2026-11-05　清单卡片改成真实时间轴（v0.20.0）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① `Update-Card` 从"半小时一格、条目塞格子"改成**真实时间事件流**：把每条 `from`/`to` 解析成分钟，按 `from` 排序成 `$scheduled`（无时间的进 `$whenever`），`$pxPerMin = (WorkHeight - 96) / (dayEndMin - dayStartMin)`，游标从 06:00 走到 22:30；命中条目就画不等高的实块（高度 = 时长 × `$pxPerMin`，最小 22），否则画空档行到下一个半点（并把空档末端夹到下一条的开始时间，否则 10:20 的课会被推进 10:30 的格子）；② `$addItemRow` 重写：行高 `< 46` 的短块（25 分钟那种）走单行「☐ 标题」，超过 46 的两行「☐ 时间–时间 · N 分 · 地点」+ 标题（标题 `TextTrimming=CharacterEllipsis`）；块内边距 `7,2,7,2`、复选框 11pt、meta 8pt |
| `index.js` | ① `planTick` 的排程条件去掉 7:00–9:30 窗口，改成"今天空就排"，失败 `appendDaylog('note', …)` 可见；② `planForToday()` 跨天时补 `pushPlanState(fresh)`（原来只写文件不推送，卡片会挂昨天的清单）；③ 启动时补一次 `pushPlanState(planForToday())`；④ `planRun` 的 add 分支：显式给了 `from`+`to` 且跨度 >25 分钟，就按真实区间存（整节课 08:30–10:10 不再被吸成 25 分钟番茄钟）|
| `README.md` | 能力表「桌面清单」改成"真实时间轴"描述 |
| `package.json` | 0.19.0 → 0.20.0 |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："我昨天的清单为什么今天还在？这个能不能清理掉换新？" 且卡片上"10:10 排在 09:25 上面"看着不对。
根因两条：跨天只写文件不推送状态；卡片用固定 30 分钟格装条目，长课被塞进一格、后面的格子继续往下画。

### 怎么验证

- `tmp\check-ps.ps1` → 五个 ps1 全 PARSE OK（编辑工具反复把 BOM 写没，都靠它补回）。
- `node --check index.js` exit 0；热重载 `reload: 2026-11-05 plan-rollover-timeline` → `ticker started` / `guide-tutor ready` / `overlay ready (pid 295928)`。
- 重载后 `state.plan` 从 `date=2026-11-04, 5 条` 变成 `date=2026-11-05, items=0`，说明跨天推送生效。
- 把今天的 6 条写进 `plan.json`（3 节课 + 3 条番茄钟）后截图 `tmp\card-new.png`：08:30–10:10、10:20–12:00、14:00–15:40 三块按比例变高，16:00/19:30/20:30 三条 25 分钟条目是单行小块，空档半点（06:00、06:30…22:00）显示淡色时间。
- 排程修复的旁证：`planTick` 现在"今天空就排"，不再依赖 7:00–9:30 那个窗口（今天插件 10:05 才启动，旧逻辑全天都不会排）。

### 怎么恢复

- 回番茄钟格：把 `Update-Card` 换回 `$bySlot` 版本（改动前的完整函数在 `D:\dsh_TestSpace\guide-tutor-backup-20261104` 之前无副本，只能按本条描述反向改）。
- 只回短块排版：把 `$addItemRow` 里 `if ($rowH -lt 46)` 那支删掉，统一走两行布局。
- 跨天推送若出问题：删 `planForToday()` 里的 `pushPlanState(fresh)` 与启动那次 push。

---

## 2026-11-05　卡片改紧凑日程：块高不再按时长拉伸，标题自动换行（v0.20.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | `Update-Card` 的渲染从"按时长等比拉高 + 半点空档"改成**紧凑日程**：① 条目块高度由内容决定（标题 `TextWrapping=Wrap`，块内 `MinHeight` 由内容撑开），不再按 `(to-from)*pxPerMin` 拉高；② 两条之间空档 ≥25 分钟才插一条 18px 的细行，左边写 `06:00–08:30` 这样的区间、右边一条 alpha 14 的细线；不足 25 分钟的空档直接不画；③ 删掉 `$pxPerMin` 与整天半点循环，末尾若离 22:30 还有 ≥25 分钟补一条收尾分隔线；④ 无时间条目归到「没定时间的」小节，左侧写「随时」 |
| `README.md` | 「桌面清单」一行补"块高由内容决定、空档才画分隔线" |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："这个空白太多了，占空间，可以考虑缩小，第二，普通番茄钟任务的文本不会随着清单栏宽度的变化把文字自动换行，导致看不到后面的字了。"
根因：上一版按时长等比算块高，100 分钟的课块有两小时那么高、里面只有两行字；短块里标题被 `TextTrimming` 截断且不换行。

### 怎么验证

- `tmp\check-ps.ps1` → 五个 ps1 PARSE OK（BOM 补回）。
- `guide_overlay restart` 后截图 `tmp\card-compact.png`：6 条按时间顺序排成一列，标题「Web系统开发（上）（带电脑）」换成两行完整显示，空档只留 `06:00–08:30`、`12:00–14:00`、`16:25–19:30`、`19:55–20:30`、`20:55–22:30` 五条细线，整张内容高度从铺满一屏缩到约 600px。
- 已打勾的两条（数据采集技术、Web系统开发）显示 `2/6`、标题带删除线。

### 怎么恢复

- 回等比铺满：把 `$addItemRow` 里 `$cardRow.Height = [double]$rowH` 与 `$pxPerMin` 那套加回来，遍历改成 `while ($cursor -lt $dayEndMin)` 的半点循环。
- 只想让短块再矮一点：调 `$addGapRow` 的 `Height = 18` 与条目 `Margin = 0,2,0,3`。

---

## 2026-11-05　回退：清单卡片恢复"按时长等比"的时间轴（v0.20.0 内回退）

### 改了什么

- `native/overlay.ps1` 的 `Update-Card` 从「紧凑日程（块高由内容决定、空档 ≥25 分钟才画线）」回退到「真实时间轴（块高 = 时长 × ``、空档按半点画格）」，即上一版的样子。
- 用户原话：「等等，回到上一版本」。

### 为什么

紧凑版把一节课压成两三行、省了空间，但他要的是"位置和长度都对得上时间"的那种时间轴观感，所以回退。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`guide_overlay restart` 后截图 `tmp\card-revert.png`：08:30–10:10、10:20–12:00、14:00–15:40 三块又按比例拉高，空档回到 06:00/06:30/… 的半点格，25 分钟条目是单行小块。
- 已完成的两条仍显示 2/6 与删除线。

### 怎么恢复

- 想再要紧凑版：把 `` 里 `.Height = [double]` 去掉、外层的半点循环换成按条目遍历、空档 ≥25 分钟才画分隔线（参考上一条 CHANGELOG「卡片改紧凑日程」）。
---

## 2026-11-05　长课程块内部加 30 分钟刻度线（v0.20.0 内改动）

### 改了什么

- `native/overlay.ps1` 的 ``：`.Child` 从直接挂内容改成挂一层 `` Grid，先放内容，再在 ` -ge 60`（约 40 分钟以上）的块里，每 30 分钟插一条 `Height=1`、alpha 22、`IsHitTestVisible=False` 的刻度线，纵向偏移按 `Round(( - ) * ) - 2` 算，超出块高就不画。
- 块高**仍然按真实时长等比拉伸**，时间轴没动。

### 为什么

用户澄清（m05567）："我只是想说这个课表部分的空白多而已，不是吧整个清单的空白全部去掉，我还没说清楚。"
他要保留"位置和长度对得上时间"的时间轴观感，只是不想让两小时的课块里空成一大片。刻度线补的是信息密度，不是压缩高度。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`guide_overlay restart`。
- 截图 `tmp\card-ticks.png`：08:30–10:10 块里能看到 09:00 / 09:30 / 10:00 三条淡线，10:20–12:00 块里 11:00 / 11:30，14:00–15:40 块里 15:00 / 15:30；25 分钟小块（16:00、19:30）不画线；点 ☐ 仍然能打勾（刻度线 `IsHitTestVisible=false`）。

### 怎么恢复

- 删掉 `` 那层 Grid、把 `.Child` 改回 `` 即可。
---

## 2026-11-05　短块标题限宽：长标题不再被硬裁（v0.20.0 内改动）

### 改了什么

- `native/overlay.ps1` 的 `` 短块分支（` -lt 46` 的番茄钟条目）：从「横向 StackPanel（☐ + 标题）」换成 **两列 Grid**（第 0 列 18px 放复选框、第 1 列 `*` 放标题），标题 `FontSize=10`、`TextWrapping=Wrap`、`TextTrimming=CharacterEllipsis`、`MaxHeight = max(12,  - 5)`。
- 每个条目块加 `ToolTip = 标题全文`，截断时悬停能看到完整文字。

### 为什么

实测（用户给的情景）：把 20:30 那条任务写成 58 个字，块里只显示前 18 个字左右，**既没有换行也没有省略号**，像被刀切断。
根因：横向 `StackPanel` 给子元素的可用宽度是**无限**，`TextWrapping` 永远不触发、`TextTrimming` 也没机会生效，文字直接画出边界被 Border 裁掉。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`guide_overlay restart`。
- 回归：58 字标题 `把Python课本第三章的课后习题全部做完，不会的题标出来发到群里问老师，最后把错题整理成一份笔记并写一段自己的总结` 现在显示成 `把Python课本第三章的课后习…`（带省略号，`tmp\longtext4.png`），不再是无提示的硬裁。
- 常规长度（15 字）现在完整显示；卡片宽度变化时标题跟着换行/截断。
- 测试用的长标题已改回 `Python 课本脚本读一段、能改一处`。

### 怎么恢复

- 想回到"硬裁"观感：删掉 `.TextTrimming` 与 `.MaxHeight` 两行即可（其余保持）。
- 想让短块显示两行：得把行高抬到 40px 以上，但会破坏"块高=时长"的时间轴对齐，不建议。
---

## 2026-11-05　课程块内容压到 2 行（v0.20.0 内改动）

### 改了什么

- `native/overlay.ps1` 的 ``：``（meta 行，`时间–时间 · N 分 · 地点`）从 `TextWrapping=Wrap` 改成 `NoWrap + TextTrimming=CharacterEllipsis`，保证它只占一行。
- 结果：长块内容固定为「第 1 行 meta、第 2 行标题」两行，宽度不够时 meta 末尾出省略号而不是折行。

### 为什么

用户反馈（m05676）：「这个课表占了三行是不是有点多了，我觉得最好2行」。根因是 meta 在窄宽度下折成两行，加上标题就成了三行。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`guide_overlay restart`；截图 `tmp\block2line.png`：08:30–10:10、10:20–12:00、14:00–15:40 三块都只占两行文字。

### 怎么恢复

- 把 `.TextWrapping` 改回 `Wrap` 并删掉那行 `TextTrimming`。
---

## 2026-11-05　悬浮球改成可调透明度的"玻璃球"（v0.20.0 内改动）

### 改了什么

- `native/overlay.ps1`：新增脚本级 ` = 235`，球体渐变两段 `GradientStop` 由 `FromRgb` 改 `FromArgb(, …)`；构造尾部保存 `` / `` / ``，给球加 `Stroke = FromArgb(70,255,255,255)`、`StrokeThickness = 1.2` 的细白描边。
- 新增 `Apply-BallOpacity([double])`（夹 0.2–1.0）：只改渐变与文字的 alpha、投影 `0.55 * value`，**不动窗口级 Opacity**（否则时钟一起糊）。
- `Show-SettingsWindow` 增加「悬浮球透明度」滑块（20–100），实时预览、松手发 `{"type":"ball_opacity"}`。
- `index.js`：`const DEFAULT_BALL = { opacity: 0.8 }`、`currentState()`/`writeState()` 带 `ball`、`handleEvent` 新增 `case 'ball_opacity'`（夹 0.2–1）。
- `Apply-State` 里按 `.ball.opacity` 调 `Apply-BallOpacity`，与 `panel.uiScale` 同款"有差异才应用"。

### 为什么

用户："悬浮球也要像清单卡片一样，变成常驻桌面的东西——有透明度、柔和地融进桌面；而且球也要有设置项（透明度可调）。"
球原来是高饱和实心渐变，压在窗口上很抢眼；拉开透明度 + 加细描边后像玻璃球，能透出桌面又不至于找不到。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`node --check index.js` exit 0；热重载后 `overlay ready (pid 305308)`。
- 设置窗截图 `tmp\settings-ball.png`：五项滑块，其中「悬浮球透明度 92%」在列。
- 拖到 20%：`state.json` 的 `ball.opacity = 0.2039`；用事件回设 55% 截图 `tmp\ball-mid.png`（能透出背后的文字）；回设 80% 截图 `tmp\ball-glass.png`（细白圈 + 轻微透底 + 「引」字仍清楚）。

### 怎么恢复

- 删 `` 与 `Apply-BallOpacity`，把两段 `GradientStop` 改回 `FromRgb(...)`，删设置窗里那一块与 `index.js` 的 `ball_opacity` 分支即可。

---

## 2026-11-05　清单卡片加「＋」自己加任务（v0.20.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/overlay.ps1` | ① 卡片标题栏在 ⚙ 左边加一个 `＋`（ToolTip「加一条任务」，`PreviewMouseLeftButtonDown` → `Show-AddTaskWindow`，`$e.Handled=$true` 不会触发拖动）；② 新增 `New-AddField`（一列标签 + 一列 TextBox 的表单行）与 `Show-AddTaskWindow`（392 宽小窗：开始/结束/地点/做什么，默认开始时间 = 现在 +5 分钟向上取 5 的倍数、结束 = 开始 +25；校验 `HH:mm` 与标题非空，出错在窗内红字提示；回车=保存）；③ 保存把 `{type:'plan_add', from, to, place, title}` 写进 `events.jsonl`；④ `$addItemRow` 的 meta 文案改读条目自己的 `from`/`to`，不再用绘制段落（时间重叠时段落会被裁短，标签不该跟着变）；⑤ 分号后补 `if ($realTo -le $realFrom) { $realTo = $realFrom + 25 }` |
| `index.js` | `handleEvent` 新增 `case 'plan_add'`：调 `planRun({action:'add', …})` 后 `pushPlanState(planForToday())`，失败写日志；`planRun` 的 add 分支把「显式 from+to 且跨度 >25 分钟按真实区间」放宽成「**只要给了 from 和 to 且 to>from 就按真实区间存**」，只给 from 才走番茄钟吸附；`DEFAULT_BALL.opacity` 0.92 → 0.8 |
| `README.md` | 能力表「桌面清单」一行补「点 ＋ 自己加一条任务」与手填时间不被吸附 |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："给任务清单加入一个可以用户自主增加任务的功能。"
之前只能靠模型调 `guide_plan add` 或直接改 `plan.json`，用户想临时加一条没有入口。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`node --check index.js` exit 0；热重载 `reload: 2026-11-05 plan-add-btn` → `overlay ready`。
- 点 `＋`（物理 `2447,32`）→ 弹出「加一条任务」，默认 `13:45–14:10`；截图 `tmp\addtask-win.png`。
- 在「做什么」里打「卡片加任务测试」→ 点保存 → `events.jsonl` 出现 `{"type":"plan_add","from":"13:50","to":"14:15","title":"卡片加任务测试"}`，`overlay.log` 记 `add task sent: 13:50-14:15 卡片加任务测试`。
- **第一版 bug**：`13:50–14:15` 被番茄钟吸附成 `13:30–13:55`。改成「显式区间原样存」后重测 → `13:50–14:15` 原样落盘。
- **第二版 bug**：`$save` 的 handler 读局部变量 `$fTitle`（WPF 委托执行时已出栈）→ 点保存没反应。改成先存 `$script:AddFrmFrom/To/Place/Title`，并给 handler 包 try/catch 写日志；重测保存生效。
- **第三版 bug**：手加一条和 14:00 的课重叠时，课块标签变成 `14:15–15:40 · 85 分`。改成 meta 读条目原始 `from`/`to` → 恢复 `14:00–15:40 · 100 分`（截图 `tmp\addtask-card.png`）。
- 测试条目已 `guide_plan remove`，清单回到 6 条。

### 怎么恢复

- 去掉入口：删 `New-CardWindow` 里 `$plus` 那一段，其余函数留着不影响。
- 退回番茄钟吸附：`planRun` 里把 `explicitSpan` 的条件改回 `rawTo - rawFrom > 25`。
- 想整包回退：`robocopy D:\dsh_TestSpace\guide-tutor-backup-20261104` 覆盖回来，再单独挑这次的三处改动。

---

## 2026-11-05　顶条前瞻窗口 30 → 90 分钟（v0.20.0 内改动）

### 改了什么

- `native/overlay.ps1` 的 `Update-TopBar`：把「没有当前条目时，往前找最近一条」的窗口从写死的 30 分钟改成可配置 `$look`，默认 **90** 分钟；值从 `state.topbar.lookahead` 读（缺省 90）。

### 为什么

他 18:00 问"顶端任务栏呢"。查下来不是坏了：16:25 之后没有进行中的条目，下一条 19:30 距当时还有 90 分钟，超出 30 分钟窗口，按设计整条隐藏。课间、饭点这种 30 分钟以上的空档，顶条就完全消失，看着像功能没了。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`guide_overlay restart`。
- 18:00 截图 `tmp\topbar-now.png`：顶端出现 `接着 19:30–19:55　Spring Boot 实验五跑通一步　@ 机房　·　1:29:21`，秒级倒计时仍在走。

### 怎么恢复

- 想回到"只在 30 分钟内才提示"：把 `$look = 90` 改回 `$look = 30`，或在 `state.json` 的 `topbar` 里写 `"lookahead": 30`。
- 想让它永远显示下一条（哪怕还有几小时）：把默认值改成 `1440`。

---

## 2026-11-05　清单按天归档 + 「历史」窗口（v0.20.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `index.js` | ① `planHistoryPath = dataDir/plan-history.json`；② `savePlanFile()` 里调 `recordPlanSnapshot(plan)`——每次保存都把当天快照覆盖写进 `plan-archive/YYYY-MM-DD.json`（旧的只靠跨天时归档一次，插件没跑的那几天就漏了）；③ 新增 `planHistoryData(days=21)`：读归档目录，倒序返回 `{date,total,done,items[]}`，**并把"今天"从 `plan.json` 补在最前面**（当天还没落档时也能看到）；④ `writePlanHistoryFile()` 写 `plan-history.json` 给悬浮层直接读；⑤ 启动时同步一次；⑥ API 新增 `GET /plan/history` |
| `native/overlay.ps1` | ① 面板标题栏「清单」后加「历史」（`PreviewMouseLeftButtonUp`——普通 `MouseLeftButtonUp` 在这个分层窗口上收不到，试了三次都没反应）；② 新增 `Show-PlanHistoryWindow`（660×520，左列日期+`完成/总数`，右侧当天明细，完成项带 ☑ 和删除线）；③ `Show-PlanDayDetail` 放在**顶层**——一开始写成 `Show-PlanHistoryWindow` 的嵌套函数，事件 handler 调不到，点日期整个窗口直接消失 |
| `CHANGELOG.md` | 本条目 |

### 为什么

他原话："将每天的清单都保存下来，记录时间和事情。要求能在 ui 页面里打开查看。"
以前只有 `plan.json`（当天），跨天靠 `archivePlan()` 在换天时归档一次，插件没跑过窗口的那天就没档；也没有任何界面能翻。

### 怎么验证

- `node --check index.js` exit 0；`tmp\check-ps.ps1` → PARSE OK；热重载 `reload: 2026-11-05 plan-history` 与 `-today`。
- `plan-history.json` 生成（955 B），内容：`2026-11-05 total=6 done=2`、`2026-11-04 total=5 done=4`。
- 点面板「历史」（物理 `2301,197`）→ `overlay.log` 记 `history button clicked`，窗口打开：标题「清单历史（2 天）」，左列两天、右侧 11-05 的 6 条明细，勾选与删除线正确（`tmp\plan-history-win.png`）。
- **未验证**：点左侧日期切换（两次点击时屏幕被别的窗口占住，窗口被压住，点击落空）。功能代码在，但交互没跑通验证。

### 怎么恢复

- 隐藏入口：删 `New-PanelWindow` 里 `$histBtn` 那段。
- 停掉归档：`savePlanFile` 里去掉 `recordPlanSnapshot(plan)` 一行，历史就退回"只在跨天时归档一次"的旧行为。
- 归档数据本身在 `plan-archive/` 下，是纯 JSON，随时可读或删。

---

## 2026-11-05　修：点日期切换清单会让悬浮层崩溃重启（v0.20.0 内修补）

### 改了什么

- `native/overlay.ps1`
  1. 日期按钮的 handler **去掉 `.GetNewClosure()`**：闭包捕获的是创建那一刻的 `$script:HistoryDetail`（当时还是 null），点击时读到的永远是 null。改成运行时读 `$script:HistoryDetailPanel`。
  2. `$script:HistoryDetailPanel = $detail` 在创建日期按钮**之前**赋值，首屏渲染与点击共用同一个引用。
  3. handler 加 try/catch，失败写 `history day failed: …` 到 `overlay.log`，不再让异常冒泡。
  4. `$app.Run()` 前加 `$app.Add_DispatcherUnhandledException({ … $e.Handled = $true })`：以后任何 UI 线程异常只记日志，不会带走整个悬浮层。

### 为什么

他报的 bug："点击左侧的两个时间的清单时，疑似重启了一遍。"
日志确认不是"疑似"——`overlay exited code=1`，插件随后 `overlay spawned` 重新拉起，所以看起来像重启。根因是上面第 1 条：`Show-PlanDayDetail $picked $null` → 函数里 `$detailPanel.Children.Clear()` 对 null 调方法 → 异常冒到 `$app.Run()` → 进程退出。

### 怎么验证

- `tmp\check-ps.ps1` → PARSE OK；`guide_overlay restart`。
- 点面板「历史」→ `history button clicked`；点「2026-11-04」→ `history day picked: 2026-11-04`，右侧切成 11-04 的 5 条（4 条已勾、带删除线），**没有 exited**（`tmp\plan-history-win2.png`）。
- 再点「2026-11-05」→ `history day picked: 2026-11-05`，切回当天 6 条（`tmp\plan-history-win3.png`）。双向都正常。

### 怎么恢复

- 不想兜底异常：删掉 `$app.Add_DispatcherUnhandledException(...)` 那段，行为回到"UI 异常即崩"。
- 只剩这一个功能要回退：删 `New-PanelWindow` 里 `$histBtn` 与两个 `Show-PlanHistory*` 函数即可，归档数据不受影响。

---

## 2026-11-05　修：历史里出现两个「2026-11-05」（v0.20.0 内修补）

### 改了什么

- `index.js` 的 `planHistoryData()`：遍历 `plan-archive/` 时，遇到日期已经在结果里的（今天的清单会先从 `plan.json` 补一条），`continue` 跳过。

### 为什么

两个来源喂了同一天：
1. 当天清单从 `plan.json` 现读一条（保证"今天"永远在最上面）；
2. `recordPlanSnapshot()` 也会把当天写进 `plan-archive/2026-11-05.json`，遍历目录时又push 一次。

于是历史窗里出现两行 `2026-11-05 6/6`，标题还显示"3 天"。

### 怎么验证

- `node --check index.js` exit 0；热重载 `reload: 2026-11-05 history-dedupe`。
- `plan-history.json`：`days=2`（`2026-11-05 6/6`、`2026-11-04 4/5`）。
- 打开历史窗：标题「清单历史（2 天）」，左列只有两天（`tmp\plan-history-dedup.png`）。

### 怎么恢复

- 把 `if (out.some((d) => d.date === date)) continue` 删掉，就回到"同一天出现两次"的旧行为（不建议）。

---

## 2026-11-06　新增：功能清单 Excel（初版）

### 改了什么

- 新增 `D:\dsh_TestSpace\guide-tutor\功能清单-v0.20.0.xlsx`（5 个工作表，19.5 KB）：
  1. **1-功能总表**（42 行）：模块 / 功能 / 入口 / 能做什么 / 数据落盘 / 状态；
  2. **2-工具清单**（21 行）：21 个工具的参数与说明；
  3. **3-界面与交互**（23 行）：四个窗口的每个按钮/手势点了会发生什么；
  4. **4-数据文件**（27 行）：`~\.dsh\guide-tutor\` 下每个文件是什么、谁写、关键字段；
  5. **5-未完成与计划**（5 行）：遗留项 + 优先级 + 建议做法。
- 格式：深蓝表头、斑马纹、冻结首行、自动筛选、列宽与自动换行按内容设。

### 为什么

他说"做一个 excel 文件用来将目前现有的所有功能写出来，先来一个初版"——要把散在 `index.js`、`overlay.ps1`、`CHANGELOG.md` 里的能力汇成一张能扫读的表，方便他自己核对"到底有哪些功能"。

### 怎么验证

- 生成后用 openpyxl 重开：`wb.sheetnames` 为 5 张表；各表 `max_row` 分别为 45 / 24 / 26 / 30 / 8（含 3 行标题与表头）；表头字段与预期一致。
- 数据来源逐条对齐：工具名取自 `index.js` 里 21 个 `name: 'guide_*' / 'video_*'`；数据文件名取自数据目录 `Get-ChildItem`；界面按钮取自 `native/overlay.ps1` 当前实现。

### 怎么恢复

- 删掉 `功能清单-v0.20.0.xlsx` 即回退，不影响插件运行（纯文档）。
- 要重新生成：按本条目列的五张表结构写脚本（openpyxl，表头/斑马纹/冻结即可）。
---

## 2026-11-06　语音换成 Edge 晓晓（v0.21.0）

### 改了什么

| 文件 | 改动 |
|---|---|
| `native/tts_edge.py`（新增） | 读环境变量 `GUIDE_TTS_TEXT`（不走命令行，避免中文被控制台代码页弄坏），调 `edge_tts.Communicate` 合成 mp3；成功输出 `{"type":"file","path":…}`，失败输出 `{"type":"error","message":…}` 并退出 1 |
| `native/tts.ps1`（重写，102 → 223 行） | 新增 **edge 分支**：调 python 合成 → 用 **MCI（winmm）** 播放 mp3（`System.Media.SoundPlayer` 只认 wav）→ 每 100ms 查 `status <alias> position/length`，按比例换算成字符位置输出 `progress`，播完输出 `end`；edge 失败自动回落到原 SAPI 逻辑，并往 stderr 写 `[tts] edge ok` / `[tts] edge failed, fallback to sapi` |
| `index.js`（spawn env） | 新增三个环境变量：`GUIDE_TTS_ENGINE`（默认 `edge`）、`GUIDE_TTS_EDGE_VOICE`（默认 `zh-CN-XiaoxiaoNeural`）、`GUIDE_TTS_PYTHON`（复用已有的 `pythonCommand()`） |
| `py\libs` | 装了 `edge-tts 7.3.1` + `aiohttp`（正式依赖目录，不是临时目录） |
| `package.json` | 0.20.0 → 0.21.0 |

### 为什么

他在听完五个样本后说"使用晓晓吧"。系统 SAPI 只有一个中文音色（惠惠，机械），Edge 是神经网络音色，同一句话差别很明显。

### 怎么验证

- `node --check index.js` exit 0；`tmp\check-ps.ps1` → `PARSE OK: tts.ps1`。
- 直接跑 `tts.ps1`（45 字中文）：耗时 15.4 秒，输出 30 行事件，含 `start` / 逐字 `progress` / `end`。
- 热重载 `reload: 2026-11-06 tts-xiaoxiao` → `api server listening`，`overlay ready (pid 271144)`。
- `guide_say` 三句实测，`plugin.log` 出现 `speak [3] (15 字)` 与 **`tts stderr: [tts] edge ok`** —— 确认走的是 Edge，字幕进度也在推进。

### 怎么恢复

- 想换回系统音色：把 `index.js` 里 `config.ttsEngine || 'edge'` 改成 `'sapi'`，或临时设环境变量 `GUIDE_TTS_ENGINE=sapi`。
- 想换回惠惠但保留两套：`GUIDE_TTS_EDGE_VOICE` 改回 `""` 无效——Edge 没有惠惠，只能切引擎。
- 想彻底删掉边缘路径：删 `native/tts_edge.py` 与 `tts.ps1` 的 edge 分支，恢复备份逻辑即可。
---

## 2026-11-09　清单条目可改可删（v0.20.0 内改动）

### 改了什么

| 文件 | 改动 |
|---|---|
| `index.js` | `planRun` 新增 `update` 分支（按 id 找条目，改 title/from/to/place，时间变了清 `remindedAt`/`nudgedAt` 让提醒重新算，写 daylog `清单改了：…`）；`handleEvent` 新增 `plan_update`、`plan_remove` 两个 case |
| `native/overlay.ps1` | `Show-AddTaskWindow` 加 `param($EditItem)`：编辑时标题「改这条任务」、四字段预填、保存发 `plan_update`；`$addItemRow` 的 `$cardRow` 加第三列（40px）放「✎」「✕」两个 Border 按钮，`✎` 调 `Show-AddTaskWindow -EditItem $script:CardItemsById[$id]`，`✕` 发 `plan_remove`；`Update-Card` 每轮重建 `$script:CardItemsById = @{}` |
| `README.md` | 「桌面清单」那行补「每条右侧 ✎ 改 / ✕ 删」 |
| `CHANGELOG.md` | 本条目 |

### 为什么

用户原话（m07464）："给今日清单增加增删改查的功能吧，目前的增加功能过于鸡肋"——原来只有「＋」能加、`☐` 能打勾，改时间、改标题、删条目都只能靠我调工具。

### 怎么验证

- `node --check index.js` exit=0；`tmp\check-ps.ps1` → PARSE OK。
- 热重载（`cordis.patch.yml` 第 44 行改成 `reload: 2026-11-09 plan-crud`）→ `guide-tutor ready`、`overlay ready (pid 310864)`。
- 加一条测试条目后点 ✎：`overlay.log` 出现 `edit button clicked: tmw9046yw`，弹出「改这条任务」且开始/结束/地点/做什么四项都预填；把标题改成「测试：这条标题被改过了」保存 → `task update sent: tmw9046yw 17:00-17:25 测试：这条标题被改过了`，`plan.json` 该条标题变了，`events.jsonl` 出现 `plan_update`，`daylog` 记「清单改了：17:00-17:25 测试：这条标题被改过了」。
- 点 ✕：`delete button clicked: tmw9046yw`，`plan.json` 少一条、`events.jsonl` 出现 `plan_remove`、`daylog` 记「清单划掉：卡片上删掉一条」。
- 测试条目已删掉，清单回到 4 条真实任务。

### 怎么恢复

- 去掉「✎/✕」：删 `$addItemRow` 里的 `$mkBtn`/`$pencil`/`$cross` 与 `$acts`，`$cardRow` 去掉 `$cc2`。
- 去掉编辑模式：`Show-AddTaskWindow` 恢复无参、保存只发 `plan_add`。
- 后端保留 `plan_update`/`plan_remove` 不影响旧 UI（没有事件就不会触发）。
## 2026-11-09　空档右侧「＋」直接加任务（v0.20.0 内改动）

**改了什么**
`native/overlay.ps1`：
- `Show-AddTaskWindow` 签名改为 `param($EditItem, $DefaultFrom)`，新增"默认开始时间"覆盖分支（`$editing` 为假且 `$DefaultFrom` 匹配 `HH:mm` 时，起止按 25 分钟预填）；
- `$mkBtn`（Border 包 TextBlock 的 18×18 按钮）从 `$addItemRow` 内部提到 `Update-Card` 顶层，空档行也能复用；
- 空档行 `$gapRow` 增加第三列 40px，放 `＋` 按钮（`Opacity=0.42`，`Tag` 存该段 `HH:MM`），点击后 `Show-AddTaskWindow -DefaultFrom`。
`README.md`：能力表「桌面清单」一行补「空档右侧 **＋**」。

**为什么**
用户提出："给清单的增加功能改成更方便的形态吧，比如给清单上空着的任务条目右边增加一个加号，然后再填别的什么东西"——顶部 ＋ 默认从"现在 +5 分钟"起，加过去或未来某段都要手改两个时间。

**怎么验证**
点 17:30 空档右侧的 ＋ → `overlay.log`: `gap add clicked: 17:30`；弹出「加一条任务」，开始 **17:30** / 结束 **17:55** 已预填；地点填「宿舍」、标题填「从空档加的任务」保存 →
`overlay.log`: `add task sent: 17:30-17:55 从空档加的任务`；`plan.json` 出现 `{"from":"17:30","to":"17:55","place":"宿舍","title":"从空档加的任务"}`。

**怎么恢复**
删掉空档行里的 `$gapAdd` 整段与 `Show-AddTaskWindow` 的 `$DefaultFrom` 参数即可退回旧行为；改完跑 `tmp\check-ps.ps1` 再 `guide_overlay restart`。
## 2026-11-09　清单空档行排版修复（与「空档＋」同批）

**改了什么**
`native/overlay.ps1`（空档行 `$gapRow` 那段）：
- 行高下限 10 → **14**（10px 塞不下 8–9pt 的时间字，字会压到下一条的块上）；
- 时间字 8pt，行高 ≥24 才用 9pt，颜色 alpha 60 → **120**（原来太淡看不见）；
- **少于 8 分钟的空档尾巴直接跳过**（`if (($segEnd - $cursor) -lt 8) { $cursor = $segEnd; continue }`）——一条 17:25 结束后到下一条 17:40 之间的零头不再单独占一行；
- **＋ 只在行高 ≥18 时出现**，矮行不塞按钮；
- `Update-Card` 整体包了 `try { } catch { Write-Log('card render failed: …') }`，渲染出错不再静默中断。

**为什么**
用户截图指出「17:30 / 18:05 / 19:55 / 20:55 这几行的时间字压到了下面条目块上，看着像重叠」。根因是 `Max(10, …)` 的下限：5–10 分钟的空档只有 10px 高，而 9pt 的时间字约 12px。

**怎么验证**
`check-ps.ps1` → PARSE OK；`guide_overlay restart` 后截卡片：17:40 / 18:10 / 19:30 / 20:30 四个块各归各位，块与块之间不再有字压在边上；5 分钟的零头行消失。

**怎么恢复**
把行高下限改回 10、删掉 `-lt 8` 那行 `continue`、`$showGapAdd` 去掉，即回旧排版。
## 2026-11-09　清单可收缩（底部「く」）+ 滚轮 + 拖动边界

**改了什么**
`native/overlay.ps1`：
- 卡片根布局从「单列 StackPanel」改为 **Grid 四行**（Auto 标题 / Auto 分割线 / * 内容 / Auto 底部），内容区套 `ScrollViewer`（隐藏滚动条、`PanningMode=VerticalOnly`、`Focusable=$false`），`PreviewMouseWheel` 每格滚 96px（`Add_PreviewMouseWheel` 事件写法，`+=` 会报「找不到属性」）；
- 新增 `$script:CardExpanded`（默认 `$false`）与 `$script:CardCompactHeight = WorkHeight * 0.64`；`New-CardWindow` 与 `Update-Card` 都按它取高；
- 底部加「く」按钮（`Border` 包 `TextBlock`，FontSize 12，alpha 150，ToolTip「展开 / 收起到整屏」），点击 toggle 展开态并把字形换成「︿」；
- 标题栏拖动 `DragMove()` 之后按 `WorkLeft/WorkTop/WorkWidth/WorkHeight` clamp，拖不出屏幕。

**为什么**
用户："界面默认为缩小的版本，但是下方有一个类似日语『ku』发音的标志代表可展开……清单现在可自由拖动，且悬浮窗按钮也一样可自由移动，但保留屏幕边界检查。"

**怎么验证**
收缩态截图 `tmp\lab6\c6.png`：卡片 978 高、只露 06:00–16:00、底部有「く」；点之 → `overlay.log`: `card expand toggled: True`，展开成 1528 全屏高（`tmp\lab6\expanded.png`），06:00–22:30 全见、4 条任务与 ✎✕ 都在，字形变「︿」；再点回到收缩态。

**怎么恢复**
把 `$stack` 换回 `StackPanel`、删掉 `$sv` 与 `$foot` 两段即可退回满屏固定卡片；`check-ps.ps1` 校验后 `guide_overlay restart`。

## 2026-11-09　清单被误删两次（记录 + 恢复）

**发生了什么**
- 16:33:53–16:33:56 `plan remove from card` 连发 5 次（`tmw8z2eso`/`tmw8z2i3u`/`tmw8z2lkh`/`tmw8z2osh`/`tmw9046yw`）；
- 16:58:10–16:58:13 又连发 4 次（`tmw90qwhn`/`tmw90r07f`/`tmw90r412`/`tmw90r7q4`）。

**为什么**
卡片 `Update-Card` 重画时把鼠标位置当成了新位置上的 `✕`（左键状态残留 → `MouseUp` 落到重建后的按钮上），于是一次点击删掉多条。

**怎么修**
`✕` 的 handler 加 **1.2 秒防抖**：`$nowDel = Get-Date; if ($null -ne $script:LastDeleteAt -and ($nowDel - $script:LastDeleteAt).TotalMilliseconds -lt 1200) { Write-Log 'delete ignored (debounce)'; return }; $script:LastDeleteAt = $nowDel`。

**怎么恢复**
按 `daylog` 把 4 条写回 `plan.json`：17:40 通读实验六报告 / 18:10 整理实验六截图文件夹 / 19:30 Spring Boot：给 BookController 加两个接口 / 20:30 Python 脚本读一段、能改一处。已确认当前 4 条齐全。
## 2026-11-09　清单/悬浮球「拖到哪就停在哪」

**改了什么**
`native/overlay.ps1`：
- `Update-Card` 删掉每次刷新都强设的 `$script:CardWindow.Top = $script:WorkTop`（这是"拖完弹回顶部"的直接原因）；
- 改为按 `state.card.x/y` 定位：有值就用，没值才用默认右上角；只做**边界保护**（`WorkLeft/WorkTop/WorkWidth/WorkHeight` clamp），不再拽回默认位置；
- 删除四处「球自动让位到清单左边」的代码（`Update-Card` 尾部、`Apply-State`、卡片隐藏分支）——用户要求球拖到哪就停在哪，不再自动躲开清单；
- 宽度变化时不再顺带改 `Left`，只改 `Width`。
`index.js` 无需改：`case 'card_moved': writeState({ card: { x, y } })` 与 `panel.ballX/ballY` 早已持久化。

**为什么**
用户反馈（原话）："我要的清单自由拖动和悬浮窗小球的自由拖动 的 改动没有落实啊，我想要的不是对清单拉扯后清单和悬浮窗回到顶端而是托在哪就在哪。"

**怎么验证**
- 拖卡片标题栏到屏幕中部 → `state.json`: `card.x=697, card.y=367`；`guide_overlay restart` 后窗口枚举仍在 `697,367 270x652`；
- 拖球到屏幕中部 → `state.json`: `panel.ballX=668, panel.ballY=656`；重启后窗口仍在 `668,656 64x88`；
- 清单 4 条完好（17:40/18:10/19:30/20:30）。

**怎么恢复**
把 `Update-Card` 里那段 `$posX/$posY` 定位换回 `$script:CardWindow.Top = $script:WorkTop`、并恢复球让位那几行即可退回「钉在右上角」行为。
## 2026-11-09　同步 U 盘副本 + 写交接文档

**改了什么**
- `E:\dsh插件\guide-tutor` 从 **0.6.0（10-22）** 更新到 **0.21.0**：旧目录改名为 `E:\dsh插件\guide-tutor.old-20261109`（可整目录回退）；新目录复制了 `index.js`(195853B)、`package.json`、`README.md`、`CHANGELOG.md`、`cordis.patch.yml`、`icon.svg`、`native/`(9 文件)、`locale/`、`tools/`、`py/`（robocopy /MIR，500 文件 54.3 MB）、`models/`（14 文件 79.5 MB，与本地一致）。
- 新建 `HANDOFF.md`（本地与 U 盘各一份）：给下一个工作区会话的交接——现状、本轮改动、待办、操作手册、踩坑清单、交付前验证命令。

**为什么**
用户要求："日志保存，继承给下一个工作区会话，把 U 盘插件版本更新到现在的版本。"

**怎么验证**
U 盘目录版本号 `0.21.0`；`py` 54.3 MB / 500 文件、`models` 79.5 MB / 14 文件、`native` 9 文件，与本地一致；`README.md` 含新特性「空档行右侧还有一个淡淡的 ＋」；`CHANGELOG.md` 1069 行。

**怎么恢复**
要退回旧版：删掉 `E:\dsh插件\guide-tutor`，把 `E:\dsh插件\guide-tutor.old-20261109` 改回原名即可。

## 2026-11-09　新增《打磨计划-2026-11》表 + 速览 md

**改了什么**
- 新增 `D:\dsh_TestSpace\guide-tutor\打磨计划-2026-11.xlsx`（37,895 B，8 个工作表）：
  1. `0-总览`：KPI 公式、本周三件事、版本路线图、用法、数据现状警告；
  2. `1-想法池`（25 条）：新功能与体验想法，P0–P3 优先级 + S–XL 工作量；
  3. `2-Bug与问题`（17 条）：严重度 S1–S3、现象复现、影响、修复方案、验证方式；
  4. `3-技术债`（12 条）：拆分、测试、日志、依赖、隐私；
  5. `4-工具清单`（21 个工具）：现有工具与参数；
  6. `5-版本计划`（4 个版本）：v0.22 稳住 / v0.23 顺手 / v0.24 聪明 / v1.0 可维护，含验收标准；
  7. `6-已完成`：本轮已落地事项；
  8. `7-想法收件箱`：20 行空白 + 下拉，供随手记。
- 新增 `D:\dsh_TestSpace\guide-tutor\打磨计划-2026-11.md`（4,457 B，同内容速览，便于手机/纯文本看）。
- 新增 `D:\dsh_TestSpace\guide-tutor\tmp\make_roadmap.py`（约 750 行）：openpyxl 生成脚本，改数据后重跑即可更新两张文件。
- 未改动 `index.js`、`native/overlay.ps1`、`plan.json` 等运行代码与数据。

**为什么**
用户原话（m00001）："我想打磨一下这个软件了……我想要整一个表，然后把对这个插件的新功能，bug排查修复，等等都包括在内，（我的新想法等等）。"
表里带实测证据：`plan.json` 当前为 `{"date":"2026-11-09","items":[]}`；`overlay.log` 2026-11-09 17:30:44–17:30:54 连续 4 次 `delete button clicked`，对应 HANDOFF 恢复的 17:40 / 18:10 / 19:30 / 20:30 四条，故把「删除无确认、不可恢复」列为 P0（B01/B02/B03）。

**怎么验证**
- `python tmp/make_roadmap.py` → 输出 `saved: …xlsx 37895`、`saved: …md 4457`。
- openpyxl 重开：`sheetnames` 为上述 8 张；各表 `max_row` 为 29 / 28 / 20 / 15 / 23 / 7 / 8 / 23（含标题与表头）；总览 35 个合并区；数据验证与条件格式计数正常。
- 版本表 7 列逐行核对：`v0.22 … 计划中 | 删除可撤销/可恢复；…`，修复了「状态」列与「验收标准」错位（原第 6 列误放验收文本、第 7 列空）。
- md 版本表 6 列（含验收标准），首行写明「8 页」。

**怎么恢复**
- 纯新增文档，删掉 `打磨计划-2026-11.xlsx`、`打磨计划-2026-11.md`、`tmp\make_roadmap.py` 即回到生成前；插件行为不受影响。
- 想重生成：直接重跑脚本即可，不覆盖任何数据文件。

---

## 2026-11-09　实现 F26 清单动画 / F27 计划入库 / F28 目标看板

### 改了什么

- `native/overlay.ps1`（3,442 → 3,921 行）：
  - F26：底部「く」的 `Add_PreviewMouseLeftButtonUp` 改成 250ms `DoubleAnimation` + `CubicEaseOut`，`Completed` 里先 `BeginAnimation(HeightProperty,$null)` 再落最终高度；新增 `$script:CardAnimTo` 与 `$script:CardAnimating`；`Update-Card` 的高度赋值加 `if (-not $script:CardAnimating)`，避免 tick 打断动画。
  - F28：新增 `Read-GoalsData` / `Save-GoalsData` / `Rebuild-GoalsPanel` / `Show-GoalsWindow`；旧实现改名 `Show-GoalsWindowLegacy`（保留未删）。目标窗口改为卡片：每条目标显示步骤勾选、`2/4` 计数与进度条，可加步骤（回车）、加目标、把步骤「排进今日清单」。`Show-AddTaskWindow` 增加 `$PrefillTitle` 参数。
- `planning/`（新增）：`打磨计划-2026-11.xlsx`（39,287 B）、`打磨计划-2026-11.md`（4,600 B）、`make_roadmap.py`（49,481 B，路径改为 `BASE` 相对）。
- `README.md`：在「已知限制 / 下一步」前加 `## 打磨计划` 一节，指向 `planning/`，并写明发版前对照「5-版本计划」。
- `tmp/make_roadmap.py`：想法池加 F26/F27/F28；`done_items` 加 3 条 0.22.0-dev；收件箱写入三条原话与理解（4–6 行）。
- 重新生成根目录 `打磨计划-2026-11.xlsx`（39,287 B）/ `.md`（4,600 B）；`index.js` 未改（`readGoals()` 已兼容 steps 字段）。

### 为什么

用户 m00279：「好的，我觉得刚刚那些想法现在就可以实现。你实现吧。（记得把表改一下）」。
三条想法来自 `7-想法收件箱`：清单展开/收起动画、把打磨计划存进插件、把目标区块做精致（不是单纯文字记录器）。

### 怎么验证

- `ParseFile` overlay.ps1 → `PS parse OK`；`guide_overlay restart` 返回 `restarted: true`，悬浮球可见。
- openpyxl 重开新表：`1-想法池` 第 29–31 行为 F26/F27/F28；`7-想法收件箱` 4–6 行有原话 + 归类「功能」+ 状态「已进池」；`6-已完成` 前 3 条为 0.22.0-dev；`5-版本计划` 7 列 4 版本。
- F28 目标窗口尚未实机打开验证（UIA 查不到「目标」按钮）；验证方式：点面板「目标」，确认两条旧目标显示为卡片、加一步、勾一步、重启后仍在。

### 怎么恢复

- 表格：旧版备份在 `tmp\打磨计划-before-regen-20261109.xlsx`（44,021 B，用户保存版）；删 `planning\` 三个文件与 README 那节即回到 F27 前。
- overlay：仓库没有 git；回退 F26 把底部「く」的动画块换回直接赋值 Height，回退 F28 删掉新 `Show-GoalsWindow` 块、把 `Show-GoalsWindowLegacy` 改回原名即可（改动前 3,442 行）。
- 目标数据：新结构只增 `steps`/`stepSeq` 字段，`goals.json` 原两条保留，`index.js` 读取仍兼容。

---

## 2026-11-09　F26/F28 调试修复（动画事件、FromArgb、BOM）

### 改了什么

- `native/overlay.ps1`：
  - F26 动画：`$anim.Completed +=` 改成 `$anim.add_Completed({...})`；加 `FillBehavior = Stop`，启动动画后把 `Height` 的 base 设为目标高度（`$script:CardAnimTo`），`Completed` 只把 `$script:CardAnimating` 置回 false。旧写法在回调里读局部 `$targetH`，委托执行时该变量已出栈，`[double]$null` 让高度变 0 —— 卡片“一闪就消失”，等下一次 `Update-Card` 才恢复。
  - F28：`$newBox.Foreground` 的 `FromArgb(232, 238, 246)`（只有 3 个参数）改为 `FromArgb(255, 232, 238, 246)`；全文件正则扫描确认再无 3 参 `FromArgb`。
  - `edit` 写入后补回 UTF-8 BOM（U+FEFF），`Parser::ParseFile` 输出 `PS parse OK`。

### 为什么

用户 m00610：点「目标」没反应，`overlay.log` 为 `goals window failed: 找不到"FromArgb"的重载，参数个数为: 4 @line 1394`；点「く」卡片一闪消失、约 10 秒后才展开。根因分别是颜色构造少一个 alpha 参数、动画回调读到已出栈的局部变量。
另外 `edit` 工具写回时会丢 BOM，PowerShell 按 GBK 解码报 `L489: 意外的标记":--'`、`L710: Try 语句缺少 Catch` 等一串假语法错误，必须先补 BOM 再解析。

### 怎么验证

- `Parser::ParseFile` → `PS parse OK`；首字节 `EF BB BF`。
- `guide_overlay restart` 返回 `restarted: true`，`overlay.log` 20:14:55 `overlay started`，无异常行。
- 自动化点击不可行：`SetCursorPos` 返回 `False`、光标不动（沙箱会话隔离），需人工点「目标」「く」确认。

### 怎么恢复

- 动画：删掉 `FillBehavior` 与 `Height` base 赋值两行，恢复 `$anim.Completed +=`（不推荐，会回到“找不到属性 Completed”）。
- FromArgb：把 1394 行改回 3 参即恢复报错，不建议。
- BOM：删掉文件首字符 U+FEFF 即回到 GBK 解析失败状态。

---

## 2026-11-09　目标看板补齐增删改（F28 续）

### 改了什么

- `native/overlay.ps1` `Rebuild-GoalsPanel`：
  - 目标标题行从 2 列改成 3 列，右侧新增「✎」改文字与「×」删目标两个 `TextBlock` 按钮；`×` 弹 `[System.Windows.MessageBox]::Show` 二次确认，确认后按 `id` 过滤 `$script:GoalsData` 并重建。
  - 每个步骤行改成 `Grid`（勾选框 + 右侧 `×`），`×` 用索引重建 `steps` 数组，写盘后 `Rebuild-GoalsPanel`。
  - 改目标文字用 `[Microsoft.VisualBasic.Interaction]::InputBox` 模态输入，空白/取消视为不动。
- 所有 `Tag` 都只存 `@{g=卡片序号;s=步骤序号}`，回调里再从 `$script:GoalsData` 取，避开委托执行时局部变量已出栈的坑。

### 为什么

用户 m00738：「可以，两个都正常了。不过我看到了新的可改进的地方，那就是在目标这个栏目里对于"目标"这个对象的增删改查并不完善啊。」原实现只有「加目标 / 加步骤 / 勾步骤 / 排进今日清单」，不能改文字、不能删目标、不能删步骤。

### 怎么验证

- `Parser::ParseFile` → `PS parse OK`；`guide_overlay restart` → `restarted:true`；`overlay.log` 20:20:20 `overlay started`，无异常。
- 待人工：点「✎」改 g1 文字、点「×」删一条临时目标、删一个步骤，关掉重开确认写盘持久。

### 怎么恢复

- 删掉 `$editBtn`、`$delBtn`、`$delStep` 三块与 `$stepRow` 包装，把 `[void]$stepsPanel.Children.Add($stepRow)` 改回 `[void]$stepsPanel.Children.Add($cb)`，标题行去掉 `$c3`/`$ops` 即可。
- 仓库无 git；改动前版本为 3,920 行（本次编辑后 4,006 行）。

---

## 2026-11-09　目标卡片按钮放大（F29 续）

### 改了什么

- `native/overlay.ps1` `Rebuild-GoalsPanel`：
  - 目标级的「✎」「×」由裸 `TextBlock`（13px / 15px、无背景）改成 28×28 的 `Border`：圆角 7、浅色底、鼠标移入加深（`MouseEnter`/`MouseLeave`），字形 16px / 18px。
  - 步骤级的「×」由 14px `TextBlock` 改成 24×24 的 `Border`：圆角 6、悬停加深，字形 15px。
  - 点击事件、`Tag`、二次确认逻辑原样保留在 `Border` 上。

### 为什么

用户 m00791：「目标区域的删除和修改按钮太小，跟清单一个大小就是不对。」原来按钮只有字形大小，没有点击热区，和清单模块里带底色的按钮视觉不一致。

### 怎么验证

- `Parser::ParseFile` → `PS parse OK`；`guide_overlay restart` → `restarted:true`。
- 待人工：打开目标窗口，确认两个按钮有 28px 热区、悬停变色，点击行为不变。

### 怎么恢复

- 把三个 `Border` 换回原来的 `TextBlock`：`$editBtn.Text='✎'; FontSize=13`、`$delBtn.Text='×'; FontSize=15`、`$delStep.Text='×'; FontSize=14`，并删掉对应的 `Child`/`MouseEnter`/`MouseLeave` 块即可。

---

## 2026-11-09　修球与清单拖动时的位置闪烁（B30）

### 改了什么

- `native/overlay.ps1` 新增三个脚本级状态：`$script:BallPinUntil`、`$script:CardDragging`、`$script:CardPinUntil`（初始化在 `$script:DragScale` 之后）。
- 球：`Apply-State` 里同步 `$panel.ballX/ballY` 的代码加两道条件——`$script:DragState` 为空、且当前时间超过 `$script:BallPinUntil` 才允许覆盖；同时改成差值 > 0.5 才写，避免每 tick 无谓重绘。
- 球：`MouseLeftButtonUp` 里 `$moved` 为真时把 `$script:BallPinUntil` 设为 3 秒后，等宿主回写的 `ball_moved` 追上，避免松手瞬间被旧坐标拉回。
- 清单：标题栏 `DragMove()` 前后用 `$script:CardDragging` 包住，返回后设 `$script:CardPinUntil = UtcNow + 3s`；`Update-Card` 的位置同步同样加 `-not CardDragging -and UtcNow > CardPinUntil` 条件。

### 为什么

用户 m00865：「我在引导球的原位置边缘拖动光标到一个新位置，发现引导球会在旧位置和新位置闪烁。清单也是同样的问题。」

根因：宿主每次 tick 都会下发完整 state，`Apply-State` 用其中的 `panel.ballX/ballY`、`Update-Card` 用 `card.x/y` 无条件重置窗口位置；拖动过程中 state 还是上一次的旧坐标，于是本地拖到新位置、tick 又拉回旧位置，来回抖动。

### 怎么验证

- `Parser::ParseFile` → `PS parse OK`；`guide_overlay restart` → `restarted:true`，`overlay.log` 20:32:45 `overlay started`，无异常。
- 待人工：按住球拖一段再松手、拖清单标题栏再松手，确认只有跟随移动、无旧位置残影/跳回。

### 怎么恢复

- 删掉三个 `$script:*Pin*`/`CardDragging` 变量与所有引用，把 `Apply-State` 与 `Update-Card` 的位置赋值恢复成无条件的 `Left = ...; Top = ...` 两行即可。

## 2026-11-09 目标修改改为窗口内联编辑（F29 续）

### 改了什么

- `native/overlay.ps1`：删掉「✎」按钮里的 `[Microsoft.VisualBasic.Interaction]::InputBox`，改为在目标窗口内直接编辑。新增 `$script:EditingGoal`、`$script:GoalEditBox` 两个状态（`$script:GoalsNewBox` 之后）。
- `Rebuild-GoalsPanel` 开头清空 `GoalEditBox`；若 `EditingGoal` 指向的目标已被删除则一并清空。标题行改成 if/else：正在编辑的目标渲染成 `TextBox`（深底白字、Tag 存目标 id），其余目标仍是 `TextBlock`。
- 编辑框：Enter 保存并重建、Esc 取消、失焦保存；保存都写 `$script:GoalsData` 后调 `Save-GoalsData`，再 `Rebuild-GoalsPanel`。
- `Rebuild` 末尾用 `Dispatcher.BeginInvoke` 对编辑框做 `Focus / SelectAll / BringIntoView`；`Show-GoalsWindow` 打开时与 `Add_Closed` 关闭时都清掉编辑状态。
- 约 +90 行，集中在 1040–1500 段。

### 为什么

用户 m00935：「打开目标栏目时对目标进行修改，点击后发现目标窗口出现极短时间后消失，然后"目标"窗口无响应，点击就出现音效，无法与其交互。」

`InputBox` 是 WinForms 模态对话框且没有 owner，弹出时会把 `Show()` 非模态的目标窗口整体禁用；它自己又可能被 `Topmost` 的主窗口盖住，于是用户看到"窗口消失 + 叮叮"。

### 怎么验证

- `Parser::ParseFile` → `PS parse OK`；文件首字节 `EF BB BF`（BOM 完好）。
- `guide_overlay restart` → `restarted:true`；`overlay.log` 20:39:00 `overlay started`，无 `goals window failed`。
- 待人工：点「目标」→ 点某条的「✎」→ 标题变输入框，直接改字；Enter 保存、Esc 取消，关掉再开确认已落盘。

### 怎么恢复

- 把「✎」的 handler 改回 `try { Add-Type -AssemblyName Microsoft.VisualBasic } catch {}` + `InputBox` 三行；删掉 `EditingGoal`/`GoalEditBox` 与标题段的 if/else 分支，恢复成原来的单个 `TextBlock` 块。
- 没有独立备份文件，回退按本节描述手工还原；`goals.json` 数据结构未变，不受影响。

## 2026-11-09 修「下一步」卡死：加 120 秒兜底（B31）

### 改了什么

- `index.js`：`handleNextStep()` 前新增 `nextStepWatchdog` 变量与 `clearNextStepWatchdog()`、`armNextStepWatchdog()` 两个函数（约 1056–1078 行）。
- 点「下一步」写入 `busy:true` 后启动 120 秒定时器；超时且面板仍是 `busy`，就写 `没等到回应，点「下一步」再试一次。` 并置 `busy:false`。
- `applyTeach()`（1100 行前）与 `applyFinish()` 开头都清定时器；`handleNextStep()` 里「没有会话」与 followup 抛错两个提前返回分支也清。

### 为什么

用户 m00201：点「下一步」后卡在「收到，正在准备下一步…」，再点也没反应。

根因：`handleNextStep()` 先写 `busy:true` 再 `agent.followup(...)`；如果这一回合被用户消息打断或被工具终止，模型不会再调 `guide_teach`，面板就永远停在 busy。之前没有超时兜底，`busy` 只能靠下一次 teach/finish 清掉。

### 怎么验证

- `node --check index.js` → `node syntax OK`。
- 改 `cordis.patch.yml` 第 44 行 → plugin.log `12:42:22.715 guide-tutor disposed` → `12:42:22.924 guide-tutor ready`，`overlay ready (pid 311952)`，overlay.log `20:42:25 overlay started`。
- 待人工：点「下一步」后故意打断回合，等 2 分钟，确认面板自己从「正在准备」恢复成提示文字且可再点。

### 怎么恢复

- 删掉 `nextStepWatchdog`、`clearNextStepWatchdog()`、`armNextStepWatchdog()`，以及四处在 `handleNextStep`/`applyTeach`/`applyFinish` 里的调用即可；不改任何数据结构。

## 2026-11-09 拆 T01 第一刀：日志抽成 lib/log.js

### 改了什么

- 新增 `lib/log.js`（约 45 行）：导出 `createLogger(file, { maxBytes })`，返回原来的单参 `log(message)`；写入格式不变，`plugin.log` 超过 5 MB 时轮转为 `plugin.log.1`（只留一份），每 200 条检查一次文件大小。
- `index.js` 顶部加 `import { createLogger } from './lib/log.js'`；`const logPath = ...` 后加 `const log = createLogger(logPath)`；删掉原来 apply 内的 7 行 `function log(message)`（原 72–78 行）。
- 103 处 `log(...)` 调用点一行未改。

### 为什么

T01（拆 index.js）的第一小步，同时落 T04 的「日志轮转」。先拿最小、最独立的模块验证 ESM 相对导入 + 插件热重载这条路，再决定后面 state/video 怎么拆。

### 怎么验证

- `node --check index.js`、`node --check lib/log.js` 均通过。
- 改 `cordis.patch.yml` 第 44 行 → plugin.log `13:04:28.189 guide-tutor disposed` → `13:04:28.384 guide-tutor ready`，`overlay ready (pid 268188)`；重启后日志继续正常追加（351,160 B）。
- 轮转阈值未实跑（要等文件到 5 MB）；逻辑是纯文件操作，出错会被 catch 住。

### 怎么恢复

- 删 `lib/log.js`，把 `index.js` 里 `function log(message)` 的 7 行原样放回；删掉顶部 import 与 `const log = createLogger(logPath)` 一行。调用点不用动。

## 2026-11-09 拆 T01 第二刀：state 抽成 lib/state.js

### 改了什么

- 新增 `lib/state.js`（约 85 行）：`createStateStore({ file, defaults, log, broadcast })`，返回 `{ current, write, readFile }`。原子写（tmp → rename）、EPERM/EBUSY 兜底、失败绝不外抛的原注释和逻辑都原样搬入。
- `index.js`：顶部加 `import { createStateStore } from './lib/state.js'`；原 `readStateFile` / `currentState` / `writeState` 三个函数的实现（99–169 行）换成 `store` 初始化 + 三个薄包装；删掉模块级 `let state = null`。约 -45 行。
- 60 多处 `currentState()` / `writeState()` 调用点一行未动。

### 为什么

T01 第二刀，同时落 T05 的「state.json 写入口收敛」。行为先保持不变：只是把读写与兜底逻辑收进一个模块，后面要加 writer 队列或 schema 版本时只改这一处。

### 怎么验证

- `node --check index.js`、`node --check lib/state.js` 均通过。
- 热重载 → plugin.log `13:07:30.168 disposed` → `13:07:30.385 guide-tutor ready`，`overlay ready (pid 281660)`。
- 重载后 `state.json` 被正常重写（1,346 B，字段齐全），plugin.log 无 `writeState failed`；index.js 已无任何模块级 `state =` 赋值。
- 注意：热重载会按启动逻辑重置 panel 的临时状态（原本就如此，不是这次引入）。

### 怎么恢复

- 删 `lib/state.js`；把 `index.js` 里三个薄包装换回原来的函数体（原实现见本条上方描述，或从 CHANGELOG 2026-11-09 之前版本找回），恢复 `let state = null`；删掉 import 与 `store` 初始化块。

## 2026-11-09 建立 git 版本管理（v0.21.0 基线）

### 改了什么

- `git init -b main`，本地身份 `user.name=<User>`、`user.email=wutian@local`（未改全局配置）。
- 新增 `.gitignore`：排除 `tmp/`、`models/`、`py/libs/`、`py/wheels/`、`kb-backup-*/`、`__pycache__/`、`*.pyc`、`~$*`、`*.tmp`、`*.log`。
- 新增 `.gitattributes`：`* -text`，按工作区字节原样存储，不做 CRLF 转换。
- 新增 `VERSIONING.md`：分支、提交格式、一刀流程、回滚命令、版本号规则、不入库清单。
- 首次提交 `0a096d4`：31 个文件、12,847 行；tag `v0.21.0` 指向该提交（含已拆好的 `lib/log.js`、`lib/state.js`）。

### 为什么

拆 `index.js` 要连续动多个文件，之前没有回滚点，CHANGELOG 里的「怎么恢复」只能靠手写描述。先有 `git reset --hard v0.21.0`，才敢继续拆第三刀。

### 怎么验证

- `git log --oneline --decorate -1` 输出 `0a096d4 (HEAD -> main, tag: v0.21.0) ...`。
- `git status --short` 为空（工作区干净）；`git tag` 有 `v0.21.0`。
- `git ls-files | Measure-Object` 为 31；`native/__pycache__`、`models/`、`py/libs/` 均未入库。

### 怎么恢复

- 回到基线：`git reset --hard v0.21.0`（丢弃之后所有提交）。
- 彻底放弃版本管理：删除 `D:\dsh_TestSpace\guide-tutor\.git` 目录即可，工作区文件不受影响，但历史与 tag 一并丢失。
- 误提交大文件时：`git rm --cached <路径>` 后补 `.gitignore`，再 `git commit --amend` 或新提交。

## 2026-11-09 拆 T01 第三刀：video 抽成 lib/video.js

### 改了什么

- 新增 `lib/video.js`（28,799 B，约 714 行）：`createVideoLibrary({ dataDir, log, broadcast, config })` → `{ tools, readVideoRecords, videoDir }`。搬入 `parseVideoUrl`、`biliApi`、WBI 签名、字幕抓取/校验、视频库 JSON/Markdown 读写，以及 9 个 `video_*` 工具定义。
- `index.js`：删除原 3656–4369 的 video 段，换成 `videoLibrary` + `videoTools` 三行初始化；`statusSnapshot` 的 `readVideoRecords()` 改 `videoLibrary.readVideoRecords()`；9 条 `ctx.tools.register(videoXTool)` 合并成 `for (const tool of videoTools) ctx.effect(...)`；import 增加 `createVideoLibrary`，删掉搬走后不再使用的 `createHash`。4,920 → 4,204 行（-716）。
- `package.json` version 0.21.0 → 0.21.1。

### 为什么

T01 第三刀。video 是最大一块（网络请求 + WBI 签名 + 字幕解析 + 库读写），收进独立模块后，T03 冒烟测试可以直接 `import` 它，不必启动整个插件。

### 怎么验证

- `node --check index.js`、`node --check lib/video.js` 均通过。
- 热重载 21:16:09 `disposed` → `ready`，`overlay ready (pid 270372)`，plugin.log 无报错。
- 实调 4 个工具：`video_list` 返回 8 条；`video_show BV18XcEzXEGL` 正常；`video_recall 指令 宿命` 命中 2 条；`video_transcript` 返回 0~28 条 / 共 232 条、`nextOffset=28`。

### 怎么恢复

- `git reset --hard v0.21.0`：回到拆分前的基线（含已拆的 log/state）。
- 或 `git revert <本刀提交>`：删除 `lib/video.js`，把 index.js 的 video 内联段恢复；原代码可从 `v0.21.0` tag 取。
- 只回退本刀：`git revert <本刀提交>` 后重新热重载。

## 2026-11-09 T03 冒烟测试：video 模块

### 改了什么

- 新增 `tools/smoke-video.mjs`（约 260 行，16 个断言）：纯函数（`parseVideoUrl` / `videoStamp` / `parseDurationText` / `subtitleFitsVideo` / `videoDigest`）、库 CRUD（save → list → note → show → transcript → forget）、`video_learn` 三条分支（正常 / 时间轴不符 / 无字幕）、`video_search`。
- `lib/video.js`：`createVideoLibrary` 增加可选参数 `fetchImpl`（默认 `globalThis.fetch`），`biliApi` 与字幕下载改用它；返回值增加 `saveVideoRecord`、`parseVideoUrl`、`parseDurationText`、`videoStamp`、`subtitleFitsVideo`、`videoDigest`，供冒烟脚本直接调用。`index.js` 调用处不变。
- `package.json` version 0.21.1 → 0.21.2。

### 为什么

T03。拆完 video 后没有可重复的回归手段，今天手点只覆盖了 4 个只读工具，`learn` / `search` / `forget` 都没实跑。冒烟脚本用 fetch 桩、临时目录，几秒跑完，提交前可重复。

### 怎么验证

- `node tools/smoke-video.mjs` → `16 passed, 0 failed`，exit 0。
- 热重载 21:22:14 `disposed` → `ready`，`overlay ready (pid 283980)`，无报错。
- 运行时 `video_list` 仍返回 8 条。

### 怎么恢复

- `git reset --hard v0.21.1`（丢弃本刀），或 `git revert <本刀提交>`。
- 只撤测试：删除 `tools/smoke-video.mjs`；`lib/video.js` 的 `fetchImpl` 与测试出口可以保留（默认行为不变），也可以一并回退。

## 2026-11-09 打磨表同步：T03 完成、B18 拖动闪烁

### 改了什么

- `打磨计划-2026-11.xlsx`（根目录）与 `planning\打磨计划-2026-11.xlsx` 同步修改：
  - `3-技术债` T03 状态「计划中」→「已完成」，改善建议末尾补「（已落地：tools/smoke-video.mjs，16 项断言）」；
  - `2-Bug与问题` 追加第 21 行 B18（悬浮层 / S2 / P1 / 清单与引导球拖动时位置闪烁 / 已修复），Table `BugList` ref 由 `A3:K20` 扩到 `A3:K21`；
  - `6-已完成` 第 3 行插入 `0.21.2 / 2026-11-09 / 工程 / 冒烟脚本（T03） / node tools/smoke-video.mjs → 16 passed / 是`；
  - `1-想法池` F26–F29 状态改「已完成」；`7-想法收件箱` 第 4–7 行状态改「已做」。
- 备份：`tmp\打磨计划-before-t03-20261109.xlsx`。
- 未改动：表结构、列宽、其他行内容。

### 为什么

代码已经到 v0.21.2，表里 T03 还写「计划中」，F26–F29 还写「已进池」，B18 根本没进表；不同步的话下次按表排期会重复做已完成的事。

### 怎么验证

- `tmp\verify_plan_t03.py` 对根目录与 planning 两份分别检查：`T03 status ok: True`、`B18 ok: True`、`table A3:K21`、`done row ok: True`。
- 补充检查：`ideas_done True`、`inbox_done True`。

### 怎么恢复

- 用 `tmp\打磨计划-before-t03-20261109.xlsx` 覆盖根目录文件，再把根目录复制回 `planning\`。
- 只想撤单条：删 B18 那行并把 `BugList` ref 改回 `A3:K20`，其余单元格逐个改回原值（原值见备份）。

## 2026-11-09 F04 自然语言加任务

### 改了什么

- 新增 `lib/plan-parse.js`（约 220 行）：`parsePlanText(text, now)` 把一句话解析成 `{ ok, from, to, place, title, date, dayOffset, missing }`。支持今天/明天/后天/大后天/周X/下周三/11月15日、上午/下午/晚上/凌晨、`HH:mm`、`X点X分`/半/一刻、`X分钟后`/`X小时后`、时长、地点（`在`/`去`）。
- `index.js`：`guide_plan` 的 `add` 新增 `text` 参数；解析成功才落盘，失败返回 `need` 并在渲染里回显「（缺 from）」；不是今天的条目先写 `plan-later.json`，`planForToday()` 在当天首次读清单时自动并入并删除该条；一句话来的时间不做 25 分钟吸附，用户说几点就是几点。
- 新增 `tools/smoke-plan.mjs`（13 条断言）。
- `package.json` 0.21.2 → 0.22.0。

### 为什么

F04：把「想到一件事」到「写进清单」压成一句话；解析失败必须回显确认，不能静默写错时间。

### 怎么验证

- `node tools/smoke-plan.mjs` → `13 passed, 0 failed`，exit 0。
- 热重载后实调：
  - `guide_plan add text=明天下午三点在图书馆复习概率论` → 「2026-11-10 先记下了：15:00 @图书馆 复习概率论」，`plan-later.json` 结构正确；
  - `guide_plan add text=今天下午五点半在宿舍背单词` → 当天 `17:30–17:55 @宿舍 背单词`；
  - `guide_plan add text=复习概率论` → 「没成：这句话没解析出完整时间（缺 from）」，不落盘。
- 测试后已恢复 `plan.json`（`tmp/plan-before-f04.json`）并删除 `plan-later.json`。

### 怎么恢复

- `git reset --hard v0.21.2` 或 `git revert <本刀提交>`。
- 只撤功能：删 `lib/plan-parse.js`、`tools/smoke-plan.mjs`，把 `index.js` 的 add 分支恢复成 v0.21.2 版本；`plan-later.json` 可留可删。

## 2026-11-09 打磨表同步：F04 完成、0.22.0 入「已完成」

### 改了什么

- `打磨计划-2026-11.xlsx`：`1-想法池` F04 行第 9 列「状态」由「进行中」改「已完成」；`6-已完成` 第 3 行插入 0.22.0（0.22.0 / 2026-11-09 / 桌面清单 / F04 一句话加任务 / node tools/smoke-plan.mjs → 13 passed；实调三条 / 是），原 0.21.2 行下移。
- `planning\打磨计划-2026-11.xlsx` 覆盖为同一版本。
- 备份：`tmp\打磨计划-before-f04-20261109.xlsx`。

### 为什么

F04 已实现并合并为 v0.22.0，表要与代码状态一致；`6-已完成` 记录该版本交付内容，下次翻表即可知道 0.22.0 做了什么。

### 怎么验证

- `tmp/update_plan_f04.py` 输出 `F04 done at row 7`、`saved root and planning copy`。
- openpyxl 读根目录：F04 第 9 列 == 已完成；`6-已完成` 第 3 行 == 0.22.0 / 2026-11-09 / 桌面清单。
- 读 `planning\` 副本：`6-已完成` 第 3 行版本同为 0.22.0。

### 怎么恢复

- 用备份覆盖两份：`Copy-Item tmp\打磨计划-before-f04-20261109.xlsx 打磨计划-2026-11.xlsx -Force`，再把根目录复制回 `planning\`。
- 只撤单条：F04 状态改回「进行中」，删 `6-已完成` 第 3 行。
## 2026-11-09 今日清单补录当天经历

### 改了什么

- `C:\Users\<User>\.dsh\guide-tutor\plan.json`（5 条）：08:30–10:10 学日语五十音、10:20–10:40 开会、14:00–17:30 玩、19:00–19:25 @宿舍 吃薯片喝奶茶、19:30–21:30 调试插件；前两条标 `done: true`。
- 删掉 `guide_plan add` 重复写入的一条「学日语五十音」（`tmw9b74cg`）。

### 为什么

用户要求「顺便把我今天的经历写到今天的清单里吧」。先后两次 `guide_plan add` 实际都写进了 `plan.json`，但工具返回 `Error: tool "guide_plan" returned invalid output: value is not lossless JSON`，于是直接改 JSON 收尾并清掉重复条目。

### 怎么验证

- `guide_plan list` → 「2026-11-09（3/5 已完成）」，顺序为 08:30 / 10:20 / 14:00 / 19:00 / 19:30，无重复。
- `plan.json` 只含 5 个不同 id。

### 怎么恢复

- 删 10:20 开会、14:00 玩、19:30 调试插件三条，把「学日语五十音」的 `done` 改回 `false`，即回到原 2 条（08:30 学日语五十音 + 19:00 吃薯片喝奶茶）。

## 2026-11-09 修 guide_plan add 返回值序列化失败（B32）

### 改了什么

- `index.js` add 分支末尾：`return { ok: true, id, parsed: parsed || undefined, plan: planSummary(plan) }` 改为先构造 `const result = { ok: true, id, plan: planSummary(plan) }`，只有 `parsed` 存在时才 `result.parsed = parsed`。
- `package.json` 0.22.0 → 0.22.1。

### 为什么

用户实测 m01850：用 from/to/title 加任务（不带 text）时，工具返回 `Error: tool "guide_plan" returned invalid output: value is not lossless JSON`，但条目实际已写进 `plan.json`；模型以为失败重试，清单出现重复条目。
根因：DSH 工具返回值走 lossless JSON 序列化，对象里值为 `undefined` 的键不合法；不带 text 时 `parsed` 为 `null`，`parsed: undefined` 这一项就是非法的。

### 怎么验证

- `node --check index.js` → `node syntax OK`；`index.js` 保持 LF、无 CRLF。
- 改 profile 的 `cordis.patch.yml` 第 44 行触发热重载：`plugin.log` 21:43:19 `guide-tutor ready`，`overlay spawned pid=290652`。
- `guide_plan add from=22:00 to=22:25 place=测试 title=测试：返回序列化` → 返回 6 条清单文本，无报错；`guide_plan remove id=tmw9baggb` 后回到 5 条。
- `grep '\|\| undefined|\? undefined|: undefined'` 全文件只剩 1 处（4042 行 URL 参数），不在工具返回值里。

### 怎么恢复

- `git revert <本刀提交>`；或把 add 分支末尾改回 `parsed: parsed || undefined`，`package.json` 改回 0.22.0。

## 2026-11-09 今日清单加右侧滚动滑块

### 改了什么

- `native/overlay.ps1`：
  - 新增 `$script:CardScrollThumb`、`$script:ScrollDragStart` 两个脚本级变量（`$script:CardWidth` 之后）。
  - 新增 `Update-CardScrollThumb`：按 `ViewportHeight / ExtentHeight` 算滑块长度（最小 26px），按 `VerticalOffset / ScrollableHeight` 算位置；内容装得下时 `Collapsed`。
  - 卡片第 2 行的 `ScrollViewer` 右侧叠一个 5px 宽 `Border` 滑块：圆角 2.5、`rgba(255,255,255,46)`、`Cursor=Hand`、ToolTip「拖动查看清单」；`$sv.Padding` 右侧留 10px，避免滑块压住文字。
  - 绑定 `ScrollChanged` 刷新滑块；滑块支持按住拖动（`CaptureMouse`，位移换算成 `ScrollToVerticalOffset`），松手释放。
- `package.json` 0.22.1 → 0.22.2。

### 为什么

用户 m01924：「打磨一下今日清单的细节：给右边的空白区域加入一个类似我图片滑块的东西用来展示在页面的什么位置」。原来 `VerticalScrollBarVisibility = Hidden`，滚轮能滚但看不出滚到哪、还有多少。

### 怎么验证

- `Parser::ParseFile` → `PS parse OK`；文件首字节 `EF BB BF`。
- `guide_overlay restart` → `restarted: true`，pid 295336，`overlay.log` 21:53:30 `overlay started`，无异常。
- 待人工：收缩态清单右侧出现细滑块；滚轮时滑块跟着走；按住滑块拖动，清单内容跟随。

### 怎么恢复

- 删掉 `Update-CardScrollThumb` 函数、`$script:CardScrollThumb` / `$script:ScrollDragStart` 两个变量，以及 `$script:CardScroll = $sv` 之后到 `$stack.Children.Add($thumb)` 的整段（含 `$sv.Padding` 那行）；即回到只有滚轮、无滑块的旧行为。

## 2026-11-09 打磨表记录 F30 清单滚动滑块

### 改了什么

- `D:\dsh_TestSpace\guide-tutor\打磨计划-2026-11.xlsx` 与 `planning\打磨计划-2026-11.xlsx`：
  - `1-想法池` 第 33 行写入 F30（桌面清单 / 功能 / 清单右侧滚动位置滑块 / 中 / P2 / S / 进行中 / 用户口述 m01924）。
  - Excel Table `IdeaPool` 的 ref 由 `A3:K32` 扩到 `A3:K33`。
  - `7-想法收件箱` 第 8 行（序号 5）写入 m01924 原话、理解、`功能`、`已做`。

### 为什么

AGENTS.md 要求「新想法、新功能都进表」；这条是用户口述的需求，代码已提交，但还没人工确认，所以状态先记「进行中」。

### 怎么验证

- openpyxl 读回：`1-想法池` 第 33 行 11 列齐全，`IdeaPool` ref = `A3:K33`；`7-想法收件箱` 第 8 行 6 列齐全。
- 根目录与 `planning\` 两份都已保存。

### 怎么恢复

- 删掉 `1-想法池` 第 33 行、把 `IdeaPool` ref 改回 `A3:K32`；清空 `7-想法收件箱` 第 8 行。两份文件同样处理。

## 2026-11-10 语音首句延迟修复（B06）

### 改了什么

- `native/tts.ps1`：
  - `Invoke-EdgeTts` 加合成缓存：按 `文本|音色|语速|音量` 做 SHA256，取前 20 位做文件名，存 `GUIDE_TTS_CACHE`（默认 `%LOCALAPPDATA%\guide-tutor\tts-cache`）；命中时直接播 mp3，不再起 python、不再等 edge 连接。
  - 合成进程改用 `ProcessStartInfo`：stdout / stderr 都异步读走（不读会把管道写满），10 秒超时后杀进程并回落 SAPI。
  - 播放结束只清理临时合成文件，缓存 mp3 保留给下一次。
- `native/tts_edge.py`：`emit()` 改为 `ensure_ascii=True`。路径里有中文用户名时，原来 UTF-8 的 JSON 被 Windows 控制台按 GBK 解码成乱码，`Test-Path` 失败，edge 分支一直静默回落 SAPI——这是 15 秒延迟的真正原因。
- `index.js`：`import { createHash, randomBytes }`；新增 `ttsCacheDir`、`ttsCacheFile()`、`prefetchSpeech()`（播放当前句时后台把下一句合成进同一缓存）；`speakChunk` 传 `GUIDE_TTS_CACHE` 并预取 `speechQueue[0]`。
- `package.json` 0.22.2 → 0.22.3。

### 为什么

B06：45 字合成 15.4 秒，整段合成完才开始播，口播像卡住；根因是 edge 输出被编码坏掉后一直回落 SAPI，而 SAPI 整句朗读又慢。

### 怎么验证

- `Parser::ParseFile` → `PS parse OK`；`node --check index.js` 通过。
- 音量 0 实测同一句：首次起播 3,285 ms（合成约 1.9 s + 进程启动），第二次 1,126 ms（缓存命中）；修复前同一路径 15 秒级。
- 缓存文件落盘：`tts-cache/314a34734c2b1b71f935.mp3`，19,440 B。
- 宿主热重载：`plugin.log` 01:34:39 `disposed` → 01:34:41 `ready`，overlay pid 286176。
- 待人工：连续口播时，从第二句起是否明显更快。

### 怎么恢复

- 删掉 `C:\Users\<User>\.dsh\guide-tutor\tts-cache` 目录即可清缓存。
- 回滚代码：`tts.ps1` 恢复为 `& $python $synth --out $out ...` 同步合成、播完删临时 mp3；`index.js` 去掉 `GUIDE_TTS_CACHE` 与 `prefetchSpeech`；`tts_edge.py` 的 `emit()` 改回 `ensure_ascii=False`。

## 2026-11-10 09:52 打磨表 B06 打勾 + 记录关表改表约定

### 改了什么
- `打磨计划-2026-11.xlsx`、`planning\打磨计划-2026-11.xlsx`：`2-Bug与问题` 第 9 行 B06，状态「待做」→「已修复」，验收列改为「缓存命中 1.1 秒起播；首次 3.3 秒；原为 15 秒级。」
- `HANDOFF.md`：标题版本 0.21.0 → 0.22.3；新增「八、和用户协作的约定」，写入「表开着先关表、改完再重开」与「两份表必须同步」。

### 为什么
B06 已随 v0.22.3 修复并实测，表内状态滞后；用户 m02972 要求把「关表—改表—重开」固化成流程，避免每回都问。

### 怎么验证
- `openpyxl` 读回两份表：B06 第 9 行为「已修复」，第 10 行为新验收文案。
- `git status --short` 只显示两份 xlsx 与 HANDOFF.md；`git diff --stat` 不出现全文件换行 diff。

### 怎么恢复
- 表：`git checkout -- 打磨计划-2026-11.xlsx planning/打磨计划-2026-11.xlsx`。
- HANDOFF：`git checkout -- HANDOFF.md`。

## 2026-11-10 09:58 清单删除加二次确认与 24 小时撤回（B01/B02/B03）

### 改了什么
- `native/overlay.ps1`：卡片每条右侧「✕」改为两段式——第一次点只变红「上膛」，2.5 秒内再点同一条才发 `plan_remove`；删掉原 1.2 秒防抖（它挡不住误触）。约 +18/−8 行。
- `index.js`：
  - 新增 `plan-deleted.json`（`planDeletedPath`）与 `readPlanDeleted()` / `writePlanDeleted()`，只保留 24 小时内删除。
  - `planRun` 的 `remove` 分支：删前把完整条目（id/from/to/place/title/done…）写进 `plan-deleted.json`，daylog 也带 `item` 字段；返回 `removed` 与 `restoreHint`。
  - 新增 `restore` 分支：给 id 恢复；不给 id 返回最近删除列表。
  - `clear` 必须带 `confirm=true`，并把清空条目写进软删除。
  - 工具 schema 加 `restore`、`confirm`，render 支持删除列表与恢复回显。
- `package.json` 0.22.3 → 0.22.4。

### 为什么
B01/B02：删除单击即删、日志不记内容，已发生三次成片误删（16:33/16:58/17:30 各 4–5 条）。B03 的 11-09 四条已随换天过期，不需要恢复。

### 怎么验证
- `node --check index.js` 通过；`Parser::ParseFile` → `PARSE OK: overlay.ps1`。
- 热重载 01:56:44（overlay pid 274072）。
- API 实测：remove → `plan-deleted.json` 有完整条目 + daylog 带 item；`GET /plan?action=restore` 列出；restore 后清单回到 3 条；`clear` 无 confirm 被拒且清单不变。
- 待人工：卡片上点一次 ✕ 变红、再点一次才删。

### 怎么恢复
- 代码：`git revert` 对应提交。
- 数据：`plan-deleted.json` 删掉即可清空撤回池；误删条目用 `guide_plan action=restore id=...`。

## 2026-11-10 10:00 打磨表 P0 打勾

### 改了什么
- 两份 `打磨计划-2026-11.xlsx`：`2-Bug与问题` 的 B01/B02 状态「已修复」、B03「已解决」，同步修复方案与验证列；`6-已完成` 第 3 行插入 0.22.4。

### 为什么
B01/B02 随 v0.22.4 落地并已用 API 实测；B03 的 11-09 清单已随换天过期，不需要恢复。

### 怎么验证
- `openpyxl` 读回：B01/B02「已修复」、B03「已解决」；`6-已完成` 第 3 行为 0.22.4。
- `git diff --stat` 两份 xlsx 只有二进制小改动。

### 怎么恢复
- `git checkout -- 打磨计划-2026-11.xlsx planning/打磨计划-2026-11.xlsx`（回到 c479efc 的表状态）。

## 2026-11-10 10:03 加 dev-watch 热重载（B05）

### 改了什么
- 新增 `scripts/dev-watch.mjs`（约 85 行）：监听 `index.js` 与 `lib/*.js`，700ms 防抖后把 `cordis.patch.yml` 的 `reload:` 行改成当前时间，再轮询 `plugin.log` 等 `disposed → ready` 并打印耗时。
- `package.json`：加 `"scripts": { "dev": "node scripts/dev-watch.mjs" }`，版本 0.22.4 → 0.22.5。

### 为什么
B05：改 index.js 要手动改 reload 文本、再猜有没有生效；现在保存即触发，跑完打印「重载完成（xxx ms）」。

### 怎么验证
- `node scripts/dev-watch.mjs` 后 touch `lib/log.js`：输出 `变更：lib\log.js`、`已触发`、`重载完成（309ms）`。
- `cordis.patch.yml` 的 reload 行变成 `2026-11-10 ... dev-watch`；`plugin.log` 出现 `disposed` → `ready`。

### 怎么恢复
- 删 `scripts/dev-watch.mjs`，去掉 package.json 的 scripts 段即可；不影响插件运行。

## 2026-11-10 10:05 打磨表 B05 打勾

### 改了什么
- 两份 `打磨计划-2026-11.xlsx`：`2-Bug与问题` 的 B05 状态改「已修复」，同步修复方案与验证列。

### 为什么
B05 随 v0.22.5（scripts/dev-watch.mjs）落地，已实测自动触发重载。

### 怎么验证
- `openpyxl` 读回两份：B05 第 9 列为「已修复」。
- `git diff --stat` 两份 xlsx 只有二进制小改动。

### 怎么恢复
- `git checkout -- 打磨计划-2026-11.xlsx planning/打磨计划-2026-11.xlsx`（回到 93357f3 的表状态）。

## 2026-11-10 10:12 T01 第四刀：拆出 lib/kb.js

### 改了什么
- 新增 `lib/kb.js`（约 200 行）：`createKb({ kbDir, broadcast, docxExtract, docxWrite })`，返回 `{ tool, run, list, summary }`，原 `safeKbName` / `kbPathOf` / `kbSummary` / `kbListFiles` / `kbRun` 原样搬入。
- `index.js`：删原 KB 段 158 行，改 `import { createKb }`、`const kb = createKb(...)`、`const guideKbTool = kb.tool`；`statusSnapshot` 与 `apiHandler` 的 `kbListFiles()` 改 `kb.list()`。4,486 → 4,332 行。

### 为什么
T01（拆分 index.js）：知识库逻辑与宿主其余部分无共享可变状态，依赖只有目录、广播和两个 docx 函数，适合先拆、验证工厂注入模式。

### 怎么验证
- `node --check index.js`、`node --check lib/kb.js` 均通过。
- 触发宿主重载：`plugin.log` 02:08:05.354 `disposed` → 02:08:05.568 `ready`。
- 实调 `guide_kb`：list 返回 6 个文件；save/read/delete `插件/tmp-smoke-kb.md` 正常；save `插件/tmp-smoke-kb.docx` 生成 36,695 B（2 段 / 0 表），已删除测试文件。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.5 -- index.js lib/kb.js`。

## 2026-11-10 10:18 T01 第五刀：拆出 lib/focus.js

### 改了什么
- 新增 `lib/focus.js`（约 250 行）：`createFocus({ dataDir, nativeDir, log, speak, readTimetable, minutesOf, hhmm })`，返回 `{ tool, tick, run, statusText }`；`focus.json` / `focus-log.jsonl` / `idle.ps1` 路径与状态迁移都搬进去。
- `index.js`：删原 focus 段 265 行，改 `import { createFocus }`、`const focus = createFocus(...)`、`const guideFocusTool = focus.tool`；tick 调用改 `focus.tick(new Date())`；语音用注入的 `speak`（内部仍走 `speechChunks`/`stopSpeech`/`speechQueue`/`playNextChunk`）。4,332 → 4,084 行。

### 为什么
T01：专注环是纯本地定时器，只依赖目录、日志、语音和课表，拆出来后可单独测 `run/tick`，不再和宿主闭包纠缠。

### 怎么验证
- `node --check index.js`、`node --check lib/focus.js` 通过。
- 重载：`plugin.log` 02:09:14.874 `disposed` → 02:09:15.069 `ready`。
- 实调 `guide_focus`：status「专注环没开。」；start（5 分工作/1 分休息/2 分提醒/10:30 结束）返回「第 1 轮 · 工作…」且正常朗读；stop 返回「已停。」。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.6 -- index.js lib/focus.js`。
