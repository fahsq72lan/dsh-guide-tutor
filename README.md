# 屏幕教学助手 · guide-tutor

在 Windows 桌面上"手把手"教用户操作：一个置顶悬浮球负责读屏，一层全屏透明标注层画箭头/圆圈/矩形，一块可调透明度的半透明面板写当前该做什么，外加一个本地 Markdown 知识库存教学步骤。

由两部分组成：

- **DSH Host 插件**（`index.js`）：注册 `guide_*` 工具、管理知识库、拉起并守护悬浮层进程、提供本机 HTTP / SSE 实时接口。
- **原生 WPF 悬浮层**（`native/overlay.ps1`）：悬浮球、标注层、面板三扇窗口，全程置顶、标注层鼠标穿透。

## 现在能做什么

| 能力 | 说明 |
| --- | --- |
| 读屏 | 点球（或面板上的「读屏」）→ 悬浮层自动隐藏 0.2 秒截图 → 宿主把截图作为一条消息发给当前对话 → 模型读图后标注 |
| 屏幕标注 | `rect` / `circle` / `arrow` / `text` / `spotlight`，可带小标签，坐标与截图 1:1 |
| 半透明面板 | 标题、正文（建议 ≤30 字，可拖选复制，右上 `⧉` 一键复制整块）、步骤列表（当前步高亮）、35–100% 透明度滑块、可折叠成球；输入框支持 `Ctrl+V` 与右键粘贴 |
| 时钟 | 球下面常驻 `HH:mm`，面板标题栏常驻 `HH:mm:ss`；每 120ms 的 tick 只在秒数变化时重画，不额外占 CPU |
| 大小可调 | 面板底部「大小」滑块拖动即可，70%–180% 连续可调（松手 0.4 秒后落盘）；球上 `Ctrl+滚轮` 一档 5%。只缩放上半部分（标题/正文/步骤/下一步），底部操作条保持原大——否则滑块会跟着自己变长，一拖就冲到顶。值存进 `state.json` 的 `panel.uiScale`，重启后还在 |
| 知识库 | `%USERPROFILE%\.dsh\guide-tutor\kb\*.md` 与 `*.docx`，模型可读写，下次直接复用步骤 |
| Word 文档 | `guide_kb` 存 `.docx` 时用 Markdown 生成排版好的 Word（标题/列表/表格）；也能导入、读取已有 `.docx` |
| 语音播报 | 回复用本机 SAPI 中文语音念出来，屏幕出现逐字渐显的字幕，字幕与语音按词同步；**回复会被拆成一句一句念**，句间停顿，像人在说话，而不是压成一句概括 |
| 触发时机 | 以 DSH 的持久 `turn/end` 事件为准：面板发消息、DSH 输入框打字、语音输入都会触发朗读，不再依赖某条输入路径 |
| 对话记录 | 面板标题栏的「记录」：列出插件端最近的对话流水（时间、谁说的、从哪说、内容），数据存在 `chatlog.json`，只留最近 120 条，纯本机 |
| 时间检测 | 每 60 秒一次心跳（`tickIntervalSec` 可改）：记下当前时间、写 `ticks.jsonl`、广播 SSE `tick` 事件，并挨个调用 `registerTickHandler` 订阅者。现在给计划/待办提供时间基准，也是以后子代理「到点读屏上报」的接入点 |
| 字幕定位 | 字幕出现在最近一次标注旁边（标注下方，放不下就放上方）；没有标注时在屏幕底部居中 |
| 语音 | 面板「说」按钮或 `Ctrl+Alt+V`：本地离线 sherpa-onnx paraformer 识别中文（不联网、不要 key）→ 作为一条【语音】消息发给模型 → 模型照常看屏/标注 |
| 面板对话 | 面板底部输入框写目标/问题，回车发送：模型先和你确认目标、列计划，你说「开始」它才开始标注 |
| 收尾 | 面板「✓」或 `guide_finish`：模型先截屏核验，再清空标注、面板折叠回球，任务标记完成 |
| 实时接口 | 本机 HTTP + SSE + 浏览器状态页，外部脚本也能驱动标注与读屏 |
| 托盘图标 | 任务栏托盘一个「引」图标：左键打开面板，右键菜单可读屏一次 / 切换常听 / 隐藏悬浮层 / 退出 |
| 下一步按钮 | 面板底部「下一步 ›」：表示这步做完了，宿主自动截屏并把下一步交给模型（也可 `POST /next`） |
| 常听 | 面板「常听」勾选框或托盘菜单：说完一句自动继续听；连续 5 次没听清会自动关闭并提示 |
| 语音音色 | 默认 **Edge 晓晓**（`zh-CN-XiaoxiaoNeural`，神经网络音色，需联网）；断网或合成失败自动回落到系统 SAPI「惠惠」。换音色：`index.js` 的 `config.edgeVoice`（可选 `zh-CN-YunxiNeural`、`zh-CN-YunyangNeural`、`zh-CN-XiaoyiNeural`、`zh-CN-liaoning-XiaobeiNeural` 等 14 个中文音色）；想完全离线用 `config.ttsEngine: 'sapi'` |
| 桌面清单 | 目标排成当天的**真实时间轴**，贴右缘、满屏高：每条一个块，**块高由内容决定**（标题自动换行，长课也一样完整显示），只有空档 ≥25 分钟才画一条 `06:00–08:30` 这样的细分隔线，一天排到 22:30；点 ☐ 打勾/取消、每条右侧 **✎ 改**（弹预填窗口）/ **✕ 删**、拖标题栏、点 ✕ 收起、点 ⚙ 开设置（清单透明度/宽度、悬浮球透明度、面板透明度/大小、提醒语气）、点标题栏 **＋** 自己加一条任务（填开始/结束/地点/做什么，`HH:mm`，手填的时间原样落盘，不往番茄钟上拗）；**空档行右侧还有一个淡淡的 ＋**，点了直接用那一段的开始时间预填（结束 +25 分钟），不用手改时间。数据在 `plan.json`，卡片读 `state.plan` + `state.card`，是无边框 + 强半透明的「伪融入」，不是真嵌壁纸层 |
| 顶部任务条 | 屏幕顶端一行，显示**当前时段**该做的事，带**秒级**倒计时（`15:26–15:51　秒级倒计时测试　@ 宿舍　·　剩 24:03`，每秒跳）；当前没有条目时退而显示 30 分钟内即将开始的一条（前缀「接着」，显示「12:30 后」），都没有就自动隐藏。拖动可移动；右端「−/＋」或直接滚轮调大小（0.7–2.0，0.1 一档）；位置与大小存 `state.json` 的 `topbar`，重启还在 |

