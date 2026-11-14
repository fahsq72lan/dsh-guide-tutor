# 交接说明（HANDOFF）

> 写给下一个接手的人（或者下一个没有记忆的 AI）。写完于 2026-11-14 16:40。
> 详细改动在 `CHANGELOG.md`，这里只写「现在是什么、接了要干什么、哪些坑别踩」。

## 一、这是什么

两个 DSH 桌面插件，一个教、一个记。

| 插件 | 干什么 | 代码 | 数据 |
|---|---|---|---|
| **guide-tutor** | 看得见你的屏幕，能在上面画标注、写步骤、说话，教你操作 | `D:\dsh_TestSpace\guide-tutor` | `~\.dsh\guide-tutor\` |
| **guide-coach** | 记你一天在哪个软件上待了多久，和清单对账，出时间统计 | `D:\dsh_TestSpace\guide-coach` | `~\.dsh\guide-coach\` |

- tutor 在 GitHub：`github.com/fahsq72lan/dsh-guide-tutor`（公开）
- coach 只在本机（本地 git，没远程）
- 用户是学生，两个插件都是给他自己用的

## 二、架构（改之前先看这节）

```
DSH 宿主
  index.js          Cordis 插件，注册工具、跑定时器、开 HTTP
  ├─ lib/*.js       纯逻辑模块（pixel / l1 / judge / activity / plan / ...）
  └─ native/overlay.ps1   PowerShell + WPF 浮层（球、面板、卡片、标注、仪表盘）

通信：
  state.json   宿主写 → 浮层读（250ms 轮询）。**唯一真相**
  events.jsonl 浮层写 → 宿主读（点按钮、拖拽、点「下一步」都走这里）

端口：tutor 41999 / coach 42000
```

**五个模块的边界**：
- `lib/pixel.js` pHash（纯 JS 解 PNG，无依赖）
- `lib/l1.js` 调智谱 GLM-4.6V-Flash（免费视觉），`askL1/askDone/askLocate/askLabel`
- `lib/judge.js` 判定封装（置信度 <0.6 交回主模型）
- `lib/activity.js` 采样 → 分块（5 分钟并、25 分钟切）→ 时间线
- `lib/plan.js` 清单（在 tutor）

## 三、现在做到哪了

| 能力 | 状态 |
|---|---|
| 截屏 + 标注 + 面板 + 语音 | 可用，日常在用 |
| 知识库 / B 站视频 | 可用 |
| 清单 / 专注环 / 都市指令 / 日记 | 可用（在教练插件里） |
| 状态监测（前台窗口每 3 秒采样） | 可用，activity jsonl 在长 |
| 时间线 + 仪表盘（F40） | 可用，42000 能看，卡片能开 |
| L1 判定「这一步做完了吗」 | 可用，真实拦截过 2 次 |
| L1 打标签（每 5 分钟，工作/学习/娱乐） | 写了，只成功过几条，超时偶发 |
| 记录卡片显示标签 | 代码改了，**要重启 DSH 才生效** |

## 四、接手要先知道的坑

1. **改 `index.js` 或 `lib/*.js` → 必须重启 DSH**，没有热重载。改 `native/overlay.ps1` → 重启浮层就行。
2. **改 `overlay.ps1` 必须保留 UTF-8 BOM**。丢了 BOM，PowerShell 5.1 按 GBK 读，中文全乱、语法报错。
3. **`state.json` 会盖掉代码里的默认值**。改了 `DEFAULT_STATE` 还得同步改 state.json，否则看不到变化。
4. **两个浮层不能重叠**。都是 `AllowsTransparency + Topmost`，贴着会闪。现在 tutor 球在右下、coach 球在左侧。
5. **`git push` 必须带 TLS 参数**（本机装了 Watt Toolkit 做证书代理）：`-c http.sslBackend=openssl -c http.sslVerify=false -c http.version=HTTP/1.1`，`tools\publish.ps1` 里已内置。
6. **模板字符串里写 `\/` 会被吞**（`replace(/\/+$/, '')` 编译成 `//+$/` 变注释），要用 `[/]`。
7. **验证浮层别用 `guide_screen`**——截屏会临时隐藏悬浮层，截出来看不到。用 `EnumWindows` 列窗口，或 PrintWindow 抓。
8. **UIA 点不动 WPF 的 CheckBox**，`TogglePattern` 不发 Click 事件，要真鼠标点。
9. **publish.ps1 会拦敏感词和 epub**（防止把得到的书和工具路径推到公开仓库），别绕过它。

## 五、还没做完

| 事 | 备注 |
|---|---|
| B36 记录里出现过一次「未来时间」 | 没复现，先观察。以 `state.json` 的 `record.updatedAt` 为准，别看卡片 |
| 标签显示 | 代码已改（`pushRecord` 读 `labels-*.jsonl` 挂到段上），重启验证 |
| 插件转型 | 引导改旁路、学习改主路。方案在 `planning\转型-学习优先.md`。**用户明确说现在不动手** |
| 引导的「开场体检」 | 没做 |
| 手机端（F32 / v0.25） | 没开始 |

## 六、下一步该干什么

**先问用户**。他有明确的优先级（`planning\打磨计划-2026-11.xlsx` 的 `5-版本计划`），而且说过「大方向我主导 80%，你提建议 20%」。

当前版本 v0.28（看得懂的判断）刚完成，下一个是 v1.0「可维护」：`index.js` 拆到 800 行以内、overlay 拆成 4 个文件、冒烟覆盖 20 个工具。

**别自作主张开新功能**——他这段时间反复说「功能太多、没主线」。

## 七、怎么跑起来

```powershell
# 看 tutor 日志
Get-Content ~\.dsh\guide-tutor\plugin.log -Tail 20
# 看 coach 日志
Get-Content ~\.dsh\guide-coach\plugin.log -Tail 20

# 重启浮层（不用重启 DSH）
# 杀进程后宿主会自动拉起
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*overlay*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# 发布 tutor
powershell -File tools\publish.ps1 -Message "..."
```