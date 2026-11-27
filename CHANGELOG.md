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

## 2026-11-10 10:24 T01 第六刀：拆出 lib/camera.js

### 改了什么
- 新增 `lib/camera.js`（约 380 行）：`createCamera({ dataDir, nativeDir, shotsDir, log, broadcast, appendDaylog, pickAgent, buildUserMessage, mutedSpeakMessages })`，返回 `{ tool, tick, run, status, snap }`；抓图串行队列、指纹比对、待看队列、清理策略全部搬入。
- `index.js`：删原 camera 段 354 行，改 `import { createCamera }`、`const camera = createCamera(...)`、`const guideCameraTool = camera.tool`；tick 调用改 `camera.tick()`。4,084 → 3,743 行。

### 为什么
T01：摄像头巡检与清单、语音、目标互不共享写状态，依赖只有目录、日志、唤醒投递，拆出后可用 `status/pending` 直接验。

### 怎么验证
- `node --check index.js`、`node --check lib/camera.js` 通过。
- 重载：`plugin.log` 02:10:09.834 `disposed` → 02:10:10.035 `ready`。
- 实调 `guide_camera`：status 返回「巡检：开，每 120 分钟…待看 20 张」；pending 返回 20 条旧记录，路径与时间正常。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.7 -- index.js lib/camera.js`。

## 2026-11-10 10:30 T01 第七刀：拆出 lib/edict.js

### 改了什么
- 新增 `lib/edict.js`（约 300 行）：`createEdict({ dataDir, readGoals, readTimetable, minutesOf, hhmm, todayKey, log, broadcast, appendDaylog, pickAgent, buildUserMessage })`，返回 `{ tool, tick, run, config, configPath }`；`edict-state.json` / `directives.jsonl` / `edict.json` 路径与调度状态都搬入。
- `index.js`：删原 edict 段 295 行（保留 `goalsPath` / `readGoals`，因为清单与 HTTP 状态还要用），改 `import { createEdict }`、`const edict = createEdict(...)`、`const guideDirectiveTool = edict.tool`；tick 改 `edict.tick()`；`tone` 事件改 `edict.config()` / `edict.configPath`；`planToneText` 改 `edict.config().tone`。3,743 → 3,461 行。

### 为什么
T01：「都市指令」的调度、发令、回报自成一套，只依赖目标读取与课表文本，拆出后可单独调用 `status/goals/list` 验证。

### 怎么验证
- `node --check index.js`、`node --check lib/edict.js` 通过，无残留 `readEdictConfig`/`edictStatePath` 引用。
- 重载：`plugin.log` 02:11:13.710 `disposed` → 02:11:13.908 `ready`。
- 实调 `guide_directive`：status「调度关；今天已发 2 条；下一条约 20:35；目标 2 条」；goals 返回两条原有目标。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.8 -- index.js lib/edict.js`。

## 2026-11-10 10:16 T01 第八刀：拆出 lib/plan.js

### 改了什么
- 新增 `lib/plan.js`（721 行）：`createPlan({ dataDir, parsePlanText, readGoals, readTimetable, minutesOf, hhmm, todayKey, appendDaylog, log, writeState, currentState, broadcast, pickAgent, buildUserMessage, mutedSpeakMessages, speak })`，返回 `{ tool, run, tick, forToday, summary, push, history, setDone }`；`plan.json` / `plan-state.json` / `plan-archive/` / `plan-history.json` / `plan-later.json` / `plan-deleted.json` 的读写全部搬入。
- `index.js`：删原 plan 段 638 行，改 `import { createPlan }`、`const plan = createPlan(...)`、`const guidePlanTool = plan.tool`，并保留 8 个薄包装（`planForToday` / `planRun` / `planTick` / `planSummary` / `pushPlanState` / `setPlanItemDone` / `planHistoryData`）。3,461 → 2,798 行。
- 第一版漏注入了 `currentState`，`guide_plan list` 报 `currentState is not defined`；补参数后重载通过。

### 为什么
T01：清单是插件里最大的一块业务逻辑（自然语言加任务、软删除恢复、换天归档、提醒 tick），拆出后 `index.js` 只剩装配与注册，清单问题可单文件定位。

### 怎么验证
- `node --check index.js`、`node --check lib/plan.js` 通过。
- 重载：`plugin.log` 02:13:06.472 `disposed` → 02:13:06.663 `ready`。
- 实调 `guide_plan`：list 返回 3 条今日清单；add 文本「今天下午六点在宿舍测试计划模块」→ 18:00–18:25 落盘；done 打勾成功；remove 软删除成功；restore 恢复成功；再 remove 清理测试条目。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.9 -- index.js lib/plan.js`。

## 2026-11-10 10:20 T01 收尾：表与 HANDOFF 同步

### 改了什么
- `打磨计划-2026-11.xlsx` 与 `planning\打磨计划-2026-11.xlsx`：`3-技术债` T01 状态「待做」→「已完成」、方案列补八刀清单与行数；`1-想法池` F30 状态「进行中」→「已完成」；`6-已完成` 追加 0.22.10 一行。
- `HANDOFF.md`：版本改 0.22.10，新增「三·五、T01 拆分进度」表，第四节删除「删除无二次确认」待办（已由 B01/B02 解决）。

### 为什么
T01 八刀拆完（log/state/video/kb/focus/camera/edict/plan），`index.js` 4,872 → 2,762 行；表与交接口径要对齐，避免下个会话还按「4,872 行 / 待做」判断。

### 怎么验证
- openpyxl 读回：两份 xlsx 的 `H4` 均为「已完成」、`I33` 均为「已完成」、`6-已完成` 末行 15。
- `HANDOFF.md` 已含「T01 拆分进度（0.22.10）」与 2,762 行。

### 怎么恢复
- 表：`tmp\打磨计划-before-t01-root.xlsx`、`tmp\打磨计划-before-t01-planning.xlsx` 覆盖回去。
- HANDOFF：`git checkout v0.22.9 -- HANDOFF.md`。

## 2026-11-10 10:25 修第八刀后 chatLog 作用域

### 改了什么
- `lib/plan.js`：删掉误搬入的 `// chatlog` 初始化段（`chatLogPath`、`chatLog` 读取）。
- `index.js`：在 `recordChat` 前补回 `chatLogPath` / `chatLog` 初始化（约 9 行）。

### 为什么
拆 plan 段时截取范围把 `// chatlog` 段一起带进模块，`recordChat` 留在 index.js 却引用不到 `chatLog`，`guide_say` 报 `chatLog is not defined`。

### 怎么验证
- `node --check index.js`、`node --check lib/plan.js` 通过。
- 重载：`plugin.log` 02:15:07.427 `disposed` → 02:15:07.616 `ready`。
- `guide_say` 正常朗读；`http://127.0.0.1:41999/chatlog?limit=2` 返回 200、`count=120`。

### 怎么恢复
- `git revert <本次提交>`。

## 2026-11-10 11:30 F05a：清单备注与优先级颜色

### 改了什么
- `lib/plan.js`（+约 45 行）：
  - 新增 `normalizePriority()`：接受 P0–P3、0–3、高/中/低，非法值落空。
  - `add` 支持 `note`、`priority`；`text` 模式会从原话里提取「带电脑、课本」进 `note`，并从标题里去掉这段。
  - `update` 支持改 `note` / `priority`；`readPlanFile` 重建条目时保留这两个字段（否则下一次 add 会把它们覆盖掉）。
  - `planItemLine` 输出 `[P1] …（带电脑）`，`list` 文本直接可见。
  - `guide_plan` schema 加 `priority`，`note` 描述扩成 add/update 备注 + remove 原因。
- `native/overlay.ps1`（+约 35 行）：卡片条目左侧 3px 优先级色条（P0 红 / P1 橙 / P2 蓝 / P3 绿，未填不画）；长块标题下加 9pt 备注行；短块用 ToolTip 显示「标题 ｜ 备注」。

### 为什么
F05 原本把备注、颜色、子任务捆在一起。备注与颜色成本低、每天用得上；子任务与目标看板的步骤功能重叠，先拆出去（F05b 待定）。

### 怎么验证
- `node --check lib/plan.js` 通过；BOM `EF BB BF`、`PS parse OK`；overlay 重启成功。
- 重载：`plugin.log` 03:25:04.075 `ready`。
- `guide_plan update id=fmw9b4njj note=带电脑 priority=P1` → 清单显示 `[P1] 08:30–10:10 …（带电脑）`。
- `guide_plan add text=今天晚上九点在宿舍写报告，带电脑和水杯` → title 只剩「写报告」，note「电脑和水杯」，priority P0。
- 截屏确认卡片：08:30 那条左侧橙色条、标题下「带电脑」小字。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.10 -- lib/plan.js native/overlay.ps1`。
- 表：`tmp\打磨计划-before-f05a-root.xlsx` / `-planning.xlsx` 覆盖回去。

## 2026-11-10 11:36 F05a 修正：色条下移、默认灰色、窗口内可设

### 改了什么
- `native/overlay.ps1` 卡片条目的优先级色条：从「左侧 3px 竖条」改为「底部 3px 横条」，不再压住第一列文字；未设优先级的条目显示浅灰条（alpha 60），不再只有个别条目有线。
- `Show-AddTaskWindow`（约 +45 行）：新增「备注」输入框与「优先级」下拉框（不设 / P0 最高 / P1 高 / P2 中 / P3 低），编辑态按条目现有值预填；保存时把 `note`、`priority` 一并发给 `plan_add` / `plan_update`。

### 为什么
用户 m03785 反馈三点：色条挡字；只有 08:30 那条有线；用户自己没有办法给任务设线条。

### 怎么验证
- `PS parse OK`；BOM `EF BB BF`、无 CRLF；`guide_overlay restart` 成功。
- 截屏确认 08:30 条目底部是黄色横条，文字不再被盖。
- 编辑窗口的备注框与优先级下拉需要人工点「✎」确认（自动化点不到）。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.11 -- native/overlay.ps1`。
- 表：`tmp\打磨计划-before-f05a2-root.xlsx` / `-planning.xlsx` 覆盖回去。

## 2026-11-10 11:40 优先级选择改用自绘小块

### 改了什么
- `native/overlay.ps1` `Show-AddTaskWindow` 里的优先级 `ComboBox` 换成五个自绘 `Border` 小块（不设 / P0 / P1 / P2 / P3，各 44×24、深底、选中时填充对应色），事件通过 `$script:AddFrmPriValue` 回传，避免闭包变量出栈。
- 保存逻辑改用 `$script:AddFrmPriValue`，不再读 `ComboBox.SelectedIndex`。

### 为什么
用户反馈：WPF 默认下拉是白底白字，在深色窗口里看不清（截图里「P1 高」白字白底）。

### 怎么验证
- `PS parse OK`；BOM `EF BB BF`、无 CRLF；`guide_overlay restart` 成功。
- 打开编辑窗口应看到五个深色小块，选中项带颜色描边。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.12 -- native/overlay.ps1`。

## 2026-11-10 11:43 修编辑窗口打不开：Tag2 不是 WPF 属性

### 改了什么
- `native/overlay.ps1`：自绘优先级块不再把颜色塞进 `$chip.Tag2`（`Border` 没有这个属性，赋值直接抛异常，整个 `Show-AddTaskWindow` 中止）；改为 `$script:AddFrmPriColors` 哈希表按 `Tag` 取色，`$priPaint` 从哈希表读。

### 为什么
用户点「✎」后窗口完全不出现。`overlay.log` 11:39:00 / 11:39:06 三次 `edit task window failed: 在此对象上找不到属性“Tag2”。请确认该属性存在并且可设置。`

### 怎么验证
- `PS parse OK`；BOM `EF BB BF`、无 CRLF；`guide_overlay restart` 成功。
- 再点「✎」应正常弹出「改这条任务」，窗口内五个优先级小块可见。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.13 -- native/overlay.ps1`（注意 v0.22.13 本身带这个 bug）。

## 2026-11-10 11:50 T10：截图与巡检数据保留 7 天

### 改了什么
- `index.js`：`pruneShots()` 由「只留最近 20 张截图」改为「按修改时间删掉 7 天前的文件」，同时扫描 `shots\` 与 `shots\cam\`；新增常量 `SHOT_KEEP_DAYS = 7`；在 `overlay ready` 事件里调用一次（截图后仍会调用）。
- `native/overlay.ps1`：新增全局函数 `Get-ShotStorage`（统计张数/字节）与 `Clear-OldShots`（按 mtime 删 7 天前）；设置窗口新增「截图与巡检（保留 7 天）」一栏，显示「共 X 张、Y MB」，并提供「清理 7 天前的」按钮。
- `README.md` 的「数据目录」表后补一段保留策略说明。

### 为什么
T10：读屏截图与巡检照片落盘无上限，README 未写保留策略；隐私相关的数据应该自动过期、可见、可手动清。

### 怎么验证
- `node --check index.js`、`PS parse OK`、BOM `EF BB BF`、无 CRLF。
- 在 `shots\cam\` 造一个 `_t10_test_old.jpg` 并把 mtime 设为 8 天前，重载宿主后该文件被删。
- 设置窗口显示张数与 MB；点「清理 7 天前的」后数字刷新。

### 怎么恢复
- `git revert <本次提交>`，或 `git checkout v0.22.14 -- index.js native/overlay.ps1 README.md`。
- 表：`tmp\打磨计划-before-t10-root.xlsx` / `-planning.xlsx` 覆盖回去。

## 2026-11-10 11:52 修 plan 历史汇总未导出

### 改了什么
- `lib/plan.js`：`createPlan` 返回值新增 `writeHistory: writePlanHistoryFile`。
- `index.js`：启动对齐改为 `plan.writeHistory()`（原先是直接调 `writePlanHistoryFile()`）。

### 为什么
T01 拆出 `lib/plan.js` 后，该函数只存在于模块闭包里；`index.js` 仍在启动时调用它，日志报 `plan history sync failed: writePlanHistoryFile is not defined`，`plan-history.json` 一直没在启动时刷新。

### 怎么验证
- `node --check index.js`、`lib/plan.js` 通过。
- 热重载 03:50:22，日志无 `plan history sync failed`。

### 怎么恢复
- `git revert <本次提交>`。

## 2026-11-10 12:10 桌面清单支持重复任务与模板（F03）

### 改了什么
- `lib/plan.js`：新增 `normalizeRepeat`、`readRepeatRules`/`writeRepeatRules`、`repeatDue`、`materializeRepeats`、`readTemplates`/`writeTemplates`；`readPlanFile` 保留 `repeat`/`repeatRuleId`；`planForToday` 在换天和当天首次调用时铺重复任务（幂等）；`add`/`update` 支持 `repeat`；`remove` 带 `repeatRuleId` 时一并删规则；`restore` 清理已失效的规则引用；新增 `template_save`/`template_apply`/`template_list`/`template_remove`；schema 与 render 同步。
- `native/overlay.ps1`：卡片长块在时间行后显示「↻每天/工作日/每周」，短块拼进标题，ToolTip 也带上；新增/编辑窗口加「重复」四个小块。
- `index.js`：`plan_add`/`plan_update` 事件透传 `note`/`priority`/`repeat`。
- 新增数据文件：`plan-repeats.json`（重复规则）、`plan-templates.json`（模板）。

### 为什么
F03：课表之外的固定习惯（背单词、跑步、复盘）不用每天手加；常用的一天也应该能一键铺开。

### 怎么验证
- `node --check lib/plan.js`、`node --check index.js`、`PS parse OK`、BOM/LF 正常。
- 实调：加 `repeat=daily` 一条 → 清单只出现一条；把 plan.json 日期改到昨天再 list → 今天的背单词自动重铺、id 更新、done=false；`template_save 晚间` → `template_apply 晚间` 铺 2 条；测试数据已清理、plan.json 已还原。
- 截图确认卡片短块显示「↻工作日」。

### 怎么恢复
- `git revert`；删掉 `%USERPROFILE%\.dsh\guide-tutor\plan-repeats.json`、`plan-templates.json` 即回到无重复任务状态。

## 2026-11-10 12:25 清单模板改为独立窗口，可铺到指定日期（F03 续）

### 改了什么
- `lib/plan.js`：`template_save` 支持 `dayOffset`/`date`，可把某一天（今天/未来/归档）的清单存成模板，模板记录 `date`；`template_apply` 支持 `dayOffset`/`date`：当天直接并入，未来写入 `plan-later.json`，到那天第一次打开时出现；`takePlanLaterFor` 补回 `note`/`priority`/`repeat`/`repeatRuleId`（之前从 later 并入时丢字段）；新增 `dayKeyWithOffset`、`itemsForDate`；schema 加 `dayOffset`/`date`。
- `native/overlay.ps1`：卡片标题栏加「模板」入口；新增 `Show-TemplatesWindow`（约 230 行）：列出模板（名称、条数、保存日期），每行「铺到 ▾」可选今天/明天/后天，× 两次点击删除；底部输入名字「把今天存为模板」。读取 `plan-templates.json` 的 `Read-TemplatesFile`。
- `index.js`：处理 `template_save`/`template_apply`/`template_remove` 三种卡片事件。

### 为什么
用户 m04333：模板应该是「把清单某一天保存成模板」，并有一个界面展示、能在界面里设置铺到明天/后天。

### 怎么验证
- `node --check lib/plan.js`、`node --check index.js`、`PS parse OK`、BOM/LF 正常。
- 单元实验 `tmp/test_tpl.mjs`：save 记录 date=2026-11-10；apply dayOffset=1 返回 date=2026-11-11 并写 plan-later。
- 实机：点卡片「模板」打开窗口；「铺到 ▾ → 明天」写入 4 条 2026-11-11；输入名字点「把今天存为模板」新增一条；两次点 × 删除。
- 测试模板与 later 测试数据已清理。

### 怎么恢复
- `git revert`；`plan-templates.json` 与 `plan-later.json` 不受版本控制，删除/清空即可回到旧行为。

## 2026-11-10 12:35 清单历史加「今天/昨天/前天/N 天前」标识

### 改了什么
- `native/overlay.ps1`：新增 `Get-PlanDayLabel`（按当天日期算 今天/昨天/前天/2–6 天前）；`New-HistoryDayButton` 的日期行改为 Inline（日期 + 浅橙色相对标签）；左栏由 170px 扩到 205px，窗口 660→700；日期过长用 `CharacterEllipsis` 截断。
- `Show-PlanDayDetail` 详情头显示「日期（今天） 完成 2/4」。

### 为什么
用户 m04573：历史里只有日期，很难对上具体是哪天。

### 怎么验证
- `PS parse OK`、BOM/LF 正常。
- 实机打开历史窗口：2026-11-10 今天、11-09 昨天、11-08 前天、11-06 4 天前、11-05 5 天前、11-04 6 天前；日期、标签、完成数都完整。

### 怎么恢复
- `git revert` 即可。

## 2026-11-10 12:42 清单条目底部的优先级线不再压字（B33）

### 改了什么
- `native/overlay.ps1`：条目内容按块高留出底部间距（`min(6, max(2, rowH - 15))`）；短块（`rowH < 46`）的优先级线改成 1.5px、底边距 1px，长块保持 2px/2px。

### 为什么
用户 m04779：截图里「吃饭」这类 25 分钟的短块，底部灰线贴在文字下沿，看起来像压字。

### 怎么验证
- `PS parse OK`、BOM/LF 正常。
- 重启后截屏放大确认：10:30「吃饭」的线在文字下方、贴块底，不再压字；08:30 长块底部黄条位置不变。

### 怎么恢复
- `git revert`。

## 2026-11-10 12:45 清单标题栏日期与按钮不再挤在一起（B34）

### 改了什么
- `native/overlay.ps1`：标题栏日期去掉年份，只显示 `MM-dd · 完成/总数`；日期 TextBlock 加 `NoWrap`、`CharacterEllipsis`、`MaxWidth=130`，空间不够时省略而不是压到右侧按钮。

### 为什么
用户 m04881：截图里「3/4」的「4」被「＋」压住，标题栏在加「模板」按钮后变挤。

### 怎么验证
- `PS parse OK`、BOM/LF 正常。
- 重启后截屏放大：标题栏显示「今日清单 11-10 · 3/4 ＋ 模板 ⚙ ✕」，各元素不重叠。

### 怎么恢复
- `git revert`。

## 2026-11-10 13:10 清单条目拖拽改时间（F02）

### 改了什么
- `native/overlay.ps1`：新增拖拽函数块（`Get-CardDragMinute` / `Clear-CardDrag` / `Set-CardDragLift` / `Begin-CardDrag` / `Settle-CardDrag` / `Update-CardDragBadge` / `Start-CardDragTimer` / `Start-CardDrag` / `Update-CardDrag` / `Finish-CardDrag`）；卡片外层加 `Canvas` 拖影层（`$script:CardDragLayer`）；条目绑定 `PreviewMouseLeftButtonDown` / `PreviewMouseMove` / `PreviewMouseLeftButtonUp` / `LostMouseCapture`；拖动期间 `Update-Card` 直接返回，不重建条目；松手按 5 分钟吸附并只发一次 `plan_update`。
- 动效：移动超过 4px 才进入拖拽（4px 内仍算点击打勾）；条目托起为 1.045 倍、阴影 blur 0→18 / opacity 0→0.5（150ms CubicEaseOut）；拖影用 `VisualBrush` 复制条目、16ms 定时器 + 0.45 阻尼跟随；鼠标停 180ms 触发「落定」（缩放回到 1.0、阴影减弱），再动恢复浮起；松手后 160ms 滑到吸附位置再消失；拖动中显示「目标时间」徽标；离上下边缘 28px 自动滚动。
- `index.js`：`plan_update` 事件补传 `note` / `priority` / `repeat`，拖拽改时间时备注、优先级、重复标记不会丢。

### 为什么
F02：在卡片上按住条目上下拖，比点 ✎ 弹窗快得多；用户（m04947）要求必须有「被托起来」的动画、拖动特效和拖动中突然停下的处理。

### 怎么验证
- `PS parse OK`、BOM `EF BB BF`、LF 正常；`guide_overlay restart` 后实机拖动：
  - 14:00–15:40「调试插件」拖到 16:00 附近 → `overlay.log` 出现 `card drag update: tmwa0clo4 -> 16:00-17:40`，`plan.json` 更新为 16:00–17:40，备注「大学英语不去了…」保留；
  - 拖动中截屏可见目标时间徽标与拖影；测试后已把条目改回 14:00–15:40。
- 另测：4px 内松开仍走打勾；拖到卡片下沿会自动滚动。

### 怎么恢复
- `git revert` 本次提交；拖拽代码集中在 `# --- 条目拖拽（F02）` 到 `function New-CardWindow {` 之间，删除该块并把 `$outer` / `$dragLayer` 换回 `$root.Child = $stack` 即可回到无拖拽状态。

## 2026-11-10 13:11 F02 拖拽修正：占位透明度、放下动画

### 改了什么
- `native/overlay.ps1`：拖动时原位占位透明度 `0.22` → `0.5`（用户 m05272「透明度太高了」）；松手后增加第二段「放下」动画：落位 160ms 结束后，拖影 130ms 内缩小回 1.0 并淡出到 0，淡出完成才发 `plan_update` 并清理。
- 抽出 `Complete-CardDragDrop`，事件发送与清理集中一处。

### 为什么
原位太淡，拖起来时看不清哪条被拿走了；松手时影子直接消失，没有「放下」的感觉。

### 怎么验证
- `PS parse OK`、BOM `EF BB BF`、LF 正常；`guide_overlay restart` 无报错。
- 实机拖动 14:00–15:40 → 14:50–16:30：`overlay.log` 记 `card drag update: tmwa0clo4 -> 14:50-16:30`，`plan.json` 同步；拖动中截屏能看到原位半透明占位与拖影两层。
- 测试后条目已改回 14:00–15:40。

### 怎么恢复
- `git revert` 本次提交；把 `$body.Opacity` 改回 `0.22`、删掉 `$anim` 的第二段即可回到上一版。

## 2026-11-10 13:35 F02 拖拽重做：只拖原块，松手压扁回弹

### 改了什么
- `native/overlay.ps1` 拖拽段整体重写：去掉 VisualBrush 拖影层，改为直接给原条目加 `TransformGroup`（`ScaleTransform` + `TranslateTransform`），按住后条目自己跟手走。
- `Get-CardDragMinute` 的基准改为 `$script:CardDragBaseY`（初始位置），不再用 `TranslatePoint` 读会被变换改掉的坐标。
- `Finish-CardDrag`：松手后 `TranslateTransform.Y` 用 230ms `CubicEaseOut` 滑到新行；`Completed` 后 140ms 压扁到 `ScaleY 0.92`、330ms 回弹到 1.0（`BackEase`），结束才发 `plan_update` 并重建。
- 拖动期间 `Update-Card` 继续 early return；timer 只负责边缘自动滚动、停手 180ms 的浮起收势与时间徽标，不再改位置。

### 为什么
用户看到的「两个虚影」是跟手拖影 + 原位半透明占位；松手后拖影被清掉、原位块被重建，视觉上就是「一瞬间掉下去」。改成只动原块后，屏幕上始终只有一块。

### 怎么验证
- `PS parse OK`、BOM `EF BB BF`、LF 正常；`guide_overlay restart` 无报错。
- 实机拖动 14:00–15:40 → 15:15–16:55：`drag start` / `drag begin` / `drag land: from=557 target=557 min=915` / `card drag update: tmwa0clo4 -> 15:15-16:55`；拖动中截屏只有一个块跟手，原位留空，不再有第二个虚影。
- 测试后已改回 14:00–15:40 并撤销误置的完成状态。

### 怎么恢复
- `git revert` 本次提交；或从 `103af57` 取回上一版 `native/overlay.ps1`。

## 2026-11-10 13:40 F02 拖拽落位：修两个导致跳变的点

### 改了什么
- `native/overlay.ps1`：
  - 拖动期间关闭边缘自动滚动——滚动会改变 ScrollViewer 偏移，重建后条目按新偏移落位，与手里看到的位置对不上，就成了跳变。
  - `CardDragPx` 改为直接用布局的 `$script:CardPxPerMin`，不再用「条目高度 / 时长」反推（短条目有最小高度，反推会偏）。
  - `Clear-CardDrag` 加 `-restore` 参数；`Complete-CardDragDrop` 传 `$false`，落下后不复原 `RenderTransform`，避免重建前旧条目闪回原位。

### 为什么
用户反馈「上一帧在别处、下一帧直接到另一个位置」：位移本身没错，是重建时参照的坐标和拖动时不一致。

### 怎么验证
- `PS parse OK`、BOM `EF BB BF`、LF 正常；`guide_overlay restart` 无报错。
- 实机拖动 14:00–15:40 → 15:05–16:45：`drag land: from=556 target=557`；逐帧截图（拖动末帧 / 松手 150ms / 400ms / 900ms）条目顶部位置一致，没有跳回原位或跳到别处。
- 测试后已恢复 14:00–15:40 与未完成状态。

### 怎么恢复
- `git revert` 本次提交；或回退到 `928405e`。

## 2026-11-10 13:50 F02 落位改成「重建后滑入」，动画终点就是布局位置

### 改了什么
- `native/overlay.ps1`：
  - `Finish-CardDrag` 不再自己演 230ms 滑行 + 压扁；只记 `$script:CardDropHint = @{ id; fromY }`（松手时的视觉位置），随即发 `plan_update`。
  - `Update-Card` 末尾：重建完成后按 hint 找到新条目，用它当前的真实布局位置算偏移，先 `RenderTransform` 偏到松手位置，再 220ms 滑回 0；同时 110ms 压扁到 0.94、260ms 回弹。
  - 落点与松手位置重合（差 <1px）时，从上方 8px 落下，保留「放下」观感，终点仍为布局位置。
- `$script:CardBodyById` 记录每轮重建的条目对象，供 hint 查找。