## 安装

已经装在本机的 desktop profile 里（`link:` 到本目录）。重装 / 更新：

```
plugin_manager action=install_bundle target=<本目录绝对路径>
```

**注意**：Host 半代码改动后必须重启 DSH 应用才会生效（没有运行时热重载）；悬浮层脚本 `native/overlay.ps1` 改动后只需 `guide_overlay restart`。

## 数据目录

`%USERPROFILE%\.dsh\guide-tutor\`

| 文件 | 用途 |
| --- | --- |
| `state.json` | 面板与标注的唯一真相，悬浮层每 250ms 轮询变化 |
| `events.jsonl` | 悬浮层 → 宿主的事件流（`ready` / `captured` / `step` / `opacity` / `mode` / `ball_moved` / `voice` / `done` / `next_step` / `always_voice` / `quit`） |
| `shots\` | 每次读屏的 PNG |
| `kb\` | 教学步骤 Markdown |
| `overlay.log` / `plugin.log` | 两个进程各自的日志，排错先看这里 |
| `chatlog.json` | 插件端对话流水（面板「记录」按钮读它），最多 120 条 |
| `ticks.jsonl` | 时间检测心跳流水，一行一次；超过 512 KB 自动只留最近 1000 条 |

**截图与巡检的保留策略**：`shots\` 与 `shots\cam\` 只保留最近 7 天——宿主启动和每次截屏时会清掉更早的文件。设置窗口（齿轮）里有「截图与巡检」一栏，能看到当前张数与占用，也可以手动「清理 7 天前的」。想彻底清掉，直接删这两个目录即可，插件不会重建历史。

## 模型可用的工具

- `guide_screen`：截屏，返回 `{path,width,height,left,top}`（截屏时悬浮层自动隐藏）。
- `guide_teach`：整体替换标注 + 打补丁更新面板。
  `annots[]{kind,x,y,w,h,x1,y1,x2,y2,color,thickness,label,text,size}`、`clearAnnots`、
  `panel{title,text,steps[],stepIndex,opacity(0.35-1),mode(ball|panel),visible}`。
- `guide_kb`：`{action: list|read|save|delete, name?, content?, source?}`，文件名必须是简单的 `*.md` 或 `*.docx`；
  `.docx` 的 save 会给 Markdown 排版成 Word，带 `source` 则直接导入已有文件。
- `guide_say`：`{text}`，朗读一句 ≤60 字的口播稿并同步屏幕字幕；每次回复前调用一次。
- `guide_overlay`：`{action: status|start|restart|stop}`。
- `guide_finish`：`{result: done|aborted, message?}`，清空标注、面板收起、任务状态落库。
- `guide_clock`：读当前时间、时区，以及时间检测心跳（间隔、已跑次数、上次时间）。
- `guide_plan`：`{action: list|add|remove|done|undo|clear|show|hide|auto, id?, from?, to?, place?, title?, goalId?, note?}`，
  桌面清单的增删勾选；`auto` 让模型拿目标和课表自己排 4–8 条。条目存在 `plan.json`，卡片由悬浮层按 `state.plan` 渲染。

## 时间检测（ticker）

默认**每 60 秒**一次心跳，配置项 `tickIntervalSec`（15–3600 秒），`ticker: false` 可整体关掉。

每次心跳做四件事：

1. 记下 `at / epoch / local / timezone / count / reason`
2. 追加一行到 `ticks.jsonl`
3. 广播 SSE 事件 `tick`（订阅 `/events` 就能收到）
4. 挨个调用注册过的 tick 处理器

**给以后的子代理留的接口**（现在没人用，接的时候不用改核心逻辑）：

```js
// 同进程：在插件里注册一个处理器，参数就是心跳 payload
const off = registerTickHandler((tick) => {
  // TODO: 到点读屏 → 处理信息 → 上报主代理
  // tick = { at, epoch, local, timezone, count, reason }
})
off() // 取消注册
```

外部进程两条路：订阅 `http://127.0.0.1:41999/events` 的 `tick` 事件，或者直接读 `ticks.jsonl` 尾部。当前 `handlers` 数量可以在 `GET /clock` 里看到，方便确认接没接上。