### 为什么
用户反馈「动画播放完后还有一次跳跃」：之前动画演在旧条目上，终点是按分钟数算的近似位置；重建后条目按布局重新排版，两者差几像素就跳。现在动画演在重建后的新条目上，终点就是它的布局位置。

### 怎么验证
- `PS parse OK`、BOM `EF BB BF`、LF 正常；`guide_overlay restart` 无报错。
- 实机拖动 14:00–15:40 → 15:05–16:45：`drag land: from=552 target=553` 后 2ms 即 `card drag update`；逐帧截图（松手 70/150/350/850ms）新条目从松手位置滑到 15:05 行后停住，没有二次跳跃。
- 测试后已恢复 14:00–15:40 与未完成状态。

### 怎么恢复
- `git revert` 本次提交；或回退到 `fcc1f70`。

## 2026-11-10 13:57 F02 松手卡顿：本地乐观更新，不等宿主往返

### 改了什么
- `native/overlay.ps1` `Complete-CardDragDrop`：发 `plan_update` 之前，先在 `$script:LastState` 里把该条目的 `from`/`to` 改成本次拖拽结果，置 `$script:CardDragActive = $false`，直接 `Update-Card $script:LastState` 重建；随后再发事件给宿主。宿主返回的新 state 到货时再正常重建一次。

### 为什么
松手后原本要等宿主写盘 + 广播 + overlay 重建，约 200–300ms，这段时间条目不动，形成「抬起后卡一下才落下」。本地先改再重建，把等待压到重建本身。

### 怎么验证
- `PS parse OK`、BOM `EF BB BF`、LF 正常；`guide_overlay restart` 无报错。
- 实机拖动 14:00–15:40 → 15:05–16:45：`drag land` 到 `card drag update` 的间隔由原来约 2ms（但重建在之后异步发生）变为 71ms（重建已同步完成）；逐帧截图（50/120/300ms）显示新条目在松手后 120ms 已带新时间滑入，不再停住等待。
- 测试后已恢复 14:00–15:40 与未完成状态。

### 怎么恢复
- `git revert` 本次提交。

## 2026-11-10 16:18 同步 U 盘副本到 v0.22.26

### 改了什么
- `E:\dsh插件\guide-tutor` 从 **0.21.0** 更新到 **0.22.26**；旧目录改名为 `E:\dsh插件\guide-tutor.old-20261110`（可整目录回退）。
- `robocopy` 全量覆盖：418 文件 / 134.63 MB，0 失败；排除 `.git`、`tmp`、`node_modules`、`__pycache__`。
- 新增内容随包带上：`lib/` 9 个模块（log/state/video/kb/focus/camera/edict/plan/plan-parse）、`tools/` 3 个脚本（probe-subtitle.cjs、smoke-plan.mjs、smoke-video.mjs）、`planning/` 三件套（打磨表 xlsx/md + 生成脚本）、`models/` 14 文件。

### 为什么
用户要求把 U 盘上的插件版本更新到当前版本，方便换机/备份。

### 怎么验证
- `package.json` 版本 `0.22.26`；`index.js` 111,377 B。
- `models`：本地与 U 盘均 14 文件 / 83,407,459 B，一致。
- `native` 8 文件、`tools` 3 文件、`lib` 9 文件、`planning\打磨计划-2026-11.xlsx` 存在。
- `robocopy` 退出码 1（有文件复制，非错误）；Files 418 Copied 418 FAILED 0。

### 怎么恢复
- 退回上一版：删掉 `E:\dsh插件\guide-tutor`，把 `E:\dsh插件\guide-tutor.old-20261110` 改回 `guide-tutor`。
- 更早的 0.6.0：`E:\dsh插件\guide-tutor.old-20261109`。

## 2026-11-11 13:07 修 guide_plan auto 报 todayClassesText is not defined

### 改了什么
- `lib/plan.js`：在 `createPlan` 内补 `todayClassesText(now)`（与 `lib/edict.js` 里同名实现一致：读 `timetable.json`、按星期过滤 `active`、算出「已上 N 节，接下来：…」）。约 +14 行。

### 为什么
T01 拆 `lib/plan.js` 时，`plan.js` 里两处引用了 `todayClassesText`（提示词与 `auto` 分支），但该函数当时留在了 `lib/edict.js` 内部、没有注入，于是 `guide_plan action=auto` 直接抛 `todayClassesText is not defined`。

### 怎么验证
- `node --check lib/plan.js` 通过。
- 改 `cordis.patch.yml` 的 `reload:` 行触发热重载，13:05:54 `guide-tutor ready`，`overlay ready (pid 273488)`。
- `guide_plan auto` 返回「现在是 13:06 / 课表：已上 2 节，接下来：15:50 大学体育@排球场1」，不再报错；随后按提示补了 10:20 数据采集技术、15:50 大学体育两条。

### 怎么恢复
- `git revert` 本次提交；删掉 `lib/plan.js` 里的 `todayClassesText` 即可回到报错状态。

## 2026-11-11 13:20 F10 标注层：步骤编号 + 完成后淡出

### 改了什么
- `native/overlay.ps1` `Update-Annots`：
  - 新增 `Add-SeqBadge`：每个非文字标注左上角画 22px 圆标，依次为 ①②③…（rect/circle 取 `x,y`，arrow 取 `x1,y1`，spotlight 取 `x,y`）。
  - 标注被清空时不再瞬间 `Children.Clear()`：先 300ms `DoubleAnimation` 把画布透明度降到 0（CubicEaseIn），320ms 后真正清空并复位；淡出期间若来了新标注，取消动画、恢复不透明。
- 未做：箭头沿线流动（保留到 F10 的后续）。

### 为什么
F10：静态箭头容易看漏，编号让「先点哪」更明确；`guide_finish` 直接清标注太突兀，加 0.3 秒淡出收尾。

### 怎么验证
- `PS parse OK`、BOM `EF BB BF`、LF 正常；`guide_overlay restart` 无报错。
- `guide_teach` 画 rect + arrow：截屏可见矩形左上角 ①、箭头起点 ②，标签位置正常。
- 传 `annots: []` 后，约 420ms 截屏标注已完全消失，面板保留。

### 怎么恢复
- `git revert`；删掉 `Add-SeqBadge` 与 `Update-Annots` 里的淡出分支即回到原样。

## 2026-11-11 13:46 面板组件化第一批（token / 按钮 / 投影 / 滑入）

### 改了什么
- `native/overlay.ps1` 新增设计系统 `$script:G`：背景、卡片、分割线、三级文字、主色、危险/成功/警告色，以及圆角（窗口 16 / 卡片 10 / 按钮 8）与字号（14/12/11）。以后调色只改这一处。
- 新增组件：`New-GTextButton`（圆角透明底、hover 120ms 淡入浅底、按下缩到 0.96）、`New-GPrimaryButton`（实心蓝、hover 变亮、按下压扁）、`Add-GShadow`（柔和外投影）。
- 面板标题栏 6 个文字按钮（记录 / 清单 / 历史 / 目标 / 复制 / 收起）全部换成 `New-GTextButton`；「下一步」换成 `New-GPrimaryButton`。
- 面板根容器 `$outer` 与底部工具条 `$bottom`：圆角改用 token、描边降到 34 透明度、加 `DropShadowEffect`，并留出 margin（右 6、下 12）避免阴影被窗口边界裁掉。
- 新增 `Show-PanelIntro`：从「小球」切到「面板」时 170ms 淡入 + 16px 从右滑入；只在模式切换时播一次，不在 tick 里重复。
- 标题 `MinWidth=84`，按钮内边距从 8,4 收到 5,2，避免标题被挤没。

### 为什么
用户要求「第二档：组件化 + 动效」。这批先把样式集中、按钮统一、面板有浮起感和入场动画，不改任何业务逻辑。

### 怎么验证
- `Parser::ParseFile` 输出 `PS parse OK`（BOM 已补，字节 `EF BB BF`）。
- `guide_overlay restart` 成功；`CopyFromScreen` 截图确认：标题栏按钮有间距与圆角、面板右下有柔和投影、下一步是整行蓝底圆角按钮。
- 已知未解决：标题栏按钮仍多、长标题会被省略；步骤区第三步会被「下一步」按钮压住（原有布局问题）；面板与卡片同时显示时会重叠（取决于卡片被拖到哪）。

### 怎么恢复
- `git revert` 本次提交；`$script:G`、三个组件函数、`Show-PanelIntro` 可整段删除，按钮换回原来的 `TextBlock` 写法。

## 2026-11-11 13:54 统一窗口外壳：无边框圆角 + 自绘标题栏（第二档第二批）

### 改了什么
- 新增 `New-GWindow([string]$Caption, [double]$Width, [double]$Height, [switch]$NoBar)`：无边框窗口 + 圆角 16 + 深色底 `$script:G.Card` + 1px 描边 + 柔和投影；自绘标题栏可拖动（`DragMove()`），右上角 ✕ 关闭；`-NoBar` 用于自身已画标题的窗口。
- 接入 6 个窗口：历史（`Show-PlanHistoryWindow`）、聊天记录（`Show-ChatLogWindow`）、目标（`Show-GoalsWindow`）、模板（`Show-TemplatesWindow`）、设置（`Show-SettingsWindow`）、加任务（`Show-AddTaskWindow`）。原来都是系统标题栏 + 直角边框。
- 面板入场动画防闪：`panel` 模式切换时先把 `$script:PanelOuter.Opacity` 置 0 再 `Show()`，避免 Show 到 BeginAnimation 之间有一帧全不透明。

### 为什么
用户反馈「窗口边框全都是这种太难看了」，且点击小球回到面板时动画像闪一下。统一样式后所有弹窗和面板是一套视觉。

### 怎么验证
- `Parser::ParseFile` 输出 `PS parse OK`（BOM `EF BB BF`）。
- `guide_overlay restart` 成功；点「历史」「目标」实测：窗口无系统标题栏、圆角 16、深色不透明底、右下投影，标题与 ✕ 自绘，内容排版不变。
- 设置/模板/加任务同样接入，逻辑未改。

### 怎么恢复
- `git revert`；把各窗口恢复成 `[System.Windows.Window]::new()` + 系统标题栏即可，`New-GWindow` 可整段删除。

### 附带修复
- `New-GWindow` 参数原名 `$Title` 与函数内 `$title`（TextBlock）在 PowerShell 里大小写不敏感、实为同一变量，导致 `$title.Text = $Title` 报「找不到属性 Text」；参数改名为 `$Caption`。

## 2026-11-11 13:56 修窗口 ✕ 点不关

### 改了什么
- `native/overlay.ps1` `New-GWindow`：✕ 按钮增加 `PreviewMouseLeftButtonDown` 并 `$e.Handled = $true`；关闭回调加日志（`gwin close clicked` / `gwin close failed: …`）。

### 为什么
标题栏整条是拖动区：在 ✕ 上按下时，`MouseLeftButtonDown` 冒泡到标题栏触发了 `DragMove()`，鼠标被拖动逻辑捕获，✕ 收不到 `MouseUp`，所以点 ✕ 没反应。

### 怎么验证
- `PS parse OK`、BOM/LF 正常；`guide_overlay restart`。
- 点「历史」打开窗口 → 点右上角 ✕ → `overlay.log` 出现 `gwin close clicked`，窗口立即消失（截图确认）。

### 怎么恢复
- `git revert`；删掉 ✕ 上那两行 `PreviewMouseLeftButtonDown` 即回到「点不关」的旧行为。

## 2026-11-11 14:12 双击时间轴空档直接加任务

### 改了什么
- `native/overlay.ps1` 卡片空档行：`$line`（那条横线）加 `Background = Transparent`、`Tag = 该行开始时间`、`MouseLeftButtonDown`（`ClickCount == 2` 时打开 `Show-AddTaskWindow -DefaultFrom <该行时间>`），并加诊断用日志 `gap line double click: HH:mm`。
- 同时给空档行（`$gapRow`）设透明背景与同样的双击处理，避免点在行内空白处无效。

### 为什么
F-card：排计划时最常见的是「空着的那一截」直接补一条，比先找＋再填时间快；地点可以之后再改。

### 怎么验证
- `PS parse OK`、BOM/LF 正常；`guide_overlay restart`。
- 实机把鼠标放到 12:30 空档行上双击：`overlay.log` 记 `gap line double click: 12:30`，「加一条任务」窗口打开，开始 12:30、结束 12:55，地点为空，可直接填标题后保存。

### 怎么恢复
- `git revert`；删掉 `$line` 上的透明度/双击处理与 `$gapRow` 的两行即可回到只有右侧「＋」的旧行为。

## 2026-11-11 14:15 双击空档改为原地输入（替代弹窗）

### 改了什么
- `native/overlay.ps1` 新增 `Stop-GapInlineEdit` 与 `Start-GapInlineEdit($GapRow, $Line, $When)`：
  - 双击横线时把该行的横线 `Collapsed`，在同一列插入一个 `TextBox`（深色底、1px 蓝描边、白字、白光标），`Dispatcher.BeginInvoke` 里聚焦。
  - 回车保存、Esc 取消；失焦且有文字也保存（空文字视为取消）。
  - 保存发 `plan_add`：`from` 取该行时间，`to` 自动 +25 分钟，`place` 留空。
- 空档行不再走 `Show-AddTaskWindow` 弹窗（上一版 0.22.32 的做法）。
- 移除输入框的默认 ToolTip（白底与深色面板冲突）。

### 为什么
用户 m07018：「我要的是这个东西直接变成可输入的样子」——双击后应原地出现输入框，而不是再弹一个表单窗口。

### 怎么验证
- `PS parse OK`、BOM/LF 正常；`guide_overlay restart`。
- 实机双击 12:30 横线：该行出现蓝边输入框；输入「颜色检查」回车后，`overlay.log` 记 `inline add: 12:30-12:55 颜色检查`，`plan.json` 新增 `12:30–12:55 颜色检查`，地点为空；截图确认输入框样式。
- 测试条目已删除。

### 怎么恢复
- `git revert`；把双击处理换回 `Show-AddTaskWindow -DefaultFrom $when` 即回到弹窗版。

## 2026-11-11 18:45 知识库加搜索（F12 前半）

### 改了什么
- `lib/kb.js`：新增 `kbSearch(query)`——按空格拆多词，同一行同时包含全部词才算命中；`.md` 直接读文本，`.docx` 用 `docxExtract` 抽文本；每个文件最多 4 条片段，片段带行号、截到 160 字。
- `guide_kb`：`action` 增加 `search`，新增 `query` 参数；description 与 `kbSummary` 同步（无结果时提示共搜了多少个文件）。

### 为什么
F12：知识库文件多了以后「找得到」比「存得下」更重要；之前只能 `list` 文件名，没法搜内容。

### 怎么验证
- `node --check lib/kb.js` 通过；改 `cordis.patch.yml` 的 `reload:` 触发热重载，18:44:51 `ready`。
- 实调 `guide_kb search 实验` → 2 个文件命中（含 `.docx` 抽取结果与行号）；`Linux 实验` → 1 个文件、同一行同时含两词；`不存在的关键词xyz` → 0 命中，提示共搜 6 个文件。

### 怎么恢复
- `git revert`；删掉 `kbSearch` 与 schema 里的 `search` 即回到只能 list/read/save/delete 的版本。

## 2026-11-11 18:53 面板入场动画放慢、减少首帧卡顿

### 改了什么
- `native/overlay.ps1` `Show-PanelIntro`：淡入 170ms → 320ms、右滑 190ms → 380ms、位移 16px → 10px；动画开始前调用 `$el.UpdateLayout()`，先把布局跑完再起动画。

### 为什么
用户反馈：点开小球后面板淡入「卡顿而且太快」。卡顿多半是窗口 Show 后的首帧布局重建和动画抢帧；时长也确实偏短，观感是「一下跳出来」。

### 怎么验证
- `PS parse OK`、BOM/LF 正常；`guide_overlay restart` 后 `overlay.log` 只有正常的 `overlay started`，无异常。
- 实机点球展开面板，淡入与右滑明显变缓；若仍卡，下一步再关掉位移只保留淡入。

### 怎么恢复
- `git revert`；把时长改回 170/190、位移改回 16、删掉 `UpdateLayout()` 即回到旧观感。

## 2026-11-11 19:02 球→面板切换：先隐藏球再淡入面板

### 改了什么
- `native/overlay.ps1` `Apply-State` 的 `switch ($mode)`：
  - `panel` 分支不再先 Show 面板再慢慢淡入；球立即 `Hide()`，同一帧收起面板到 0 再 `Show()`，交给 `Show-PanelIntro` 做 320ms 淡入 + 10px 右滑。
  - `ball` 分支恢复面板隐藏、球显示；球根元素 `$script:BallRoot` 的 `Opacity` 复位，避免上次残留透明。
  - 删掉未生效的 `Play-BallExit` 调用与 `PanelEnterTimer` 延迟显示（DispatcherTimer 在脚本块里的 Tick 不可靠）。
- 新增 `$script:BallRoot = $grid`（球的窗口内容），供以后做内容级动画用。

### 为什么
用户反馈「点小球后消失然后 UI 出现」的过渡不连贯、有卡帧。根因是球和面板是两个独立窗口，切换时球要等动画结束才藏、面板又延迟显示，中间出现空档。

### 怎么验证
- `PS parse OK`、BOM/LF 正常；`guide_overlay restart` 后日志 `mode=panel ... ball=False panel=True`，说明球已隐藏、面板同帧显示。
- 抓帧（50/130/250/420ms）：球在首帧内消失，面板从 0 开始淡入，420ms 内完成。

### 怎么恢复
- `git revert`；把 `panel` 分支改回「先 Play-BallExit 再延迟 Show」即可。

## 2026-11-11 19:10 对话记录支持单条重播

### 改了什么
- `native/overlay.ps1` `Show-ChatLogWindow`：从只读 TextBox 改成可滚动卡片列表（640×540）。每条显示「时间 · 角色·来源 + 正文」，AI 播报类条目右侧带「▶ 重播」按钮（`New-GTextButton`），点击发 `Send-OverlayEvent @{ type='replay_say'; text=... }`，并写日志 `replay clicked: N chars`。
- `index.js`：`handleEvent` 新增 `case 'replay_say'`，调 `speakText(text, { silent: true })`；`speakText` 增加 `options.silent`，重播时不重复写 `chatlog.json`。
- 顺手修 `index.js` 一处：`speakText` 的 `recordChat` 受 `silent` 控制。

### 为什么
用户注意力不在电脑上时容易听漏播报，需要在对话记录里点一条重听，而不是让我重新说一遍。

### 怎么验证
- `PS parse OK`、`node --check index.js`、BOM/LF 正常；`guide_overlay restart` + 改 `cordis.patch.yml` 的 `reload:` 行热重载（19:06:08 disposed → ready）。
- 实机：打开「记录」→ 点第一条「▶ 重播」→ `overlay.log` 记 `replay clicked: 131 chars`，`plugin.log` 记 `replay: 131 字 …` 与 `speak queue (5 句，131 字，约 49 秒)`，TTS 缓存命中直接出声。

### 怎么恢复
- `git revert`；把 `Show-ChatLogWindow` 换回 TextBox、删掉 `case 'replay_say'` 即可。

## 2026-11-11 19:20 交接文档更新到 0.22.37

### 改了什么
- `HANDOFF.md`：头部版本 0.22.10 → 0.22.37、日期改为 2026-11-11 19:20；
- 第二节「这一版有什么」表格补：面板组件化与过渡、`New-GWindow` 窗口外壳、清单双击空档原地输入、对话记录重播、知识库搜索；
- 第三节改为「2026-11-09 至 11-11」，从 4 条扩到 11 条（补 F02 拖拽、F03 重复任务/模板、第二档美化、知识库搜索、球→面板切换、重播）；
- 第四节待办补 F12b（版本回滚）、F10b（箭头流光）与「下一步」卡死 bug 的位置和建议修法；
- 第六节「踩过的坑」补 4 条：`$script:G.*` 是画刷、别用 python 批量改 `overlay.ps1`、DispatcherTimer 不可靠、`ShowActivated=false` 收不到点击。

### 为什么
用户结束这一轮会话，交接文档要能直接反映 0.22.37 的状态，避免下个会话按 0.21.0/0.22.10 的旧信息操作。

### 怎么验证
- `git diff --stat` 显示只改 `HANDOFF.md`；文件首行仍是 `# 交接说明（HANDOFF）`，换行为 LF。
- 抽查第二节表格与 `package.json` 版本一致（0.22.37）。

### 怎么恢复
- `git revert` 本次提交即可回到上一版交接文档。

## 2026-11-11 19:30 状态页装成桌面应用（PWA）：一个图标一个窗口

### 改了什么
- `index.js`：状态页 `<head>` 加 3 行：`<link rel="manifest" href="/manifest.webmanifest">`、`<link rel="icon" href="/icon-192.png">`、`<meta name="theme-color" content="#14181f">`（`index.js:2376` 附近）；
- `index.js` `apiHandler`（`index.js:2502`）新增 3 个 GET 分支：`/manifest.webmanifest` 返回 PWA 清单（`standalone`、192/512 图标）、`/icon-192.png` 与 `/icon-512.png` 从 `assets/` 读文件返回（1 天缓存，找不到回 404）；
- 新增 `assets/icon-192.png`（7,120 B）、`assets/icon-512.png`（19,553 B）：用 Edge headless 把 `icon.svg` 渲染成透明底 PNG；
- 新增 `assets/guide-tutor.ico`（35,063 B）：Pillow 从 512 PNG 生成 16/32/48/64/128/256 多尺寸，留给快捷方式用；
- `README.md` 新增「装成桌面应用（PWA）」一节（安装步骤 + 端口漂移提醒）；
- `package.json` `files` 加 `"assets"`，打包时带上图标。

### 为什么
用户要「点任务栏图标 → 打开一个独立窗口显示插件页面」，跟浏览器图标一个体验。状态页 `http://127.0.0.1:41999/` 本来就有，缺的只是 manifest 和图标；补齐后 Edge/Chrome 能「安装此站点为应用」，任务栏出插件自己的图标、窗口无地址栏。

### 怎么验证
- `node --check index.js` 通过（EXIT 0）；
- `assets/icon-512.png` 512×512、RGBA、四角 alpha=0（Pillow 检查），`read_image` 目视图标正常；
- 实机：`cordis.patch.yml` 的 touch 行改过也没触发重载（等 18 秒仍 404），确认宿主代码必须**重启 DSH 应用**才生效——重启后 `curl http://127.0.0.1:41999/manifest.webmanifest` 应返回 JSON；Edge 打开状态页，地址栏出现「安装此站点为应用」。touch 行已改回原值。

### 怎么恢复
- `git revert` 本次提交；或删掉 `apiHandler` 里 3 个分支与 `<head>` 的 3 行、删 `assets/` 目录，状态页恢复成纯网页。

## 2026-11-11 19:33 修复状态页脚本语法错误（"连接中…"的根因）

### 改了什么
- index.js:2439：ar API = location.pathname.replace(/\/+$/, ''); 改为 ar API = location.pathname.replace(/[/]+$/, '');（1 行）。
- 根因：DASHBOARD_HTML 是模板字符串，源码里的 \/ 会被 JS 转义成 /，浏览器收到的内联脚本变成 
eplace(//+$/, '')——// 是注释开头，整行剩余部分被吞，Chrome 报 Uncaught SyntaxError: missing ) after argument list（第 70 行 57 列），整个 <script> 不执行。

### 为什么
用户重启 DSH 后打开 http://127.0.0.1:41999/ 一直显示「连接中…」。用 headless Edge 加载页面并注入 window.onerror 复现出上述语法错误；DOM dump 里 #ov 仍是「—」、/status 的 clients=0，确认页面脚本从未执行。这是状态页一直存在的旧 bug（SSE、按钮、滑杆因此全都没工作过），与本次 PWA 改动无关。

### 怎么验证
- 复现（修复前）：headless Edge + 注入 onerror，得到 ERR 70:57 Uncaught SyntaxError: missing ) after argument list；curl /status 的 clients 为 0。
- 修复后需重启 DSH（宿主代码无热重载）；重启后 curl http://127.0.0.1:41999/ 应含 
eplace(/[/]+$/, '')，浏览器页面应显示「实时连接」。

### 怎么恢复
- 把 index.js:2439 改回 
eplace(/\/+$/, '') 即回到故障状态（不建议）；回退整个 PWA 改动见上一条。

## 2026-11-12 16:45 修排程唤醒失败：DSH 没开对话时 5 分钟后重试

### 改了什么

- `lib/plan.js:306`：`planState` 初始值由 `{ buildPromptedFor: '' }` 扩为 `{ buildPromptedFor: '', buildAttemptAt: '', buildFailedNoteFor: '' }`（新增 2 个字段）。
- `lib/plan.js:545-568`（`planTick` 排程段）：重写「今天还没清单就叫一次」的逻辑——
  - 旧：先把 `planState.buildPromptedFor = today` 写死，再 `wakePlan(...)`，失败只记一条 daylog，当天不再重试；
  - 新：先记 `buildAttemptAt`，`wakePlan` **成功才**写 `buildPromptedFor`；失败时 5 分钟内不重试（按 `buildAttemptAt` 节流），失败只记一次 daylog（`buildFailedNoteFor` 去重），之后每 5 分钟重试直到成功。
- `C:\Users\<User>\.dsh\guide-tutor\plan-state.json`：把今天写死的 `"buildPromptedFor": "2026-11-12"` 清空为 `""`，并补两个新字段空值，让重启后今天能重新尝试排程。

### 为什么

2026-11-12 16:33 插件启动时，DSH 里还没有打开的对话，`ctx.agents.roots()` 为空，`pickAgent()` 返回 null，日志 `[2026-11-12T08:33:02.305Z] plan wake: no agent`。旧代码在 wake 之前就把 `buildPromptedFor` 写成今天，于是当天再也不会重试，用户 16:33 发消息后清单也一直空着（daylog 里那条「计划排程没叫起来」就是这么来的）。

### 怎么验证

- `node --check lib/plan.js` → EXIT 0；`node --check index.js` → EXIT 0（用 `D:\deepseekHarness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe`）。
- 重启 DSH 后看 `plugin.log`：应出现 `followup delivered to agent ...` 或计划排程相关的成功投递；`daylog-2026-11-12.jsonl` 不应再新增「计划排程没叫起来」。
- HTTP `GET /api/guide-tutor/journal?date=2026-11-12` 可查当天流水。

### 怎么恢复

- `git revert` 本次提交；或把 `lib/plan.js` 的排程段改回旧写法（先写 `buildPromptedFor` 再 `wakePlan`），`planState` 恢复 `{ buildPromptedFor: '' }`。
- `plan-state.json` 是运行时数据：删掉文件会按默认值重建（当天会重新尝试排程）。
- 本次只改代码与运行时状态，未动 `plan.json` 里的清单条目。

## 2026-11-12 23:05 准备开源：抹掉仓库里的私人信息

### 改了什么

- 全文替换私人信息为占位符（`tmp/scrub-privacy.mjs` 脚本，脚本本身在 `tmp/`，被 .gitignore 忽略、不提交）：
  - Windows 用户名（`C:\Users\<User> 后面那段）→ `<User>`，零散出现的地方一并替换；
  - 真实姓名 → `<姓名>`；学号 → `<学号>`；
  - 班级 → `<班级>`。
- 受影响文件：`CHANGELOG.md`（11 处）、`HANDOFF.md`（8 处）、`tools/probe-subtitle.cjs`（1 处，硬编码的数据目录）。
- 新增 `assets/`（PWA 图标三件套）与 README 的 PWA 一节随后一并提交。
- 用 `git filter-repo --replace-text` 重写全部 59 个提交与 29 个 tag 的历史文本，让历史里也不再出现上述词；改写前用 `git bundle create tmp/pre-github-backup.bundle --all` 留了完整备份（700 KB，在 `tmp/` 下，不入库）。

### 为什么

要上传到公开仓库 `dsh-guide-tutor`。只清洗工作区不够——公开的是整个提交历史，旧提交里的姓名、学号、Windows 用户名同样会被人看到，所以历史也重写。

### 怎么验证

- 工作区残留检查：用 `tmp/privacy-rules.txt` 里那四个词分别跑 `git grep`，无输出（exit 1）。
- 历史检查：`git log --all -p | Select-String` 同样四个词，无匹配。
- 替换样例：`HANDOFF.md:13` 变成 `- 用户：<姓名>，<学号>，<班级>；课表 C:\Users\<User>\.dsh\guide-tutor\timetable.json`。

### 怎么恢复

- 历史回滚：`git bundle unbundle tmp/pre-github-backup.bundle` 或 `git fetch tmp/pre-github-backup.bundle 'refs/*:refs/backup/*'` 后重置。
- 工作区回滚：`git revert` 对应提交；或把占位符改回原文（原文可从备份 bundle 里找回）。
- `tmp/scrub-privacy.mjs` 与 `tmp/privacy-rules.txt` 留着，下次需要清洗别的词可复用。


## 2026-11-13 16:38 拆分管理功能：tutor 加 manage 开关，清单/专注环/指令/日记/摄像头默认关闭

**改了什么**
- `index.js`：新增 `const manage = config.manage === true`；工具注册拆成教学组（guide_screen / guide_teach / guide_kb / guide_say / guide_overlay / guide_finish + video_* 共 9 个）与管理组（guide_clock / guide_journal / guide_camera / guide_directive / guide_focus / guide_plan，仅 `manage` 为 true 时注册）。
- `index.js` 启动段：`pushPlanState` / `plan.writeHistory` 与 5 个 tick 回调（checkSchedule / camera / edict / focus / plan）全部包进 `if (manage)`；`else` 分支把残留的 `card.visible` 置 false。
- `index.js:51` 的 TUTOR_PROMPT 删掉【摄像头】一段。

**为什么**
管理功能（清单 / 番茄钟 / 专注环 / 都市指令 / 日记 / 摄像头）已迁到 `guide-coach`，tutor 要专注教学；两边同时跑会各画一张卡片抢屏幕。

**怎么验证**
`node --check index.js` EXIT 0；重启 DSH 后 tutor 的工具列表只剩 guide_screen / guide_teach / guide_say / guide_finish / guide_overlay / guide_kb + video_*，清单卡片不再出现。

**怎么恢复**
在 `cordis.patch.yml` 的 guide-tutor config 里加 `manage: true` 即可恢复管理工具；或 `git revert` 本提交。

## 2026-11-13 19:02 打磨计划加入安卓端（F32）

**改了什么**
- `planning/打磨计划-2026-11.md`：版本路线图新增 v0.25「带着走」一行（F32 + F07，3–5 天）；P0/P1 表新增 F32 行。
- `planning/打磨计划-2026-11.xlsx`：`1-想法池` 第 38 行新增 F32（安卓 App：手机上看清单/打勾/收提醒，P1/M/想法）；`7-想法收件箱` 第 24 行新增原话记录（序号 21，日期 2026-11-13）。

**为什么**
用户说“安卓 app 能做是吧，把他加入计划”——把手机端需求落进项目 roadmap，不要只停留在对话里；先记想法、再排版本。

**怎么验证**
openpyxl 读回：`1-想法池` 最后一行编号 F32（与已有 F29/F31 不冲突）；`7-想法收件箱` 最后一行序号 21；md 里 `grep F32` 命中 P0/P1 表与路线图各一处。

**怎么恢复**
xlsx 备份：`tmp\打磨计划-2026-11.xlsx.bak-20261113`；md 用 `git checkout -- planning/打磨计划-2026-11.md` 回退。

## 2026-11-13 19:12 发布防泄漏：publish.ps1 拦截第三方工具与电子书

**改了什么**
- `tools/publish.ps1`：`git add -A` 之后新增拦截块（约 8 行），命中即 `git reset` + `exit 1`。禁止词 `dedao|ActiveUID|得到电子书|得到（电子书）`；禁止文件后缀 `.epub/.mobi/.azw3/.azw`。
- `.gitignore`：新增 `*.epub`/`*.mobi`/`*.azw3`/`*.azw` 四条（第 16-20 行）。

**为什么**
用户要求“得到电子书下载工具不能放进开源网站”。仓库内本来就没有相关内容（`git grep` 零命中），但要防以后误提交：拦截放在脚本里，而不是靠记性。

**怎么验证**
`[Parser]::ParseFile('tools/publish.ps1')` → 0 errors；BOM 已补（首字节 EF BB BF）；`git grep -i "dedao|得到电子书|ActiveUID"` 仍零命中。

**怎么恢复**
删掉 `tools/publish.ps1` 里的拦截块与 `.gitignore` 末 5 行即可；不涉及历史提交。
## 2026-11-13 19:14 面板加「清」按钮：一键清除屏幕标注

**改了什么**
- `native/overlay.ps1`：面板标题栏在「—」左边新增 ` = New-GTextButton '清'`（13px，点击发 `{type:'clear_annots'}`），约 +12 行；托盘右键菜单在「隐藏悬浮层」上面新增「清除屏幕标注」项，约 +2 行。
- `index.js`：`handleEvent` 的 switch 新增 `case 'clear_annots'`（约 +11 行）：写 `annots: []`、`panel: {visible:false, busy:false, text:'', steps:[], stepIndex:0}`、`captureMode:false`。

**为什么**
用户说“加入一个清理屏幕上指导框的功能，因为如果不把步骤走完它就会一直存在”。以前只能等模型调用 `guide_finish` 收尾；模型不在或用户想自己收场时，标注会一直挂在屏幕上挡事。

**怎么验证**
`node --check index.js` → EXIT 0；overlay.ps1 BOM 正常、`[Parser]::ParseFile` → 0 errors；`guide_overlay restart` 成功（pid 42096）；Win32 `EnumWindows` 确认面板窗口 vis=True rect=1039,110-1659,439。点击响应要重启 DSH 后生效（index.js 是宿主代码，无热重载）。

**怎么恢复**
删掉 overlay.ps1 里 `` 那一段和托盘 ``，删 index.js 的 `case 'clear_annots'` 即可。
### 2026-11-13 19:17 追加：改成垃圾桶图标、挪到面板中部
用户要求“把『清』的按钮变成垃圾桶的图标，然后往下放一点，差不多中间的位置”。

**改了什么**
- `native/overlay.ps1`：删掉标题栏的 ``（『清』字按钮）；在步骤列表 `` 之后新增 ``（右对齐）与 `` 按钮，图标用 `Segoe MDL2 Assets` 的 `[char]0xE74D`（Delete/垃圾桶），16px 白色 + 淡底 + 8×4 内边距。
- 位置：步骤列表下方、「常听/下一步」上方，靠右（UI 自动化实测 rect=2421,350,24,24）。

**为什么**
标题栏按钮太多挤时间；垃圾桶更直观，放中部不容易误点。

**怎么验证**
`[Parser]::ParseFile` → 0 errors；`guide_overlay restart` 后 UIA 枚举面板元素，文本序列为「步骤2 → (空名图标 2421,350) → 常听 → 下一步」，位置正确。

**怎么恢复**
删 `` 那一段（约 2307-2320 行），标题栏若要恢复『清』字按钮见上一节的代码。
## 2026-11-13 19:26 修「清」按钮点了没反应

**改了什么**：`native/overlay.ps1:2316-2346`（+24 行）。垃圾桶按钮的 `PreviewMouseLeftButtonUp` 从「只发 `clear_annots` 事件」改成「先在本地清 + 写盘上的 state.json，再发事件」：`Update-Annots @()`、`.Hide()`、`.Show()`，然后把 `state.json` 里的 `annots` 清空、`panel.visible=false`、`mode=ball`、`steps=[]`、`stepIndex=0`。

**为什么**：`index.js` 里虽然加了 `case 'clear_annots'`，但那是宿主代码，**不重启 DSH 不生效**。所以在重启前点垃圾桶毫无反应，屏幕上还留着红框。改成 overlay 自己处理，不依赖宿主。

**怎么验证**：`[Parser]::ParseFile` 0 错误、BOM 已补；`guide_overlay restart` 后日志 `overlay started`；UIA 找到图标元素（`ControlType.Text` 空名 @2421,318），按 1.5 倍 DPI 换算成逻辑坐标 (1614,212) 用 `SetCursorPos` + `mouse_event` 点击，2 秒后 `state.json` 从 `annots=1 / panelVisible=true` 变成 `annots=0 / panelVisible=false / mode=ball`，mtime 更新到 19:25:26。

**怎么恢复**：把该处回调改回原来的三行（`.Handled = True` + `Send-OverlayEvent @{ type = 'clear_annots' }`）即可；宿主侧 `index.js` 的 `clear_annots` 分支保留，重启 DSH 后就由宿主接管。

**踩坑**：UIA 的 `BoundingRectangle` 是物理像素（2560x1440），而 PowerShell 进程非 DPI-aware，`SetCursorPos` 收逻辑像素（1707x1067），必须除以 1.5 才能点中；直接传 2421 会被系统夹到屏幕边缘 1706。
## 2026-11-13 20:25 记录转型方向：引导转旁路、学习转主路

### 改了什么
- 新增 `D:\dsh_TestSpace\guide-tutor\planning\转型-学习优先.md`（约 2.4 KB）：转型理由、目标形态对照表、要动的 6 个部分、不做什么、验收标准、决定记录。
- `CHANGELOG.md` 追加本条（+1 条四段式）。

### 为什么
用户 2026-11-13 20:23 拍板「引导应该为旁路，学习应该为主路」，同时明确「但不是现在」。先落成文件避免决策丢失，本轮不写任何代码。

### 怎么验证
- `Get-Item planning\转型-学习优先.md` 存在；`Get-Content` 可读，状态行写明「待启动」。
- 本轮未改 `index.js` / `native/overlay.ps1`，`git status` 应只多出 planning 新文件与 CHANGELOG 改动。

### 怎么恢复
- 该文件为新增文档，删除即可；决策原文在本次会话 20:23 的消息里，可重新整理。
## 2026-11-13 20:30 新增项目结构表（转型前基线）

### 改了什么
- 新增 `D:\dsh_TestSpace\guide-tutor\planning\项目结构表.md`（约 5.6 KB，6 节）：决策权约定（用户 80% / AI 20%）、四层结构、平台/能力/教学/管理四组功能清单、联动强度表（●●●/●●/●）、转型后目标流程图与新增功能表、6 条延展规则、5 个已知脆弱点。

### 为什么
用户要求「开工前做出一张项目结构表，并且有可靠的延展性」，并明确「更新引导大方向由我主导，你的建议为次要，比例 80:20」。表的作用是让后续每个新功能先找到挂载层与联动关系，避免功能蔓延。

### 怎么验证
- `Get-Item planning\项目结构表.md` 存在；`Get-Content` 各节标题齐全（0-6 节）。
- 本轮未改代码；`git status --short` 只多出该文件与 CHANGELOG。

### 怎么恢复
- 新增文档，删除即可；内容可从本次会话 20:30 前的讨论重建。
## 2026-11-13 20:35 项目结构表 Excel 版

**改了什么**：新增 `planning/项目结构表.xlsx`（15183 B，6 个 sheet：1-总览 / 2-功能清单 24 行 / 3-联动强度 16 条 / 4-转型目标 6 行 / 5-延展规则 6 条 / 6-脆弱点 5 条）；生成脚本 `tmp/make_structure_xlsx.py`（openpyxl，表头深底白字、斑马纹、冻结窗格、强度按 ●●●/●●/● 上色）。同步保留 Markdown 版 `planning/项目结构表.md`。

**为什么**：用户要求把结构表做成 Excel，方便筛选、排序、后续在表上直接加功能；Markdown 版适合阅读，Excel 版适合维护。

**怎么验证**：`python tmp/make_structure_xlsx.py` 输出 saved，EXIT=0；openpyxl 重开确认 6 个 sheet 行数正确、冻结窗格在 A4/A5；LibreOffice Kit 按 sheet 渲染 `2-功能清单`、`3-联动强度`、`1-总览` 三页无裁切、无乱码，列宽与配色正常。

**怎么恢复**：删除 `planning/项目结构表.xlsx` 与 `tmp/make_structure_xlsx.py` 即可；Markdown 版不受影响。
## 2026-11-13 20:46 新增《想法表-状态监测》

**改了什么**：新建 `planning/想法表-状态监测.md`（约 6.4 KB，10 节）：三层信号（L1 进程免费 / L2 键鼠免费 / L3 截图花钱）、清单联动设计（时间线自动挂 `plan_item_id`，产出「对上 / 偏了 / 空窗」）、功能清单 F33–F39（接打磨计划编号）、明确不做的四件事、`activity-YYYY-MM-DD.jsonl` 数据结构、隐私边界、五步落地顺序、与教学流程的前置关系。

**为什么**：用户判断「教学流程太耗 token，先做状态监测与 AI 上下级协作」；进一步明确「监测重点在进程、要和清单联动、要带时间信息」，并要求把想法整理成和打磨计划同级的文档。功能 2（学习时长）保留，功能 1（分心提醒）与功能 3（自动场景判断）按用户判断不做，文档里写明原因。

**怎么验证**：文档 10 节齐全，功能编号从 F33 起、不与打磨计划 F01–F32 冲突；数据结构字段与 `plan.json` 的 `from/to/id` 对得上；未改动任何代码。

**怎么恢复**：删除 `planning/想法表-状态监测.md` 即可；不影响其他文件。
## 2026-11-13 21:44 状态监测加入打磨计划（F33–F39）

**改了什么**：`planning/打磨计划-2026-11.md`（5,996 B）版本路线图新增 `v0.26 看得见时间`（F33 F38 F35 + F34 F36 F37，3–4 天），P0/P1 清单新增 F33–F39 七行，末尾加「详见 想法表-状态监测.md」；B03 状态由「待确认」改为「已确认（11-09 四条已过期，无需恢复）」。`planning/打磨计划-2026-11.xlsx`（47,461 B）同步：`1-想法池` 第 39–45 行写 F33–F39、`7-想法收件箱` 第 25 行写序号 22（原始想法记录）、`0-总览` 与 `5-版本计划` 各插入 `v0.25 带着走` 与 `v0.26 看得见时间` 两行并校正顺序（v0.22→v0.23→v0.24→v0.25→v0.26→v1.0），`0-总览` A3 统计改为「共 32 个想法」并标注 2026-11-13 更新。

**为什么**：用户要求把状态监测的想法并入打磨计划，统一编号与排期；同时补上 xlsx 缺失的 v0.25（安卓）行，避免 md 与 xlsx 不一致。

**怎么验证**：openpyxl 重开确认 `1-想法池` F33–F39 字段完整、`7-想法收件箱` 序号 22 已写；`0-总览` 与 `5-版本计划` 版本序列均为 v0.22→v1.0 六行顺序正确；md 版本路线图与 P0/P1 表行数与 xlsx 对得上。备份 `tmp/打磨计划-2026-11.xlsx.bak-before-monitor`（45,303 B）。

**怎么恢复**：用备份覆盖回 `planning/打磨计划-2026-11.xlsx`；md 删掉 v0.26 行、F33–F39 七行、末尾那句「详见想法表」，B03 状态改回「待确认」。
## 2026-11-13 21:50 修复想法池结构并重排

**改了什么**：`planning/打磨计划-2026-11.xlsx` 的 `1-想法池`：①补齐 F33–F39 缺失的三列——「状态」（想法）、「来源」（用户 2026-11-13）、「备注 / 验收」（每条一句可验收标准）；②全表 43 行统一 `wrap_text` + 顶端对齐 + 行高（长文本 66pt、短文本 50pt）；③按编号重排（F01→F39，F05a/F05b、F10/F10b 相邻），原顺序为追加式，F05b / F10b / F31 / F32 散在末尾。

**为什么**：用户截图指出「什么鬼结构，重排」——根因是新增 7 行只写了前 8 列，后 3 列空白，行比上面短一截，看上去像表格断裂；另有 4 个编号未按序排列。

**怎么验证**：openpyxl 重开确认 43 行编号序列为 F01…F39 且 F05b 紧跟 F05a、F10b 紧跟 F10；F33 完整 11 列均有值；LibreOffice Kit 渲染 `A3:K46` 一页完整、11 列无裁切、长文本正常换行。

**怎么恢复**：`tmp/打磨计划-2026-11.xlsx.bak-before-monitor`（45,303 B）覆盖回去即为加监测前的版本；若只想撤销排序，按 `CHANGELOG` 里「追加式顺序」手动调整行序即可。
## 2026-11-13 22:05 清单回迁 tutor（用户：清单在 guide，记录在 coach）

**改了什么**：`index.js` 三处——①`guidePlanTool` 从 `if (manage)` 里移出、无条件注册；②启动段 `pushPlanState(planForToday())` 与 `plan.writeHistory()` 移出 `if (manage)`，删掉「不画清单就关掉卡片」的 else 分支；③tick 里 `checkSchedule` 与 `planTick` 移出 `if (manage)`，camera/edict/focus 仍受 manage 控制。`manage` 现在只控制专注环、都市指令、摄像头、日记、时钟五个工具。

**为什么**：用户 2026-11-13 明确「清单是清单，记录是记录，分开的。清单在 guide，记录在 coach」——之前拆分把清单整个给了 coach，导致教学插件没有清单工具。

**怎么验证**：`node --check index.js` → EXIT 0；重启 DSH 后 tutor 工具列表应含 `guide_plan`，卡片数据由 tutor 推；coach 不再注册 `guide_plan`（只读 plan.json 做时间线对照）。

**怎么恢复**：把 ①的注册移回 `if (manage)` 内、②③的改动反向搬回，即恢复「清单归 coach」的旧布局。
## 2026-11-13 23:00 Bug 池新增 B35：两插件悬浮窗互相覆盖

**改了什么**：`planning/打磨计划-2026-11.xlsx` 的 `2-Bug与问题` 第 25 行新增 B35（模块「悬浮层 · 两插件」、严重度 S2、优先级 P1、状态「待修」），11 列写全：现象是 coach 的「今日记录」卡片与仪表盘窗口会盖住 tutor 的球/卡片，点开一个另一个被压在下面；修复方案列了三个候选（按插件分侧 / 卡片互斥 / 统一 z-order），备注「明天定」。`planning/打磨计划-2026-11.md` 的 P0/P1 清单在 B16 后加同一条（状态「待修（11-14）」）。

**为什么**：用户 22:49 说「悬浮窗互相覆盖的问题记录到 bug 池（打磨清单）里，明天解决，记得提醒我」。

**怎么验证**：openpyxl 重开确认 `2-Bug与问题` 共 25 行、B35 在最后一行且 11 列都有值；md 里 `grep B35` 命中一行。已 `schedule_create` 设 2026-11-14 09:30 的提醒（id `schedule-6c7304e1-f3e7-4193-aa05-a139345252a9`）。

**怎么恢复**：删 xlsx 第 25 行与 md 里那行 B35；提醒用 `schedule_delete` 带上面的 id 删除。

## 2026-11-13 23:05 未修 Bug 改为「打开 DSH 就提醒」

**改了什么**：①`C:\Users\易千纸\.dsh\AGENTS.md` 新增第 6 条「打开就提醒：未修的 Bug」——每次新会话先查 `planning/打磨计划-2026-11.xlsx` 的 `2-Bug与问题`，有「待修/待做」就在第一条回复里提醒，格式 `待修：B35 悬浮窗互相覆盖（还要 N 条）`；②删除 2026-11-14 09:30 的定时提醒（`schedule-6c7304e1-f3e7-4193-aa05-a139345252a9`）。

**为什么**：用户 22:51 说「设置为打开就提醒」——他要的是每次打开 DSH 就被告知，不是等到某个时刻。

**怎么验证**：AGENTS.md 现在 57 行、第 6 节在第 43-55 行；`schedule_delete` 返回 `{"deleted":true}`。下次新会话我会先查 xlsx 再回复。

**怎么恢复**：删 AGENTS.md 第 6 节即可取消「打开就提醒」；要恢复定时提醒用 `schedule_create` 重建（原 id 已删，不可找回）。

## 2026-11-14 11:38 修复总览表文字竖排（单元格未合并）

**改了什么**：`planning/打磨计划-2026-11.xlsx` 的 `0-总览`：第 **27、30、31** 行合并 **A:F**，并把 A 列对齐改成 `wrap_text=True` + `vertical=top`，行高按字数重设（30–48pt）。受影响的是「怎么用这张表」的 ④ 行和第 29 行起的「⚠ 数据现状提醒」整块。

**为什么**：用户发截图说「表的数据显示出了问题」——④ 和「数据现状提醒」的文字被挤成一列竖排。根因是这两行是单 A 列（列宽只有 6），而上下相邻行都合并到了 F 列；长文本落在 6 字符宽的格子里就变成一字一行。

**怎么验证**：openpyxl 重开后 `0-总览` 的 A27/A30/A31 都出现在 `merged_cells.ranges` 里；LibreOffice Kit 渲染 `A20:H32` 确认 ①②③④⑤ 全部横排完整、「数据现状提醒」整块换行正常。

**怎么恢复**：把这四行（27/28/30/31）的 A:F 合并拆掉、A 列对齐改回默认即可；或从 `tmp/打磨计划-2026-11.xlsx.bak-before-monitor` 取回加监测前的版本。

## 2026-11-14 12:35 新建「AI 协作规划」表

**改了什么**：新增 `planning\AI协作规划.xlsx`（8 个 sheet，约 13 KB）：1-总览 / 2-角色职责 / 3-任务分派（8 条场景）/ 4-接口协议 / 5-成本预算 / 6-降级容错 / 7-落地顺序（8 步）/ 8-硬性要求（8 条）。生成脚本 `tmp\make-ai-collab-xlsx.py`。

**为什么**：用户要求「详细讲讲 AI 协作的详细规划和要求，做成一张表」。核心是把「主模型什么都干」拆成 L0 本地规则 / L1 子模型 / L2 主模型三层，目标是主模型调用 -60%、token -70%、延迟 -50% 且质量不降。

**怎么验证**：openpyxl 生成后 LibreOffice Kit 渲染 `3-任务分派!A4:H12` 与 `1-总览!A4:B10`，表头深底白字、斑马纹、8 行任务分派完整无裁切；`8-硬性要求` 8 条逐条可检查。

**怎么恢复**：删掉 `planning\AI协作规划.xlsx` 与 `tmp\make-ai-collab-xlsx.py` 即可，不影响任何代码。
## 2026-11-14 12:45 AI 协作表补实现细节

**改了什么**：`planning\AI协作规划.xlsx` 从 8 个 sheet 扩到 11 个：新增 `9-实现细节`（9 条能力，每条写到改哪个文件、新增函数、实现要点、已知坑）、`10-技术选型`（8 项候选与结论）、`11-数据与配置`（新增的 4 样东西）。生成脚本 `tmp\make-ai-collab-xlsx.py` 同步扩写。

**为什么**：用户要求「把对于具体实现的想法加入到表里面」——原表只有「谁做什么」，没有「怎么做」。

**怎么验证**：openpyxl 重新生成后 LibreOffice Kit 渲染 `9-实现细节!A4:F13`，9 行完整、六列无裁切；`wb.sheetnames` 返回 11 项。

**怎么恢复**：删掉三个新 sheet 或整份文件即可，不影响代码。
## 2026-11-14 14:55 AI 协作表：L1 选型定为智谱 GLM-4V-Flash

**改了什么**：`planning\AI协作规划.xlsx` 三处：①`2-角色职责` 的 L1 行从「轻量 API 或本地小模型（待选）」改为「智谱 GLM-4V-Flash（免费视觉 API，OpenAI 兼容）」；②`9-实现细节` 第 2 条补 `base_url = https://open.bigmodel.cn/api/paas/v4`、`model=glm-4v-flash`；③`10-技术选型` 的 L1 行结论从「DeepSeek 轻量」改为「智谱 GLM-4V-Flash（用这个）」，DeepSeek V4-Flash-Vision-Exp 降为备选。

**为什么**：核查发现智谱 GLM-4V-Flash 是「完全免费的图像理解模型」且 OpenAI 兼容、国内直连；同时纠正此前「DeepSeek 不能看图」的错误——DeepSeek 已有 V4-Flash-Vision-Exp（约 .216/百万输入）。免费方案优先。

**怎么验证**：openpyxl 重新生成后 LibreOffice Kit 渲染 `10-技术选型!A4:E12`，L1 三行依次为 GLM-4V-Flash（用这个）/ DeepSeek V4-Flash-Vision-Exp（备选）/ GLM 云端小模型（备选）；`wb.sheetnames` 仍 11 项。

**怎么恢复**：把三处文案改回原值即可，文件无结构变化。
## 2026-11-14 15:30 L1 选型升级为 GLM-4.6V-Flash

**改了什么**：`planning\AI协作规划.xlsx` 三处型号更新：①`2-角色职责` 的 L1 → 「智谱 GLM-4.6V-Flash（9B 轻量视觉，免费，128K 上下文，原生 Function Calling）」；②`9-实现细节` 第 2 条 `model=glm-4.6v-flash`；③`10-技术选型` 首行结论改 4.6V-Flash，原 GLM-4V 那行替换为 GLM-4.6V（106B，疑难升级用）。

**为什么**：用户指出「4V 可能是老模型」，核官网发现 2025-12-08 已发布 GLM-4.6V 系列（106B 高性能 + 9B 轻量 Flash），Flash 版完全免费且原生支持 Function Calling，比 GLM-4V-Flash 新一代。

**怎么验证**：`z.ai/blog/glm-4.6v` 确认两版本与 128K 上下文、OpenAI 兼容；xlsx 重新生成后 `10-技术选型` 首行为 GLM-4.6V-Flash。

**怎么恢复**：型号字符串改回 `glm-4v-flash` 即可。
## 2026-11-14 16:35 GLM-4.6V-Flash POC 通过

**改了什么**：新增 `tmp\poc-vision.py`、`tmp\poc-vision2.py`（临时脚本，不提交）；API key 与 baseUrl 存 `~/.dsh/guide-tutor/ai.json`（数据目录，不进 Git）。

**为什么**：验证智谱免费视觉模型能否承担 L1 子模型——看它能不能读截图、能不能只输出 JSON、延迟多少。

**怎么验证**（实测数据）：同一张截图（1280×800，JPEG q60，输入约 1366 token）
- 纯文本提问 3 次：`3.13s / 3.57s / 1.02s`，三次都答对「GLM-4.6V」，准确率 3/3；
- JSON 模式 1 次：`2.76s`，返回 `{"is_doc":true,"title":"GLM-4.6V","confidence":1.0}`，可直接解析；
- 结论：视觉可用、JSON 可控、**延迟 1–3.6 秒（均值约 2.6s，略超 2s 目标）**、成本 0。

**怎么恢复**：删 `ai.json` 与两个 poc 脚本即可；key 在智谱控制台可随时吊销。
## 2026-11-14 17:15 coach 建 git + tutor 发布 + 拦截器误伤修复

**改了什么**：
1. `D:\dsh_TestSpace\guide-coach`：`git init` → 建 `work` 分支 → 首次提交 `9647978`（21 个文件、11,102 行）；新增 `.gitignore`（排除 node_modules / tmp / tmp-test / shots / *.png / 数据 jsonl / state.json / ai.json）。
2. `D:\dsh_TestSpace\guide-tutor`：`tools\publish.ps1` 的拦截块修复（见下），执行发布 → `c0e4700`（12 个文件、+816 行）已推到 GitHub，work 同步到 main。
3. `tools\publish.ps1` 第 44–50 行：新增 ` = '^(tools/publish\.ps1|CHANGELOG\.md)$'`，按 diff 的 `+++ b/路径` 逐行归属，规则文件自身写出的禁止词不再误伤；`` 改为 ``（字符串数组）。