## 视频库（B 站）

视频单独存在 `%USERPROFILE%\.dsh\guide-tutor\videos\`，**和教学知识库（kb/）分开**：每条视频一个 `.json`（元数据 + 字幕）和一个 `.md`（可读摘要）。

| 工具 | 作用 |
| --- | --- |
| `video_search` | 按关键词搜 B 站视频，返回 BV 号/标题/UP/时长/播放量；`order` 可选综合/播放/最新/弹幕/收藏，默认回 8 条。两次搜索至少间隔 4 秒防风控 |
| `video_learn` | `{url}` 抓 B 站视频信息与字幕（支持 `?p=N` 分P），返回带时间戳的转写；没字幕时提示需要登录 |
| `video_note` | 把摘要和要点写回某条视频 |
| `video_transcript` | 分页读取字幕全文（`offset`/`nextOffset`），长视频用 |
| `video_show` | 看某条视频的详情（UP、分P、字幕条数、摘要、要点） |
| `video_recall` | 按关键词搜标题/摘要/要点/字幕，返回带时间戳的命中片段 |
| `video_list` | 列出视频库 |
| `video_forget` | 删除一条视频记录 |
| `video_cookie` | 保存 B 站 SESSDATA 到 `bili-cookie.txt`，之后 `video_learn` 自动带上 |

字幕需要登录：匿名请求 B 站只返回 `need_login_subtitle: true`。做法是在浏览器登录后取 `SESSDATA`，用 `video_cookie` 保存（文件在本机，不上传）。

**WBI 签名（重要）**：`/x/player/v2` 不带 WBI 签名时，B 站照样返回 200，但给出的 `subtitle_url` 经常指向**别的视频**的字幕（歌词、别人的教程），这就是之前"读不出视频内容"的根因。0.7.0 起先取 `/x/web-interface/nav` 的 `wbi_img` 算 mixin key，用 md5 签 `w_rid` 请求 `/x/player/wbi/v2`；只有当签名失败时才退回老接口。

**字幕校验**：抓到的字幕如果最大时间戳超出视频时长 5 秒以上，判定不是这条视频的，自动重取一次，仍不符就丢弃并返回 `reason: mismatch`，不再把错字幕写进库。记录里同时存 `aid/cid/subtitleUrl`，出问题可以回查。重新 `video_learn` 同一条视频会**保留**原来的摘要和要点。

**搜索**：`video_search` 走 `/x/web-interface/wbi/search/type`，和取字幕共用 WBI 签名。风控比取字幕严：内置 4 秒节流，被 `-412` 拦下会给出明确提示；结果默认只回 8 条，挑中再 `video_learn`，避免一次把上下文灌满。

## 装成桌面应用（PWA）

状态页带 `manifest.webmanifest`，可以装成一个**独立窗口的应用**：任务栏一个图标，点开无地址栏、无标签页，跟浏览器图标一个体验。

1. 先保证 DSH 开着、插件加载完（`http://127.0.0.1:41999/status` 能返回 JSON）；
2. 用 Edge/Chrome 打开 <http://127.0.0.1:41999/>；
3. 地址栏右侧点「安装此站点为应用」（或右上角 `⋯` → 应用 → 安装此站点为应用）；
4. 装完在开始菜单「屏幕教学助手 · 实时状态」里，右键可固定到任务栏。