**为什么**：①coach 写了两天、498 KB、零版本控制，改坏无法回退；②tutor 在 work 上攒了两天没发布；③拦截器第一次跑就把`publish.ps1` 和 `CHANGELOG.md` 自己拦住（它们记录了禁止词），导致发布中止。

**怎么验证**：tutor `git log origin/main -1` = `c0e4700`；coach `git log -1` = `9647978`、`git ls-files` 21 个；两边 `git status --short` 都为空。`[Parser]::ParseFile` 对 publish.ps1 报 0 errors（补回 UTF-8 BOM，否则 Windows PowerShell 5.1 按 GBK 解码中文正则失效、`` 变空串导致「每行都命中」）。

**怎么恢复**：coach 删 `.git` 即回到无版本控制；tutor 用 `git reset --hard b4d05bd` 回发布前，`git push --force` 后远程回退（谨慎，会丢 c0e4700）。
## 2026-11-14 17:35 L1 视觉子模型落地（pHash + GLM-4.6V-Flash + 判定/定位）

**改了什么**
- 新增 `lib/pixel.js`（约 190 行）：纯 JS 解 PNG（zlib + 反 filter）+ 32×32 灰度 + 8×8 DCT + 中位数二值化 → 16 位 hex；导出 `phash(file)` / `phashFromPixels` / `decodePng` / `hamming(a,b)`。
- 新增 `lib/l1.js`（约 190 行）：`askL1({task,goal,image,hint,timeoutMs,config})` 调智谱 GLM-4.6V-Flash，`thinking:{type:'disabled'}`，只收 JSON；`prepareImage()` 把 >250KB 的图缩成 1280 宽 JPEG（缓存到 `~/.dsh/guide-tutor/thumbs/`）；导出 `askDone` / `askLocate`。
- 新增 `lib/judge.js`（约 70 行）：`createJudge()` 返回 `{done, locate, stats}`，置信度 <0.6 或 L1 失败一律返回 null，交回主模型。
- 新增 `native/thumb.ps1`（约 35 行）：System.Drawing 缩图，JPEG q70、最大 1280 宽。
- `index.js`：import `createJudge`；`apply()` 开头加 `config.ai = { l1:'off', apiKey:'', baseUrl:'', model:'' }` 读取与 `judge` 实例（`l1==='on'` 才创建）。

**为什么**
主模型每步都看截图太贵（一次 15 分钟教学被调 20–40 次）。把「看一眼就能答」的三件事（完成了吗 / 错在哪 / 变了什么）交给免费的 GLM-4.6V-Flash，判断不了就退回主模型，质量不降、token 大降。

**怎么验证**
- pHash：`tmp/test-pixel.mjs` → 同一张图两次距离 **0**，不同图距离 **34**（>10 即视为不同），单张耗时 **48–83ms**。
- L1 单次：`tmp/t2.mjs` → 返回合法 JSON，1372 prompt token，延迟 **1.28–1.71s**（第二张起缩图有缓存）。
- 9 次批量：`tmp/test-l1.mjs`（3 图 × 3 次，间隔 2.5s）→ 有效回答 **4/9**，判断正确 **4/4**（100%），平均延迟 **2293ms**；5 次失败中 2 次超时、1 次 429「账户已达到速率限制」——**免费档有 QPS 限制，调用必须限流 + 失败即退回**。
- `node --check` 对 pixel.js / l1.js / judge.js / index.js 全部 EXIT 0。

**怎么恢复**
删 `lib/pixel.js`、`lib/l1.js`、`lib/judge.js`、`native/thumb.ps1`，并把 `index.js` 里 `import { createJudge }` 与 `config.ai` 那段删掉即可回到「主模型全包」。`config.ai.l1` 默认 `'off'`，不配 key 时行为与之前完全一致。
## 2026-11-14 21:45 L1 接进「下一步」：没做完就不许往下走

**改了什么**
- `lib/plan.js:80`：`edict.config().tone` → `edict?.config?.()?.tone`（manage 关闭时 edict 为 undefined，plan tick 每次报 `edict is not defined`）。
- `index.js`：新增 `latestShot(maxAgeMs = 90000)`（取 shots/ 里最近一张 `shot-*.png`，超过 90 秒视为过期返回 null）；`case 'step'` 前加 L1 判断——`delta > 0`（点「下一步」）且 `judge` 存在时，读 `panel.text` 当目标、取最近截图，调 `judge.done({goal, image, timeoutMs:2500})`；返回 `not_done` 就 `writeState({panel:{text:'⚠ …'}})` + `speak('这一步好像还没做完，再看一眼？')` 并 `break`（不推进步骤），返回 null 或 done 则照常推进。
- `C:\Users\易千纸\.dsh\profiles\desktop\cordis.patch.yml` 的 guide-tutor 节点新增 `ai: { l1: 'on', apiKey: '0583…ExaL', baseUrl, model: 'glm-4.6v-flash' }`。

**为什么**
这是教学闭环最缺的一环：现在点「下一步」是无条件翻页，不管上一步有没有真做。用免费的 L1 看一眼截图就能挡住「没做完还往下讲」，比每次都调主模型便宜两个数量级。

**怎么验证**
- 重启后 `plugin.log` 出现 `L1 已开启（glm-4.6v-flash）`（已确认，14:47:50）。
- `node --check index.js` / `lib/plan.js` 均 EXIT 0。
- 待实测：教学面板上点「下一步」，上一步没做完时面板正文变 `⚠ …` 且不翻页，日志出现 `step blocked by L1: …`；做完了则出现 `step ok by L1: …` 并正常翻页。

**怎么恢复**
把 `cordis.patch.yml` 里 `ai.l1` 改成 `'off'` 即完全回到旧行为（不调 L1、不拦步骤）；`case 'step'` 那段 L1 判断也可整段删掉，剩下的就是原来的无条件推进。
## 2026-11-14 23:25 修 L1 拦截的两处引用错误

**改了什么**
- `lib/plan.js:80`：`edict?.config?.()` → 固定 `'normal'`。可选链救不了未声明变量，`edict` 在 plan 模块里从来就不是参数，所以每次 plan tick 都抛 `ReferenceError`。
- `index.js:374`：`speak(...)` → `speakText(...)`（tutor 的语音函数叫 `speakText`，没有 `speak`）。
- `index.js:375`：`speakText(...).catch(...)` → `try { speakText(...) } catch {}`（`speakText` 是同步函数，返回 null，不是 Promise）。

**为什么**
接 L1 拦截时手写了两处不存在的符号，导致「点下一步」在拦截分支上直接抛错：日志 `event handler failed: ReferenceError: speak is not defined`，面板不会变成 ⚠ 状态，也不会拦。

**怎么验证**
- `node --check index.js` / `lib/plan.js` 均 EXIT 0。
- 往 `events.jsonl` 追加 `{"type":"step","delta":1}` 实测：修复前日志是 `event handler failed: ReferenceError: speak is not defined`；修复后应出现 `step blocked by L1: …` 或 `step ok by L1: …`。
- 重启后 `plugin.log` 不应再有 `plan tick failed: edict is not defined`。

**怎么恢复**
两处都是单行改动；`git diff index.js lib/plan.js` 可看，`git checkout -- index.js lib/plan.js` 回退（会把 L1 接入一起回退掉）。
## 2026-11-14 23:55 拦截后自动圈错位（locate 接入）+ B36 排查结论

**改了什么**
- `index.js` 新增 `pngSize(file)`（只读 PNG 前 24 字节拿宽高，不解像素）。
- `index.js` 的 `case 'step'` 拦截分支：判定 `not_done` 后再调 `judge.locate({goal, image: shot, timeoutMs: 2500})`，把返回的 `boxes` 按 `原图宽 / 1280` 换算成屏幕坐标，写成 `annots`（红框 + `why` 文案，最多 3 个），随 `writeState` 一起落到悬浮层；`locate` 失败只记日志，不影响拦截本身。

**为什么**
拦截只说「没做完」帮助有限，用户还得自己找错在哪。L1 的 `locate` 已经能返回 `{x,y,w,h,why}`，接进来就能直接圈红框，把「检查」变成「指出来」。

**怎么验证**
- `node --check index.js` EXIT 0。
- 待实测：教学任务点「下一步」且判定未完成时，屏幕上出现红框圈住错误区域，面板正文 `⚠ …`，日志 `step blocked by L1: …`（若 locate 也成功，会多一条红框）。

**怎么恢复**
删掉 `case 'step'` 里那段 `try { const loc = await judge.locate(...) }` 即可回到「只拦不圈」；`pngSize` 留着不影响。

**B36（今日记录出现未来时间）排查结论（未复现）**
- 现状：`state.record.segments` 16 条，时间连续 10:24→15:10，最新一条 `15:00-15:10`，与系统时间 15:11 一致，无未来时间。
- 当时的现象更可能是**卡片渲染了上一轮 state**：`overlay` 每 250ms 读 `state.json`，而宿主 `pushRecord` 每分钟才写一次；用户 10:56 看到的 11:11 那条，可能是手动改 `state.json` 后 overlay 尚未重读的窗口期。
- 结论：数据源（`activity-*.jsonl` 与 `blocks()`）没有未来时间，暂标「未复现」，继续观察；若再出现，先看 `state.json` 的 `record.updatedAt` 与 `segments` 实时值，不要看卡片。
## 2026-11-14 00:20 修 `[object Object]`：judge 的日志包装写坏了

**改了什么**
- `index.js:77`：`log: (m) => log([judge] )` → `log: (m) => log([judge] )`。

**为什么**
接 L1 时手写这一行，模板字符串的反引号和 `` 都丢了，变成「把 judge 对象塞进数组再抛给 log」，所以 judge 每打一条日志就变成 `[object Object]`——这也解释了为什么拦截日志里看不到 `step blocked by L1:`，因为那行之前 judge 内部先打了日志，把真正的错误盖住了。

**怎么验证**
- `node --check index.js` EXIT 0。
- 重启后触发一次拦截，日志应出现 `[judge] judge.done -> null（…）` 或 `step blocked by L1: …`，不再有裸的 `[object Object]`。

**怎么恢复**
单行改动，`git diff index.js` 可见；改回 `log([judge] )` 就是原来的坏版本（不建议）。
## 2026-11-14 00:40 L1 超时从 2.5s 放宽到 8s（根因：首次缩图慢）

**改了什么**
- `index.js`：`judge.done` / `judge.locate` 的 `timeoutMs` 2500 → 8000（两处）。

**为什么**
实测链路（`tmp\t-judge.mjs` 直接调 `createJudge().done`）：同一张截图第一次调用 **5295ms**、第二次（缩图已缓存）**3630ms**。原来的 2500ms 必然超时，`judge.done` 返回 null，于是「点下一步」既不拦也不报错，只是静默放行——这就是为什么重启后测不到拦截。

**怎么验证**
- `node --check index.js` EXIT 0。
- `tmp\t-judge.mjs` 用真实截图跑：`RESULT:{"verdict":"not_done","confidence":0.9,"reason":"当前界面显示的是 DeepSeek 桌面应用，而不是 Excel…","ms":3630}` —— 判定链确认可用。
- 待重启后端到端验证：点「下一步」应看到 ⚠ 面板 + 红框 + 日志 `step blocked by L1: …`。

**怎么恢复**
把两处 `timeoutMs: 8000` 改回 2500 即可（会退回「L1 经常超时、静默放行」的行为）。
## 2026-11-14 18:35 把 L1 判定登记进打磨计划

**改了什么**：`planning/打磨计划-2026-11.md`：版本路线图新增 `v0.28 看得懂的判断 | F01 F42 | 2–3 天`；P0/P1 清单 F41 后新增 `F42 L1 判定`（P0/S/已完成）；F01 状态从「待确认」改「已完成（选智谱 GLM-4.6V-Flash，免费视觉）」。`planning/打磨计划-2026-11.xlsx`：`1-想法池` 第 48 行插入 F42 全 11 列；F01 行状态改「已完成」、备注写选型结论；`5-版本计划` 在 v0.26 后补 v0.27（原来漏了）与 v0.28。

**为什么**：用户要求「把改动记录到打磨计划中」。L1 判定是这半天的主要产出（新增 4 个文件、改了 index.js 的 step 分支），不登记的话下次看计划会以为 AI 协作还停在「三选一待确认」。

**怎么验证**：openpyxl 读回：`5-版本计划` 版本列为 v0.22→v0.28→v1.0 顺序正确；`1-想法池` 的 F40（46 行）、F41（47 行）、F42（48 行）连续，F42 状态为「已完成」；md 里 `v0.28` 行与 `F42` 行存在。

**怎么恢复**：xlsx 用 `tmp/打磨计划-2026-11.xlsx.bak-before-monitor` 覆盖（仅退到加监测前，会同时丢掉 F33–F42）；只撤 F42 的话，删 `1-想法池` 第 48 行、`5-版本计划` 第 10 行（v0.28），并把 F01 状态改回「待确认」。
## 2026-11-14 19:55 今日记录加语义标签（每 5 分钟一次 L1）

**改了什么**：①`lib/l1.js` 新增 `PROMPTS.label`（看截图判断「此刻在做什么」，输出 `{"category":"学习|工作|娱乐|休息|其他","detail":"≤12 字"}`）与 `askLabel({image, proc, timeoutMs, config})`（约 20 行）；②`index.js` 新增 `LABEL_INTERVAL_MS = 5*60*1000`、`labelsFile(dateKey)`、`appendLabel(entry)`、`labelTick()`（请求一次截图 → 调 `askLabel` → 追加到 `labels-YYYY-MM-DD.jsonl`），启动段在 `config.autoStart !== false` 时 `later(…, 90000)` 后每 5 分钟跑一次，`dispose` 里 `clearInterval(labelTimer)`。

**为什么**：用户指出「今日记录只是单纯的得到了当前运行的进程，太单一」——进程名分不清「在 B 站看日语课」和「在 B 站刷视频」，用 L1 给每个时间点打语义标签，记录才说得清状态。

**怎么验证**：`node --check index.js` / `lib/l1.js` 均 EXIT 0；用最新截图实跑 `askLabel`：**1513ms** 返回 `{"category":"工作","detail":"使用 DeepSeek 查询判定链结果"}`，与截图内容一致；串行调用（`labelBusy` 锁）避免撞 429。

**怎么恢复**：删 `labels-*.jsonl` 即清空标签；回退代码删 `lib/l1.js` 的 `PROMPTS.label`/`askLabel` 与 `index.js` 的 `labelTick`/`appendLabel`/`LABEL_INTERVAL_MS` 及启动段与 dispose 的 `labelTimer`；`config.ai.l1` 改 `'off'` 即整条 L1 链停用（含打标签）。
## 2026-11-14 21:20 打磨计划表整理

**改了什么**：`planning/打磨计划-2026-11.xlsx`：①`0-总览` 的计数行更新为「共 45 个想法、23 个问题、12 项技术债」并把「更新于」改为 2026-11-14 20:40；版本路线图补齐 v0.27（时间仪表盘）与 v0.28（看得懂的判断）两行（插入时误与下方行合并，已 `unmerge_cells('A21:F21' / 'A22:F22')` 后重写；v1.0 行一并恢复）。②`1-想法池` 状态「待定」→「想法」；`2-Bug与问题` 「已修复 / 已解决 / 已修（11-14）」统一为「已完成」（共 10 处）；`3-技术债` 无需改。③`5-版本计划` 增「状态」列（v0.22 进行中、v0.26–v0.28 已完成、v0.23–v0.25 与 v1.0 计划中），并修 v0.27 / v0.28 的「验收标准」错位到状态列的问题。④`6-已完成` 按版本号重排（0.17.0 → 0.22.34）。

**为什么**：用户说「看你都没怎么管，得整整齐齐的」——原表状态值有五种写法（已修复/已解决/已修（11-14）/待定/待做），版本路线图缺两版，已完成表版本号乱序。

**怎么验证**：LibreOffice Kit 渲染 `0-总览 A13:H23` 确认 v0.22→v0.28→v1.0 九行完整、无空行；渲染 `5-版本计划 A3:G11` 确认七列齐全、状态与验收各就其位；openpyxl 读回 `6-已完成` 首行为 0.17.0。

**怎么恢复**：`tmp/打磨计划.bak-before-tidy.xlsx`（50,848 B）覆盖即回到整理前。注意：第一版整理曾用「全表重算行高」把所有行撑得极高（总览出现大片空白与竖排文字），已整体回滚后改为只做数据与状态修正，不再批量改行高。
## 2026-11-14 16:45 重写 HANDOFF（给下一个接手的人/AI）

**改了什么**：D:\dsh_TestSpace\guide-tutor\HANDOFF.md 从 9,836 B（2026-11-12 版，写的是 0.22.37 和 11-09~11-11 的改动）整体重写为 5,177 B，七节：这是什么（两个插件对照表）/ 架构（宿主-浮层-state/events 通信与五个模块边界）/ 现在做到哪了（能力表，含 L1、activity、F40 的真实状态）/ 接手要先知道的坑（9 条）/ 还没做完（5 条）/ 下一步该干什么（先问用户，别自作主张开新功能）/ 怎么跑起来（日志、重启浮层、发布命令）。

**为什么**：用户说「你只需要让以后空白的你理解自己要干什么」——原 HANDOFF 停留在 11-12，没写拆分 guide-coach、L1 判定、仪表盘、标签这些新东西，下一个会话接手会完全接不上。

**怎么验证**：Get-Item HANDOFF.md = 5,177 B；Get-Content -TotalCount 10 确认首段是「写给下一个接手的人（或者下一个没有记忆的 AI）。写完于 2026-11-14 16:40」，七节标题齐全。

**怎么恢复**：旧版 9,836 B 在 git 历史里（git show HEAD~1:HANDOFF.md 或 git log --oneline -- HANDOFF.md 找到对应提交后 git checkout <sha> -- HANDOFF.md）。
## 2026-11-14 16:52 截图保留期 7 天 → 3 天 + 400 张上限

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\index.js` L717-763：`SHOT_KEEP_DAYS` 由 `7` 改为 `3`，新增 `SHOT_MAX_FILES = 400`；`pruneShots()` 重写——原来只按 mtime 删过期文件，现在同一遍扫描里把未过期的收集进 `alive`，超过 400 张就按 mtime 从最老的开始删（每条 `try/catch` 单独包住，删不动就跳过）。

**为什么**
用户说「截图不能一直堆」。记录打标签每 5 分钟截一张全屏图，实测一天 30~40 张、约 1.2MB/张；7 天保留期按最坏情况算能到 1GB 以上，磁盘无声无息被吃。3 天 + 400 张双保险，正常使用稳定在 130MB 上下。

**怎么验证**
- `node --check index.js` EXIT 0。
- 用同一套规则手动跑了一遍（临时脚本 `%TEMP%\prune.js`），结果：`shots/` 147 张删 37 张（30.5MB）、`shots/cam/` 7 张全删（1.2MB）；删后剩 110 张 / 128.6MB。明细在 `D:\dsh_TestSpace\guide-tutor\tmp\prune-report.json`。
- 常驻清理点没变：`handleEvent` 的 `ready`（L386）和 `captured`（L398）都会调 `pruneShots()`，所以每截一张就顺带扫一次。

**删除说明（不可恢复）**
- 本次手动删除 44 个文件：`shots/shot-*.png` 37 个（11-08 至 11-11 的旧读屏图，30.5MB）+ `shots/cam/*.png` 7 个（摄像头巡检照，1.2MB）。均为过期截图，`labels-*.jsonl` 里指向它们的 `shot` 字段会失效，但标签文字本身仍在，卡片显示不受影响。

**怎么恢复**
- 代码：`git diff index.js` 回退——`SHOT_KEEP_DAYS` 改回 `7`，删掉 `SHOT_MAX_FILES` 与 `alive`/排序那段，即还原成「只按天删」。
- 文件：删掉的截图没有备份，不可恢复（这也正是清理的目的）；需要新图等下一次截屏即可。
**另记（触发重载）**：`C:\Users\易千纸\.dsh\profiles\desktop\cordis.patch.yml` L44 的注释时间戳由 `reload: 2026/11/11 19:06:05` 改为 `reload: 2026/11/14 16:52:00 截图保留期改 3 天`。这行注释是配置里原本就写明的「改这行注释可触发插件热重载」开关，没有行为影响；改完 `plugin.log` 出现 `guide-tutor disposed` → `guide-tutor ready` → `overlay ready (pid 23388)`，新代码无需重启 DSH 即生效。恢复：把注释改回原时间戳即可。
## 2026-11-14 16:55 标签改成「叙事」：说清在做什么，不再泛泛「使用某软件」

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\lib\l1.js` L46-55：`PROMPTS.label` 重写——要求「在做什么动作、对什么对象」、≤16 字、禁止「使用某某软件/处理工作」这类笼统说法、禁止写文件名/代码路径/变量名、只说看得见的。原来只有一句「判断用户此刻在做什么，detail 不超过 12 字」。
- `D:\dsh_TestSpace\guide-tutor\lib\l1.js` L187-202：`askLabel({ image, proc, prev, timeoutMs, config })` 新增 `prev`（上一张的 detail），把 `proc` 与 `prev` 拼成 hint 交给模型；`detail` 截断上限 20 → 18 字。
- `D:\dsh_TestSpace\guide-tutor\index.js` L119-129：新增 `lastLabelDetail()`，读当天 `labels-YYYY-MM-DD.jsonl` 最后一行的 `detail`；`labelTick()` 里 `askLabel(...)` 调用处增加 `prev: lastLabelDetail()`。

**为什么**
用户 16:48 说「希望让智谱观察我做的细节情况（叙事）但不用太细节，在其能力范围内即可」。旧 prompt 下今天 6 条标签有 5 条是「使用 DeepSeek 写作工具 / 使用 DeepSeek 写作」——它只看见屏幕中央的 DeepSeek 窗口，说不出具体在改什么，卡片上就变成了千篇一律的一行字。

**怎么验证**
- 新旧 prompt 同图对比（`tmp/label-compare.json`、`tmp/label-compare2.json`）：旧「使用 DeepSeek 写作工具」→ 第一版新 prompt「在查看修改日志，了解 native/overlay.ps1 文件的变化」（24 字，还带技术细节）→ 收紧后「在查看今日记录的修改内容」。
- 直接 `import l1.js` 调 `askLabel({ image: thumbs/shot-20261114-164304-323.jpg, prev: '在查看今日记录的修改内容' })`（脚本 `tmp/try-label.mjs`）：3055ms 返回 `{"category":"工作","detail":"在查看今日记录的修改内容"}`。
- `node --check index.js`、`node --check lib/l1.js` 均 EXIT 0；热重载后 `plugin.log`：`label sampler armed (every 5min)` → `guide-tutor ready` → `overlay ready (pid 41144)`。
- 下一次真实采样在重载后 5 分钟内，新标签会写进 `C:\Users\易千纸\.dsh\guide-coach\labels-2026-11-14.jsonl`，卡片刷新后可见。

**另记（触发重载）**：`C:\Users\易千纸\.dsh\profiles\desktop\cordis.patch.yml` L44 注释时间戳改为 `reload: 2026/11/14 16:55:00 标签改叙事`。

**怎么恢复**
- `git diff lib/l1.js index.js` 回退：`PROMPTS.label` 换回旧句、`askLabel` 去掉 `prev` 与 hint 拼装、`detail` 截断改回 20、`index.js` 删掉 `lastLabelDetail()` 并把调用改回不传 `prev`。
- 临时验证产物（`tmp/label-compare.json`、`tmp/label-compare2.json`、`tmp/try-label.mjs`）可直接删，不影响功能。
## 2026-11-14 18:06 空闲时不截图、不调智谱，直接记「休息」

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\index.js`：
  - `appendLabel()` 之后新增 `lastIdleSeconds()`（约 L120-149）：读 `C:\Users\易千纸\.dsh\guide-coach\activity-YYYY-MM-DD.jsonl` 的**最后一行**——用 `fs.statSync` 拿大小，`fs.openSync` + `fs.readSync` 只读末尾 8192 字节再按行切（文件一天约 860KB，整读没必要）；取 `JSON.parse(last).idle`，异常一律返回 0（按在岗处理）。
  - `labelTick()`（约 L715-735）：在 `!aiL1 || labelBusy || disposed` 之后、`overlayChild` 检查之前，插入 `idleSec >= 300` 分支——不截图、不调 API，写一条 `{category:'休息', detail:'离开电脑 N 分钟', idle:true, source:'idle', ms:0}` 到 `labels-YYYY-MM-DD.jsonl`，`broadcast('label', entry)` 后 return。
- 文件其余部分未动。

**为什么**
用户指出「键鼠空闲没被记入，智谱分不清人在还是不在」。coach 那边已经把空闲切成了独立段，但 tutor 的打标签仍每 5 分钟无条件整屏截图 + 上传智谱：人离开 40 分钟就白花 8 次 API 调用，还会写 8 条「工作」。空闲时直接写「休息」，既省钱也不污染记录。

**怎么验证**
- `node --check index.js` EXIT 0。
- 独立脚本复刻 `lastIdleSeconds()` 跑真实文件（`activity-2026-11-14.jsonl`，859754 字节）→ 返回 `idleSeconds 248`，证明尾部 8KB 读取能拿到最后一行。
- 热重载（改 `cordis.patch.yml` L44 注释为 `reload: 2026/11/14 18:05:00 标签空闲跳过截图`）后 `plugin.log`：`label sampler armed (every 5min)` → `guide-tutor ready (dataDir=C:\Users\易千纸\.dsh\guide-tutor, autoStart=true)` → `overlay ready (pid 2620)`。
- 触发分支需要真实空闲 ≥300 秒；当时采样 `idle=248`，尚未到阈值，下一次离开 5 分钟以上时日志会出现 `label: 休息 · 离开电脑 N 分钟（idle Ns，跳过截图）`。

**另记（配置）**：`C:\Users\易千纸\.dsh\profiles\desktop\cordis.patch.yml` L44 注释时间戳改动仅用于触发热重载。

**怎么恢复**
- `git diff index.js` 回退：删 `lastIdleSeconds()` 与 `labelTick()` 开头的 idle 分支即可，其余逻辑不受影响。
- 已写入的「休息」标签不需要清理；旧标签没有 `idle`/`source` 字段，读取方按缺省处理。
## 2026-11-14 18:07 更正：空闲不再本地判「休息」，只作为提示交给智谱

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\index.js`：删掉 `labelTick()` 里 `idleSec >= 300 → 直接写「休息」并 return` 的短路分支；改为照常 `requestCapture()` + `askLabel({ ..., idle: idleSec })`；落盘条目增加 `idle`（秒）与 `source:'vision'`，日志改为 `label: X · Y (Nms, idle Ns)`。
- `D:\dsh_TestSpace\guide-tutor\lib\l1.js`：
  - `askLabel({ image, proc = '', prev = '', idle = 0, timeoutMs = 6000, config = null })` 新增 `idle` 参数；`idle >= 120` 时 hint 追加「键鼠已经 N 分钟没动了，但画面可能在放视频或停在长文上，别只看这一点就判休息」。
  - `PROMPTS.label` 增加第 6 条：键鼠久未动时，屏幕有视频/图片/长文就照实写在看什么；停在桌面、黑屏或明显没变化才写「离开了电脑」；拿不准按屏幕内容写，别一律判休息。
- 上一版（18:06 条目的「空闲时不截图、不调智谱」）作废，见下。

**为什么**
用户否决：「不能绕过智谱啊，不然看视频鼠标绝对是不动的啊，数据要给智谱，让智谱判断啊」。本地用 `idle >= 300` 直接写「休息」等于拿一个假设代替观察——看视频、读长文时键鼠同样不动，会把「在看 B 站」记成「离开电脑」，而且省下的那点调用换来的是假数据。

**怎么验证**
- `node --check index.js`、`node --check lib/l1.js` 均 EXIT 0。
- 对照实验（`tmp/try-label-idle2.mjs`，同一张截图 `shot-20261114-180454-936.png`）：`idle=0` 返回 `{"category":"工作","detail":"在查看顺手修的问题记录"}`；`idle=900`（假装 15 分钟没动）返回**完全相同**的 detail——说明模型没有因为空闲就一律判休息，仍按屏幕内容判断。
- 单次真实调用（`tmp/try-label-idle.mjs`）：2934ms 返回 `{"category":"工作","detail":"在查看顺手修的问题记录"}`。
- 热重载后 `plugin.log`：`label sampler armed (every 5min)` → `guide-tutor ready` → `overlay ready (pid 16028)`（2026-11-14T10:06:07Z）。

**怎么恢复**
- `git diff index.js lib/l1.js` 回退：恢复 `askLabel` 调用不传 `idle`、删掉 `PROMPTS.label` 第 6 条、删掉 hint 里的空闲句。
- 已写入的 `source:'vision'` 标签可直接保留；旧标签没有这两个字段，读取方按缺省处理。
- 临时脚本 `tmp/try-label-idle.mjs`、`tmp/try-label-idle2.mjs` 可直接删。
## 2026-11-14 19:08 修 B37：点垃圾桶清标注，不再连面板和悬浮球一起收走

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`（垃圾桶 handler，约 L2299-2335）：ToolTip 改为「清除屏幕上的标注（面板和悬浮球保留）」；删掉 `$script:PanelWindow.Hide()` 与 `$script:BallWindow.Show()`，也删掉写盘时对 `$disk.panel.visible / mode / steps / stepIndex / text / busy` 的修改，只写 `$disk.annots = @()`；注释里的 B36 更正为 B37。
- `D:\dsh_TestSpace\guide-tutor\index.js`（`clear_annots` 分支，约 L696-700）：由 `writeState({ annots: [], panel: { visible:false, busy:false, text:'', steps:[], stepIndex:0 }, captureMode:false })` 改为 `writeState({ annots: [], captureMode: false })`。`lib/state.js:39` 的 `write()` 是浅合并，没传 `panel` 就保持原样。
- `D:\dsh_TestSpace\guide-tutor\planning\打磨计划-2026-11.xlsx` 的「2-Bug与问题」表新增第 27 行 B37（模块 悬浮层 · 面板 / S2 / P1 / 标题「点垃圾桶会连悬浮球一起消失」/ 现象 / 影响 / 修复方案 / 状态 已完成 / 验证方式 / 来源 用户 m01185 截图）。改前备份：`D:\dsh_TestSpace\guide-tutor\tmp\打磨计划-2026-11.before-B37.xlsx`。

**为什么**
用户 m01185：「这个垃圾桶点了会导致悬浮球直接隐藏。（虽然标注也跟着清理了）我想要直接达到清理的效果」。原 handler 把「清标注」和「收面板、显球」绑成一步，而 `BallWindow.Show()` 当时没能把球放出来，结果标注清了、整个助手从屏幕上消失，只能重启或等宿主恢复。清标注和收面板本来是两件事。

**怎么验证**
- 补回 UTF-8 BOM 后 `[Parser]::ParseFile` 0 错误；`node --check index.js` EXIT 0。
- 热重载：`cordis.patch.yml` L44 注释改为 `reload: 2026/11/14 19:08:00 修 B37 垃圾桶不收面板`，`plugin.log` → `overlay exited code=1` → `overlay ready (pid 7860)`（2026-11-14T11:05:43Z）。
- 实测：`POST http://127.0.0.1:41999/teach` 弹出「清理测试」面板 + 1 个红框标注；鼠标点面板右下垃圾桶（物理坐标 2435,361）后 state.json 由 `annots=1, panel.visible=true` 变为 `annots=0, panel.visible=true, mode=panel`；`plugin.log` 出现 `clear annots requested from overlay`；截屏 `tmp/panel-after-click.png` 面板、步骤、「下一步」按钮都还在，红框已消失。
- 测试面板已用 `/finish` 收回悬浮球。

**怎么恢复**
- 代码：`git checkout -- native/overlay.ps1 index.js`（本条目尚未提交时），或 `git revert <本条目 commit>`。
- 表格：用备份 `tmp\打磨计划-2026-11.before-B37.xlsx` 覆盖，或删掉第 27 行 B37。


## 2026-11-15 11:15 新增知识文件：自律理论两期视频摘要

**改了什么**
- 新建 `knowledge\自律理论-视频摘要.md`（约 190 行，UTF-8 无 BOM）。
- 新建目录 `knowledge\`（此前不存在）。
- 内容：B 站「自律理论」第 24 期（`BV1Cd4y1s7ze`，17:45，434 条字幕）与第 43 期（`BV1Nx42127Xe`，40:15，839 条字幕）的归纳——样板时间表、三条规则、双重重复、五组分类、结构树、两种用法、能借/不能照搬、落到本插件的映射与判定伪代码、原话摘录（带时间戳）。
- 未改动任何代码，本文件目前不被程序读取。

**为什么**
用户 m01844：「把这些知识整理成摘要，在插件内部专门建一个文件用于存储这些信息」。两期视频分别对应「一天的计划表」和「周期计划结构」，是后续做时间表模板、每日常项（石流）、以及 AI 拆解/排序的地基，放仓库里比留在对话里可靠。

**怎么验证**
- Test-Path knowledge → True；文件已写入。
- 术语「石流」为字幕 ASR 音译，文件内已标注存疑并给出特征（每天重复、按顺序），不当作原词引用。

**怎么恢复**
- 删掉 `knowledge\自律理论-视频摘要.md` 与空目录 `knowledge\` 即可；不影响任何代码路径。
## 2026-11-15 11:20 知识文件加入第 42 期（用番茄做意识管理）

- **改了什么**：`knowledge/自律理论-视频摘要.md`（+102 / -25 行，5451 -> 7265 字符）。
  - 新增 `## 2. 第 42 期：用番茄做意识管理`：2.1 意识管理是什么、2.2 四步循环、2.3 番茄特点、2.4 为什么必须是整点、2.5 格子里没动力怎么办、2.6 石流（完整定义）、2.7 与前两期的关系（含矛盾）。
  - 原第 43 期及其后各节编号整体后移一位：`## 3.` 到 `## 7.`，子标题 `3.x` 到 `5.x` 同步。
  - 标题「两期视频摘要」-> 「三期视频摘要」；顶部视频表补第 42 期一行；第 0 节改成「节律 / 执行 / 判断」三层；「石流」术语说明改为指向 2.6；原话摘录补 42 期 3 条；待办改为「还缺 24 期（下）、战略理论、石流专期」。
- **为什么**：用户 m01887 要求分析 `BV1DS421K7gi`（第 42 期）。整理时发现它和第 24 期的颗粒度冲突——24 期是 1 小时「学 40 休 20」，42 期是半小时一格、格内不休息。不在文件里写清楚版本演进，以后照这份文件做产品会自相矛盾。

**怎么验证**
- 写入后打印二级标题：`0.` 到 `7.` 连续、无重复（脚本输出）。
- `git diff --stat`：单文件 `102 insertions(+), 25 deletions(-)`。
- 内容与视频库 `video_show BV1DS421K7gi`（摘要 + 10 条要点）一致。

**怎么恢复**
- `git checkout HEAD -- knowledge/自律理论-视频摘要.md` 回到 `7ecf8cc` 的两期版本（会丢掉第 42 期整节）。
- 生成脚本是临时文件 `%TEMP%/kb-update.py`，未入库。

## 2026-11-15 11:34 知识文件加入第 41 期（记录行动的用时）

- **改了什么**：`knowledge/自律理论-视频摘要.md`（+120 / -33 行，7265 -> 9375 字符）。
  - 新增 `## 2. 第 41 期：记录行动的用时`：2.1 记什么（固定起止 / 等长半小时 / 段内一个行动 / 连续 / 直观化）、2.2 为什么是半小时、2.3 六种用途（事前 1 当时 2 事后 3）、2.4 节点任务与导正序列、2.5 怎么让记录自己发生、2.6 与另外三期怎么接、2.7 手动记录 vs 自动采集的差异。
  - 原第 42、43 期及之后各节编号整体 +1（`## 3.` 到 `## 8.`），子标题 `3.x` 到 `6.x` 同步。
  - 标题「三期」-> 「四期」；顶部「来源」与视频表补第 41 期一行；第 0 节改成「节律 / 测量 / 执行 / 判断」四层；原话摘录补 41 期 3 条；待办更新。
- **为什么**：用户 m01912 要求分析 `BV1qA4m1G76e`（第 41 期）。这期是整套方法的「测量层」，正好是本插件「今日记录」卡的理论原型，必须和另外三期放在一起才看得出体系；也暴露了一个关键取舍——手动记录本身承担「到点想起来 + 回来」的导正作用，自动采集省了负担但丢了这一层。

**怎么验证**
- 写入后导出全部二/三级标题：`0.` 到 `8.` 连续、子标题 `1.x` 到 `6.x` 无重复（41 条标题）。
- `git diff --stat`：单文件 `120 insertions(+), 33 deletions(-)`。
- 内容与视频库 `video_show BV1qA4m1G76e`（摘要 + 10 条要点）一致。

**怎么恢复**
- `git checkout HEAD -- knowledge/自律理论-视频摘要.md` 回到 `38aea88` 的三期版本（会丢掉第 41 期整节）。
- 生成脚本是临时文件 `%TEMP%/kb-ep41.py`，未入库。

## 2026-11-15 11:41 知识文件：并入第 37 期（给行动制造乐趣）

- **改了什么**：`knowledge/自律理论-视频摘要.md`（+122 / -39 行，9375 -> 11588 字符）：
  - 新增 `## 2. 第 37 期：给行动制造乐趣（增乐促动力）`（2.1 一句话、2.2 四步法、2.3 为什么拆到单质、2.4 锁和钥匙、2.5 发现 vs 构建、2.6 常见乐趣模块、2.7 这期的漏洞、2.8 和另外几期的关系）。
  - 原 41、42、43 期及之后编号整体 +1：`## 3.` 到 `## 9.`，子标题 `3.x` 到 `6.x` 同步。
  - 结构从「四期四层」改成「结构层四期 + 动力层一期」两层：`## 0.` 标题改「五期合起来在讲什么」，正文写明 37 期解决「愿不愿意做」，与 24/41/42/43 的「让行动在对的时间出现」不是同一条线。
  - 标题「四期」->「五期」，来源行与视频表格补第 37 期一行；原话摘录补 3 条（15:27 / 17:53 / 46:20）；待办补缺 37 期的游戏化专期与应用例子。
- **为什么**：用户 m01948 要求分析 `BV19z4y1F7WP`（第 37 期）。这期是「动力层」，前四期都是结构层——之前文件把两者混在「四层」里会误导人以为 37 期是第五步；37 期作者自己也承认只讲框架没讲例子（46:22）、讲到第 4 步时忘了当初写的理由（44:02），这些局限必须和正文一起落盘，否则以后照着做会踩坑。
- **怎么验证**：
- 写入后导出全部标题：`tmp/headings.txt` 共 50 条，`## 0.` 到 `## 9.` 连续无重复，子标题 `1.x` 到 `6.x` 无重。
- `git diff --stat`：单文件 `122 insertions(+), 39 deletions(-)`。
- 与视频本身对照：`video_show BV19z4y1F7WP`（摘要 + 10 条要点）与文件 2.2–2.8 小节一致。
- **怎么恢复**：
- `git checkout HEAD -- knowledge/自律理论-视频摘要.md` 回到 `11b03bd`（四期版本，会丢掉第 37 期）。
- 生成脚本是临时文件 `%TEMP%/kb-ep37.py`，未入库。


## 2026-11-15 11:45 知识文件：并入第 27 期总纲（自律理论骨架）

- **改了什么**：`knowledge/自律理论-视频摘要.md`（+173 / -55 行，11588 -> 14278 字符）：
  - 新增 `## 1. 第 27 期：自律理论总览（总纲）`，含 1.1 一句话、1.2 自然型 vs 目标型、1.3 预测后果倒推选择、1.4 七条规律链、1.5 锁与钥匙、1.6 信念模块、1.7 为什么意识管理是核心、1.8 清单方法的边界、1.9 作者自认的困难、1.10 与另外五期的对应关系。
  - 原 24、37、41、42、43 期及之后编号整体 +1：`## 2.` 到 `## 10.`，子标题 `2.x` 到 `9.x` 同步。
  - `## 0.` 从「两层五期」改成「三层六期」：总纲一期 + 结构层四期 + 动力层一期；结尾补一句「清单只解决舞台，动力那条线另说」，把总纲和产品分工对上。
  - 标题「五期」->「六期」；来源行、更新行、视频表格补第 27 期（放在表首）；原话摘录补 3 条（10:31 / 24:55 / 26:22）；待办改成六期。
- **为什么**：用户 m01992 同意「把这期并进知识文件、放在最前面当导出层」。27 期是总纲，不并进来则另外五期只是技巧合集，看不出彼此关系；而且它里面「清单方法只解决舞台，不解决总动力」直接定义了 guide-tutor 现在这套（清单/记录卡）的边界，必须写在最前面，否则以后容易把「记录做好」误当成「自律做好」。
- **怎么验证**：
- 导出全部标题 `tmp/headings.txt` 共 61 条，`## 0.` 到 `## 10.` 连续无重复，子标题 `1.x` 到 `9.x` 无重。
- `git diff --stat`：单文件 `173 insertions(+), 55 deletions(-)`。
- 与视频对照：`video_show BV1cv4y1r7X7`（摘要 + 9 条要点）与文件 1.4–1.9 小节一致。
- **怎么恢复**：
- `git checkout HEAD -- knowledge/自律理论-视频摘要.md` 回到 `fb41f96`（五期版本，会丢掉第 27 期）。
- 生成脚本是临时文件 `%TEMP%/kb-ep27.py`，未入库。


## 2026-11-15 11:52 新增知识文件：学习理论（专注与发散·一）

- **改了什么**：新建 `knowledge/学习理论-视频摘要.md`（约 190 行，UTF-8 无 BOM），内容为学习理论系列第 16 期（`BV1pQDVYVEVL`，14:48，397 条字幕）。结构：0 这期讲什么 / 1 第 16 期（1.1 两个模式、1.2 独存性与切换性、1.3 分工、1.4 三维度对比、1.5 为什么人过度重视专注、1.6 何时进发散、1.7 怎么进、1.8 演化解释）/ 2 能借与不能照搬 / 3 落到 guide-tutor 的映射 / 4 原话摘录 / 5 待办。
- **为什么**：用户 m02025「可以单开」。这期属于「学习理论」系列，和现有 `knowledge/自律理论-视频摘要.md` 术语体系不同（那边是动力/舞台/信息结构，这边是专注/发散），混写会让两套概念互相污染；单开一个文件，各自可按系列继续扩展。
- **怎么验证**：
- `git status --short` 显示 `?? knowledge/学习理论-视频摘要.md`（新文件，未被跟踪）。
- 文件首字节 35（`#`），无 BOM；行数约 190。
- 内容与 `video_show BV1pQDVYVEVL`（摘要 + 10 条要点）一致，原话摘录 6 条均可在字幕里检索到。
- **怎么恢复**：直接删除 `knowledge/学习理论-视频摘要.md` 即可（本次为新建，无覆盖风险）。


## 2026-11-15 11:56 学习理论知识文件并入第 4 期（五类信息）

- **改了什么**：`knowledge/学习理论-视频摘要.md`，3874 → 7120 字符（+3246），行数 195 → 291。新增 `## 1. 第 4 期：一切学习就是处理五类信息`（1.1 一句话、1.2 为什么要分类、1.3 五类信息总表、1.4 逐类说 1.4.1–1.4.5、1.5 结构强度、1.6 他对斯科特·杨的最终评价、1.7 这期的漏洞）；原 `## 1.`–`## 5.` 整体 +1（第 16 期变 `## 2.`，子标题 `1.x` → `2.x`）；`## 0.` 由「这期讲什么」改写为「这个系列讲什么」，讲两期各自回答什么问题；映射节新增 `### 4.1 按信息类型给建议（第 4 期）` 表，原 3.1/3.2/3.3 变 4.2/4.3/4.4；表头补第 4 期行，原话摘录补 3 条（2:06 / 28:48 / 16:48），待办更新为「还缺 5–15 期与 17 期」。
- **为什么**：用户 m02044 发来第 4 期（`BV1Kx421U7fy`，29:07，685 条字幕），要求分析并并入。这期和第 16 期正好互补：4 期回答「这块材料是什么类型、该用什么方法」，16 期回答「此刻该用哪种认知状态」，缺了 4 期，学习理论文件只有「怎么学」没有「学什么」。
- **怎么验证**：
- 生成脚本 `%TEMP%/kb-learn4.py` 输出 `len 3874 -> 7120`，`headings 28`。
- 导出标题 `tmp/headings-learn.txt`，`## 0.` 到 `## 6.` 连续，子标题 `1.x`/`2.x`/`4.x` 无重；全文件 `grep "^###? \d"` 26 处，无残留 `3.1/3.2/3.3`。
- 与视频对照：`video_show BV1Kx421U7fy`（摘要 + 9 条要点）与文件 1.3–1.5 一致。
- **怎么恢复**：
- `git checkout HEAD -- knowledge/学习理论-视频摘要.md` 回到上一次提交（只有第 16 期的版本）。
- 脚本是临时文件，未入库；第 4 期字幕仍在视频库（`video_show BV1Kx421U7fy`），可重新生成。

## 2026-11-15 12:44 新增设计摘要：目标拆解与「格」度量

- **改了什么**：新建 `knowledge/目标拆解与格-设计摘要.md`（约 260 行，UTF-8 无 BOM）。结构：0 一句话 / 1 单位「格」的定义、为什么叫格、延伸词（满格/空格/半格/连格/断格）、产出格分档、校准方法 / 2 拆解（一步的公式、三个校准器、太简单与太粗的硬判据、倒推五步、拆不动＝缺知识）/ 3 AI 匹配（双向刻度、70–85% 准则、能力更新公式、`user-skill.json` 与 step 结构、三道探针冷启动、三个风险）/ 4 前置改动 / 5 待定四项。
- **为什么**：用户 m02078 提出「宏观目标拆成小步且不能太简单」，m02085 提出「需要表示学习能力标准的单位」，m02091 提出「该单位作为 AI 派任务的判断标准」，m02103 让我给单位取名。定名「格」的理由：一个词同时占「时间格」和「产出格」两层，不另造新词（42 期原话就是「半小时一格」），且自带满格/空格/连格这套可描述进度与连续性的词。落盘是因为这三个想法构成同一套设计，留在对话里会被压缩掉。
- **怎么验证**：
- 文件可读，标题 0–5 共 6 个一级小标题，`## 4. 前置改动` 列出的四条与代码现状一致（`goals.json` 无 steps、`plan-history.json` 丢 goalId、段只有 `planItemId`、无 `user-skill.json`）。
- 本文件是**设计稿**，不含代码改动，运行时长与行为均未变。
- **怎么恢复**：本次为新建文件，直接删除 `knowledge/目标拆解与格-设计摘要.md` 即可，不影响任何代码。

## 2026-11-15 12:52 新增设计表：目标拆解与「格」度量（xlsx）

- **改了什么**：新建 `planning/目标拆解与格-设计表.xlsx`（3 个工作表，UTF-8，openpyxl 生成）。`1-需求与应对` 36 行 4 列（编号/类别/内容/状态），按 R1–R6 六条用户要求分组，每条要求下面挂 2–6 条应对，状态区分已定/待实现；`2-功能联动矩阵` 9 行 11 列，六条要求 × 八个已有功能（清单/记录卡/目标看板/定时器/复盘/知识库/都市指令/L1 标签），末列覆盖率；`3-联动明细` 20 行 6 列（编号/功能/联动点/现状/需要改什么/优先级），17 个触点，P0 五条。
- **为什么**：用户 m02119/m02121 要求「把我的要求设一页，你的应对在要求下面，然后写和其他功能的联动性，excel」。此前的设计摘要（`knowledge/目标拆解与格-设计摘要.md`）是散文式，看不出每条要求对应哪条改动、也看不出与现有八个功能的关系；改成表格后可以逐行核对「要求—应对—落点」。
- **怎么验证**：
- `load_workbook` 读回：三个 sheet 名与行列数正确（36×4 / 9×11 / 20×6），逐格抽检无空表头。
- `3-联动明细` 的「现状」列全部来自代码事实（如 `guide_plan add` 有 goalId 无 stepId、`pushHistory` 丢 goalId、记录模式按 match 分四态），不是推测。
- 未改任何运行代码，插件行为不变。
- **怎么恢复**：新建文件，直接删除 `planning/目标拆解与格-设计表.xlsx` 即可；生成脚本为临时文件 `%TEMP%/mkxlsx.py`，未入库。

## 2026-11-15 13:05 设计表新增第 4 页：成功率模型的实现与细节（lib/units.js）

- **改了什么**
  - 新增 `lib/units.js`（约 250 行，ESM 纯函数、无 IO）：`pKnow / pSkill / pScale / pNovelty / plannedUnits / estimateUnits / verdictOf / estimateWin / recordOutcome / emptySkill` 等 12 个导出。公式 `p = p_know × p_skill × p_scale × p_novelty`，参数 `lambda 0.15 / hardBelow 0.55 / easyAbove 0.85`、Beta(2,1) 先验、`KIND_UNITS` 先验格数表。
  - 新增 `tmp/test-units.mjs`（38 条断言，覆盖四个因子、区间边界、回写、入参不可变）。
  - 新增 `tmp/try-units.mjs`（Spring Boot 6 步真实场景试算）与 `tmp/mk-design4.py`（写表页的生成脚本）。
  - `planning/目标拆解与格-设计表.xlsx` 新增工作表 `4-实现与细节`（61 行 × 4 列，10 节：一句话 / 公式 / 四因子 / 参数表 / 首版翻车 / 修正后试算 / 回写 / 数据结构 / 代码与验证 / 还没定的）。原三页未动。
- **为什么**
  - 用户 m02145 问「分发任务的难度应该怎么计算判定」，m02151 要求「你试试，如果成功就把这个写道目标拆解表里，就说是那个部分的实现与细节」。设计表前三页只写了「要做什么」和「和哪些功能联动」，没有一处写「这套判定的数怎么算出来」，实现之前必须先证明公式跑得通。
  - 首版跑出来 **6 个任务全判「太难」**（装 JDK 56%、quickstart 21%、讲清 IoC 31%、配 datasource 11%、写 CRUD 0%、设计模块 0%），一眼不对。查下来是五处参数问题：熟练度按「信息类型」而不是「产物类型」统计、Beta(1,1) 先验把整体压掉一档、新异度下限 0.75 罚太狠、规模惩罚重复乘了估时偏差、门槛 0.60 偏高。改完后 s1 75%、s3 57% 落在合适区间，s2/s4/s5/s6 仍判太难但各自指向不同缺项（缺 maven / 缺 sql-basic / 没学 IoC），这才是能执行的分发建议。
  - 把「首版翻车」如实写进表里，是因为这五条不是调参手感，而是模型的结构性错误；下次别人照着做会踩同样的坑。
- **怎么验证**
  - `node --check lib/units.js` → 退出码 0。
  - `node tmp/test-units.mjs` → `38 passed`。
  - `node tmp/try-units.mjs` → 6 步判定分层：s1 75% 合适、s2 32% 太难、s3 57% 合适、s4 14% 太难、s5/s6 0% 太难；回写演示 75% → 67%（stuck）→ 60%（partial）→ 64%（done）。
  - `openpyxl.load_workbook` 读回：4 个工作表，`4-实现与细节` 61×4；导出全表文字到 `tmp/design4-dump.txt` 逐行核对，无空行、无错位（表头「因子/算法/为什么这么定」与数据行对齐）。
- **怎么恢复**
  - 删 `lib/units.js`、`tmp/test-units.mjs`、`tmp/try-units.mjs`、`tmp/mk-design4.py` 四个文件（新增文件，无覆盖风险）。
  - 表格只删工作表 `4-实现与细节` 即回到三页版本；`git checkout HEAD -- planning/目标拆解与格-设计表.xlsx` 可整表回退到 `0dc0319`。
  - `tmp/` 按 `.gitignore` 第 2 行约定不入库，`test-units.mjs` / `try-units.mjs` / `mk-design4.py` 只在本机；入库的是 `lib/units.js`、`CHANGELOG.md` 与表页。
  - 参数若要回退到首版：`hardBelow` 0.60、`pSkill` 先验 Beta(1,1)、`pNovelty` 下限 0.75、`pScale` 用 `estimateUnits()`——不推荐，首版 6/6 全判太难。


## 2026-11-15 13:20 前置能力（capability）：把「隐藏项」落成 p_cap

- **改了什么**
  - 新增 `lib/capabilities.js`（约 190 行）：`CAP_STATE` / `SATISFACTION` / `CAP_PARAMS` / `GENERIC_CAPS` / `stateFromMastery` / `normalizeCaps` / `pCap` / `partitionCaps` / `expandable` / `setCapState` / `capGap`。
  - `lib/units.js`（248 行）：`pKnow()` 改为 `pCap()` 的薄包装；`estimateWin()` 的 `parts.p_know` 改名为 `parts.p_cap`，并多返回 `caps`（来自 `capGap()` 的缺口对象）；ADVICE 文案改成「缺前置能力：先补「X」，或派一格验证任务确认你会不会」。
  - `planning/目标拆解与格-设计表.xlsx` 新增第 5 页 `5-前置能力设计`（51 行 × 4 列，11 节：三实体 / 四状态 / p_cap 三条规则 / 迁移规则 / 收敛闸门 / 发现机制 / 界面 / 数据结构 / 代码 / 验证 / 还没定的）；第 4 页末尾第 63 行加注记，标明 p_know 已被 p_cap 取代。
  - 临时脚本 `tmp/try-caps.mjs`（四状态对比）、`tmp/mk-design5.py`（生成第 5 页），按 `.gitignore` 不入库。

- **为什么**
  - 旧模型把前置知识按 `knowledge.mastery` 连乘，没学过就是 0，任务一律判 0% 太难。但「不知道我会不会」和「确定我不会」是两回事，前者还能试。
  - 用户 m02304 明确：隐藏项 = 前置能力（人身上的前置条件），不是环境坑；m02310 要求重新设计。于是把 unknown 单列为 0.75 的状态，只有 lack 才一票否决；`unknown ≥ 2` 时每多一张再乘 0.9^(n-1)，无 lack 时下限 0.2。
  - 「防无限归因」只留一道闸门：`state=lack` + 用户要推进 + 不是通用能力，三条同时满足才往下拆一张牌。

- **怎么验证**
  - `node --check lib/capabilities.js`、`node --check lib/units.js` 均 exit 0。
  - `node tmp/test-units.mjs` → `38 passed`。旧 `requires` 迁移断言数值恰好等价（java-basic 1.0→have、maven 0.5→partial 连乘 0.5、ioc/jpa 0→lack 归零）。
  - `node tmp/try-caps.mjs`：同一件事四种说法——mastery=0（不会）→ p_cap 0；两张 unknown → 0.506（34%）；一张 have 一张 unknown → 0.75（50%）；一张 have 一张 lack → 0。确认「不知道」和「不会」已经分开算。
  - 设计表读回 `tmp/design5-dump.txt`：5 页齐全，第 5 页 51×4，第 4 页 63 行注记在位。

- **怎么恢复**
  - 删 `lib/capabilities.js`；把 `lib/units.js` 的 `pKnow()` 恢复成旧的 `requires × knowledge.mastery` 连乘、`parts.p_cap` 改回 `p_know`（旧实现在 git `10008d0`）。
  - 设计表回到只有 4 页的版本：`git checkout 10008d0 -- planning/目标拆解与格-设计表.xlsx`；或手动删掉 `5-前置能力设计` 页与第 4 页第 63 行注记。
  - `tmp/try-caps.mjs`、`tmp/mk-design5.py` 直接删掉，无外部依赖。


## 2026-11-15 13:47 回退：取消「能力状态由成果推导」这批改动（7981ab3）

- **改了什么**
  - `git revert 7981ab3`，一次提交撤掉三个文件的改动：`lib/capabilities.js`（-108 行，回到 203 行的四态版）、`planning/目标拆解与格-设计表.xlsx`（第 5 页回到 51 行的版本）、`CHANGELOG.md`（删掉 13:48「能力状态改为看成果」整条）。
  - 保留上一版 `7c965b2` 的全部内容：`p_cap` 四态（have/partial/lack/unknown）、`normalizeCaps` 迁移、`expandable` 收敛闸门、`capGap`。
- **为什么**
  - 用户 m02507：「我是说图中的内容其实不重要的意思，把改动退回吧」。指设计表第 5 页「发现机制」那节（AI 列牌 → 用户三选一）以及由此延伸出的「证据从哪来」整节，认为不值得为它增加这层复杂度。
  - 判断标准：`applyAttempt`/`verifyQueue`/`effectiveState` 三件套是为「成果判定」服务的，但成果由谁验、怎么验还没定，先把代码退回到确定的四态模型，避免半成品逻辑留在主路径上。
- **怎么验证**
  - `git log --oneline -2` 显示新提交在 `7c965b2` 之后，`git show --stat HEAD` 显示 `lib/capabilities.js` 减少 108 行、xlsx 变小。
  - `node --check lib/capabilities.js` exit 0；`node tmp/test-units.mjs` → `38 passed`（回调后仍需全绿）。
  - `node tmp/try-caps.mjs` 输出仍是四态对比（不再有 claimHave/unknown 折算）。
- **怎么恢复**
  - 想捡回来：`git revert <本次回退提交的 hash>`，或直接 `git checkout 7981ab3 -- lib/capabilities.js planning/目标拆解与格-设计表.xlsx`。
  - 只想要设计表那页：`git show 7981ab3:planning/目标拆解与格-设计表.xlsx` 导出后另存。
  - 代码层面没有删任何外部依赖，`lib/units.js` 仍只 import `pCap` 与 `capGap`，回退不影响它。

## 2026-11-15 14:20 目标拆解落地：goals.json 长出阶段与步骤，stepId 打通清单与记录

**改了什么**

- 新增 `lib/decompose.js`（约 380 行）：`normalizeGoal` / `validateGoal`（14 种问题码：验收句缺失、「掌握/了解/熟悉/学好/学会/搞懂/理解」判无效、阶段过多、步骤缺产物、缺验法、units>3、依赖缺失、依赖成环等）/ `flattenGoals` / `availableSteps` / `nextSteps` / `toPlanItem` / `setStepStatus` / `recomputeProgress` / `goalProgress` / `progressLine`。
- 新增 `lib/goals.js`（约 150 行）：goals.json 读写，兼容老的数组格式，写回统一成 `{updatedAt, goals}`；`add` / `setMilestones`（校验不过抛错且不写盘）/ `patch` / `remove` / `setStepStatus`。
- 新增 `lib/skill.js`（约 120 行）：user-skill.json 读写；`record`（kinds 计数 + estimateBias EMA）、`setCap`（拒绝通用能力）、`seedFromKnowledge`、`summary`。
- `index.js`：import 三个模块；建 `createGoals` / `createSkill` 实例；`readGoals()` 改为 `goals.active()`；新增 `onGoalStepChange`（勾/退回一步 → 写 goals + 记 skill + 写 daylog）；新增 `guide_goal` 工具（list/show/add/set/decompose/validate/next/done/undo/progress/skill/cap/remove）；`createPlan` 传 `onStepDone`；TUTOR_PROMPT 加【目标拆解】一段。
- `lib/plan.js`：条目解析加 `milestoneId` / `stepId`；add 分支 push 带上；schema 加两个参数；`createPlan` 加 `onStepDone` 选项；`setPlanItemDone` 在勾/退回时回调（只有挂了 stepId 的条目才调）。
- 新增测试：`tmp/test-decompose.mjs`（28 条断言，临时目录）、`tmp/smoke-real.mjs`（真实数据只读现状）、`tmp/e2e-real.mjs`（真实目录完整链路，跑完自动删测试目标）。

**为什么**

14 步链里标 ❌ 的四步（拆阶段、拆步、完成判定、进度回写）此前只有聊天里的设计，文件里一个字都没有。goals.json 只有两行名字，清单条目只有 title，记录段没有目标归属，导致「这个目标做到哪了」「这步花了多久」都答不了。

**怎么验证**

- `node --check` 对 index.js / lib/plan.js / lib/decompose.js / lib/goals.js / lib/skill.js 全部 exit 0。
- `node tmp/test-decompose.mjs` → 28 passed（校验、派发、进度、读写、能力档、清单回调六组）。
- `node tmp/e2e-real.mjs` → 9 passed：在真实 `~/.dsh/guide-tutor` 上建测试目标 g3 → 写两阶段步骤 → next 只派第一步 → 转清单条目 → 勾完成进度 50% → 第二步解锁 → 写能力牌 → 删 g3 → 核对 g1/g2 未被改动。
- `node tmp/smoke-real.mjs` → 现状：g1/g2 各 2 个问题（no-acceptance、no-milestone），可派步骤 0。

**怎么恢复**

- 代码：`git revert <本次提交>`。
- 数据：`tmp/goals.before-e2e.json` 是改动前原样（老数组格式），复制回 `C:\Users\易千纸\.dsh\guide-tutor\goals.json` 即可回退。
- 测试产生的 `user-skill.json` 已删除，内容备份在 `tmp/user-skill.test-artifact.json`（只有测试数据，不是真实能力）。

**删除与数据结构（单独记）**

- 删除文件：`C:\Users\易千纸\.dsh\guide-tutor\user-skill.json`（本次测试生成；恢复方式：从 `tmp/user-skill.test-artifact.json` 复制回，或不管它——删了只是回到「没有能力档案」的初始态）。
- 数据结构变更：`goals.json` 从 `[{id,text,status}]` 升级为 `{updatedAt, goals:[{id,text,acceptance,status,createdAt,milestones[]}]}`。旧文件仍可读（goals.js 兼容两种形状），但一写盘就升级。
## 2026-11-15 14:35 补两处缺口：派发带成功率、steps 的 caps 能被识别

**改了什么**

- `index.js` 的 `guide_goal next`：派发前对每一步调 `estimateWin`，返回里带 `percent` / `verdict` / `weak` / `advice`；`verdict === 'too-hard'` 的不进 `items`，单列到 `tooHard`，`hint` 会说明「能派的都太难，先补前置能力或继续拆」。
- `index.js` 新增 `guide_goal action=spent`：读 `~/.dsh/guide-coach/state.json` 的 `record.segments`，按 `stepId` 汇总实际分钟数（空窗与空闲不算）。
- `lib/capabilities.js` 的 `normalizeCaps()` 增加对 `step.caps` 的识别（`lib/decompose.js` 的步骤用的是 `caps`，此前只认 `capabilities` / `requires`，导致挂了能力牌也不生效）。
- `lib/units.js` 的 `estimateWin()`：`too-hard` 且短板是 `p_cap` 时，把 `capGap` 占位符「X」替换成具体缺的那张牌名（如 `java-basic`）。

**为什么**

第一次跑 `tmp/check-next.mjs` 发现步骤挂了 `caps:[{ref:'java-basic',state:'lack'}]` 却算出 62%（应该 0%）——`normalizeCaps` 不认 `caps` 字段，能力牌等于没挂。另外 `next` 只按格数派，不看成功率，等于第 8 步「定派发」还是空的。

**怎么验证**

- `node tmp/check-next.mjs` → `g1-m1-s1 0% too-hard p_cap | 缺前置能力：先补「java-basic」…`，`g1-m1-s2 62% good`。
- `node tmp/test-units.mjs` 38 passed；`node tmp/test-decompose.mjs` 28 passed；`node tmp/e2e-real.mjs` 9 passed。
- `node --check lib/units.js` exit 0。

**怎么恢复**

`git revert <本次提交>`；纯逻辑改动，无数据迁移。
## 2026-11-15 14:16 验收句不再做语义判断

**改了什么**

- `lib/decompose.js`：删掉 `VAGUE_WORDS` 常量与 `vague-acceptance` 问题码；`validateGoal()` 对 `acceptance` 只校验非空，`no-acceptance` 的文案改成「怎么算做完，说一句你认的就行」。原常量位置留了注释备查。
- `tmp/test-decompose.mjs`：把「模糊验收句会被拦」一条改成「验收句只看用户认不认，不做语义判断」（断言 `vague-acceptance` 为 0、problems 为空）。

**为什么**

原来用「掌握/了解/熟悉/学好/学会/搞懂/理解」七个词做子串匹配，会把「掌握 IoC，并能手写一个 @Autowired 的 demo 跑起来」这种合格句子也判成空话。用户 2026-11-15 14:14 的意见是：掌握不掌握由他自己肯定就行，系统没必要硬判语义。验收句归用户，系统只负责不让它空着。

**怎么验证**

- `node --check lib/decompose.js` exit 0。
- `node tmp/test-decompose.mjs` 28 passed（其中断言 `acceptance: '掌握 Spring Boot'` 不再产生任何 problem）。
- `node tmp/test-units.mjs` 38 passed、`node tmp/e2e-real.mjs` 9 passed（跑完删掉生成的 user-skill.json）。

**怎么恢复**

`git revert <本次提交>`，或把 `lib/decompose.js` 里那段注释换回 `const VAGUE_WORDS = [...]` 并在 `validateGoal` 的 `else` 分支恢复过滤逻辑。
## 2026-11-15 14:32 补齐拆解链路的两个缺件，并把 g1/g2 真正拆开

**改了什么**

- `index.js` 的 `guide_goal` 新增两个 action：
  - `scaffold`：返回一份待填的 milestones 模板 + 六条拆解硬规则 + 提示（填完用 `decompose` 校验再 `apply`）。
  - `review`：今天的复盘——列出挂了 `stepId` 的清单条目、每条在记录卡里的实际分钟、以及各目标的 `progressLine`，返回结构化 `items/done/total/minutes/goals/lines`。
- `index.js` 的 `TUTOR_PROMPT`：【目标拆解】段重写，写入六条硬规则（一步=一格=25–50 分钟+可拿出的产物；product 写名词、check 写怎么验；阶段 3–5 个、每阶段 2–4 步；超 3 格必拆；写不出 check 改 `kind:read`；拆不动=缺知识先插查资料步），并新增【目标复盘】一段指向 `guide_goal review`。
- `guide_goal` 的 description 与 `action` 枚举补上 `scaffold` / `review`。
- 数据侧（`~/.dsh/guide-tutor/goals.json`）：
  - g1 写入验收句「能独立写一个带数据库的 CRUD 接口：curl 能增删改查，实验五的报告能交上去」+ 4 阶段 8 步（环境跑起来 / 看懂依赖注入 / 接上数据库 / 写出 CRUD 接口）。
  - g2 写入验收句「能把课本第三章的脚本改一个功能，并跑出预期的输出」+ 3 阶段 6 步（基础语法过一遍 / 看懂一个完整脚本 / 动手改一个功能）。
- 数据侧（`~/.dsh/guide-tutor/plan.json`）：今天新增两条带 `stepId` 的清单——14:30–15:20「装 JDK 17 并确认版本」`g1-m1-s1`、15:30–16:20「建 Spring Boot 空工程并用 mvn 起 hello」`g1-m1-s2`。
- `tmp/e2e-real.mjs`：三处断言随真实数据更新——派发改成 `limit:50/maxUnits:999` 后按 goalId 过滤（真实 g1/g2 现在也有可派步骤，会占满 limit）；最后一条从「原有目标仍是未拆状态」改成「原有目标的阶段未被测试改动」。

**为什么**

用户问「我要怎么使用这个功能、现在能运行吗」，我列出的缺口里，拆解没有模板入口、复盘完全没有、两个真实目标还是空的。这次补上「怎么拆」的指导与「拆成什么样」的实例，让链路第一次有真实数据可以跑。

**怎么验证**

- `node --check index.js` exit 0。
- `node tmp/decompose-real.mjs` → g1 4 阶段/8 步、g2 3 阶段/6 步，`validateGoal` 零问题。
- `node tmp/seed-plan.mjs` → 今天 2 条，均带 `stepId`。
- `node tmp/check-data.mjs` → 目标结构、清单 stepId、记录卡归因（当前 0 段，因清单刚排、时段未到）、skill 状态均符合预期。
- `node tmp/test-units.mjs` 38 passed、`node tmp/test-decompose.mjs` 28 passed、`node tmp/e2e-real.mjs` 9 passed。
- 数据改前备份：`tmp/goals.before-decompose.json`。

**怎么恢复**

- 目标拆解：把 `tmp/goals.before-decompose.json` 覆盖回 `~/.dsh/guide-tutor/goals.json`。
- 清单两条：`guide_plan remove` 对应 id，或直接删 `plan.json` 里那两条。
- 代码：`git revert <本次提交>`。
## 2026-11-15 14:42 冷启动不再一上来就判「太难」

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\lib\units.js`：新增常量 `COLD_START_PRIOR = 0.85`；`pSkill()` 在 `kinds`/`types` 总样本为 0 时直接返回该值（原来走 Beta(2,1) 得 0.667）；`NOVELTY_BY_SEEN.unknown` 0.7 → 0.8（+1 行注释说明原因）。
- `D:\dsh_TestSpace\guide-tutor\lib\capabilities.js` L113-116：`pCap()` 在「所有能力牌都是 unknown」时返回 `max(floor, 0.9)`，不再按 0.75 逐张折价。
- `D:\dsh_TestSpace\guide-tutor\tmp\test-units.mjs`：两条断言随新参数改（`pSkill 无任何记录 = 冷启动 0.85`、`pNovelty 完全陌生 = 0.8`）。

**为什么**
- 真实数据实测（`tmp/test-live.mjs`，g1 的 5 个步骤）发现：一份 `user-skill.json` 都没有时，5 步里 4 步被判 `too-hard`，advice 全是「这类产物你还没做成过」，一件都派不出去。
- 三个因子叠乘把冷启动压死：`p_cap 0.75 × p_skill 0.667 × p_novelty 0.7 = 0.35`。第一次用的人不该被判成什么都做不了。
- 修后同一批步骤：71% / 61% / 71% / 79% / 71%，全部 `good`。

**怎么验证**
- `node tmp/test-units.mjs` → 38 passed；`node tmp/test-decompose.mjs` → 28 passed；`node tmp/e2e-real.mjs` → 9 passed。
- `node tmp/test-live.mjs` 第 2 节五步全部 `good`，无 `too-hard`。

**怎么恢复**
- `git checkout HEAD~1 -- lib/units.js lib/capabilities.js tmp/test-units.mjs`；或把 `COLD_START_PRIOR` 改回 `(0+2)/(0+3)`、`NOVELTY_BY_SEEN.unknown` 改回 0.7、删掉 `pCap` 里那段 `unknown === caps.length` 的分支。
## 2026-11-15 14:58 用户说的话默认落 daylog（不再靠模型判断值不值得记）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\index.js` L2004-2012：`session/event` 监听里新增 `user/message` 分支——主会话收到用户消息就把文本写进 `daylog-YYYY-MM-DD.jsonl`，`kind` 用 `say`。
- 同文件 L2291-2305：新增 `userTurnText(message)`（取 text block；图片记 `[图片]`；文件记 `[文件 名字]`）与 `redactSecrets(text)`（24 位以上连续字母数字含 `._%-` 只留前 6 位，防止 SESSDATA / apiKey 落盘）。
- 同文件 L3342-3370：新增 `apiServers` 集合，`startApiServer()` 造出 server 就入集合；`error` 分支先 `close()` 再重试下一端口。L3392-3412 的 dispose 改成遍历集合逐个关闭（原来只关 `apiServer`，而热重载太快时 listen 回调还没跑、`apiServer` 仍是 null，端口就漏了）。

**为什么**
- 用户 m03360「不是我说过的话默认要记忆的啊」。原设计把「记不记」交给模型调 `guide_journal`，结果 11-15 一整天只落 1 行系统 note，用户说的话一条没留。这是设计错误，不是漏调工具。
- 顺带修 `plugin.log` 里的 `api port 41999 busy … 42002` 与 `duplicate prefix route "/api/guide-tutor"`：同一个 pid 同时监听 41999–42002 四个端口，来自多次热重载时旧 server 没被关掉。

**怎么验证**
- `node --check index.js` → exit 0。
- `redactSecrets` 样例：`SESSDATA=e9902167%2C1790000000%2Cabcd%2CIIEC` → `SESSDATA=e99021…（已打码）`；`apiKey 0583c87e…` → `apiKey 0583c8…（已打码）`；普通句子与 B 站链接原样保留。
- 端口泄漏要重启 DSH 才能验证干净（旧实例跑的是修之前的代码，这轮重载清不掉它）。

**怎么恢复**
- `git revert <本次提交>`。若只想退回「模型自己判断要不要记」，删掉 L2004-2012 的 `user/message` 分支即可，`userTurnText`/`redactSecrets` 留着不碍事。

## 2026-11-15 15:05 修「工具全掉线」：guide_goal 漏了 output，一条工具把整个 apply 打死

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\index.js` L2580-2606：`guideGoalTool` 补 `output: { schema, render }`（schema 用 `{type:'object',additionalProperties:true}`，render 把 lines/line/goals/items/hint 拼成文本，失败时显示 error + problems）。
- 同文件 L3421-3452：新增 `registerTool(tool)`，把每处 `ctx.tools.register(...)` 包进 try/catch，失败只 log `tool "X" 没注册上：原因` 并返回空 disposer，不再让一条工具注册失败中断整个 apply。

**为什么**
- 现象：本会话里 `guide_say` / `guide_plan` / `guide_goal` 全报 `unknown tool`，但 coach 的 `guide_clock` 等正常；`plugin.log` 从 10:36 之后再也没有 `guide-tutor ready`。
- 真因（日志原话）：`tool "guide_goal" 没注册上：tool "guide_goal" must declare output { schema, render, presentationMeta? }`。`ctx.effect(() => ctx.tools.register(tool))` 的回调同步抛错 → cordis 中止 apply → 排在后面的工具全部不注册、`guide-tutor ready` 也不打。
- 之前一直误判成「热重载时同名工具撞名」，实际是宿主校验工具定义就失败了。

**怎么验证**
- 补完后 `node --check index.js` exit 0；`plugin.log` 出现 `guide-tutor ready`，且无任何「没注册上」。
- 实际调用 `guide_goal action=list` 返回两条目标与进度（0/8 步、0/6 步），工具表的 schema 也已刷新。

**怎么恢复**
- `git revert <本次提交>`。只回退 output 那段也行：删掉 `guideGoalTool` 里的 `output` 对象即可复现原故障（不建议）。

**仍待重启才能清干净的**
- `plugin.log` 还有 `api port 41999 busy … 42003` 与 `webserver: duplicate prefix route "/api/guide-tutor"`：14:06 之后那几次重载留下的旧实例仍占着 41999–42002 与 web 路由。新代码的 `apiServers` 清理只能管之后的实例，管不了已经在跑的旧实例。

## 2026-11-15 15:07 daylog 只记人话：过滤宿主注入的时间采样与系统提示

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\index.js` 的 `userTurnText()`（约 L2290-2330）：新增 `INJECTED_HEAD` 前缀表与 `isInjectedText()`，逐块跳过宿主注入的文本（`Time sampled while preparing` / `Current runtime context.` / `Browser time zone for this request` / `Elapsed since the preceding` / `You are an AI agent powered by DeepSeek Harness`，以及整段 `<system-reminder>`）；过滤后为空就不写。
- 数据清理：`C:\Users\易千纸\.dsh\guide-tutor\daylog-2026-11-15.jsonl` 删掉 1 行脏记录（`{"kind":"say","text":"Time sampled while preparing turn 71…"}`），文件从 2 行回到 1 行（保留 10:18 那条系统 note）。

**为什么**
- 改成「用户消息自动落盘」后，宿主把时间采样、浏览器时区、system-reminder 垫在同一条 user 消息的 content 里，被整段当成用户说的话记进了日志。日志是给人看的，混进机器话就没法当记忆用。

**怎么验证**
- `node --check index.js` exit 0；重载后 `plugin.log` 出现 `guide-tutor ready`（06:53:29Z），无「没注册上」。
- 清理脚本输出 `kept 1 dropped 1`，脏行已消失；`daylog-2026-11-15.jsonl` 现只有 note 那一行。
- 下一条真实用户消息到达时应出现 `{"kind":"say","text":"<原话>"}`，且不含 `Time sampled…`。

**怎么恢复**
- `git revert <本次提交>`。被删的那行是机器文本、无信息量；若要原样找回，可从 `plugin.log` 的对应时间段重建。

## 2026-11-15 15:29 目标看板支持「阶段 + 步骤」，保存不再吃掉 milestones

**改了什么**（全部在 `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`）
- 新增 7 个纯函数：`Get-StepTitle` / `Get-StepCheck` / `Get-StepDone` / `Get-GoalRows`（把目标摊成「阶段行 + 步骤行」）/ `Set-StepDone` / `Remove-GoalStep` / `Add-GoalStep`。
- `Read-GoalsData` 重写：每个目标额外挂 `raw`（原始 JSON 对象，含 milestones/acceptance/caps/stepId…）与 `rows`（渲染用视图）；兼容纯字符串旧格式。
- `Save-GoalsData` 重写：写回 `raw`，`ConvertTo-Json -Depth 12`；不再重建只有 6 个字段的新对象。
- `Rebuild-GoalsPanel` 开头：先按 `raw` 重算每个目标的 `rows`，再清空重画。
- 步骤渲染段（原 1550-1656 行）重写：先画阶段行（标题 + 该阶段 `0/2`），再画缩进的步骤行；步骤下的 `验：…` 小字来自 `check` 字段。
- 勾选/删除步骤改为按 `{g,m,s}` 三元组定位到 `raw` 里的真实步骤；添加步骤走 `Add-GoalStep`（挂到第一个阶段，生成 `stepId`）。
- 顺手修掉一处我自己引入的重复：`[void]$inner.Children.Add($addRow)` 写了两遍，第二次会抛「指定的 Visual 已经是另一个 Visual 的子级」（`overlay.log` 里 `goals debug open failed … @1857`）。

**为什么**
- 14:22 把目标升级成 `milestones[].steps[]` 两层结构后，看板还按 `goal.steps` 单层读，**一步都显示不出来**。
- 更严重：旧 `Save-GoalsData` 把每个目标重建成 `{id,text,createdAt,status,steps,stepSeq}` 再整份覆写，`milestones`/`acceptance`/`caps`/`stepId` 全部不在其中——**打开看板点一下就会把拆解成果抹掉**。

**怎么验证**
- 数据层：`tmp` 下的临时脚本用 AST 从 `overlay.ps1` 抽出真函数，对 `goals.json` 副本跑：`g1: rows=12 milestone=4 step=8`、`g2: rows=9 milestone=3 step=6`；勾掉 `g1-m1-s1` 后保存再读回，`acceptance=True milestones=4 steps=8 s1.status=done stepId=g1-m1-s1 check=True caps=1 units=1` 全部保留。
- 界面：`overlay.log` 出现 `goals debug: window opened`（临时钩子，已删除）；截 `tmp/gw-crop.png`、`tmp/gw-after-check.png`——阶段标题「基础语法过一遍 0/2」、步骤下 `验：不报错，输出和书上截图一致`、勾选后整卡变 `1/6`、阶段变 `1/2`、该行加删除线。
- 语法：`[Parser]::ParseFile` 0 错误；文件头 BOM 仍是 `239,187,191`；overlay 重启后 `overlay.log` 无 err。
- 测试用的那次勾选已撤销（`g2-m1-s1` 回到 `status=todo / doneAt=null`），`goals.json` 现状 `g1 4 阶段 8 步`、`g2 3 阶段 6 步`。

**怎么恢复**
- 改前整份备份：`D:\dsh_TestSpace\guide-tutor\tmp\overlay.before-goals-v3.ps1`（278249 字节，5703 行）。
- 或 `git revert <本次提交>`；只想救数据不回代码，可从 `tmp/goals.with-milestones.json` / `tmp/goals.before-check.json` 取回目标结构。

## 2026-11-15 15:55 步骤可以无限往下拆（树形结构 + 叶子计数 + 级联勾选）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\lib\decompose.js`（310 → 520 行）：步骤从「一层」改成「树」。
  - `normalizeStep()` 递归：`children[]` 同构，`stepId` 逐层拼（`g1-m1-s1` → `g1-m1-s1-s2` → `g1-m1-s1-s2-s1`），带 `depth`。
  - 新增 `walkSteps()` / `flattenSteps()` / `leafSteps()` / `isBranch()` / `findStep()` / `splitStep()` / `branchCount()` / `syncAncestors()` / `cascade()`。
  - `MAX_DEPTH = 8` 只防手滑写出无穷递归，超过报 `too-deep`；校验对组步不要求 `product/check`，对叶子照旧。
  - `setStepStatus()`：勾组步级联子步、取消也级联；子步全 done 时祖先自动 done、被撤销时自动退回。
  - `goalProgress()` / `recomputeProgress()` / `availableSteps()` 全部按**叶子**算；派发只派叶子，父被 dropped 的不派。
- `D:\dsh_TestSpace\guide-tutor\lib\goals.js`：`setStepStatus()` 改用 `findStep()` 递归查找（原来只找两层）；新增 `splitStep(stepId, children)`。
- `D:\dsh_TestSpace\guide-tutor\index.js`：`guide_goal` 新增 `split` action；`show` 递归返回 `children` 与 `group{done,total}`；渲染把树打成缩进文本；参数表加 `children`。
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`（5840 → 5990 行）：
  - 新增 `Count-Leaves` / `Add-StepRows` / `Mark-StepDone` / `Set-StepCascade` / `Sync-BranchStatus` / `Get-StepAncestors` / `Set-StepDoneAt` / `Remove-GoalStepAt`。
  - `Get-GoalRows()` 改成递归，每行带 `path`（如 `0.1.2`）、`level`、`groupDone/groupTotal`。
  - 渲染按 `level` 缩进（每层 16px），组步标题后显示 `done/total`。
  - 卡片右上角的总数改成**只算叶子**（原来把组步也数进去，多出来一个）。
  - 重画后保持滚动位置（原来 `ScrollToEnd()` 会跳到底）。
**为什么**
- 用户要求：「每步小目标可以设置更小级的目标，且可以一直分支下去」。原来只能「目标 → 阶段 → 步骤」两层，装 JDK 这一步拆到「配 JAVA_HOME」就到底了。
**怎么验证**
- 测试全部跑过：`tmp/test-units.mjs` 38、`tmp/test-decompose.mjs` 28、`tmp/test-nested.mjs` 16（新增）、`tmp/e2e-real.mjs` 9、`tmp/test-goalrows.ps1` 19（新增，用 AST 抽 overlay 里的真函数跑）。
- 真实数据：`guide_goal split g1-m1-s1` 拆出 3 个子步（`g1-m1-s1-s1/s2/s3`），`goals.json` 落盘正确。
- 界面：截图 `tmp/gw-tree3.png`（组步「装 JDK 17 并确认版本 0/3」，三个子步缩进一层）、`tmp/gw-tree4.png`（勾掉第一个子步后整卡 `1/10`、阶段 `1/4`、组步 `1/3`、该行划线）。
- 测试勾选已撤销（`g1-m1-s1-s1` 回到 `todo`）。
**怎么恢复**
- 代码：`git revert` 本次提交。
- 数据：`g1-m1-s1` 下的 3 个子步是这次拆的，不想要就在看板上把子步 × 掉、或从 `tmp/goals.before-check.json` 取回拆之前的结构。

## 2026-11-15 16:00 有子步骤的行可以折叠（▸/▾）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`：
  - `Add-StepRows()`（约 L1329-1363）：行对象多三个字段 `sid`（stepId，缺了退回 path）、`hasKids`、`collapsed`；命中折叠表时不递归子行。
  - 步骤行从两列改成三列：折叠钮（16px）| 内容 | 删除（约 L1843-1855）。
  - 新增折叠三角（约 L1930-1968）：`▸` 收起 / `▾` 展开，ToolTip「展开子步骤 / 收起子步骤」，点击切 `$script:GoalCollapsed[$sid]` 后 `Rebuild-GoalsPanel`；只有组步显示，实步留空位保持对齐。
  - 新增 `$script:GoalCollapsed` 表（`Show-GoalsWindow` 之前初始化，只活在内存里，重启回到全展开）。
  - 顺手修一个跟着暴露的 bug：卡片右上角总数原来按「画出来的行」数，折叠后会从 `0/10` 变成 `0/7`；改成按树算（`Count-Leaves`），折叠不影响总数。
- `D:\dsh_TestSpace\guide-tutor\tmp\test-goalrows.ps1`：新增 6 条折叠断言（无关键不改变行数、折叠一个组步少 3 行、collapsed/hasKids 标记、折叠后仍显示 0/3、阶段总数不变）。
**为什么**
- 用户要求「这种小目标可以折叠」。拆到三层以后（装 JDK 17 → 下载/配环境变量/IDEA 选中），一个目标在板上就有十几行，滚起来费劲。
**怎么验证**
- `tmp/test-goalrows.ps1` 25 passed；`tmp/test-units.mjs` 38、`tmp/test-decompose.mjs` 28、`tmp/test-nested.mjs` 16、`tmp/e2e-real.mjs` 9 全过。
- 界面：`tmp/gw-collapsed2.png` 收起时「装 JDK 17 并确认版本 0/3」前是 `▸`、三个子步不显示、卡片仍是 `0/10`；`tmp/gw-tri-click.png` 点 `▸` 后变 `▾`、三个子步展开、阶段仍 `0/4`。
- 实测顺带确认了级联：误点到 checkbox 时整卡从 `0/10` 变 `3/10`、组步 `3/3`，再点一次回到 `todo`。
**怎么恢复**
- 代码：`git revert` 本次提交；折叠表只在内存里，删掉 `$script:GoalCollapsed` 相关代码即回到全展开。

## 2026-11-15 16:15 新增「杂务」：每天的琐碎事单独管，到点自动排进清单

**改了什么**
- 新建 `D:\dsh_TestSpace\guide-tutor\lib\chores.js`（约 300 行）：`CHORE_WINDOWS`（morning/noon/afternoon/evening/any）、`WINDOW_LABEL`、`WINDOW_RANGE`、`EVERY`（daily/weekdays/weekly/every2/every3）、`EVERY_LABEL`、`normalizeChore()`、`dueToday()`（按 lastDone 算间隔）、`planChores()`（在偏好时段里找不与清单冲突的空档，短的先排，两条之间留 5 分钟）、`createChores()`（读写 `~/.dsh/guide-tutor/chores.json`，id 自动 c1/c2）。
- `D:\dsh_TestSpace\guide-tutor\lib\plan.js`：清单条目新增 `choreId`；`guide_plan` schema 加 `choreId`；`createPlan` 新增 `onChoreDone`，勾完成时回调。
- `D:\dsh_TestSpace\guide-tutor\index.js`：
  - 新增 `choreDay()` / `choreLines()` / `pushChoreState()` / `onChoreDone()` / `autoPlanChores()`。
  - 新增 `guide_chores` 工具：`list` / `add` / `update` / `remove` / `done` / `plan`（只算不写）/ `auto`（写进清单）。
  - ticker 每 5 分钟推一次 `state.chores`；每天第一次过 07:30 且今天还有没排的 → 自动排进清单（`choreAutoDate` 去重）。
  - overlay 事件新增 `chore_done`：记 lastDone、写 daylog、顺手把清单里挂着它的那条勾上。
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`：`Rebuild-GoalsPanel()` 在目标卡之前插一张「杂务」卡（标题 + `N/总数` + 说明 + 每条一行：勾选框 / 名称 / 时段与时长），勾选发 `Send-OverlayEvent @{type='chore_done'}` 并本地乐观更新。
- 新增 `D:\dsh_TestSpace\guide-tutor\tmp\test-chores.mjs`（37 条断言）。
**为什么**
- 用户要求「给目标加入一个小模块，名字叫（你来取），作用是每天的一些细碎琐事，比如洗衣服洗袜子洗澡等等事情，然后让ai自动排时间」。洗衣、洗澡、倒垃圾这类事每天都要花时间，但既不属于任何目标、也不该混进目标步骤里；单独一栏才能既不占目标进度、又不漏掉。
**怎么验证**
- `tmp/test-chores.mjs` 37 passed；`tmp/test-units.mjs` 38、`tmp/test-decompose.mjs` 28、`tmp/test-nested.mjs` 16、`tmp/e2e-real.mjs` 9、`tmp/test-goalrows.ps1` 25 全过。
- 真实数据：`chores.json` 写入三条（洗衣服 30 分/晚上/隔天、洗澡 25 分/晚上/每天、倒垃圾 10 分/随时/隔天），重载后日志出现 `chore auto plan start 2026-11-15`，`plan.json` 自动多出 `16:25-16:35 倒垃圾`、`19:00-19:25 洗澡`、`19:30-20:00 洗衣服`，三条都带 `choreId`。
- 界面：`tmp/gw-chores3.png` 看板顶部「杂务 0/3」+ 三行；点「倒垃圾」后 `tmp/gw-chore-done.png` 显示 `1/3`、该行划线变灰，`chores.json` 的 `c3.lastDone=2026-11-15`、`plan.json` 里 16:25 那条 `done=true`，日志 `chore done from overlay: c3`。
**怎么恢复**
- 代码：`git revert` 本次提交。
- 数据：`chores.json` 是新建文件，删掉即回到没有杂务的状态；自动排进清单的三条可以用 `guide_plan action=remove` 划掉。
- 注意：`state.chores` 是运行态字段，删掉代码后旧 state 里会留着，不影响使用。

## 2026-11-15 16:33 目标步骤按今天的空档自动派发（不再死板 3 步）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\index.js`：
  - 新增 `goalCapacity({now})`：从「现在之后的第一个整十分钟」到 22:30，减去今天清单已占的时段，算出还剩多少分钟；`targetUnits = clamp(round(free × 0.6 / 30), 2, 10)`。
  - 新增 `clockOfMin()`、`nextFreeSlot()`（在 busy 列表里找第一个塞得下的起点）。
  - 新增 `autoPlanGoals({dateKey, now})`：取 `nextSteps(limit=targetUnits, maxUnits=targetUnits)`，逐条算成功率、跳过 `too-hard`、用 `nextFreeSlot` 找位置、`planRun add` 带 `goalId/milestoneId/stepId`，两条之间留 10 分钟。
  - tick handler 改成「每天第一次过 07:30 排两样」：先杂务（`choreAutoDate`）、再目标（`goalAutoDate`）；日志 `goal auto plan start` / `goal auto plan done: N 步`。
  - `guide_goal next` 不传 `limit/maxUnits` 时改成按今天的容量（原来死写 3），返回里多一个 `capacity: {freeMinutes, targetUnits}`。
**为什么**
- 用户 m04328：「我是说一天时间有很多。如果任务太少会太空」。原来 `nextSteps` 默认 `limit:3, maxUnits:3`，且只有 `guide_goal next` 能触发——没人调就一直不动，今天清单里只有 14:32 手动加的两条。
**怎么验证**
- 重载后 `plugin.log` 出现 `goal auto plan start 2026-11-15` → `goal auto plan done: 4 步`，`plan.json` 自动多出四条带 `stepId` 的：`16:35-17:05 下载 Temurin 17 安装包并装好`（g1-m1-s1-s1）、`17:15-17:45 配 JAVA_HOME 与 Path`（g1-m1-s1-s2）、`17:55-18:25 在 IDEA 里选中这个 JDK`（g1-m1-s1-s3）、`20:00-20:30 写一个 @Autowired 的 Controller 并访问到`（g1-m2-s1）；四条都绕开了 19:00 洗澡与 19:30 洗衣服。
- 回归：test-chores 37、test-units 38、test-decompose 28、test-nested 16、e2e-real 9、test-goalrows 25 全过；`node --check index.js` exit 0。
**怎么恢复**
- 代码：`git revert` 本次提交。
- 数据：自动派进来的四条可以用 `guide_plan action=remove` 划掉；`goalAutoDate` 只在内存里，重启后会重新判断一次。

## 2026-11-15 16:40 加「派发」按钮：自己定今天排多少

**改了什么**

- `index.js`：
  - `goalCapacity({ now, forceUnits })` 先看 `forceUnits`，再看 `speechSettings.dispatchUnits`，都没有才按空档算（`clamp(round(free*0.6/30), 2, 10)`）。
  - `autoPlanGoals()` 加 `forceUnits` 透传。
  - 新增 `clearAutoSteps()`：撤掉今天所有「挂了 stepId 且没勾」的条目。
  - overlay 事件 `dispatch_goals`：`units=0` 表示回到「按空档自动」，`1–16` 表示固定格数；写 `speechSettings.dispatchUnits` + `saveSpeechSettings()` + `writeState({ dispatchUnits })`，再 `clearAutoSteps()` → `autoPlanGoals()`，写 daylog「派发调整：…」。
  - `guide_goal` 新增 `dispatch` action（参数 `units`，0 = 自动）。
  - tick 每 5 分钟、启动时各 `writeState({ dispatchUnits })` 一次，overlay 打开窗口时能读到当前值。
- `native/overlay.ps1`（+约 120 行）：
  - 清单卡 header 加「派发」文字按钮（在「模板」前），目标窗口 header 加蓝色「派发」链接（head 从 3 列扩到 4 列，✕ 挪到第 4 列）。
  - 新增 `$script:DispatchWindow` 与 `Show-DispatchWindow`：420×246 深色卡片，标题「今天派多少」、说明「一格约 30 分钟」、大号「N 格 ≈ X 小时」、Slider 1–16、「按空档自动」与「重新排」两个按钮。
  - ⚠ 踩坑：handler 里写 `$slider.Value` 取到的是 `$null`（非严格模式下 `[int]$null` = 0），发出去的一直是 `units=0`；改成 `$script:DispatchSlider` 后正常，并加 `if ($v -lt 1) { $v = 6 }` 兜底。

**为什么**

用户说「一天时间有很多，任务太少会太空」，上一版按空档算出的固定 4 步不够直观，也没法自己调。加按钮让他能直接定「今天排几格」，而不是改代码或让我手动 `guide_plan add`。

**怎么验证**

- `node --check index.js` exit 0；`[Parser]::ParseInput` 0 错误；BOM 仍 `239,187,191`。
- 点「派发」→ `overlay.log` 出现 `dispatch window opened`，窗口显示「6 格 ≈ 3 小时」。
- 点「重新排」→ `plugin.log` 出现 `dispatch goals: units=6 removed=5 added=5`；`state.json` 的 `dispatchUnits=6`；`plan.json` 目标条目正好 6 格：
  - 16:40–17:10 下载 Temurin（1 格）
  - 17:20–17:50 配 JAVA_HOME（1 格）
  - 18:00–18:30 IDEA 选 JDK（1 格）
  - 20:00–21:00 建 Spring Boot 空工程（2 格）
  - 21:10–21:40 写 Controller（1 格）
  - 杂务三条（倒垃圾 16:25、洗澡 19:00、洗衣服 19:30）没被动。

**怎么恢复**

- 代码：`git revert` 本次提交。
- 数据：把 `~/.dsh/guide-tutor` 里 speech 设置文件的 `dispatchUnits` 删掉（或点「按空档自动」），就回到按空档算。
- 已排进清单的条目点「派发 → 重新排」会整批重排，不会留下旧条目。

## 2026-11-15 16:42 修「重排后会重复提醒」

**改了什么**

- `lib/plan.js`：`createPlan()` 内加 `const remindedKeys = new Set()`；`planTick()` 的 `toRemind` 判断从「`item.remindedAt` 为空 + 落在 `from-10 ~ from+2`」改成再查一次 `remindedKeys`（键是 `${plan.date}|${item.from}|${item.title}`），命中就跳过；真的提醒时把键写进集合，集合超过 800 条自动清空。

**为什么**

点「派发 → 重新排」时，`clearAutoSteps()` 会把今天没做的条目删掉重排，新条目的 `remindedAt` 是 `null`，于是同一条目又落回提醒窗口，被连续提醒三次（16:38、16:39、16:40 各一次）。加 `remindedAt` 也不能解决跨进程重启的情况，所以用「日期 + 开始时间 + 标题」做键来认「这条已经提醒过了」。

**怎么验证**

- `node --check lib/plan.js` exit 0。
- 回归：`test-units` 38、`test-decompose` 28、`test-chores` 37、`test-nested` 16、`e2e-real` 9 全过（五个脚本退出码均 0）。
- 行为：同一条重排后（标题与开始时间不变）不再触发第二次提醒；改变了开始时间或标题的条目会正常提醒。

**怎么恢复**

`git revert` 本次提交。副作用是回到「重排后可能重复提醒一次」的旧行为，不影响数据。

## 2026-11-15 16:50 修「派发的条拉不动」

**改了什么**

- `native/overlay.ps1` 的 `Show-DispatchWindow`：
  - 删掉窗口级 `$win.Add_MouseLeftButtonDown({ $win.DragMove() })`——这个 handler 会在滑块、±、按钮上按下时先触发，把拖动手势全吃掉。
  - 拖动窗口改绑在标题文字 `$title` 上（`Cursor=SizeAll`，ToolTip「按住这里可以拖动窗口」）。
  - `$slider.IsMoveToPointEnabled = $true`：点轨道任意位置直接跳过去，不必精确抓住滑块。
  - 滑块下加一行「−」「＋」两个按钮，点一下加减一格，作为拖不动的兜底。

**为什么**

用户反馈「派发的条拉不动」。实测拖拽时整个窗口跟着动、滑块值不变，确认是窗口级 DragMove 抢了手势。

**怎么验证**

- `[Parser]::ParseInput` 0 错误；BOM 仍 `239,187,191`。
- `overlay.log` 出现 `dispatch window opened`；窗口里能看到「−」「＋」一行。
- ⚠ 局限：我用脚本合成的鼠标点击打不进这个窗口（同样的点击在「我的目标」窗口里有效），所以拖拽和 ± 的最终效果需要用户用真鼠标确认一次。代码层面三处改动方向是确定的。

**怎么恢复**

`git revert` 本次提交，回到「窗口任意位置可拖动、滑块拖不动」的旧行为。

## 2026-11-15 16:53 派发窗口换成预设格数按钮（滑块与 ± 点不动）

**改了什么**

- `native/overlay.ps1` 的 `Show-DispatchWindow`：
  - 删掉 Slider 和「−」「＋」两个按钮，换成一排预设：「4 格 / 6 格 / 8 格 / 10 格 / 12 格 / 14 格」，当前值高亮成蓝色。
  - 每个预设按钮把格数存进控件自带的 `Tag`，事件处理里用 `[int]$s.Tag` 读，不再依赖循环变量闭包。
  - 点预设 = 立刻发 `dispatch_goals` 并按该格数重排，随即关窗。
  - 底部只留「按空档自动」和「关闭」；「重新排」删掉（预设按钮本身就是重排）。
  - 窗口拖动仍然只绑在标题上。

**为什么**

用户反馈「点的加号减号没用」。查 `overlay.log` 发现 handler 确实执行了（`dispatch preset clicked:`），但格数是空的 —— PowerShell 的 scriptblock 在函数返回后拿不到循环里的 `$unitsVar`，`[int]$null` 就是 0，于是每次都按「自动」重排。同理「重新排」读 `$script:DispatchSlider.Value` 也一直是 `$null`，靠 fallback 才发成 6。用控件 `Tag` 传值可以彻底绕开闭包生命周期问题。

**怎么验证**

- `[Parser]::ParseInput` 0 错误；BOM 仍 `239,187,191`。
- 点「8 格」→ `overlay.log`：`dispatch preset clicked: 8`；`plugin.log`：`dispatch goals: units=8 removed=5 added=6`；`state.json` 的 `dispatchUnits=8`。
- 清单按 8 格重排成 6 条（合计 8 格）：17:00 Temurin（1）、17:40 JAVA_HOME（1）、18:20 IDEA 选 JDK（1）、20:00 建工程（2）、21:10 写 Controller（1）、21:50 说清 IoC（2）。

**怎么恢复**

`git revert` 本次提交，回到滑块版本（滑块在这台机器上拖不动，不建议回退）。

## 2026-11-15 17:00 删目标时清单里的条目一起消失（附：goals.json 被覆盖的事故与写盘保护）

**改了什么**
- `index.js`：新增 `dropGoalItems(goalId)`（在 `planHistoryData` 之后约 20 行），按 `item.goalId === gid` 或 `item.stepId.startsWith(gid + '-')` 挑条目，逐条 `plan.run({action:'remove', id, note:'目标已删'})`，返回被撤标题数组；`guide_goal` 的 `remove` 分支改为先 `dropGoalItems` 再 `goals.remove`，daylog 与返回值带上 `cleared`；overlay 事件新增 `case 'goal_removed'`（插在 `dispatch_goals` 之前）。
- `native/overlay.ps1`：目标卡 ✕ 的 handler（约 L1915，`Save-GoalsData` 之后）加 4 行「`Send-OverlayEvent @{ type = 'goal_removed'; goalId = [string]$goal.id }`」。
- `lib/goals.js`：新增 `let broken = false`；`readRaw()` 遇到非 ENOENT 的异常时把坏文件另存 `goals.broken-<ts>.json`、置 `broken = true`；`save()` 开头 `if (broken) throw`，杜绝「读空 → 写空」。

**为什么**
- 用户 m04671：「在我删除目标时，其在清单上的任务也应该消失」。
- 做这个需求时用 `guide_goal add` 造测试目标，`goals.json` 被整份覆盖，原有 g1/g2 连同 4 阶段 8 步 / 3 阶段 6 步全部丢失（见下条「数据事故」）。

**怎么验证**
- `tmp/test-goals-guard.mjs`：正常 add → `['A']`；把文件写成坏 JSON 再 add → 抛错、文件字节未变、目录里多一个 `goals.broken-*`。4 项全过。
- 真实数据：`guide_goal add` 造 g3 → `guide_plan add` 加一条 `stepId=g3-m1-s1` 的条目 → `guide_goal remove id=g3` → `plan.json` 里该条目消失，`goals.json` 剩 g1(4 段)/g2(3 段)。
- `node --check index.js`、`node --check lib/goals.js` 均 exit 0；`overlay.ps1` `[Parser]::ParseInput` 0 错误、BOM 仍是 239,187,191；热重载后 `plugin.log` 出现 `guide-tutor ready` + `overlay ready (pid 46312)`。

**怎么恢复**
- 代码：`git revert <本次 commit>`。
- 数据：`goals.json` 已从 `D:\dsh_TestSpace\guide-tutor\tmp\goals.before-check.json`（14:39 备份，9503 字节）恢复。

**数据事故（不可忽略）**
- 时间：2026-11-15 16:57 前后。
- 现象：`C:\Users\易千纸\.dsh\guide-tutor\goals.json` 被整份覆盖，只剩一条 `【测试】删除目标时清单要清干净`；原有 g1（Spring Boot）/g2（Python）及全部阶段步骤丢失。
- 原因（初判）：`lib/goals.js` 的 `readRaw()` 在 JSON 解析或规范化抛错时静默返回空数组，紧接着 `add()` 用这个空数组 `save()`，整份覆盖。
- 已恢复：从 `tmp/goals.before-check.json` 写回 g1(4 阶段 8 步)、g2(3 阶段 6 步)，`updatedAt` 刷新为恢复时刻。
- 仍缺：15:28 把 `g1-m1-s1`「装 JDK 17 并确认版本」拆成的 3 个子步（下载 Temurin 17 / 配 JAVA_HOME 与 Path / IDEA 里选中 JDK）不在这份备份里，需要重新拆；其余内容与 14:39 一致。
- 原始被覆盖前的文件没有单独留档（被 `guide_goal add` 直接 writeFile），这是这次最该避免的地方。

## 2026-11-15 19:45 杂务卡支持加 / 改名 / 删

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\index.js`：`case 'chore_done'` 重写（`event.done === false` 时把当天的 `lastDone` 清掉，算取消勾选）；新增 `case 'chore_add'` / `case 'chore_update'` / `case 'chore_remove'` 三个 overlay 事件，分别落盘、推 state、写 daylog。合计约 +60 行。
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`：杂务卡头从 2 列改 3 列并加蓝色「＋」按钮（`Send-OverlayEvent @{type='chore_add'}`）；每行末尾加「✎」（改名字，`$script:EditingChore = Tag` 后 `Rebuild-GoalsPanel`）与「✕」（`chore_remove`）；渲染时若 `$script:EditingChore` 等于该条 id，名称位置换成 `TextBox`（Enter 发 `chore_update`、Esc 取消）。约 +95 / −20 行。

**为什么**
用户问「为什么没有针对杂务部分的增删改查？」——后端 `guide_chores` 早就有 `list/add/update/remove/done/plan/auto`，但桌面看板上的杂务卡只渲染 checkbox + 名字 + 时间，没有任何增删改入口，等于只能通过聊天改。

**怎么验证**
- `node --check index.js` exit 0；`overlay.ps1` 用 `[Parser]::ParseInput` 校验 0 错误、BOM 仍是 `239,187,191`。
- 实机点击：点「＋」→ `plugin.log` 出现 `chore added: c4 新杂务`，`chores.json` 多一条；点「✕」→ `chore removed: c1`，文件少一条；点「✎」→ 名字变输入框，输入「洗澡2」回车 → `chore updated: c2`、`chores.json` 改名成功。
- 截图：`D:\dsh_TestSpace\guide-tutor\tmp\chore-ui4.png`（＋ 与 ✕）、`tmp\chore-edit8.png`（改名输入框）、`tmp\chore-final.png`（最终三件套）。

**怎么恢复**
- 代码：`git revert` 本次提交。
- 数据（本次测试动过 `C:\Users\易千纸\.dsh\guide-tutor\chores.json`）：测试加的 `c4 新杂务` 已删除；误删的 `c1 洗衣服`（30 分 / 晚上 / every2）已按原值写回；改名的 `c2` 已从「洗澡2」改回「洗澡」。当前三条：c1 洗衣服、c2 洗澡、c3 倒垃圾。

**踩坑记录**
- `TextBlock` 上挂 `MouseLeftButtonUp` 不稳，改成外层套 `Border`（`Background=Transparent`）才稳定命中——「✕」和「✎」都是这么修的。
- 我给 `$script:EditingChore = $null` 的初始化插错了位置（插进了 `Rebuild-GoalsPanel` 内部），导致每次重画都把编辑态清掉、点了没反应；已删掉那一行。

## 2026-11-15 19:52 目标窗口能拖了（自定义标题栏）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`：
  - `New-GWindow`（L2795 起）：给标题栏 `$bar` 补 `Background = Transparent`（Grid 没背景时空白区不参与命中），并把 `DragMove()` 换成手写拖拽——`MouseLeftButtonDown` 记屏幕坐标与窗口 Left/Top、`MouseMove` 里按屏幕位移改 Left/Top、`MouseUp` 释放捕获。约 +30 / −6 行。
  - `Show-GoalsWindow`（L2653 起）：这个窗口是 `-NoBar` 建的，没有系统标题栏，之前根本没有拖动逻辑。给自定义 header `$head` 挂同一套拖拽，并设 `Background = Transparent`。约 +30 行。

**为什么**
用户报「目标窗口拖不动了」。查下来：目标窗口用 `-NoBar`，标题栏被隐藏，只有内容区，所以从来没绑过拖动；其它窗口（清单历史、模板、对话记录）虽然有标题栏，但 `DragMove()` 在 PowerShell 事件回调里会进模态循环，一抛异常就被 `try/catch` 吞掉，表现为「按着没反应」。

**怎么验证**
- `overlay.ps1` 用 `[Parser]::ParseInput` 校验 0 错误、BOM 仍是 `239,187,191`。
- 实机拖动目标窗口标题栏空白处：窗口物理位置从 `(818,275)` 移到 `(460,708)`，位移 `(−358,+433)`，与鼠标位移一致（截图 `tmp/d2-before.png` → `tmp/d4-after.png`）。
- 关闭按钮、派发链接仍是 Preview 拦截，不会被拖动吃掉。

**怎么恢复**
`git revert` 本次提交。拖动是纯 UI 行为，不涉及任何数据。

**踩坑记录**
- 第一版用「鼠标相对窗口的坐标」算位移，窗口跟着鼠标走 → 相对坐标不变 → 位移恒为 0，看着就是「拖不动」。必须用 `PointToScreen` 拿屏幕坐标。

## 2026-11-15 19:58 拖动位移放大 1.5 倍（DPI 缩放没换算）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`：
  - `New-GWindow` 的标题栏拖拽（L2850-2874）与 `Show-GoalsWindow` 的自定义 header 拖拽：MouseDown 时用 `[System.Windows.PresentationSource]::FromVisual($w).CompositionTarget.TransformToDevice.M11` 取当前 DPI 缩放，存进 `$script:BarDrag.Scale`；MouseMove 里把物理像素位移除以它再改 `Left/Top`。两处各约 +8 行。

**为什么**
上一版用 `PointToScreen` 拿到的是**物理像素**，而 WPF 的 `Window.Left/Top` 是**设备无关像素（DIP）**。这块屏缩放 150%，于是鼠标移 100 逻辑像素、窗口跑 150，看起来「拖不动/跟不上/越拖越偏」。实测：鼠标物理位移 `(−240,+287)`，窗口位移 `(−358,+433)`，比值正好 1.5。

**怎么验证**
- `[Parser]::ParseInput` 0 错误、BOM 仍是 `239,187,191`。
- 实测拖动：鼠标物理位移 `(−150,+150)`，窗口位移 `(−145,+152)`，1:1 跟随（截图 `tmp/dragdpi-before.png` → `tmp/dragdpi-after.png`）。

**怎么恢复**
`git revert` 本次提交。纯 UI 行为，不涉及数据。

**说明**
拖动后关闭窗口再打开会回到屏幕正中——`New-GWindow` 用的是 `WindowStartupLocation = CenterScreen`，位置不持久化。这是既有行为，本次没改。

## 2026-11-16 09:32 「排进今日清单」改成「排下一步」，派发不再撤手动排的条目

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`：
  - 新增 `Find-NextLeafStep($goal)`：递归找该目标第一个「没 done 的实步」（有子步骤的组步跳过）。约 +30 行。
  - 目标卡底部按钮由「排进今日清单」（`Show-AddTaskWindow -PrefillTitle 目标标题`）换成「排下一步」：点击找下一个可做叶子，`Send-OverlayEvent @{ type='plan_step'; stepId=… }`；没有可做步骤时弹一句提示。约 +12 / −8 行。
- `D:\dsh_TestSpace\guide-tutor\lib\plan.js`：清单条目新增 `auto` 字段（读 L113 附近、写 L733 附近），标记「这条是派发自己排进来的」。
- `D:\dsh_TestSpace\guide-tutor\index.js`：
  - `autoPlanGoals` 排的条目写 `auto: true`。
  - `clearAutoSteps()` 的过滤从「所有带 stepId 且未完成」改成「`auto && stepId && !done`」——派发重排只撤自己排的。
  - 新增 `planOneStep(stepId)`：手动排某一步，找空档（`nextFreeSlot`）、去重（今天已有同 stepId 未完成就报错）、带 `stepId/goalId/milestoneId`、`auto: false`。
  - 新增 overlay 事件 `plan_step`；`guide_goal` 新增 `plan` action（参数 `stepId`）。

**为什么**
用户报「『排进当日清单』和派发功能冲突」。查下来是两个问题叠着：
1. 旧按钮把**目标标题**预填进「加任务」窗口，加出来的条目**没有 stepId**，既不算进度、也和派发排的「叶子步骤」形成两条同义条目；
2. `clearAutoSteps()` 会撤掉今天**所有**带 stepId 且未完成的条目，包括用户手动排的——点一次派发，手动排的就被吞了。

**怎么验证**
- `node --check index.js`、`lib/plan.js` exit 0；`overlay.ps1` `[Parser]::ParseInput` 0 错误、BOM 仍 `239,187,191`。
- `Find-NextLeafStep` 用 AST 抽函数实测：g1→`g1-m1-s1`、g2→`g2-m1-s1`、g3→`g3-m2-s1`（作业 5 已完成，正确跳到作业 6 第一步）。
- `guide_goal action=plan stepId=g2-m1-s1` → 「排上 14:10–14:40 跑通课本第一章的 3 个示例脚本」，plan.json 里 `auto=false`。
- 再 `guide_goal action=dispatch units=8` → 6 条 g1 步骤被撤掉重排（`auto=true`），**14:10 那条 g2 手动排的原样保留**，杂务两条也没动。

**怎么恢复**
`git revert` 本次提交。`auto` 是新增字段，旧数据缺省为 `false`（会被当作手动排，派发不撤）；要恢复旧行为把 `clearAutoSteps` 的过滤改回 `i.stepId && !i.done` 即可。

**说明**
今天已有的 6 条 g1 步骤手工补了 `auto: true`（它们是旧版派发生成的），否则新逻辑会把它们当手动排的、撤不掉。

## 2026-11-24 14:12 清单提醒可以关了（settings.planReminders）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\lib\plan.js`：`createPlan()` 参数表加 `planRemindersEnabled = () => true`（L22 附近）；`planTick()` 开头取出 `const remindersOn = planRemindersEnabled()`，把「到点提醒」「超时追问」「今天还没排清单」三处触发都加上 `remindersOn &&` 前置判断（L552、L597 附近）。约 +4 / −3 行。
- `D:\dsh_TestSpace\guide-tutor\index.js`：`DEFAULT_SPEECH` 加 `planReminders: true`（L1675）；`createPlan({...})` 传 `planRemindersEnabled: () => speechSettings.planReminders !== false`（L2704 附近）。
- `C:\Users\易千纸\.dsh\guide-tutor\settings.json`：加 `"planReminders": false`（用户本次要求「提醒停掉」）。

**为什么**
用户从 11-18 起连续几天不回清单确认，系统每半小时问一句「这一项还做吗」，既没效果又烦。原来的代码里只有「每条被提醒过就记 remindedAt」这种逐条去重，没有总开关，关不掉。现在开关放在 settings.json，改一个字段即生效，热重载后马上停。

**怎么验证**
- `node --check index.js` / `lib/plan.js` 均 exit 0（用 `C:\Users\易千纸\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`）。
- 改 `cordis.patch.yml` 的 reload 注释触发热重载，`plugin.log` 出现 `guide-tutor ready` → `overlay ready (pid 42144)`，无报错。
- `settings.json` 里 `planReminders: false` 已落盘；重载后清单不会再触发「快到点/该开始了/排今天」三种提示。

**怎么恢复**
把 `settings.json` 里的 `planReminders` 改成 `true`（或删掉这个字段，默认就是 true），然后改一下 `cordis.patch.yml` 的 reload 注释触发重载即可。要回退代码就用 `git revert` 本次提交。

**注意**
课表提醒（上课前 30 分钟那条）不受这个开关影响，它走 `timetable.reminders.enabled`，需要单独关。

## 2026-11-24 14:20 新增《插件架构说明》文档

**改了什么**
- 新建 `D:\dsh_TestSpace\guide-tutor\docs\插件架构说明.md`（374 行，18593 字节）：面向外部 AI 的完整技术说明，含系统边界、进程与通信模型（state.json 下行 / events.jsonl 上行）、两仓库代码结构与行数、工具清单、六类核心数据模型（goals/plan/chores/settings/skill/records）、成功率公式、一次派发调用链、10 条技术约束、9 条技术债、按问题索引的阅读入口。

**为什么**
用户要把插件介绍发给另一个 AI 分析。原有 `README.md`（91 行）和 `HANDOFF.md`（100 行）是 11-14 写的，只覆盖「截屏 + 标注 + 清单」，不含目标拆解、格数、能力牌、杂务、派发、提醒开关这些后来加的东西。

**怎么验证**
- `Get-Item docs\插件架构说明.md` → 18593 字节、374 行。
- 文中行数来自脚本统计（`os.walk` 排除 `.git/tmp/shots/node_modules`），tutor `index.js` 4250 / `lib` 18 个文件 5242 / `overlay.ps1` 6643，coach `index.js` 1253 + `lib` 3179 / `overlay.ps1` 6334。
- 工具清单用 `Select-String "name: 'guide_"` 从两个仓库的 `index.js` 与 `lib/*.js` 提取，tutor 12 个、coach 7 个。

**怎么恢复**
`git rm docs\插件架构说明.md`；纯文档，无数据影响。

## 2026-11-24 14:40 新增《艾宾浩斯复习卡设计摘要》

**改了什么**
- 新建 `D:\dsh_TestSpace\guide-tutor\knowledge\艾宾浩斯-复习卡设计摘要.md`（229 行，8317 字节）：把外部 AI 提交的 451 行 `SPEC:guide-review` 摘要化，含遗忘曲线公式与常数、金标表（前 4 轮手算核对）、状态机、review.json 与 plan.json 的数据契约、7 条不变量、派发配额、**3 处我核对出的问题**、2 处可忽略项、6 个待定项与建议顺序。

**为什么**
用户要求「整理成摘要放进文档，名字跟艾宾浩斯遗忘曲线有关」。这份 spec 的数学部分可用，但有 3 处会落地成 bug，摘要里把「可用」和「要改」分开写，以后照它实现时不会把错误一起抄进去。

**怎么验证**
- `(Get-Content knowledge\艾宾浩斯-复习卡设计摘要.md).Count` → 229 行。
- 数学核对：`FACTOR=19/81, DECAY=-0.5` 代入 `t=S` 得 `R=0.9`；`intervalFor(0.9,S)=S`；金标表前 4 轮手算 `S = 1.0152 / 1.7251 / 2.8778`、到期 `1.0352 / 2.7603`，与原文表一致（±0.0001）。
- 三处问题均有代码依据：级联建卡查 `lib/decompose.js` 的 `cascade`/`syncAncestors`；窗口位置查 `native/overlay.ps1` 的 `card.mode` 分派；题面来源查 `lib/decompose.js` 的 `validateGoal` 只校验 `check` 非空。

**怎么恢复**
`git rm knowledge\艾宾浩斯-复习卡设计摘要.md`；纯文档，无数据影响。

## 2026-11-24 14:48 《艾宾浩斯复习卡设计摘要》补「与目标模块的协调」

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\knowledge\艾宾浩斯-复习卡设计摘要.md`：229 → 340 行。
  - 新增 `## 4. 与目标模块的协调`（108 行，9 个小节）：六个接触点表（建卡来源 / 配额切分 / 复习包 / 目标完成 / 删目标 / 看板）、卡如何挂到目标树、配额公式（`reviewQuota = min(3, floor(targetUnits × 0.25))`）、复习包不挂 `goalId`、目标完成的 A/B 两个方案、删目标置 `suspended`、看板徽标 `⟳ N`、单目标不超过配额一半的硬约束、以及「不会被影响的三处」。
  - 原 §4–§7 编号后移为 §5–§8。
  - 待定项表新增一行「复习是否参与目标完成判定｜不参与（A）｜待拍板」。
  - §8 一句话总结加一句「目标是学会，复习是不忘记」。

**为什么**
用户问「艾宾浩斯和目标模块怎么协调」，确认要写进文档。这些是落地时必须先定的接口，散在聊天里会丢。

**怎么验证**
- `(Get-Content knowledge\艾宾浩斯-复习卡设计摘要.md).Count` → 340 行。
- `Select-String '^## '` 输出 §0–§8 共 9 个标题，编号连续无重复。
- 表内 `reviewQuota / learnQuota` 公式与 `targetUnits` 现有算式（`clamp(round(free*0.6/30), 2, 10)`）一致。

**怎么恢复**
`git revert` 本次提交。纯文档，无数据影响。

## 2026-11-24 14:50 定下「复习不阻塞目标完成」（方案 A）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\knowledge\艾宾浩斯-复习卡设计摘要.md`：340 → 357 行。
  - §4.5 由「待定」改为「已定：方案 A，复习不阻塞」，写明拍板日期与理由；原 A/B 对照表保留作备查，B 标注「未采用」。
  - 新增「保持度」派生算法 `retentionOf(goal)`：`cards` / `avgS` / `dueToday` / `lastReviewedAt` 四个字段，明确**纯派生、不落盘**。
  - 新增实现约束：`recomputeProgress` 一个字符都不改。
  - §6 待定项表该行状态改为「✅ 2026-11-24 已定」。
  - §8 总结补「`recomputeProgress` 一个字符都不动（方案 A 已定）」。

**为什么**
用户 2026-11-24 13:46 回答「a」，即选 A（复习不阻塞目标完成）。这是落地时必须先定的语义，定完要落到文档，否则实现时会退回 B 或反复摇摆。

**怎么验证**
- `(Get-Content knowledge\艾宾浩斯-复习卡设计摘要.md).Count` → 357 行。
- `Select-String '已定|待你拍板'` → §4.5 与 §6 均为「已定」，全文无「待拍板」。

**怎么恢复**
`git revert` 本次提交。纯文档，无数据影响。

## 2026-11-24 15:36 复习本落地（艾宾浩斯遗忘曲线 + 纸手账界面）

**改了什么**
- 新增 `D:\dsh_TestSpace\guide-tutor\lib\review-store.js`（约 400 行）：R = (1 + t/(FACTOR·S))^DECAY，`FACTOR = 19/81`、`DECAY = -0.5`；`applyGrade()` 按「记得 / 模糊 / 忘了」重算 S 与下次到期，忘了 S×0.35 且 20 分钟后重来，连忘 4 次转 leech 挂起；`dayView/weekView/monthView/stats` 三视图纯函数；`review.json` 读坏时备份 `.broken-<ts>` 并拒绝写盘。
- `index.js`：`onGoalStepChange` 里叶子步骤 done 时自动建卡（组步不建）；`dropGoalItems` 之后挂起该目标的卡；新增 `pushReviewState()`（写 `state.review`，tick 每 5 分钟）；新增 `guide_review` 工具（list/stats/day/week/month/add/grade/backfill/suspend/resume/remove）；overlay 事件 `review_open` / `review_grade` / `review_add`。
- `native/overlay.ps1`（+约 900 行）：新增 `Show-ReviewWindow` 纸手账风窗口——三层纸叠、版心双线、朱红「复」字章、日/周/月三视图、卡片面三按钮；面板页眉加「复习」按钮；`Apply-State` 里数据指纹变化时自动重画（打完卡界面立刻更新，不会停在旧数字）。
- 修两处：①新建卡第一次复习时 R 取 `wantRetention`，否则刚建卡立刻复习收益恒为 0、S 不变；②`dayView` 的「已逾期」按日期比较而非时间比较，否则当天早上到期的卡会被算成逾期。
- 修一处 UI bug：点日/周/月切换后 tab 会消失——把 tab 行抽成 `Add-ReviewTabs`，每次重画都重建。

**为什么**
用户 11-24 给了外部 AI 写的复习调度 spec，核对数学正确后要落地；并明确要求界面「风格完全和现在的不一样」，所以做成纸手账（米白纸、墨线、朱红章），与现有深色玻璃界面区分开。

**怎么验证**
- `tmp/test-review.mjs` 16 项、`tmp/test-review-store.mjs` 9 项全过（R(S,S)=0.9、intervalFor(0.9,S)=S、金标表前 4 轮 1.0152/1.7251/2.8778/4.7016 误差 <0.5%）。
- 真实数据 backfill 出 2 张卡；界面点「记得」后 `review.json` 里 `r-g4-m1-s1` 的 S 由 1.0 → 1.7001、dueAt 由 11-24 15:30 → 11-26 08:30、state learning → review，`plugin.log` 记 `review graded: r-g4-m1-s1 g=3 S=1.70`；界面随即变成「今天到期 1 / 以后 1 / 今天已复习 1」。
- 日、周、月三视图均截图确认（`tmp/rv4.png`、`tmp/rv-week2.png`、`tmp/rv-month.png`）。

**怎么恢复**
`git revert` 本次提交；`~/.dsh/guide-tutor/review.json` 可直接删除（删了等于清空复习记录，不影响目标与清单）。

## 2026-11-24 18:31 复习本周视图改成「一天一行」

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1` 的 `Rebuild-ReviewPanel` 周视图段整段重写：从「七列大数字」改成「一天一行」——星期、日期、张数、该天到期的卡名（最多 3 条），今天那行加米色底；底部加「本周到期 N 张 · 已复习 N 次」「最重的一天 X，N 张」「空着的日子：…」。约 +80 / −50 行。
- `D:\dsh_TestSpace\guide-tutor\lib\review-store.js` 的 `weekView()`：每天带的 `titles` 从「2 条 × 4 字」改成「3 条 × 14 字」（原来只有 4 字，屏幕上几乎看不出是哪张卡）。

**为什么**
用户反馈「复习栏中『周』页面的信息展示的太少」——原来只有七个数字和一句合计，看不出一周里哪天要做哪张卡。

**怎么验证**
打开复习本切到「周」：显示 `2026-11-23 ~ 2026-11-29`，七行分别是一 11-23 —、二 11-24 1 张 第2课（今天，米色底）、三 11-25 —、四 11-26 1 张 第1课、其余为空；底部「本周到期 2 张 · 已复习 1 次 / 最重的一天 11-24，1 张 / 空着的日子：11-23、11-25、11-27、11-28、11-29」。截图 `tmp/rv-week3.png`。

**怎么恢复**
`git revert` 本次提交。

## 2026-11-24 18:50 复习本周视图加「按目标 / 上周对比 / 悬停看全部」，月视图补星期表头

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\lib\review-store.js` 的 `weekView()`（约 L195-240）：每天新增 `all: [{title, goalId}]`（不再只留 3 条），新增 `byGoal: [{goalId, count}]`（按目标汇总、降序）与 `prevTotal`（上一周同区间到期数）。
- `D:\dsh_TestSpace\guide-tutor\index.js` 的 `pushReviewState()`：`week.days[].all` 与 `week.byGoal` 补上 `goalText`（查 `goalMap`），`week.prevTotal` 透传。
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1` 周视图：底部新增「上周 N 张 → 本周 M 张（多/少 X 张）」「按目标：学习日语到 N1 2」；标题超过 3 条时显示 `+N（悬停看全部）`，行 `ToolTip` 设为该天全部卡名（一行一张，含目标名）。月视图在日历网格上方补一行「一二三四五六日」表头。
- 另加 `$script:ReviewWeekOpen`（本轮未启用，见「没做的」）。

**为什么**
用户问「复习栏中『周』页面的信息是不是展示的太少」——原周视图只有 7 行数字 + 卡名前 3 条，看不到「这周一共多少、比上周多还是少、都是哪个目标的」。

**怎么验证**
- `node --check lib/review-store.js`、`node --check index.js` 均 exit 0；`overlay.ps1` 用 `[Parser]::ParseInput` 校验 0 错误，BOM 仍是 `239,187,191`。
- 热重载后打开复习本切到「周」：截图 `tmp/rv-week7.png` 显示「上周 0 张 → 本周 2 张（多 2 张）」「按目标：学习日语到 N1 2」「空着的日子：11-23、11-25、11-27、11-28、11-29」。
- 切到「月」：截图 `tmp/rv-month2.png` 显示星期表头「一 二 三 四 五 六 日」，24 号蓝框、26 号格内有数字 1。

**怎么恢复**
`git revert` 本次提交。`review.json` 数据结构没变，回退后旧界面照样能读。

**没做的**
「点一行展开该天全部卡片」试了两版都没生效（行上绑 `MouseLeftButtonUp` 后点两次无反应，ToolTip 会弹出但 `Rebuild-ReviewPanel` 不执行），改为悬停 ToolTip 显示全部。`$script:ReviewWeekOpen` 留在代码里但没接上，后续要做得先查清行点击事件为什么被吞。

## 2026-11-26 11:22 新增 easylive 项目目标（15 天）+ 修 next 派不出步骤

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\lib\decompose.js:48`：`MAX_STEPS_PER_MILESTONE` 由 8 改为 12（课程类目标天然步数多，6 阶段 × 54 步装不下）。
- `D:\dsh_TestSpace\guide-tutor\index.js` 的 `guide_goal action=next`（L3604 起）：原先把 `pickNextSteps(goals.active(), {limit, maxUnits})` 的结果直接过滤「今天已排」，排在前面的步骤把配额占满、又被 taken 全过滤后就没得派了（新增 54 步的目标一步都派不出来）。改成先按 4 倍配额多取、排除已排、再截断；同时接入 `args.id`——给了 id 就只看那个目标。
- 数据结构变更：`C:\Users\易千纸\.dsh\guide-tutor\goals.json` 新增目标 `g2`「15 天做完 easylive 仿 B 站项目（Spring Boot 微服务）」，6 阶段 54 步、共 57.5 格。写入方式是脚本直调 `goals.setMilestones()`（`tmp/apply-easylive.mjs`），因为 54 步的 JSON 通过工具调用传输时被截断（两次报 3–4 个 problems，但同一份数据脚本校验 `problems: 0`）。
- `C:\Users\易千纸\.dsh\guide-tutor\plan.json` 新增三条：13:00–13:30 看完 P1 项目简介（`g2-m1-s1`）、13:35–14:05 看完 P2 技术栈与架构（`g2-m1-s2`）、14:10–15:10 P3 项目构建（`g2-m1-s3`），都带 `goalId=g2`/`milestoneId=m1`。

**为什么**
用户要求「根据这个网址设定目标并执行，要求在15天内完成」（BV1aW2NYREFh，54 集、29.3 小时）。建好目标后 `guide_goal next` 返回「没有可派的步骤」，原因是 next 的选择顺序问题，不是数据问题。

**怎么验证**
- `node --check index.js`、`node --check lib/decompose.js` exit 0。
- `node tmp/apply-easylive.mjs` 输出 `problems: 0` / `saved: milestones 6 steps 54 units 57.5`。
- 重载后 `guide_goal action=list` 显示「15 天做完 easylive…0/54 步（0/57.5 格）0%」。
- `guide_goal action=next id=g2` 返回三步（79%/79%/79%），不再是「没有可派的步骤」。
- `guide_plan list` 显示今天 11 条，其中 3 条是 g2 的步骤。

**怎么恢复**
- 代码：`git revert` 本次提交。
- 数据：删掉 `goals.json` 里的 g2 即可（`guide_goal remove id=g2`，会连带撤清单条目）；`MAX_STEPS_PER_MILESTONE` 改回 8 会让 54 步的目标无法保存。

**单列：数据结构变更**
`goals.json` 新增 g2（6 阶段 54 步），`plan.json` 新增 3 条带 `stepId` 的条目。删除 g2 时 `dropGoalItems` 会一起撤掉这 3 条。

## 2026-11-26 13:45 清单条目分性质 + 「换到娱乐」

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\lib\plan.js`：
  - 新增 `PLAN_KINDS`（task / fun / rest / blank / chore / class）、`KIND_SET`、`REMINDABLE_KINDS`、`normalizeKind()`（约 L36-52）；`readPlanFile()` 与 `add` 分支都带上 `kind`（L139 附近、L757 附近）。
  - 新增 `clockText(mins)` 与 `swapInFun({ minutes, now })`（L113-215 附近）：把娱乐插到「现在」，从被打断那条起所有未完成条目**整体后移**，溢出 23:00 的整条顺延到明天（写 `plan-later.json`）。
  - `planTick()` 的到点提醒改成只对 `REMINDABLE_KINDS`（task/chore/class）生效（L574 附近）——娱乐、休息、空白永不提醒。
  - `guide_plan` 新增 `action=swap`（L1028 附近）与参数 `minutes` / `kind`（schema L1175 附近）。
- `D:\dsh_TestSpace\guide-tutor\index.js`：`choreAutoDate` / `goalAutoDate` 落盘到 `settings.json`（L4506-4540），插件热重载后不再把「今天已排过」忘掉。

**为什么**
用户要的是「不想做当前任务时，直接把当前任务和娱乐互换，然后重排」。一开始想把两条互换位置，但单条插队会让第 3 课排到第 4 课后面（用户当场指出）。改成**整体后移**：娱乐插进来，后面的条目按原顺序一起往后推，顺序天然不乱；推不下的顺延到明天，代价如实可见。
`kind` 是前提——没有「娱乐」这个条目类型，就没有东西可换。

**怎么验证**
- `node --check lib/plan.js` / `node --check index.js` exit 0。
- `node tmp/test-swap2.mjs` 输出 `7 passed, 0 failed`：30 分钟版插入 13:35-14:05 且晚上 2 小时娱乐保留并后移；120 分钟版整块提前、不重复；两种情况第 3 课都在第 4 课前面；溢出条目出现在 `plan-later.json`。
- 实机：今天清单加了一条 `20:00–22:00 娱乐 2 小时`（`kind=fun`）；重载两次后清单稳定在 10 条，不再被自动派发加回第 5、6 课。

**怎么恢复**
`git revert` 本次提交。数据侧：`plan.json` 里带 `kind` 的条目会退回「有 stepId 就算 task」的推断，不影响使用；`settings.json` 的 `goalAutoDate`/`choreAutoDate` 可以直接删。

**单列：数据结构变更**
`plan.json` 的每个条目新增 `kind` 字段；`settings.json` 新增 `goalAutoDate`、`choreAutoDate` 两个日期字段。

## 2026-11-26 13:58 清单卡加「歇会」按钮（换 30 分钟娱乐）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\lib\plan.js`：`createPlan()` 的返回对象加 `swapInFun`（L1243 附近，原来只在内部用，没暴露）。
- `D:\dsh_TestSpace\guide-tutor\index.js`：overlay 事件新增 `case 'swap_fun'`（L902 附近，紧跟 `dispatch_goals`）——读 `event.minutes`（默认 30），调 `plan.swapInFun()`，成功写 daylog「换到娱乐：起始-结束，N 条后移」，并 `log('swap fun from overlay: …')`。
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`：清单卡标题栏「派发」前加「歇会」按钮（L5522 附近，约 +16 行）。粉色字 `FromArgb(200, 255, 180, 200)`，ToolTip「换 30 分钟娱乐：娱乐插到现在，后面整体后移，顺序不乱；想歇更久跟我说一声」，点击 `Send-OverlayEvent @{ type='swap_fun'; minutes=30 }`。

**为什么**
换到娱乐的功能昨天就做完了，但只有后端——用户得开口跟我说才生效。用户问「所以我想换娱乐模块怎么换」，说明他要的是**自己点得到**。给清单卡加一个按钮，点一下就是 30 分钟版（最常用的那档），要 1 小时/2 小时再说一声。

**怎么验证**
- `node --check lib/plan.js` / `node --check index.js` exit 0；`overlay.ps1` 用 `[Parser]::ParseInput` 0 错误、BOM 仍是 `efbbbf`。
- 实机点按钮：`plugin.log` 出现 `swap fun from overlay: 30min -> 14:10-14:40 moved=5`；`plan.json` 变成——`14:10-14:40 娱乐 30 分钟`（新插入）、P3 项目构建 `14:40-15:40`、第 3 课 `16:20-17:05`、第 4 课 `17:15-18:00`、洗澡 `19:30-19:55`、娱乐 `20:35-22:35`。**第 3 课仍在第 4 课前面**，顺序没乱。
- 验证完已从 `D:\dsh_TestSpace\guide-tutor\tmp\plan.before-swap.json` 恢复今天的清单（10 条，娱乐回到 `20:05-22:05`）。

**怎么恢复**
`git revert` 本次提交。数据侧：按钮只调 `swapInFun`，不会改代码之外的东西；清单从 `tmp/plan.before-swap.json` 可随时取回。

**已知行为（不是 bug，但要知道）**
已完成（`done: true`）的条目在 swap 时不参与后移——那是「实际发生」的记录，不该被改。代价是它可能和后移后的未完成条目时间重叠（本次实测：洗衣服 `19:30-20:00` 已完成，洗澡后移到 `19:30-19:55`，两条撞上）。要避免，可以在 swap 前先勾掉或删掉那条已完成的。

## 2026-11-27 10:50 面板加「语音开关」按钮（静音后只留字幕）

**改了什么**
- `D:\dsh_TestSpace\guide-tutor\index.js`：
  - `DEFAULT_SPEECH` 加 `muted: false`（L1746）。
  - `speakChunk()` 开头加 `if (speechSettings.muted) return silentChunk(text)`（L1897 附近）。
  - 新增 `silentChunk(text)`（L2000 附近）：不调 TTS，只把字幕推两次（`reveal: 0` 然后 `reveal: 长度`），按 `max(600, 字数×120ms)` 计时后 `playNextChunk()`，保证朗读队列照常前进。
  - 新增 `setSpeechMuted(muted)`（L1857 附近）：写 `speechSettings.muted`、`saveSpeechSettings()`、`writeState({ speechMuted })`、`broadcast('settings')`，静音时 `stopSpeech()`，日志 `speech muted -> true/false`。
  - 事件新增 `case 'toggle_mute'`（L735 附近）：`event.muted === undefined` 时取反。
  - `saveSpeechSettings` 之后补一次 `writeState({ speechMuted })`，开机就把状态同步给浮层。
- `D:\dsh_TestSpace\guide-tutor\native\overlay.ps1`：
  - 教学面板 header 在「复习」与「—」之间加 `$script:MuteBtn`（`New-GTextButton '音'`），点击发 `Send-OverlayEvent @{ type='toggle_mute' }`；`if (-not $headerButtons.Children.Contains(...))` 防重复添加。约 +14 行。
  - `Apply-State()` 开头（L7128 起）读 `$state.speechMuted`：`Child.Text` 切「静 / 音」、`Opacity` 0.45 / 1.0、两套 ToolTip。约 +10 行。

**为什么**
用户 2026-11-27 10:42 要求「在 ui 界面制作一个能关闭和打开语音提醒功能的按钮」。此前只能改 `settings.json` 或让我调工具，界面上没有入口。

**怎么验证**
- `node --check index.js` exit 0；`overlay.ps1` 用 `[Parser]::ParseInput`（先 `ReadAllText` + UTF8）校验 0 错误、BOM 仍是 `efbbbf`。
- 实机点「静」→ `plugin.log` 出现 `speech muted -> true`、`settings.json` 的 `muted=true`、`state.json` 的 `speechMuted=true`、按钮变灰「静」。
- 再点一次 → `speech muted -> false`、`muted=false`、按钮恢复「音」（截图 `tmp/mute-head4.png` / `tmp/mute-btn-on.png`）。

**怎么恢复**
`git revert` 本次提交即可回到没有按钮的版本。语音设置只存在 `settings.json` 的 `muted` 字段，删掉该字段就恢复默认（不静音）。

**踩坑**
- `New-GTextButton` 返回的是 `Border`，文字在 `.Child`（TextBlock）里；第一版写 `$script:MuteBtn.Text = ...` 抛异常被 `catch {}` 吞掉，按钮看着完全没反应。
- 第一版用 emoji `🔊`/`🔇`，WPF 渲染 `🔇` 时字体缺字形，显示成灰底方块；改成中文单字「音 / 静」。
- 按钮别离「—」（最小化）太近：两者间距只有约 12 逻辑像素，点偏会收起面板。