图标在 `assets/icon-192.png`、`assets/icon-512.png`（由 `icon.svg` 渲染），`assets/guide-tutor.ico` 留给快捷方式用。

注意：端口 `41999` 被占用时会自动 +1，已装的应用还指旧端口——想装成应用就保持默认端口；DSH 没开时点图标会连不上，先开 DSH。

## 开发与发布：work 攒改动，一次 squash 进 main

想让 GitHub 上的提交记录保持干净（不因为小修小补刷屏），用两条分支：

- **`work`**：日常改动都提交在这里，可以很碎、很频繁，只在本机，不推 GitHub；
- **`main`**：只接收"打包"后的提交，每个提交对应一批完整改动。

发布时运行：

```powershell
.\tools\publish.ps1 -Message "feat(plan): 清单支持拖拽改时间"
```

脚本做的事：`work` 上有改动就补一个 `wip:` 提交（本地备份，可回滚）→ 切到 `main` → `git merge --squash work` → 用 `-Message` 作为提交信息提交一次 → 推送 → 把 `work` 重置到 `main`。

只想本地看看、先不推送，加 `-NoPush`。

> 注意：这台机器装了 Watt Toolkit，它会替换 GitHub 的证书，脚本里已经带上 `-c http.sslBackend=openssl -c http.sslVerify=false -c http.version=HTTP/1.1`；手动 `git push` 时也记得带。

## 本机 HTTP API

默认地址 **<http://127.0.0.1:41999/>**（只监听 127.0.0.1；端口被占用时自动 +1，实际端口见 `plugin.log` 的 `api server listening on ...`）。

DSH 自带的 Web 服务器对全部路由都要求会话令牌，所以这里另起了一个本地回环端口，任何脚本、浏览器标签页都能直接用。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | 实时状态页（EventSource 订阅 `/events`） |
| GET | `/status` | 当前快照：悬浮层 pid/模式/标注/面板/知识库/任务状态 |
| GET | `/events` | SSE：`hello`（首帧带快照）、`state`、`overlay`、`capture`、`kb`、`voice`、`done`、`session`，15s 一次 `: ping` |
| GET | `/clock` | 当前时间 + 时间检测心跳状态（间隔、次数、上次时间、订阅者数量） |
| GET | `/chatlog` | 最近对话流水，`?limit=40`（最多 120），面板「记录」同源 |
| POST | `/teach` | 请求体同 `guide_teach` 参数 |
| POST | `/capture` | 触发一次读屏（等同点悬浮球），返回截图信息 |
| POST | `/finish` | `{"result":"done"\|"aborted","message":"..."}`，收尾 |
| POST | `/next` | 等同面板「下一步」：推进 `stepIndex` 并让模型准备下一步 |
| POST | `/listen` | 立即听一句（等同面板「说」） |
| POST | `/say` | `{"text":"..."}`，朗读一段话（自动拆成逐句朗读）并显示同步字幕 |
| POST | `/auto-speak` | `{"on":true}` / `{"on":false}`，开关“回复自动朗读” |
| POST | `/always-listen` | `{"on":true}` / `{"on":false}`，开关常听 |
| POST | `/overlay` | `{"action":"start"\|"restart"\|"stop"\|"status"}` |
| GET/POST | `/kb` | `action=list\|read\|save\|delete`，参数可用 query 或 JSON |

示例：

```bash
curl http://127.0.0.1:41999/status

curl -X POST http://127.0.0.1:41999/teach \
  -H "content-type: application/json" \
  -d '{"annots":[{"kind":"rect","x":700,"y":300,"w":260,"h":80,"color":"#FFB020","label":"点这里"}],"panel":{"text":"先点这个按钮","mode":"panel"}}'

curl -N http://127.0.0.1:41999/events
```

PowerShell：

```powershell
Invoke-RestMethod http://127.0.0.1:41999/status
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:41999/capture
```

## 排错

- 悬浮球不见了：`guide_overlay action=status`，再 `restart`；看 `overlay.log`。
- 点「读屏」没反应：`plugin.log` 里应依次出现 `capture ...` 和 `followup delivered to agent ...`。
- 截图与标注位置偏了：确认屏幕缩放比例没变（截图统一缩放到 DIP 网格，1 标注单位 = 1 截图像素）。
- 改了 `index.js` 没生效：重启 DSH 应用。
- 点「说」没反应或总说没听清：看 `plugin.log` 的 `listen ok:` / `asr stderr:`；手测麦克风与模型：
  `python native/asr.py --model models/paraformer-small/model.int8.onnx --tokens models/paraformer-small/tokens.txt --max-seconds 5`
  （需要 `PYTHONPATH=py/libs`）。
- 端口想换：插件配置 `apiPort`（默认 41999）。
- 点球行为：`ballAction` 为 `capture`（默认，点球即读屏）或 `panel`（点球只开/关面板）；本机已设为 `panel`，读屏改走面板「读屏」按钮或托盘「读屏一次」。
- 打字后没有语音：先看 `plugin.log` 有没有 `turn/end <会话> main=true chars=N`。有 `main=true` 但 `chars=0`，说明那轮没有可朗读的正文；完全没有 `turn/end`，就是宿主没发持久事件（看 `session event hook failed`）。`auto-speak (turn-end, N 句)` 这一行表示成功触发。子代理会话会显示 `main=false`，按设计不朗读。
- 视频字幕不对（歌词 / 别的视频内容）：多半是 WBI 签名失效，看 `plugin.log` 的 `wbi player failed:` 和 `subtitle mismatch`。签名失败会退回老接口，老接口会返回错字幕；确认 `bili-cookie.txt` 还有效（`video_learn` 返回里的 `loggedIn`）。单条视频的对照组可以用
  `node tools/probe-subtitle.cjs BV号`（走带签名的 `player/wbi/v2`，连跑 3 次看 URL 和字幕是否稳定）。
- 语音播报相关配置：`autoSpeak`（默认 true，回复自动朗读）、`voice`（SAPI 音色名，留空自动选中文音色）、`speechRate`（-10..10，默认 0）、`pythonPath`（可选；不填时自动探测当前 DSH 自带的 Python 3.12）。
- 托盘右键的「朗读回复（语音+字幕）」可以随时关掉自动播报；关掉后 `guide_say` 仍可手动朗读。
- 托盘右键「字幕大小」：小 18 / 中 24 / 大 30 / 特大 38；「朗读音量」：轻 45 / 中 75 / 响 100。设置写在数据目录的 `settings.json`，重启后保留。
- HTTP 也能调：`POST /settings`，body 支持 `{"subtitleSize":30,"volume":75,"rate":0}`。
- 字幕窗是独立置顶、鼠标穿透的 WPF 窗口；截屏时和其它悬浮窗一起隐藏。

## 打磨计划

新功能、Bug、技术债和临时想法都收在 `planning/打磨计划-2026-11.xlsx`（8 页：总览 / 想法池 / Bug 与问题 / 技术债 / 工具清单 / 版本计划 / 已完成 / 想法收件箱）。同目录的 `.md` 是纯文本速览；`make_roadmap.py` 是生成脚本，改完数据重跑即可。

发版前对照「5-版本计划」的验收标准；改完一项就更新「6-已完成」，别让表和代码脱节。

## 已知限制 / 下一步

- 悬浮层已声明 Per-Monitor V2 DPI 感知：截图按物理像素抓整个虚拟桌面、再缩放到标注网格；标注坐标以虚拟桌面左上角为原点，负坐标副屏也能对齐（副屏缩放比与主屏不同时，仍以主屏 DPI 为基准换算）。
- 只有一块面板，一次一个教学任务。
- 语音是本地离线模型（sherpa-onnx paraformer，`models/paraformer-small`，82 MB int8），安静环境识别良好，强噪声会掉字；再往上就得换在线 ASR。
- 语音依赖装在 `py/libs`（`sherpa_onnx` + `sherpa-onnx-core` + `sounddevice` + `cffi`），重装环境跑 `python py/fetch_wheels.py`；模型跑 `python py/download_model.py`。
- 还没有 DSH 界面内的入口（当前入口 = 悬浮球 + 面板 + 状态页）。
- 计划：步骤文件模板、副屏独立 DPI 换算、语音唤醒词。
