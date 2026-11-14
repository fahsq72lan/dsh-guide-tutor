import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from './lib/log.js'
import { createStateStore } from './lib/state.js'
import { createVideoLibrary } from './lib/video.js'
import { createKb } from './lib/kb.js'
import { createFocus } from './lib/focus.js'
import { createCamera } from './lib/camera.js'
import { createEdict } from './lib/edict.js'
import { createPlan } from './lib/plan.js'
import { parsePlanText } from './lib/plan-parse.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const NATIVE_DIR = path.join(HERE, 'native')

const DEFAULT_PANEL = {
  visible: true,
  mode: 'ball',
  opacity: 0.92,
  title: '教学助手',
  text: '点击悬浮球，我会读取屏幕并一步步指导你。',
  steps: [],
  stepIndex: 0,
  alwaysListen: false,
  autoSpeak: true,
  ballAction: 'capture',
  busy: false,
  ballX: null,
  ballY: null,
  uiScale: 1,
}

const DEFAULT_SESSION = { status: 'idle', goal: '', startedAt: null, endedAt: null, result: null, message: '' }

// 桌面清单卡片：插件只存「在哪、透明度多少、显不显示」，绘制交给悬浮层。
// 不真的嵌进壁纸层（WorkerW 那套不稳），靠半透明+无边框做"伪融入"。
const DEFAULT_CARD = { visible: false, x: null, y: null, opacity: 0.86, width: 360 }
// 悬浮球透明度：0.2–1。只改球体渐变的 alpha，不改窗口 Opacity。
const DEFAULT_BALL = { opacity: 0.8 }
const DEFAULT_TOPBAR = { x: null, y: null, scale: 1 }

// Spoken captions: the host owns the text and the revealed character count, the
// overlay window only paints it next to whatever the screen points at.
const DEFAULT_SUBTITLE = { active: false, text: '', reveal: 0, seq: 0 }

const TUTOR_PROMPT = `【屏幕教学】本环境装有"教学助手"：桌面悬浮球、全屏标注层和半透明步骤面板，由 guide_* 工具控制。\n- 当用户说"教我 / 带我操作 / 帮我做某件事"，或你收到【读屏请求】【语音】【完成确认】消息时，按此流程：guide_screen 截屏 → read_image 看图 → guide_teach 标注并在面板写一步提示。\n- 标注坐标与最近一次截图使用同一像素坐标（原点为虚拟桌面左上角，可直接用截图里的坐标）。\n- 一次只给一步；用户完成后重新截屏确认，再给下一步。多步骤任务把步骤列表放进 panel.steps，当前步放进 panel.stepIndex。\n- 面板文字要短（不超过 30 字），像教练在旁边轻声提示；解释放在聊天回复里。\n- 【收尾】任务达成、用户说"好了/完成了"，或你截屏看到目标已实现时，先 guide_screen 核验，再调用 guide_finish 结束：它会清空标注并把面板折叠回悬浮球。不要一直把标注和面板挂在屏幕上。\n- 【语音】用户可能用语音说话（消息以【语音】开头）：回应要口语化、简短，因为对方可能没在看屏幕。\n- 【面板对话】用户会从面板底部的输入框打字（消息以【面板对话】开头），这是"先沟通、再动手"的通道：新目标先确认理解、把计划写进 panel.steps 并等待用户点开始；回答问题时把短答案写进 panel.text；说"开始/下一步"时才截屏标注。\n- 【目标】确定教学任务后，用 guide_teach 的 goal 字段记录一句话目标（例如"在 Excel 里插入数据透视表"），这样面板和状态页都能显示当前任务。\n- 教学脚本可以存进 guide_kb（Markdown），下次直接读取复用。\n- 不确定屏幕内容时先截屏或直接问用户，不要臆测坐标。\n- 【下一步】用户点面板上的「下一步」＝这步做完了：先 guide_screen 截屏核验，再用 guide_teach 给出下一步标注，并把 panel.stepIndex 推进一格；已经是最后一步或目标达成，就用 guide_finish 收尾。\n- 【常听】面板和托盘都有「常听」开关：打开后每说完一句会自动再听，适合连续口述；用户说"关掉常听"时提醒他在面板或托盘取消勾选。\n- 【口播】每次回复用户前先调用 guide_say。这段是"说"出来给人听的，要像跟熟人聊天，但**总时长控制在 60 秒内**：当前语速约每秒 2.8 字，也就是 150–170 字、8–12 句，每句 ≤30 字。信息要密度高——正文的结论、原因、数字、下一步挑最要紧的塞进去，别用废话铺垫，也别只丢一句概括。可以有"嗯""你看""说实话"这类口头语，可以带情绪和判断，可以反问一句把话头递回去；只略过代码块、表格细节、文件路径。插件会逐句朗读并同步字幕，详细内容留在聊天里。
- 【字幕】字幕自动出现在最近一次标注的旁边；没有标注时出现在屏幕底部中间。\n- 【都市指令】用户设了目标后（面板右上角「目标」窗口，写 goals.json），心跳会到点叫醒你发令：这时按消息里的三件事做——guide_directive action=issue 发令、guide_teach 贴面板、guide_say 念一句。收到【都市指令·催办】就问一句做了没，然后 action=close 记结果。用户主动喊"来条指令"也走同一套。别在没人叫的时候自己定时发。\n- 【专注环】用户说"拉我一下/提醒我专注/别走神"时，用 guide_focus start（默认 25 分钟一轮、每 8 分钟喊一次、90 分钟后自动结束）。它是纯本地闹钟：到点用 TTS 说话，不叫模型、不花 token；人离开电脑（键鼠空闲 5 分钟）或正在上课时自己跳过。用户说"停"就 stop。\n- 【桌面清单】目标可以排成当天的清单，用 guide_plan：add 加一条（from/to 用 HH:mm、place、title），show/hide 控制桌面卡片，done/undo 打勾，remove 划掉。早上 7:00–9:30 今天还没清单时心跳会叫你排一次；到点前 10 分钟提醒、过点 15 分钟追问一次，语气读 edict.json 的 tone。卡片是"伪融入桌面"的半透明清单（无边框+强半透明），不是真嵌进壁纸层，别承诺贴进桌面壁纸。\n- 【Word 知识库】guide_kb 支持 .md 与 .docx，名字可以带子目录（如「Linux/实验五.md」）：要 Word 版步骤就 save 一个 .docx 名字并给 content（Markdown 自动排版成标题/列表/表格）；导入已有 Word 用 source 指向绝对路径；read 一个 .docx 会返回抽取出的文本。\n- 【视频】用户给 B 站链接想“看懂/记住”时：先 video_learn 取字幕（分P用链接里的 ?p=N；没有字幕就说明要登录 Cookie，可用 video_cookie 保存 SESSDATA），长视频用 video_transcript 翻页读完，再用 video_note 写回摘要和要点；之后用 video_recall 回忆、video_show 看详情、video_list 看库存、video_forget 删记录。用户只知道想找什么、没有链接时，先用 video_search 按关键词搜，把结果列给他挑，再 video_learn。视频存在独立视频库，不和教学知识库混放。\n- 【改动日志】用户定了硬规矩：任何对文件的实际修改（代码、配置、文档、清理删除），都要在同一个回合里写进该项目的 CHANGELOG.md（没有就新建；不成项目时写 ~/.dsh/changes/YYYY-MM.md）。每条四段：改了什么（文件+行数或字节）、为什么、怎么验证（命令+结果）、删掉的东西怎么恢复。删文件、改依赖版本、改数据结构必须单独一行。规矩的来历与全文见 ~/.dsh/AGENTS.md。只写在聊天里不算数。`

export const inject = ['tools', 'systemPrompt', 'agents']

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function apply(ctx, config = {}) {
  const dataDir = path.resolve(config.dataDir || path.join(os.homedir(), '.dsh', 'guide-tutor'))
  const kbDir = path.join(dataDir, 'kb')
  const shotsDir = path.join(dataDir, 'shots')
  for (const dir of [dataDir, kbDir, shotsDir]) fs.mkdirSync(dir, { recursive: true })

  const statePath = path.join(dataDir, 'state.json')
  const eventsPath = path.join(dataDir, 'events.jsonl')
  const logPath = path.join(dataDir, 'plugin.log')
  const log = createLogger(logPath)

  let disposed = false
  const timers = new Set()
  function later(fn, ms) {
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (!disposed) fn()
    }, ms)
    timers.add(timer)
    return timer
  }

  // ----------------------------------------------------------- realtime bus
  // Every state/overlay/capture change is pushed to connected Server-Sent
  // Events clients, so the dashboard and external tools see the plugin live.
  const apiClients = new Set()

  function broadcast(event, data) {
    if (apiClients.size === 0) return
    let frame
    try {
      frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    } catch {
      return
    }
    for (const client of apiClients) {
      try {
        client.write(frame)
      } catch {
        apiClients.delete(client)
      }
    }
  }

  // ---------------------------------------------------------------- state
  const store = createStateStore({
    file: statePath,
    defaults: {
      panel: DEFAULT_PANEL,
      card: DEFAULT_CARD,
      ball: DEFAULT_BALL,
      topbar: DEFAULT_TOPBAR,
      subtitle: DEFAULT_SUBTITLE,
      session: DEFAULT_SESSION,
    },
    log,
    broadcast,
  })

  function readStateFile() {
    return store.readFile()
  }

  function currentState() {
    return store.current()
  }

  function writeState(patch = {}) {
    return store.write(patch)
  }

  // reset transient UI state on startup but keep the bubble position
  {
    const previous = readStateFile()
    writeState({
      panel: {
        ...DEFAULT_PANEL,
        ballAction: config.ballAction === 'panel' ? 'panel' : 'capture',
        ballX: previous?.panel?.ballX ?? null,
        ballY: previous?.panel?.ballY ?? null,
      },
      annots: [],
      subtitle: { ...DEFAULT_SUBTITLE },
      captureMode: false,
      session: { ...DEFAULT_SESSION },
    })
  }

  // ------------------------------------------------------------- overlay
  let overlayChild = null
  let overlayStartedAt = 0
  let failuresSinceReady = 0
  let eventsOffset = 0
  // Set when the plugin itself stops the child: the exit handler then must not
  // schedule another spawn, otherwise stop/restart races become a spawn storm.
  let overlayHalt = false

  function startOverlay() {
    if (disposed) return
    if (overlayChild) {
      log('overlay start ignored: already running')
      return
    }
    const script = path.join(NATIVE_DIR, 'overlay.ps1')
    if (!fs.existsSync(script)) {
      log(`overlay.ps1 missing at ${script}`)
      return
    }
    // PowerShell 5.1 reads a BOM-less script as the ANSI codepage, and Chinese
    // literals then swallow the closing quote. Keep the BOM on every script we
    // ship so a plain re-save can never silently break the overlay.
    for (const name of ['overlay.ps1', 'capture.ps1', 'cam.ps1']) {
      const file = path.join(NATIVE_DIR, name)
      try {
        if (!fs.existsSync(file)) continue
        const bytes = fs.readFileSync(file)
        if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) continue
        fs.writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]))
        log(`UTF-8 BOM restored: ${name}`)
      } catch (error) {
        log(`BOM check failed for ${name}: ${error?.message ?? error}`)
      }
    }
    try {
      fs.writeFileSync(eventsPath, '', 'utf8')
    } catch {
      /* ignore */
    }
    eventsOffset = 0
    overlayHalt = false
    try {
      // A fresh process must never replay the request that the previous one
      // already served, so the counter starts from zero on every spawn.
      writeState({ captureRequest: 0 })
    } catch {
      /* ignore */
    }
    let child
    try {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script],
        {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, GUIDE_TUTOR_DATA: dataDir },
        },
      )
    } catch (error) {
      log(`overlay spawn failed: ${error?.message ?? error}`)
      return
    }
    overlayChild = child
    overlayStartedAt = Date.now()
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => log(`overlay out: ${String(chunk).trim()}`))
    child.stderr?.on('data', (chunk) => log(`overlay err: ${String(chunk).trim()}`))
    child.on('error', (error) => log(`overlay process error: ${error?.message ?? error}`))
    child.on('exit', (code, signal) => {
      log(`overlay exited code=${code} signal=${signal} after ${Date.now() - overlayStartedAt}ms`)
      if (overlayChild === child) overlayChild = null
      broadcast('overlay', { running: false, code, signal })
      if (disposed) return
      if (overlayHalt) {
        overlayHalt = false
        return
      }
      if (failuresSinceReady < 4) {
        failuresSinceReady += 1
        later(startOverlay, 1500)
      }
    })
    log(`overlay spawned pid=${child.pid}`)
    broadcast('overlay', { running: true, pid: child.pid, ready: false })
  }

  function stopOverlay() {
    const child = overlayChild
    overlayChild = null
    if (!child) return
    overlayHalt = true
    if (!child.killed) {
      try {
        // A WPF overlay ignores a soft kill long enough to overlap the next
        // spawn (two bubbles, two trays), so take the whole tree down.
        if (process.platform === 'win32' && child.pid) {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
        } else {
          child.kill()
        }
      } catch (error) {
        log(`overlay kill failed: ${error?.message ?? error}`)
      }
    }
  }

  // ---------------------------------------------------------------- events
  function pollEvents() {
    let stat
    try {
      stat = fs.statSync(eventsPath)
    } catch {
      return
    }
    if (stat.size === eventsOffset) return
    if (stat.size < eventsOffset) eventsOffset = 0
    const length = stat.size - eventsOffset
    if (length <= 0) return
    let text = ''
    try {
      const fd = fs.openSync(eventsPath, 'r')
      try {
        const buffer = Buffer.alloc(length)
        fs.readSync(fd, buffer, 0, length, eventsOffset)
        text = buffer.toString('utf8')
      } finally {
        fs.closeSync(fd)
      }
      eventsOffset = stat.size
    } catch (error) {
      log(`read events failed: ${error?.message ?? error}`)
      return
    }
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let event
      try {
        event = JSON.parse(trimmed)
      } catch {
        continue
      }
      handleEvent(event).catch((error) => log(`event handler failed: ${error?.stack ?? error}`))
    }
  }

  async function handleEvent(event) {
    switch (event.type) {
      case 'ready':
        failuresSinceReady = 0
        log(`overlay ready (pid ${event.pid})`)
        pruneShots()
        broadcast('overlay', { running: true, pid: Number(event.pid) || null, ready: true })
        break
      case 'captured': {
        const shot = {
          path: String(event.path || ''),
          width: Number(event.width) || 0,
          height: Number(event.height) || 0,
          left: Number(event.left) || 0,
          top: Number(event.top) || 0,
        }
        broadcast('capture', { ...shot, reason: event.reason, requestId: Number(event.requestId) || 0 })
        pruneShots()
        if (event.reason === 'ball') {
          void handleCaptureRequest(shot)
        } else {
          settleCapture(Number(event.requestId), shot, null)
        }
        break
      }
      case 'capture_failed':
        settleCapture(Number(event.requestId), null, new Error('悬浮层截屏失败'))
        break
      case 'step': {
        const panel = currentState().panel
        const steps = Array.isArray(panel.steps) ? panel.steps : []
        if (steps.length === 0) break
        const delta = Number(event.delta) || 0
        const next = Math.max(0, Math.min(steps.length - 1, (Number(panel.stepIndex) || 0) + delta))
        writeState({ panel: { stepIndex: next } })
        break
      }
      case 'opacity': {
        const value = Number(event.value)
        if (!Number.isFinite(value)) break
        writeState({ panel: { opacity: Math.max(0.35, Math.min(1, value)) } })
        break
      }
      case 'mode':
        writeState({ panel: { mode: event.mode === 'panel' ? 'panel' : 'ball', visible: true } })
        break
      case 'hide':
        writeState({ panel: { visible: false } })
        break
      case 'ball_moved':
        writeState({ panel: { ballX: Number(event.x), ballY: Number(event.y) } })
        break
      case 'ui_scale': {
        // 面板底部滑块或球上 Ctrl+滚轮：0.7–1.8 连续可调
        const scale = Number(event.scale)
        if (!Number.isFinite(scale)) break
        writeState({ panel: { uiScale: Math.max(0.7, Math.min(1.8, scale)) } })
        break
      }
      case 'plan_done': {
        const id = String(event.id || '')
        if (id) setPlanItemDone(id, event.done !== false)
        break
      }
      case 'card_moved':
        writeState({ card: { x: Number(event.x), y: Number(event.y) } })
        break
      case 'topbar_moved':
        writeState({ topbar: { x: Number(event.x), y: Number(event.y) } })
        break
      case 'topbar_scale': {
        const sc = Number(event.scale)
        if (!Number.isFinite(sc)) break
        writeState({ topbar: { scale: Math.max(0.7, Math.min(2, sc)) } })
        break
      }
      case 'card_close':
        writeState({ card: { visible: false } })
        break
      case 'card_toggle': {
        const shown = currentState().card?.visible === true
        writeState({ card: { visible: !shown } })
        break
      }
      case 'card_show':
        writeState({ card: { visible: true } })
        break
      case 'card_hide':
        writeState({ card: { visible: false } })
        break
      case 'card_opacity': {
        const op = Number(event.opacity)
        if (!Number.isFinite(op)) break
        writeState({ card: { opacity: Math.max(0.2, Math.min(1, op)) } })
        break
      }
      case 'card_width': {
        const w = Number(event.width)
        if (!Number.isFinite(w)) break
        writeState({ card: { width: Math.max(240, Math.min(640, Math.round(w))) } })
        break
      }
      case 'ball_opacity': {
        const bop = Number(event.opacity)
        if (!Number.isFinite(bop)) break
        writeState({ ball: { opacity: Math.max(0.2, Math.min(1, bop)) } })
        break
      }
      case 'plan_add': {
        // 卡片右上角「＋」：用户自己往清单里加一条，不必经过模型。
        const newTitle = String(event.title || '').trim()
        if (!newTitle) break
        try {
          const added = planRun({
            action: 'add',
            from: String(event.from || ''),
            to: String(event.to || ''),
            place: String(event.place || ''),
            title: newTitle,
            note: String(event.note || ''),
            priority: String(event.priority || ''),
            repeat: String(event.repeat || ''),
          })
          log('plan add from card -> ' + (added?.error || String(event.from || '?') + ' ' + newTitle))
          pushPlanState(planForToday())
        } catch (error) {
          log('plan add from card failed: ' + (error?.message || error))
        }
        break
      }
      case 'plan_update': {
        // 卡片上点「✎」：改一条的时间/地点/标题，不必经过模型。
        try {
          const updated = planRun({
            action: 'update',
            id: String(event.id || ''),
            from: String(event.from || ''),
            to: String(event.to || ''),
            place: String(event.place !== undefined ? event.place : ''),
            title: String(event.title || ''),
            note: String(event.note !== undefined ? event.note : ''),
            priority: String(event.priority !== undefined ? event.priority : ''),
            repeat: String(event.repeat !== undefined ? event.repeat : ''),
          })
          log('plan update from card -> ' + (updated?.error || String(event.id || '?')))
          pushPlanState(planForToday())
        } catch (error) {
          log('plan update from card failed: ' + (error?.message || error))
        }
        break
      }
      case 'plan_remove': {
        // 卡片上点「✕」：删掉一条。
        try {
          const removed = planRun({ action: 'remove', id: String(event.id || ''), note: '卡片上删掉一条' })
          log('plan remove from card -> ' + (removed?.error || String(event.id || '?')))
          pushPlanState(planForToday())
        } catch (error) {
          log('plan remove from card failed: ' + (error?.message || error))
        }
        break
      }
      case 'template_save': {
        try {
          const saved = planRun({ action: 'template_save', name: String(event.name || '') })
          log('template save from card -> ' + (saved?.error || saved?.name))
        } catch (error) {
          log('template save failed: ' + (error?.message || error))
        }
        break
      }
      case 'template_apply': {
        try {
          const applied = planRun({
            action: 'template_apply',
            name: String(event.name || ''),
            dayOffset: Number(event.dayOffset || 0),
          })
          log('template apply from card -> ' + (applied?.error || applied?.date))
        } catch (error) {
          log('template apply failed: ' + (error?.message || error))
        }
        break
      }
      case 'template_remove': {
        try {
          const removedTemplate = planRun({ action: 'template_remove', name: String(event.name || '') })
          log('template remove from card -> ' + (removedTemplate?.error || removedTemplate?.name))
        } catch (error) {
          log('template remove failed: ' + (error?.message || error))
        }
        break
      }
      case 'tone': {
        const tone = String(event.tone || '')
        if (!tone) break
        try {
          const cur = edict.config()
          fs.writeFileSync(edict.configPath, JSON.stringify({ ...cur, tone }, null, 2) + '\n', 'utf8')
          log(`tone set: ${tone}`)
        } catch (err) {
          log(`tone set failed: ${err && err.message}`)
        }
        break
      }
      case 'voice':
        void handleVoice(event)
        break
      case 'replay_say': {
        const text = String(event.text || '').trim()
        if (!text) break
        log(`replay: ${text.length} 字 ${text.slice(0, 30)}`)
        speakText(text, { silent: true })
        break
      }
      case 'listen':
        void handleListen()
        break
      case 'done':
        handleDone()
        break
      case 'ask':
        void handleAsk(event)
        break
      case 'next_step':
        handleNextStep()
        break
      case 'always_voice':
        setAlwaysListen(event.on === true)
        break
      case 'auto_speak':
        setAutoSpeak(event.on === true)
        break
      case 'subtitle_size':
        setSubtitleSize(event.size)
        break
      case 'volume':
        setSpeechVolume(event.value)
        break
      case 'clear_annots': {
        // 用户在面板上点「清」或在托盘菜单里选「清除屏幕标注」：
        // 立刻把标注清空、面板收起来。不需要等模型来 guide_finish。
        log('clear annots requested from overlay')
        writeState({
          annots: [],
          panel: { visible: false, busy: false, text: '', steps: [], stepIndex: 0 },
          captureMode: false,
        })
        break
      }
      case 'quit':
        log('overlay quit requested from the tray menu')
        broadcast('overlay', { running: false, pid: null, ready: false })
        break
      default:
        log(`unknown overlay event ${JSON.stringify(event)}`)
    }
  }

  // --------------------------------------------------------------- capture
  // The WPF overlay process owns screen capture: it hides itself, grabs the
  // screen in its own DPI context and downscales the bitmap to the annotation
  // grid, so a coordinate read off the saved PNG lands exactly on the overlay.
  const pendingCaptures = new Map()
  let captureRequestId = 0

  // T10：截图与巡检照片默认只留 7 天。目录里按修改时间判断，两个子目录都扫
  // （shots/ 是读屏截图，shots/cam/ 是摄像头巡检），超期就删，避免悄悄堆满磁盘。
  const SHOT_KEEP_DAYS = 7

  function pruneShots(keepDays = SHOT_KEEP_DAYS) {
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000
    for (const dir of [shotsDir, path.join(shotsDir, 'cam')]) {
      let names = []
      try {
        names = fs.readdirSync(dir).filter((name) => !name.startsWith('.'))
      } catch {
        continue
      }
      for (const name of names) {
        const file = path.join(dir, name)
        try {
          const stat = fs.statSync(file)
          if (stat.isFile() && stat.mtimeMs < cutoff) fs.unlinkSync(file)
        } catch {
          /* 文件可能正被读走，跳过 */
        }
      }
    }
  }

  function settleCapture(id, shot, error) {
    const pending = pendingCaptures.get(id)
    if (!pending) return
    pendingCaptures.delete(id)
    clearTimeout(pending.timer)
    if (error) pending.reject(error)
    else pending.resolve(shot)
  }

  function requestCapture() {
    const id = ++captureRequestId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingCaptures.delete(id)
      reject(new Error('等待悬浮层截屏超时'))
      }, 15000)
      pendingCaptures.set(id, { resolve, reject, timer })
      try {
        writeState({ captureRequest: id })
      } catch (error) {
        clearTimeout(timer)
        pendingCaptures.delete(id)
        reject(error)
        return
      }
      if (!overlayChild) startOverlay()
    })
  }

  // --------------------------------------------------------------- message
  // A user message has to be a plain, deeply frozen object: the session keeps
  // events JSON-serializable, so a Promise (from a lazy import) or a class
  // instance would be rejected with "carries non-JSON-serializable data".
  function buildUserMessage(text) {
    return Object.freeze({
      id: `msg_${randomBytes(8).toString('hex')}`,
      role: 'user',
      content: Object.freeze([Object.freeze({ type: 'text', text: String(text) })]),
      source: Object.freeze({ kind: 'user' }),
    })
  }

  function pickAgent() {
    try {
      const roots = ctx.agents?.roots?.() ?? []
      if (roots.length === 0) return null
      return roots[roots.length - 1]
    } catch (error) {
      log(`agent lookup failed: ${error?.message ?? error}`)
      return null
    }
  }

  function capturePrompt(shot) {
    return [
      '【读屏请求】用户点击了屏幕上的“教学助手”悬浮球。',
      `屏幕截图：${shot.path}（尺寸 ${shot.width}x${shot.height}，坐标原点为虚拟桌面左上角）。`,
      '请按下面的流程处理：',
      '1. 用 read_image 读取这张截图，判断用户正在用什么软件、处于什么界面、下一步该做什么。',
      '2. 用 guide_teach 在屏幕上标出下一步要点击或输入的位置（rect、circle 或 arrow，坐标与截图一致），并在 panel.text 写一句不超过 30 字的中文提示。',
      '3. 如果是多步骤任务，用 panel.steps 列出步骤，并把 panel.stepIndex 设为当前步。',
      '4. 回复用户时只讲当前这一步，等用户操作后再读屏确认。',
      '如果截图信息不足，先用一句话问用户一个明确的问题，不要臆测。',
    ].join('\n')
  }

  async function handleCaptureRequest(shot) {
    if (captureBusy) {
      log('capture request ignored: already busy')
      return
    }
    captureBusy = true
    try {
      writeState({
        panel: { visible: true, mode: 'panel', busy: true, title: '正在读屏', text: '已读取屏幕，正在分析…' },
      })
      const agent = pickAgent()
      if (!agent) {
        writeState({ panel: { busy: false, title: '未找到会话', text: '请先打开一个 DSH 对话，再点击悬浮球。' } })
        return
      }
      const message = buildUserMessage(capturePrompt(shot))
      log(`capture ${shot.path} (${shot.width}x${shot.height})`)
      agent.followup(message)
      log(`followup delivered to agent ${agent.id}`)
      writeState({ panel: { busy: false, title: '教学助手', text: '已把屏幕交给模型，稍等提示。' } })
    } catch (error) {
      log(`capture flow failed: ${error?.stack ?? error}`)
      writeState({ panel: { busy: false, title: '读屏失败', text: String(error?.message ?? error).slice(0, 160) } })
    } finally {
      captureBusy = false
    }
  }

  let captureBusy = false

  // ---------------------------------------------------------------- shapes
  const SHAPE_KINDS = ['rect', 'circle', 'arrow', 'text', 'spotlight']

  function toNumber(value, fallback = 0) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
  }

  function normalizeShapes(list) {
    const shapes = []
    for (const raw of Array.isArray(list) ? list : []) {
      if (!raw || typeof raw !== 'object') continue
      const kind = String(raw.kind)
      if (!SHAPE_KINDS.includes(kind)) continue
      const shape = { kind }
      if (typeof raw.color === 'string' && raw.color.trim()) shape.color = raw.color.trim()
      if (raw.thickness !== undefined) shape.thickness = Math.max(1, toNumber(raw.thickness, 5))
      if (kind === 'arrow') {
        shape.x1 = toNumber(raw.x1)
        shape.y1 = toNumber(raw.y1)
        shape.x2 = toNumber(raw.x2)
        shape.y2 = toNumber(raw.y2)
      } else if (kind === 'text') {
        shape.x = toNumber(raw.x)
        shape.y = toNumber(raw.y)
        shape.text = String(raw.text ?? '')
      } else {
        shape.x = toNumber(raw.x)
        shape.y = toNumber(raw.y)
        shape.w = Math.max(1, toNumber(raw.w, 1))
        shape.h = Math.max(1, toNumber(raw.h, 1))
      }
      if (raw.label) shape.label = String(raw.label)
      shapes.push(shape)
    }
    return shapes.slice(0, 24)
  }

  const shapeSchema = {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: SHAPE_KINDS },
      x: { type: 'number', description: '矩形/圆圈/聚光灯左上角 X（截图像素）' },
      y: { type: 'number' },
      w: { type: 'number' },
      h: { type: 'number' },
      x1: { type: 'number', description: '箭头起点' },
      y1: { type: 'number' },
      x2: { type: 'number', description: '箭头终点（箭头指向这里）' },
      y2: { type: 'number' },
      color: { type: 'string', description: '颜色，如 #FF3B30' },
      thickness: { type: 'number', description: '线宽，默认 5' },
      label: { type: 'string', description: '标注旁的小字' },
      text: { type: 'string', description: 'kind=text 时显示的文字' },
      size: { type: 'number' },
    },
    required: ['kind'],
    additionalProperties: false,
  }

  const panelPatchSchema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      text: { type: 'string', description: '面板正文，建议不超过 30 字' },
      steps: { type: 'array', items: { type: 'string' }, description: '步骤列表' },
      stepIndex: { type: 'integer', description: '当前步骤下标，从 0 开始' },
      opacity: { type: 'number', description: '面板不透明度，0.35 - 1' },
      mode: { type: 'string', enum: ['ball', 'panel'] },
      visible: { type: 'boolean' },
    },
    additionalProperties: false,
  }

  // ----------------------------------------------------------------- tools
  const guideScreenTool = {
    name: 'guide_screen',
    description:
      '截取整个 Windows 桌面，返回 PNG 文件路径与像素尺寸；截屏时会临时隐藏悬浮层。拿到路径后用 read_image 读取图片，再决定怎么标注。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          width: { type: 'integer' },
          height: { type: 'integer' },
          left: { type: 'integer' },
          top: { type: 'integer' },
        },
        required: ['path', 'width', 'height'],
        additionalProperties: false,
      },
      render: (args, value) => [
        {
          type: 'text',
          text: `已截屏 ${value.width}x${value.height}，文件：${value.path}（用 read_image 查看）`,
        },
      ],
    },
    async execute() {
      return await requestCapture()
    },
  }

  // ---------------------------------------------------------- voice / done
  function voicePrompt(text) {
    return [
      '【语音】用户刚刚对你说：',
      `「${text}」`,
      '（来自本地离线语音识别 paraformer，可能有错字或漏字，请结合上下文理解；实在听不清就先问一句。）',
      '照常回应用户：要看屏幕就调用 guide_screen，要指路就用 guide_teach 标注，一次只给一步。',
    ].join('\n')
  }

  function askPrompt(text) {
    return [
      '【面板对话】用户从悬浮面板的输入框发来：',
      `「${text}」`,
      '这是"先沟通、再动手"的窗口，按内容判断：',
      '- 像是新的学习目标（例如"我想学会用 XX 做 YY"）：先用一两句话确认你理解的目标，把计划拆成 3-6 步写进 panel.steps、panel.stepIndex=0，panel.text 写一句"计划好了，点开始"。不要立刻开始标注。同时把目标写进 guide_teach 的 goal 字段。',
      '- 像问题：直接回答。短答案写 panel.text（≤30 字），完整解释放聊天回复。',
      '- "开始" / "下一步" / "继续"：立即 guide_screen → read_image → guide_teach，给出这一步的标注。',
      '- 别的（补充说明、纠正方向）：按上下文调整计划，并更新面板。',
    ].join('\n')
  }

  async function handleAsk(event) {
    const text = String(event.text || '').trim()
    if (!text) return
    log(`ask: ${text}`)
    recordChat('你', '面板', text)
    broadcast('ask', { text })
    writeState({ panel: { text: '收到，稍微等我一下…', busy: true, mode: 'panel', visible: true } })
    const agent = pickAgent()
    if (!agent) {
      log('ask: no agent to deliver to')
      writeState({ panel: { text: '现在没有打开的对话，请先在 DSH 里开一个会话。', busy: false } })
      return
    }
    try {
      agent.followup(buildUserMessage(askPrompt(text)))
      log('ask followup delivered')
    } catch (error) {
      log(`ask followup failed: ${error?.message ?? error}`)
      writeState({ panel: { text: '消息没送出去，看下 plugin.log。', busy: false } })
    }
  }

  async function deliverVoiceText(text, meta = {}) {
    if (!text) return
    log(`voice: ${text}`)
    recordChat('你', '语音', text)
    broadcast('voice', { text, confidence: Number(meta.confidence) || 0 })
    writeState({ panel: { text: `听到：${text.slice(0, 24)}`, mode: 'panel', busy: false } })
    const agent = pickAgent()
    if (!agent) {
      log('voice: no agent to deliver to')
      writeState({ panel: { text: '先打开一个对话，我才能回应语音。', busy: false } })
      return
    }
    try {
      agent.followup(buildUserMessage(voicePrompt(text)))
      log('voice followup delivered')
    } catch (error) {
      log(`voice followup failed: ${error?.message ?? error}`)
      writeState({ panel: { text: '语音消息没送出去，看下 plugin.log。', busy: false } })
    }
  }

  async function handleVoice(event) {
    const text = String(event.text || '').trim()
    if (!text || /\uFFFD/.test(text)) {
      if (text) log(`voice dropped garbled text: ${JSON.stringify(text).slice(0, 80)}`)
      return
    }
    await deliverVoiceText(text, { confidence: event.confidence })
  }

  // Offline speech-to-text: record a short utterance in python (VAD trims the
  // silence) and let sherpa-onnx paraformer transcribe it. No network, no key.
  let listenBusy = false

  // Portable Python lookup: every DSH install ships a Python 3.12 with
  // python-docx, so probe the runtime that belongs to this app instead of
  // depending on a per-machine absolute path. A configured pythonPath still wins.
  function pythonCommand() {
    const candidates = []
    if (config.pythonPath) candidates.push(String(config.pythonPath))
    if (process.env.DSH_PRIMARY_RUNTIME) {
      candidates.push(path.join(process.env.DSH_PRIMARY_RUNTIME, 'dependencies', 'python', 'python.exe'))
    }
    candidates.push(
      path.join(os.homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe'),
    )
    try {
      const root = path.dirname(process.execPath)
      candidates.push(path.join(root, 'resources', 'runtime', 'primary-runtime', 'dependencies', 'python', 'python.exe'))
      candidates.push(path.join(root, 'resources', 'runtime', 'dependencies', 'python', 'python.exe'))
      candidates.push(path.join(root, 'runtime', 'primary-runtime', 'dependencies', 'python', 'python.exe'))
    } catch {
      /* process.execPath always exists; never fail the plugin load over it */
    }
    for (const candidate of candidates) {
      try {
        if (candidate && fs.existsSync(candidate)) return candidate
      } catch {
        /* ignore a malformed candidate */
      }
    }
    log('python not found; set config.pythonPath to a Python 3.12 that has python-docx')
    return 'python'
  }

  function asrPaths() {
    const modelDir = config.modelDir
      ? path.resolve(config.modelDir)
      : path.join(HERE, 'models', 'paraformer-small')
    return {
      script: path.join(HERE, 'native', 'asr.py'),
      libs: path.join(HERE, 'py', 'libs'),
      model: config.modelFile || path.join(modelDir, 'model.int8.onnx'),
      tokens: config.tokensFile || path.join(modelDir, 'tokens.txt'),
    }
  }

  function transcribeOnce() {
    const { script, libs, model, tokens } = asrPaths()
    return new Promise((resolve) => {
      if (!fs.existsSync(script)) return resolve({ ok: false, error: `缺少 ${script}` })
      if (!fs.existsSync(model)) return resolve({ ok: false, error: '语音模型还没装好' })
      const child = spawn(
        pythonCommand(),
        [script, '--model', model, '--tokens', tokens, '--max-seconds', String(config.listenSeconds || 12)],
        {
          windowsHide: true,
          env: { ...process.env, PYTHONPATH: [libs, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
        },
      )
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
      }, 30000)
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        resolve({ ok: false, error: error.message })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (stderr.trim()) log(`asr stderr: ${stderr.trim().slice(-400)}`)
        const line = stdout
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter((item) => item.startsWith('{'))
          .pop()
        if (!line) return resolve({ ok: false, error: `识别进程退出码 ${code}` })
        try {
          resolve(JSON.parse(line))
        } catch (error) {
          resolve({ ok: false, error: error.message })
        }
      })
    })
  }

  let alwaysListen = false
  let listenFailures = 0
  let listenTimer = null

  function setAlwaysListen(on, reason = '') {
    alwaysListen = Boolean(on)
    listenFailures = 0
    writeState({ panel: { alwaysListen } })
    broadcast('alwaysListen', { on: alwaysListen })
    log(`always-listen ${alwaysListen ? 'on' : 'off'}${reason ? ` (${reason})` : ''}`)
    if (alwaysListen && !listenBusy && !disposed) scheduleNextListen(0)
  }

  function scheduleNextListen(delay = 700) {
    if (!alwaysListen || disposed || listenTimer) return
    listenTimer = setTimeout(() => {
      listenTimer = null
      if (!alwaysListen || disposed) return
      if (listenBusy) {
        scheduleNextListen(1200)
        return
      }
      void handleListen()
    }, delay)
  }

  async function handleListen() {
    if (listenBusy || disposed) return
    listenBusy = true
    writeState({ panel: { mode: 'panel', visible: true, text: '正在听…（说完会自动结束）', busy: true } })
    broadcast('listen', { at: Date.now() })
    try {
      const result = await transcribeOnce()
      const heard = typeof result.text === 'string' ? result.text.trim() : ''
      const garbled = /\uFFFD/.test(heard)
      if (!result.ok || !heard || garbled) {
        const reason = garbled ? 'garbled text' : result.error || 'no speech'
        const friendly = /no speech|garbled/i.test(reason) ? '没听清，再说一次？' : `语音不可用：${String(reason).slice(0, 40)}`
        log(`listen failed: ${reason}${heard ? ` raw=${JSON.stringify(heard).slice(0, 80)}` : ''}`)
        listenFailures += 1
        if (alwaysListen && listenFailures >= 5) {
          setAlwaysListen(false, 'too many failures')
          writeState({ panel: { text: '常听已关闭：连续几次没听清。', busy: false } })
          return
        }
        writeState({ panel: { text: friendly, busy: false } })
        return
      }
      listenFailures = 0
      log(`listen ok: ${heard} (${result.seconds}s)`)
      await deliverVoiceText(heard, { confidence: result.confidence || 0 })
    } catch (error) {
      listenFailures += 1
      log(`listen crashed: ${error?.stack ?? error}`)
      writeState({ panel: { text: '语音出错了，稍后再说。', busy: false } })
    } finally {
      listenBusy = false
      if (alwaysListen && !disposed) scheduleNextListen()
    }
  }

  function handleDone() {
    log('panel done button pressed')
    writeState({ panel: { text: '收到，正在核验结果…', mode: 'panel', visible: true } })
    broadcast('done', { at: Date.now() })
    const agent = pickAgent()
    if (!agent) {
      log('done: no agent to deliver to')
      return
    }
    try {
      agent.followup(
        buildUserMessage(
          [
            '【完成确认】用户点了悬浮面板上的「完成」按钮，认为当前任务已经做完。',
            '请按顺序：1) guide_screen 截屏；2) read_image 核验目标是否真的达成；',
            '3) 确认完成就调用 guide_finish 收尾（清空标注、面板折叠回悬浮球）；',
            '4) 若还差一步，指出差在哪里并继续 guide_teach。',
          ].join('\n'),
        ),
      )
      log('done followup delivered')
    } catch (error) {
      log(`done followup failed: ${error?.message ?? error}`)
      writeState({ panel: { text: '完成请求没送出去，看下 plugin.log。', busy: false } })
    }
  }

  function nextStepPrompt() {
    const panel = currentState().panel
    const steps = Array.isArray(panel.steps) ? panel.steps : []
    const index = Number(panel.stepIndex) || 0
    return [
      '【下一步】用户点了悬浮面板上的「下一步」，表示这一步做完了，或者想直接推进到下一步。',
      steps.length
        ? `原计划共 ${steps.length} 步，当前第 ${Math.min(index + 1, steps.length)} 步：${steps[Math.min(index, steps.length - 1)] || ''}`
        : '当前面板里没有写好步骤列表。',
      '请按顺序：1) guide_screen 截屏；2) read_image 确认屏幕上现在到了哪一步；',
      '3) 用 guide_teach 给出下一步的标注，panel.text ≤30 字，panel.steps 保留原计划、panel.stepIndex 指向新的当前步；',
      '4) 若已经是最后一步、或目标已经达成，改用 guide_finish 收尾。',
      '一次只教一步，别把后面几步的操作说明一次堆上来。',
    ].join('\n')
  }

  // 兜底：点「下一步」后若 120 秒内没有新的 teach/finish 到达，就把面板从 busy 里放出来。
  // 之前 followup 被用户消息打断时，回合不会再调 guide_teach，面板会永远卡在「正在准备下一步…」。
  let nextStepWatchdog = null

  function clearNextStepWatchdog() {
    if (nextStepWatchdog) {
      clearTimeout(nextStepWatchdog)
      nextStepWatchdog = null
    }
  }

  function armNextStepWatchdog() {
    clearNextStepWatchdog()
    nextStepWatchdog = setTimeout(() => {
      nextStepWatchdog = null
      const panel = currentState().panel || {}
      if (panel.busy !== true) return
      log('next-step watchdog: still busy after 120s, releasing panel')
      writeState({ panel: { text: '没等到回应，点「下一步」再试一次。', busy: false } })
    }, 120000)
  }

  function handleNextStep() {
    const panel = currentState().panel
    const steps = Array.isArray(panel.steps) ? panel.steps : []
    const index = Number(panel.stepIndex) || 0
    log(`next-step pressed (step ${Math.min(index + 1, Math.max(steps.length, 1))}/${steps.length})`)
    if (steps.length > 0) {
      const next = Math.max(0, Math.min(steps.length - 1, index + 1))
      writeState({ panel: { stepIndex: next } })
    }
    writeState({ panel: { text: '收到，正在准备下一步…', busy: true, mode: 'panel', visible: true } })
    armNextStepWatchdog()
    broadcast('nextStep', { at: Date.now() })
    const agent = pickAgent()
    if (!agent) {
      log('next-step: no agent to deliver to')
      clearNextStepWatchdog()
      writeState({ panel: { text: '现在没有打开的对话，请先在 DSH 里开一个会话。', busy: false } })
      return
    }
    try {
      agent.followup(buildUserMessage(nextStepPrompt()))
      log('next-step followup delivered')
    } catch (error) {
      clearNextStepWatchdog()
      log(`next-step followup failed: ${error?.message ?? error}`)
      writeState({ panel: { text: '下一步请求没送出去，看下 plugin.log。', busy: false } })
    }
  }

  function applyTeach(args = {}) {
    const patch = {}
    if (args.panel && typeof args.panel === 'object') {
      const panel = {}
      for (const key of ['title', 'text', 'steps', 'stepIndex', 'opacity', 'mode', 'visible']) {
        if (args.panel[key] !== undefined) panel[key] = args.panel[key]
      }
      if (Array.isArray(panel.steps)) panel.steps = panel.steps.map((step) => String(step))
      else delete panel.steps
      if (panel.stepIndex !== undefined) panel.stepIndex = Math.max(0, Math.floor(toNumber(panel.stepIndex, 0)))
      if (panel.opacity !== undefined) panel.opacity = Math.max(0.35, Math.min(1, toNumber(panel.opacity, 0.92)))
      if (panel.mode !== undefined && !['ball', 'panel'].includes(panel.mode)) delete panel.mode
      if (panel.visible !== undefined) panel.visible = Boolean(panel.visible)
      if (Object.keys(panel).length > 0) patch.panel = panel
    }
    if (args.clearAnnots) patch.annots = []
    else if (Array.isArray(args.annots)) patch.annots = normalizeShapes(args.annots)
    // Any successful teach call means the "thinking" state is over.
    clearNextStepWatchdog()
    patch.panel = { ...(patch.panel || {}), busy: false }
    const session = currentState().session || {}
    const goal = typeof args.goal === 'string' && args.goal.trim() ? args.goal.trim().slice(0, 140) : ''
    if (session.status !== 'active') {
      patch.session = {
        ...DEFAULT_SESSION,
        ...session,
        status: 'active',
        goal: goal || session.goal || '',
        startedAt: session.startedAt || new Date().toISOString(),
        endedAt: null,
        result: null,
      }
    } else if (goal && goal !== session.goal) {
      patch.session = { ...session, goal }
    }
    const next = writeState(patch)
    return {
      ok: true,
      annotCount: next.annots.length,
      stepIndex: Number(next.panel.stepIndex) || 0,
      mode: next.panel.mode,
      opacity: next.panel.opacity,
    }
  }

  function applyFinish(args = {}) {
    clearNextStepWatchdog()
    const result = args.result === 'aborted' ? 'aborted' : 'done'
    const fallback = result === 'done' ? '任务完成 ✅' : '已结束'
    const message =
      typeof args.message === 'string' && args.message.trim() ? args.message.trim().slice(0, 140) : fallback
    const previous = currentState().session || {}
    writeState({
      panel: { text: message, mode: 'ball', visible: true, steps: [], stepIndex: 0, busy: false },
      annots: [],
      session: {
        status: result,
        result,
        message,
        goal: previous.goal || '',
        startedAt: previous.startedAt || null,
        endedAt: new Date().toISOString(),
      },
    })
    broadcast('session', { status: result, message })
    return { ok: true, result, message }
  }

  const guideFinishTool = {
    name: 'guide_finish',
    description:
      '结束当前教学任务：清空屏幕标注，面板显示结束语并折叠回悬浮球。任务达成、用户放弃或要求停止时调用；调用前尽量先 guide_screen 核验。',
    parameters: {
      type: 'object',
      properties: {
        result: { type: 'string', enum: ['done', 'aborted'], description: 'done=完成，aborted=中止' },
        message: { type: 'string', description: '面板上的一句话，例如「已经帮你打开设置」' },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          result: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['ok', 'result'],
        additionalProperties: false,
      },
      render: (args, value) => [
        {
          type: 'text',
          text: value.result === 'done' ? `教学任务已结束：${value.message}` : `教学任务已中止：${value.message}`,
        },
      ],
    },
    async execute(args = {}) {
      return applyFinish(args)
    },
  }

  const guideTeachTool = {
    name: 'guide_teach',
    description:
      '更新屏幕教学悬浮层：在屏幕上画箭头/圆圈/矩形（坐标用最近一次 guide_screen 截图的像素坐标），并设置半透明面板的标题、提示文字、步骤列表与透明度。每次调用整体替换标注。',
    parameters: {
      type: 'object',
      properties: {
        annots: { type: 'array', items: shapeSchema, description: '新的标注集合；传空数组即清空' },
        clearAnnots: { type: 'boolean', description: '为 true 时清空所有标注' },
        goal: { type: 'string', description: '本次教学任务的一句话目标，例如「在 Excel 里插入数据透视表」' },
        panel: panelPatchSchema,
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          annotCount: { type: 'integer' },
          stepIndex: { type: 'integer' },
          mode: { type: 'string' },
          opacity: { type: 'number' },
        },
        required: ['ok', 'annotCount'],
        additionalProperties: false,
      },
      render: (args, value) =>
        [{ type: 'text', text: `悬浮层已更新：${value.annotCount} 个标注，第 ${value.stepIndex + 1} 步，模式 ${value.mode}。` }],
    },
    async execute(args = {}) {
      return applyTeach(args)
    },
  }

  const kb = createKb({ kbDir, broadcast, docxExtract, docxWrite })
  const guideKbTool = kb.tool

  const guideOverlayTool = {
    name: 'guide_overlay',
    description: '控制桌面悬浮层：status 查看状态；start 启动；restart 重启；stop 关闭。悬浮层异常消失时可用 restart 恢复。',
    parameters: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['status', 'start', 'restart', 'stop'] } },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args = {}) {
      return runOverlayAction(args.action)
    },
  }

  function runOverlayAction(action) {
    if (action === 'stop') {
      stopOverlay()
      broadcast('overlay', { running: false, stopped: true })
      return { running: false }
    }
    if (action === 'start') {
      if (!overlayChild) startOverlay()
      return { running: true }
    }
    if (action === 'restart') {
      // stopOverlay sets overlayHalt, so the exit handler stays quiet; the
      // single delayed spawn below is the only one that happens.
      stopOverlay()
      later(startOverlay, 1200)
      return { running: true, restarted: true }
    }
    return {
      running: Boolean(overlayChild),
      pid: overlayChild?.pid ?? null,
      dataDir,
      shots: fs.readdirSync(shotsDir).length,
      kb: kb.list().length,
    }
  }

  // ------------------------------------------------------------------ speech
  // Replies are spoken by Windows SAPI (offline, no key) and the same text is
  // painted on screen. native/tts.ps1 streams word-level progress so the caption
  // reveals exactly when the voice reaches that word.
  const ttsScript = path.join(NATIVE_DIR, 'tts.ps1')
  let ttsChild = null
  let subtitleSeq = 0
  let subtitleHideTimer = null
  let autoSpeak = config.autoSpeak !== false

  // Caption size and speaking volume live in the data directory so they survive
  // a restart without touching the profile patch.
  const settingsPath = path.join(dataDir, 'settings.json')
  const DEFAULT_SPEECH = { subtitleSize: 24, volume: 90, rate: Number(config.speechRate) || 0 }
  let speechSettings = { ...DEFAULT_SPEECH }
  try {
    speechSettings = { ...DEFAULT_SPEECH, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }
  } catch {
    /* first run, or the file was removed by hand */
  }

  function saveSpeechSettings() {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(speechSettings, null, 2), 'utf8')
    } catch (error) {
      log(`save speech settings failed: ${error?.message ?? error}`)
    }
  }

  // 语音缓存：同一句第二次播放直接读 mp3，不用再起 python 去等 edge。
  const ttsCacheDir = path.join(dataDir, 'tts-cache')
  try {
    fs.mkdirSync(ttsCacheDir, { recursive: true })
  } catch {
    /* 缓存目录建不出来就退化成现合现播 */
  }
  const speechPrefetching = new Set()

  function ttsCacheFile(text) {
    const voice = String(config.edgeVoice || 'zh-CN-XiaoxiaoNeural')
    const seed = `${text}|${voice}|${speechSettings.rate}|${speechSettings.volume}`
    return path.join(ttsCacheDir, `${createHash('sha256').update(seed).digest('hex').slice(0, 20)}.mp3`)
  }

  // 播放当前句时顺手把下一句合出来，轮到它时直接命中缓存。
  function prefetchSpeech(text) {
    if (!text || disposed) return
    let target
    try {
      target = ttsCacheFile(text)
    } catch {
      return
    }
    try {
      if (fs.statSync(target).size > 800) return
    } catch {
      /* 还没缓存 */
    }
    if (speechPrefetching.has(target)) return
    const script = path.join(NATIVE_DIR, 'tts_edge.py')
    if (!fs.existsSync(script)) return
    const voice = String(config.edgeVoice || 'zh-CN-XiaoxiaoNeural')
    speechPrefetching.add(target)
    const tmp = `${target}.${Date.now()}.tmp`
    const finish = (code) => {
      speechPrefetching.delete(target)
      try {
        if (code === 0 && fs.statSync(tmp).size > 800) fs.renameSync(tmp, target)
        else fs.rmSync(tmp, { force: true })
      } catch {
        try {
          fs.rmSync(tmp, { force: true })
        } catch {
          /* ignore */
        }
      }
    }
    try {
      const child = spawn(
        pythonCommand(),
        [script, '--out', tmp, '--rate', String(speechSettings.rate), '--volume', String(speechSettings.volume)],
        {
          windowsHide: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            GUIDE_TTS_TEXT: text,
            GUIDE_TTS_VOICE: voice,
            PYTHONPATH: path.join(HERE, 'py', 'libs') + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : ''),
          },
        },
      )
      child.on('exit', finish)
      child.on('error', () => finish(-1))
    } catch {
      speechPrefetching.delete(target)
    }
  }

  function setSubtitleSize(size) {
    const value = Math.max(14, Math.min(48, Math.round(Number(size) || DEFAULT_SPEECH.subtitleSize)))
    speechSettings.subtitleSize = value
    saveSpeechSettings()
    writeState({ subtitle: { size: value } })
    broadcast('settings', { ...speechSettings })
    log(`subtitle size -> ${value}`)
    return value
  }

  function setSpeechVolume(level) {
    const value = Math.max(10, Math.min(100, Math.round(Number(level) || DEFAULT_SPEECH.volume)))
    speechSettings.volume = value
    saveSpeechSettings()
    broadcast('settings', { ...speechSettings })
    log(`speech volume -> ${value}`)
    return value
  }

  function clampSpeech(text, limit = 220) {
    return String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, Math.max(10, Number(limit) || 220))
  }

  // Speech is queued sentence by sentence: one reply is broken into several short
  // chunks, each spoken on its own, so it sounds like a person talking instead of
  // a single compressed headline being read out.
  let speechQueue = []
  let speaking = false
  let speechRun = 0
  let lastRevealAt = 0

  // 摄像头巡检是静默提示：那一轮的回复不朗读（用户明确要求"抓拍不需要语音播报"）。
  // 用消息 id 认这一轮，避免把下一轮正常对话也一起静音。
  const mutedSpeakMessages = new Set()
  let speakMutedThisTurn = false

  function stopSpeech() {
    if (subtitleHideTimer) {
      clearTimeout(subtitleHideTimer)
      subtitleHideTimer = null
    }
    speechQueue = []
    speechRun += 1
    if (ttsChild) {
      try {
        ttsChild.kill()
      } catch {
        /* ignore */
      }
      ttsChild = null
    }
  }

  function scheduleSubtitleClear(seq) {
    if (subtitleHideTimer) clearTimeout(subtitleHideTimer)
    subtitleHideTimer = setTimeout(() => {
      subtitleHideTimer = null
      if (seq !== subtitleSeq) return
      writeState({ subtitle: { active: false, reveal: 0 } })
    }, 2600)
  }

  function speakChunk(text) {
    if (!text || disposed) return null
    if (!fs.existsSync(ttsScript)) {
      log(`tts.ps1 missing at ${ttsScript}`)
      return null
    }
    const run = speechRun
    const seq = ++subtitleSeq
    writeState({ subtitle: { active: true, text, reveal: 0, seq, size: speechSettings.subtitleSize } })
    let child
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ttsScript], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GUIDE_TTS_TEXT: text,
          GUIDE_TTS_VOICE: String(config.voice || ''),
          GUIDE_TTS_RATE: String(speechSettings.rate),
          GUIDE_TTS_VOLUME: String(speechSettings.volume),
          // 默认走 edge（晓晓），断网时 tts.ps1 自己回落到 SAPI 惠惠。
          GUIDE_TTS_ENGINE: String(config.ttsEngine || 'edge'),
          GUIDE_TTS_EDGE_VOICE: String(config.edgeVoice || 'zh-CN-XiaoxiaoNeural'),
          GUIDE_TTS_PYTHON: pythonCommand(),
          GUIDE_TTS_CACHE: ttsCacheDir,
        },
      })
    } catch (error) {
      log(`tts spawn failed: ${error?.message ?? error}`)
      writeState({ subtitle: { active: false } })
      return null
    }
    ttsChild = child
    if (speechQueue.length) prefetchSpeech(speechQueue[0])
    let advanced = false
    const advance = (delay) => {
      if (advanced) return
      advanced = true
      if (ttsChild === child) ttsChild = null
      if (run !== speechRun) return
      later(playNextChunk, delay)
    }
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    let buffer = ''
    child.stdout?.on('data', (chunk) => {
      buffer += String(chunk)
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!line.startsWith('{')) continue
        let event
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }
        if (run !== speechRun || seq !== subtitleSeq) continue
        if (event.type === 'progress') {
          const reveal = Math.min(text.length, (Number(event.char) || 0) + (Number(event.count) || 0))
          // 逐字刷新没必要每个字都写盘：60ms 一次足够跟手，也少和悬浮层抢文件。
          const now = Date.now()
          if (now - lastRevealAt < 60 && reveal < text.length) continue
          lastRevealAt = now
          writeState({ subtitle: { reveal } })
        } else if (event.type === 'end') {
          advance(160)
        } else if (event.type === 'error') {
          log(`tts error: ${event.message}`)
        }
      }
    })
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text) log(`tts stderr: ${text.slice(-300)}`)
    })
    child.on('error', (error) => log(`tts process error: ${error?.message ?? error}`))
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) log(`tts exited ${code}`)
      advance(60)
    })
    log(`speak [${seq}] (${text.length} 字): ${text.slice(0, 40)}`)
    return seq
  }

  function playNextChunk() {
    if (disposed) return
    if (subtitleHideTimer) {
      clearTimeout(subtitleHideTimer)
      subtitleHideTimer = null
    }
    const next = speechQueue.shift()
    if (!next) {
      speaking = false
      scheduleSubtitleClear(subtitleSeq)
      return
    }
    speaking = true
    speakChunk(next)
  }

  function speakText(rawText, options = {}) {
    const chunks = speechChunks(rawText)
    if (!chunks.length || disposed) return null
    stopSpeech()
    speechQueue = chunks.slice()
    playNextChunk()
    const chars = chunks.join('').length
    log(`speak queue (${chunks.length} 句，${chars} 字，约 ${Math.round(chars / 2.8 + chunks.length * 0.16 + 1)} 秒)`)
    if (!options.silent) recordChat('我', '语音', chunks.join(''))
    return subtitleSeq
  }

  // Long markdown replies make terrible narration. Strip the markup, then cut the
  // text into short spoken lines: a person says one idea, pauses, then the next.
  const SPEECH_MAX_CHUNKS = 32
  const SPEECH_MAX_CHARS = 1600
  const SPEECH_CHUNK_CHARS = 46

  function speechChunks(text) {
    let body = String(text ?? '')
    body = body.replace(/```[\s\S]*?```/g, ' ')
    body = body.replace(/`[^`]*`/g, ' ')
    body = body.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    body = body.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    body = body.replace(/https?:\/\/\S+/g, ' ')
    body = body.replace(/^\s{0,3}#{1,6}\s+/gm, '')
    body = body.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    body = body.replace(/\|/g, ' ')
    body = body.replace(/[*_>~#]/g, '')
    body = body.replace(/[ \t]+/g, ' ')
    body = body.replace(/\n{2,}/g, '\n')
    body = body.trim()
    if (!body) return []
    const sentences = body
      .split(/(?<=[。！？!?；;])|\n/)
      .map((part) => part.trim())
      .filter(Boolean)
    const pieces = []
    for (const sentence of sentences) {
      if (sentence.length <= SPEECH_CHUNK_CHARS) {
        pieces.push(sentence)
        continue
      }
      // 太长的句子按逗号/顿号再切，尽量保持"一口气说得完"
      let buffer = ''
      for (const part of sentence.split(/(?<=[，,、：:])/)) {
        if ((buffer + part).length > SPEECH_CHUNK_CHARS && buffer) {
          pieces.push(buffer)
          buffer = part
        } else {
          buffer += part
        }
      }
      while (buffer.length > SPEECH_CHUNK_CHARS) {
        pieces.push(buffer.slice(0, SPEECH_CHUNK_CHARS))
        buffer = buffer.slice(SPEECH_CHUNK_CHARS)
      }
      if (buffer.trim()) pieces.push(buffer)
    }
    const chunks = []
    let total = 0
    for (const piece of pieces) {
      const clean = piece.replace(/\s+/g, ' ').trim()
      if (clean.length < 2) continue
      if (chunks.length >= SPEECH_MAX_CHUNKS || total >= SPEECH_MAX_CHARS) break
      chunks.push(clean)
      total += clean.length
    }
    return chunks
  }

  function setAutoSpeak(on) {
    autoSpeak = Boolean(on)
    writeState({ panel: { autoSpeak } })
    broadcast('autoSpeak', { on: autoSpeak })
    log(`auto-speak ${autoSpeak ? 'on' : 'off'}`)
    if (!autoSpeak) stopSpeech()
  }

  // Auto-narration: watch the assistant stream for the words, but take the cue to
  // speak from the durable turn events. Chat typed in the DSH window and chat sent
  // from the panel both end with turn/end, so the voice no longer depends on which
  // input path the message came through.
  let activeAgentId = null
  let turnText = ''
  let attemptText = ''
  let guideSaidThisTurn = false
  let speakTimer = null
  const turnTextBySession = new Map()
  let lastSpokenSignature = ''
  let lastSpokenAt = 0
  let lastTurnEndAt = 0

  function agentKey(agent) {
    return String(agent?.id ?? agent?.session?.id ?? '')
  }

  function isRootAgent(agent) {
    try {
      const key = agentKey(agent)
      return (ctx.agents?.roots?.() ?? []).some((item) => agentKey(item) === key)
    } catch {
      return false
    }
  }

  function rootSessionIds() {
    try {
      return (ctx.agents?.roots?.() ?? []).map((agent) => String(agent?.session?.id ?? '')).filter(Boolean)
    } catch {
      return []
    }
  }

  // 主会话（用户正在说话的那个）才朗读；子代理的自言自语不打扰用户。
  function isMainSession(sessionId) {
    const ids = rootSessionIds()
    if (!ids.length) return true
    return ids.includes(String(sessionId ?? ''))
  }

  function autoSpeakTurn(text, reason) {
    if (!autoSpeak || guideSaidThisTurn || speakMutedThisTurn) return false
    const chunks = speechChunks(text)
    if (!chunks.length) return false
    const signature = chunks.join('|')
    if (signature === lastSpokenSignature && Date.now() - lastSpokenAt < 8000) return false
    lastSpokenSignature = signature
    lastSpokenAt = Date.now()
    guideSaidThisTurn = true
    log(`auto-speak (${reason}, ${chunks.length} 句)`)
    speakText(text)
    return true
  }

  ctx.effect(() => {
    const offInbox = ctx.on('agent/inbox/inserted', (payload) => {
      try {
        const agent = payload?.agent
        const message = payload?.message
        if (message?.source?.kind === 'user') {
          const sessionId = String(agent?.session?.id ?? '')
          activeAgentId = agentKey(agent) || activeAgentId
          turnText = ''
          if (sessionId) turnTextBySession.set(sessionId, '')
          attemptText = ''
          guideSaidThisTurn = false
          // 这一轮是不是"不朗读"的抓拍提示：认消息 id，用完即清。
          speakMutedThisTurn = false
          if (message?.id && mutedSpeakMessages.has(message.id)) {
            mutedSpeakMessages.delete(message.id)
            speakMutedThisTurn = true
          }
          if (speakTimer) {
            clearTimeout(speakTimer)
            speakTimer = null
          }
        }
      } catch (error) {
        log(`inbox hook failed: ${error?.message ?? error}`)
      }
    })
    const offStream = ctx.on('agent/assistant-stream', (payload) => {
      try {
        const agent = payload?.agent
        const frame = payload?.frame
        if (!frame) return
        if (frame.type === 'start') {
          attemptText = ''
          if (speakTimer) {
            clearTimeout(speakTimer)
            speakTimer = null
          }
          return
        }
        if (frame.type === 'chunk') {
          if (frame.chunk?.type === 'text-delta') attemptText += String(frame.chunk.text || '')
          return
        }
        if (frame.type !== 'end') return
        if (frame.outcome?.kind !== 'committed') return
        if (!attemptText.trim()) return
        turnText = attemptText
        const sessionId = String(agent?.session?.id ?? '')
        if (sessionId) turnTextBySession.set(sessionId, turnText)
        // 兜底：万一 turn/end 没来（旧宿主或异常中断），也要把最后一段念出来。
        if (!autoSpeak || guideSaidThisTurn) return
        if (Date.now() - lastTurnEndAt < 1500) return
        const key = agentKey(agent)
        if (activeAgentId && key !== activeAgentId && !isRootAgent(agent)) return
        if (speakTimer) clearTimeout(speakTimer)
        speakTimer = setTimeout(() => {
          speakTimer = null
          if (Date.now() - lastTurnEndAt < 1200) return
          autoSpeakTurn(turnText, 'stream-end')
        }, 1800)
      } catch (error) {
        log(`assistant stream hook failed: ${error?.message ?? error}`)
      }
    })
    // 持久事件：每轮开始/结束都会发，跟输入来自面板还是 DSH 输入框无关。
    // global 让宿主把任意会话的事件都派过来（否则只收到本插件自己那部分）。
    const offSession = ctx.on('session/event', (session, event) => {
      try {
        const sessionId = String(session?.id ?? '')
        if (!sessionId || !event) return
        if (event.type === 'turn/start') {
          turnTextBySession.set(sessionId, '')
          if (isMainSession(sessionId)) {
            turnText = ''
            attemptText = ''
            guideSaidThisTurn = false
            if (speakTimer) {
              clearTimeout(speakTimer)
              speakTimer = null
            }
          }
          return
        }
        if (event.type !== 'turn/end') return
        lastTurnEndAt = Date.now()
        const main = isMainSession(sessionId)
        log(`turn/end ${sessionId.slice(0, 8)} main=${main} chars=${(turnTextBySession.get(sessionId) || turnText || '').length}`)
        if (!main) return
        const spoken = turnTextBySession.get(sessionId) || turnText
        if (!spoken) return
        if (speakTimer) clearTimeout(speakTimer)
        speakTimer = setTimeout(() => {
          speakTimer = null
          autoSpeakTurn(spoken, 'turn-end')
        }, 250)
      } catch (error) {
        log(`session event hook failed: ${error?.message ?? error}`)
      }
    }, { global: true })
    return () => {
      offInbox?.()
      offStream?.()
      offSession?.()
    }
  })

  const guideSayTool = {
    name: 'guide_say',
    description:
      '朗读口播稿，并在屏幕上显示与语音同步的逐字字幕。每次回复用户前调用一次。这是说出来给人听的：像跟熟人聊天，**总时长 60 秒以内**——当前语速约每秒 2.8 字，也就是 150–170 字、8–12 句（每句 ≤30 字）。正文的结论、原因、数字、下一步挑最要紧的讲进去，别铺垫、别只丢一句概括；可以有语气词（嗯、你看、说实话）、带情绪和判断、反问一句把话头递回去；只略过代码块、表格细节、路径。插件会逐句朗读、句间停顿，字幕出现在最近一次标注旁边，没有标注时在屏幕底部中间。',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: '口播稿：8–12 句、每句 ≤30 字、整段 150–170 字（约 60 秒）' } },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, spoken: { type: 'string' }, sentences: { type: 'integer' } },
        required: ['ok'],
        additionalProperties: false,
      },
      render: (args, value) => [{ type: 'text', text: value.ok ? `已朗读：${value.spoken}` : '没有可朗读的内容。' }],
    },
    async execute(args = {}) {
      const text = clampSpeech(args.text, 500)
      if (!text) return { ok: false, spoken: '', sentences: 0 }
      guideSaidThisTurn = true
      speakText(text)
      return { ok: true, spoken: text, sentences: speechChunks(text).length }
    },
  }

  // -------------------------------------------------------------------- word
  // Word documents ride on the Python that ships with DSH (python-docx).
  function runPython(script, argv, stdinText) {
    return new Promise((resolve, reject) => {
      let child
      try {
        child = spawn(pythonCommand(), [script, ...argv], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (error) {
        reject(error)
        return
      }
      let stdout = ''
      let stderr = ''
      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk)
      })
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (stderr.trim()) log(`docx stderr: ${stderr.trim().slice(-300)}`)
        const line = stdout
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter((item) => item.startsWith('{'))
          .pop()
        if (!line) {
          reject(new Error(`Word 处理失败（退出码 ${code}）${stderr.trim() ? `：${stderr.trim().slice(-160)}` : ''}`))
          return
        }
        try {
          resolve(JSON.parse(line))
        } catch (error) {
          reject(error)
        }
      })
      if (child.stdin) {
        child.stdin.on('error', () => {})
        child.stdin.end(stdinText === undefined ? '' : stdinText, 'utf8')
      }
    })
  }

  async function docxExtract(file) {
    if (!fs.existsSync(file)) throw new Error(`找不到 ${path.basename(file)}`)
    const result = await runPython(path.join(NATIVE_DIR, 'docx_tool.py'), ['read', file])
    if (!result.ok) throw new Error(result.error || '读取 Word 失败')
    return result.text
  }

  async function docxWrite(file, content) {
    const result = await runPython(path.join(NATIVE_DIR, 'docx_tool.py'), ['write', file], JSON.stringify({ text: content }))
    if (!result.ok) throw new Error(result.error || '生成 Word 失败')
    return result
  }

  // ---------------------------------------------------------------- ticker
  // 时间检测：默认每 60 秒一次心跳。现在只负责「记下当前时间 + 落盘 + 广播 + 叫订阅者」，
  // 不给任何计划逻辑绑死，因为计划本身还没定。
  // 以后子代理要做「到点读屏 → 把信息报给主代理」，两种接法：
  //   1) 同进程：registerTickHandler((tick) => {...})，参数就是下面 payload 的结构；
  //   2) 外部进程：订阅本机 SSE /events 里的 `tick` 事件，或者读 ticks.jsonl。
  const tickerPath = path.join(dataDir, 'ticks.jsonl')
  const tickIntervalMs = Math.max(15, Math.min(3600, Number(config.tickIntervalSec) || 60)) * 1000
  const tickHandlers = new Set()
  const ticker = {
    enabled: config.ticker !== false,
    startedAt: null,
    intervalMs: tickIntervalMs,
    count: 0,
    lastAt: null,
    lastEpoch: 0,
  }

  function registerTickHandler(handler) {
    if (typeof handler !== 'function') return () => {}
    tickHandlers.add(handler)
    return () => tickHandlers.delete(handler)
  }

  function trimTickLog() {
    try {
      if (fs.statSync(tickerPath).size < 512 * 1024) return
      const lines = fs.readFileSync(tickerPath, 'utf8').split('\n').filter(Boolean)
      fs.writeFileSync(tickerPath, `${lines.slice(-1000).join('\n')}\n`, 'utf8')
    } catch {
      /* 裁剪失败不影响心跳本身 */
    }
  }

  function tickerInfo() {
    const now = new Date()
    return {
      ok: true,
      enabled: ticker.enabled,
      now: now.toISOString(),
      epoch: now.getTime(),
      local: now.toLocaleString('zh-CN', { hour12: false }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      startedAt: ticker.startedAt,
      intervalMs: ticker.intervalMs,
      count: ticker.count,
      lastTickAt: ticker.lastAt,
      sinceLastTickMs: ticker.lastEpoch ? now.getTime() - ticker.lastEpoch : null,
      handlers: tickHandlers.size,
      log: tickerPath,
    }
  }

  // 一次心跳：记时间、落盘、广播、叫所有订阅者。子代理以后就从这里接。
  function fireTick(reason) {
    const now = new Date()
    const payload = {
      at: now.toISOString(),
      epoch: now.getTime(),
      local: now.toLocaleString('zh-CN', { hour12: false }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      count: (ticker.count += 1),
      reason,
    }
    ticker.lastAt = payload.at
    ticker.lastEpoch = payload.epoch
    try {
      fs.appendFileSync(tickerPath, `${JSON.stringify(payload)}\n`, 'utf8')
      trimTickLog()
    } catch (error) {
      log(`ticker write failed: ${error?.message ?? error}`)
    }
    broadcast('tick', payload)
    for (const handler of [...tickHandlers]) {
      try {
        handler(payload)
      } catch (error) {
        log(`tick handler failed: ${error?.message ?? error}`)
      }
    }
    return payload
  }

  const guideClockTool = {
    name: 'guide_clock',
    description:
      '读取当前时间、时区，以及 1 分钟一次的「时间检测」心跳状态（跑了多少次、上次什么时候）。给计划、待办、倒计时提供时间基准时用它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: `现在：${value.local}（${value.timezone}）\n心跳：${value.enabled ? '开' : '关'}，每 ${Math.round(value.intervalMs / 1000)} 秒一次，已 ${value.count} 次，上次 ${value.lastTickAt ?? '还没开始'}`,
        },
      ],
    },
    async execute() {
      return tickerInfo()
    },
  }

  // -------------------------------------------------------------- schedule
  // 日程提醒：每次心跳检查一次"有没有事件进入触发窗口"，到了就往会话里塞一条消息，
  // 把模型叫醒去说话。课表来自 timetable.json，改课只改那个文件，不用动代码。
  const timetablePath = path.join(dataDir, 'timetable.json')
  const reminderStatePath = path.join(dataDir, 'reminder-state.json')
  let timetableCache = { mtime: 0, data: null }
  let reminderDate = ''
  let firedKeys = new Set()

  function todayKey(date) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  function hhmm(date) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function minutesOf(text) {
    const [h, m] = String(text || '0:0').split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }

  function readTimetable() {
    try {
      const stat = fs.statSync(timetablePath)
      if (timetableCache.data && timetableCache.mtime === stat.mtimeMs) return timetableCache.data
      const data = JSON.parse(fs.readFileSync(timetablePath, 'utf8'))
      timetableCache = { mtime: stat.mtimeMs, data }
      return data
    } catch (error) {
      if (error?.code !== 'ENOENT') log(`timetable read failed: ${error?.message ?? error}`)
      return null
    }
  }

  function saveFired() {
    try {
      fs.writeFileSync(reminderStatePath, JSON.stringify({ date: reminderDate, keys: [...firedKeys] }), 'utf8')
    } catch (error) {
      log(`reminder state write failed: ${error?.message ?? error}`)
    }
  }

  try {
    const saved = JSON.parse(fs.readFileSync(reminderStatePath, 'utf8'))
    reminderDate = String(saved?.date || todayKey(new Date()))
    if (Array.isArray(saved?.keys)) firedKeys = new Set(saved.keys)
  } catch {
    reminderDate = todayKey(new Date())
  }

  function appendDaylog(kind, text, extra = {}) {
    const now = new Date()
    const line = JSON.stringify({
      at: now.toISOString(),
      local: now.toLocaleString('zh-CN', { hour12: false }),
      kind,
      text: String(text ?? '').slice(0, 1200),
      ...extra,
    })
    try {
      fs.appendFileSync(path.join(dataDir, `daylog-${todayKey(now)}.jsonl`), `${line}\n`, 'utf8')
    } catch (error) {
      log(`daylog write failed: ${error?.message ?? error}`)
    }
  }

  function classPrompt(item, untilMinutes) {
    const place = item.room ? `，地点 ${item.room}` : ''
    const tip = String(item.reminder || '').trim()
    const lines = [
      `【定时提醒】现在是 ${hhmm(new Date())}，${untilMinutes} 分钟后（${item.start}）上课：${item.course}${place}。`,
    ]
    if (tip) lines.push(`课上要留意：${tip}。`)
    lines.push(
      '请做两件事，别多：',
      `1. 调用 guide_say，用 2–4 句口语喊我一声（要出声）：说清还剩几分钟、什么课、在哪${tip ? '，并把「课上要留意」那句带上' : ''}。`,
      `2. 调用 guide_journal，kind=remind，text 写：提醒了「${item.course}」还有 ${untilMinutes} 分钟。`,
      '不要贴路径、代码，不要问一堆问题。',
    )
    return lines.join('\n')
  }

  function reviewPrompt(todayClasses) {
    const summary = todayClasses.length
      ? todayClasses.map((item) => `${item.start} ${item.course}`).join('；')
      : '今天没有课'
    return [
      `【日终复盘】现在是 ${hhmm(new Date())}。今天的课：${summary}。`,
      '请做两件事：',
      '1. 用 guide_say 说 2–3 句，问一句今天过得怎么样、明天第一节是什么。',
      '2. 调用 guide_journal，kind=review，text 写今天的收尾（能写多少写多少，没说的别编）。',
    ].join('\n')
  }

  function pushReminder(key, prompt, meta) {
    firedKeys.add(key)
    saveFired()
    appendDaylog('remind', meta.summary, { key, kindDetail: meta.kind })
    const agent = pickAgent()
    if (!agent) {
      log(`reminder ${key}: no agent to deliver to`)
      return false
    }
    try {
      agent.followup(buildUserMessage(prompt))
      log(`reminder fired: ${key}`)
      broadcast('reminder', { key, ...meta })
      return true
    } catch (error) {
      log(`reminder ${key} failed: ${error?.message ?? error}`)
      return false
    }
  }

  function checkSchedule(now = new Date()) {
    const table = readTimetable()
    if (!table || !Array.isArray(table.classes)) return
    const config2 = table.reminders || {}
    if (config2.enabled === false) return

    const dateKey = todayKey(now)
    if (reminderDate !== dateKey) {
      reminderDate = dateKey
      firedKeys = new Set()
      saveFired()
    }

    const weekday = now.getDay() === 0 ? 7 : now.getDay()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const lead = Math.max(1, Math.min(120, Number(config2.leadMinutes) || 15))
    const todayClasses = table.classes.filter((item) => item.day === weekday && item.active !== false)

    for (const item of todayClasses) {
      const until = minutesOf(item.start) - nowMinutes
      if (until <= 0 || until > lead) continue
      const key = `class:${dateKey}:${item.start}:${item.course}`
      if (firedKeys.has(key)) continue
      pushReminder(key, classPrompt(item, until), {
        kind: 'class',
        course: item.course,
        room: item.room || '',
        start: item.start,
        summary: `提醒「${item.course}」还有 ${until} 分钟开课`,
      })
    }

    const dayEnd = minutesOf(config2.dayEnd || '21:30')
    if (nowMinutes >= dayEnd && nowMinutes < dayEnd + 3) {
      const key = `review:${dateKey}`
      if (!firedKeys.has(key)) {
        pushReminder(key, reviewPrompt(todayClasses), {
          kind: 'review',
          summary: `日终复盘（今天 ${todayClasses.length} 节课）`,
        })
      }
    }
  }

  // ---------------------------------------------------------------- camera
  // 摄像头巡检：默认每 2 小时抓一张。本地只算 16x16 灰度指纹做差——
  // 没变化立刻删图，不叫模型（0 token）；差过阈值才留图、进待看队列，
  // 并往会话塞一条消息把主代理叫醒。参数都在 camera.json，改文件即生效。
  const camera = createCamera({
    dataDir,
    nativeDir: NATIVE_DIR,
    shotsDir,
    log,
    broadcast,
    appendDaylog,
    pickAgent,
    buildUserMessage,
    mutedSpeakMessages,
  })
  const guideCameraTool = camera.tool

  const guideJournalTool = {
    name: 'guide_journal',
    description:
      '把「今天发生了什么」如实记进当日流水 daylog-YYYY-MM-DD.jsonl。用户回答提醒、说自己正在做什么、完成或没完成时调用；照原话记，不要润色、不要编。',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'remind / answer / activity / review / note' },
        text: { type: 'string', description: '要记的内容，如实写；没说的别补' },
        course: { type: 'string', description: '可选：对应哪门课' },
      },
      required: ['kind', 'text'],
      additionalProperties: true,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: `已记入 ${value.date}（${value.kind}）` }],
    },
    async execute(args = {}) {
      appendDaylog(String(args.kind || 'note'), args.text, args.course ? { course: String(args.course) } : {})
      return { ok: true, date: todayKey(new Date()), kind: String(args.kind || 'note') }
    },
  }

  // ------------------------------------------------------------------ edicts
  // 「都市指令」：目标在悬浮面板的「目标」窗口里写（goals.json，不限条数），
  // 心跳到点把模型叫醒发一条指令，用户执行完回报，落进 directives.jsonl。
  // 只在真的发令/催办时叫模型，其余时间不动 token。
  const goalsPath = path.join(dataDir, 'goals.json')

  let goalsCache = { mtime: -1, list: [] }

  function readGoals() {
    try {
      const stat = fs.statSync(goalsPath)
      if (goalsCache.mtime === stat.mtimeMs) return goalsCache.list
      const data = JSON.parse(fs.readFileSync(goalsPath, 'utf8'))
      const raw = Array.isArray(data) ? data : Array.isArray(data?.goals) ? data.goals : []
      const list = raw
        .map((item, index) => ({
          id: String(item?.id || `g${index + 1}`),
          text: String(typeof item === 'string' ? item : item?.text ?? '').trim(),
          status: String(item?.status || 'active'),
        }))
        .filter((item) => item.text && item.status === 'active')
      goalsCache = { mtime: stat.mtimeMs, list }
      return list
    } catch (error) {
      if (error?.code !== 'ENOENT') log(`goals read failed: ${error?.message ?? error}`)
      return goalsCache.list
    }
  }

  const edict = createEdict({
    dataDir,
    readGoals,
    readTimetable,
    minutesOf,
    hhmm,
    todayKey,
    log,
    broadcast,
    appendDaylog,
    pickAgent,
    buildUserMessage,
  })
  const guideDirectiveTool = edict.tool

  const focus = createFocus({
    dataDir,
    nativeDir: NATIVE_DIR,
    log,
    speak: (text) => {
      const chunks = speechChunks(text)
      if (!chunks.length || disposed) return
      stopSpeech()
      speechQueue = chunks.slice()
      playNextChunk()
    },
    readTimetable,
    minutesOf,
    hhmm,
  })
  const guideFocusTool = focus.tool

  // ------------------------------------------------------------------ plan
  // 「桌面清单」：目标 → 今日清单（起止时间 + 地点 + 做什么）→ 桌面卡片。
  // 卡片只是 state 的投影：插件写 state.plan / state.card，overlay 照着画；
  // 用户点勾 → overlay 回一个 plan_done 事件，这里改 plan.json 再写回 state。
  // 故意不做"真嵌进壁纸层"（WorkerW 那套资源管理器一重启就掉），
  // 用无边框 + 强半透明做"看起来融进桌面"的效果。
  const plan = createPlan({
    dataDir,
    parsePlanText,
    readGoals,
    readTimetable,
    minutesOf,
    hhmm,
    todayKey,
    appendDaylog,
    log,
    writeState,
    currentState,
    broadcast,
    pickAgent,
    buildUserMessage,
    mutedSpeakMessages,
    speak: speakText,
  })
  const guidePlanTool = plan.tool
  const planForToday = (now) => plan.forToday(now)
  const planRun = (args) => plan.run(args)
  const planTick = (now) => plan.tick(now)
  const planSummary = (value) => plan.summary(value)
  const pushPlanState = (value) => plan.push(value)
  const setPlanItemDone = (id, done) => plan.setDone(id, done)
  const planHistoryData = (days) => plan.history(days)

  const chatLogPath = path.join(dataDir, 'chatlog.json')
  let chatLog = []
  try {
    const loaded = JSON.parse(fs.readFileSync(chatLogPath, 'utf8'))
    if (Array.isArray(loaded)) chatLog = loaded
  } catch {
    chatLog = []
  }

  function recordChat(role, via, text) {
    const value = String(text || '').trim()
    if (!value) return
    chatLog.push({ at: new Date().toISOString(), role, via, text: value.slice(0, 600) })
    if (chatLog.length > 120) chatLog = chatLog.slice(-120)
    try {
      fs.writeFileSync(chatLogPath, JSON.stringify(chatLog, null, 2), 'utf8')
    } catch (error) {
      log(`chatlog write failed: ${error?.message ?? error}`)
    }
    broadcast('chatlog', { count: chatLog.length })
  }

  // ------------------------------------------------------------------ video
  const videoLibrary = createVideoLibrary({ dataDir, log, broadcast, config })
  const videoTools = videoLibrary.tools


  // ------------------------------------------------------------------ http
  // A small local REST surface + Server-Sent Events stream, so the plugin can
  // be driven and observed in real time by the dashboard, scripts or any
  // other program on this machine.
  const API_PREFIX = '/api/guide-tutor'

  function statusSnapshot() {
    const snapshot = currentState()
    return {
      ok: true,
      dataDir,
      overlay: { running: Boolean(overlayChild), pid: overlayChild?.pid ?? null },
      panel: snapshot.panel,
      annots: Array.isArray(snapshot.annots) ? snapshot.annots : [],
      subtitle: snapshot.subtitle || DEFAULT_SUBTITLE,
      autoSpeak,
      settings: { ...speechSettings },
      shots: fs.readdirSync(shotsDir).length,
      videos: videoLibrary.readVideoRecords().length,
      kb: kb.list(),
      updatedAt: snapshot.updatedAt ?? null,
      session: snapshot.session ?? { ...DEFAULT_SESSION },
      clients: apiClients.size,
    }
  }

  function sendJson(res, code, value) {
    const body = JSON.stringify(value, null, 2)
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(body)
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > 2_000_000) {
      reject(new Error('请求体过大'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        if (!text) return resolve({})
        try {
          resolve(JSON.parse(text))
        } catch (error) {
        reject(new Error(`JSON 解析失败：${error?.message ?? error}`))
        }
      })
      req.on('error', reject)
    })
  }

  const DASHBOARD_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>屏幕教学助手 · 实时状态</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon-192.png">
<meta name="theme-color" content="#14181f">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #0f1218; color: #e6edf6; font: 14px/1.6 "Microsoft YaHei", system-ui, sans-serif; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  h1 { font-size: 18px; margin: 0; font-weight: 600; }
  .pill { font-size: 12px; padding: 2px 10px; border-radius: 999px; background: #2a3140; color: #9fb0c7; }
  .pill.on { background: #12351f; color: #5ee08a; }
  .pill.off { background: #3a1b1b; color: #ff8b8b; }
  main { display: grid; gap: 14px; max-width: 880px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
  section { background: #161b24; border: 1px solid #232c3a; border-radius: 12px; padding: 14px 16px; }
  h2 { font-size: 15px; margin: 0 0 8px; font-weight: 600; }
  .kv { display: flex; justify-content: space-between; padding: 3px 0; color: #9fb0c7; }
  .kv b { color: #e6edf6; font-weight: 500; }
  p { margin: 6px 0; color: #c8d3e2; }
  ol { margin: 8px 0 0; padding-left: 20px; color: #8b9bb4; }
  ol li.cur { color: #ffb020; font-weight: 600; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
  button { background: #223047; color: #dfe9f7; border: 1px solid #2f4059; border-radius: 8px; padding: 6px 12px; cursor: pointer; font: inherit; }
  button:hover { background: #2b3c58; }
  input[type=range] { width: 140px; accent-color: #ffb020; }
  ul { margin: 6px 0 0; padding-left: 18px; color: #9fb0c7; }
  #shot { font-size: 12px; color: #6f8099; word-break: break-all; }
</style>
</head>
<body>
<header><h1>屏幕教学助手</h1><span id="conn" class="pill">连接中…</span></header>
<main>
  <section>
    <h2>运行状态</h2>
    <div class="kv"><span>悬浮层</span><b id="ov">—</b></div>
    <div class="kv"><span>模式</span><b id="mode">—</b></div>
    <div class="kv"><span>标注数量</span><b id="ann">0</b></div>
    <div class="kv"><span>任务</span><b id="session">待命</b></div>
    <div class="kv"><span>最近更新</span><b id="upd">—</b></div>
    <div class="row">
      <button data-api="capture">读屏截屏</button>
      <button data-api="finish">标记完成</button>
      <button data-overlay="restart">重启悬浮层</button>
    </div>
  </section>
  <section>
    <h2 id="ptitle">—</h2>
    <p id="ptext">—</p>
    <ol id="steps"></ol>
    <div class="row">
      <button data-teach="clear">清空标注</button>
      <button data-teach="ball">折叠成球</button>
      <button data-teach="panel">展开面板</button>
      <label>透明度 <input id="opacity" type="range" min="35" max="100" value="92"><span id="opv">92%</span></label>
    </div>
    <p id="shot"></p>
  </section>
  <section>
    <h2>知识库</h2>
    <ul id="kb"></ul>
  </section>
</main>
<script>
  var API = location.pathname.replace(/[/]+$/, '');
  function el(id) { return document.getElementById(id); }
  function renderKb(files) {
    var ul = el('kb'); ul.innerHTML = '';
    if (!files || !files.length) { var li = document.createElement('li'); li.textContent = '（空）'; ul.appendChild(li); return; }
    files.forEach(function (f) { var li = document.createElement('li'); li.textContent = f.name + ' · ' + f.bytes + ' B'; ul.appendChild(li); });
  }
  function render(s) {
    if (!s) return;
    var p = s.panel || {};
    el('ov').textContent = s.overlay && s.overlay.running ? ('运行中 pid ' + (s.overlay.pid || '?')) : '未运行';
    el('mode').textContent = p.mode === 'panel' ? '面板' : (p.mode === 'ball' ? '悬浮球' : '隐藏');
    el('ann').textContent = (s.annots || []).length;
    var sess = s.session || {};
    var labels = { idle: '待命', active: '进行中', done: '已完成', aborted: '已中止' };
    el('session').textContent = labels[sess.status] || sess.status || '待命';
    el('upd').textContent = s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString() : '—';
    el('ptitle').textContent = p.title || '—';
    el('ptext').textContent = p.text || '—';
    var steps = el('steps'); steps.innerHTML = '';
    (p.steps || []).forEach(function (t, i) {
      var li = document.createElement('li'); li.textContent = t;
      if (i === (p.stepIndex || 0)) li.className = 'cur';
      steps.appendChild(li);
    });
    el('opacity').value = Math.round((p.opacity || 0.92) * 100);
    el('opv').textContent = el('opacity').value + '%';
    renderKb(s.kb || []);
  }
  function post(path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json(); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.api === 'capture') {
      el('shot').textContent = '截屏中…';
      post('/capture').then(function (r) { el('shot').textContent = r && r.path ? ('已保存 ' + r.path) : '截屏失败'; })
        .catch(function () { el('shot').textContent = '截屏失败'; });
    }
    if (b.dataset.teach === 'clear') post('/teach', { clearAnnots: true });
    if (b.dataset.api === 'finish') post('/finish', { result: 'done', message: '已手动标记完成' });
    if (b.dataset.teach === 'ball') post('/teach', { panel: { mode: 'ball' } });
    if (b.dataset.teach === 'panel') post('/teach', { panel: { mode: 'panel', visible: true } });
    if (b.dataset.overlay === 'restart') post('/overlay', { action: 'restart' });
  });
  var slider = el('opacity'), sliderTimer = null;
  slider.addEventListener('input', function () {
    el('opv').textContent = slider.value + '%';
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(function () { post('/teach', { panel: { opacity: Number(slider.value) / 100 } }); }, 250);
  });
  var es = new EventSource(API + '/events');
  es.onopen = function () { el('conn').textContent = '实时连接'; el('conn').className = 'pill on'; };
  es.onerror = function () { el('conn').textContent = '已断开'; el('conn').className = 'pill off'; };
  es.addEventListener('state', function (m) { try { render(JSON.parse(m.data)); } catch (err) {} });
  es.addEventListener('overlay', function (m) {
    try { var o = JSON.parse(m.data); el('ov').textContent = o.running ? ('运行中 pid ' + (o.pid || '?')) : '未运行'; } catch (err) {}
  });
  es.addEventListener('capture', function (m) { try { el('shot').textContent = '已保存 ' + JSON.parse(m.data).path; } catch (err) {} });
  es.addEventListener('kb', function (m) { try { renderKb(JSON.parse(m.data).files); } catch (err) {} });
  fetch(API + '/status').then(function (r) { return r.json(); }).then(render).catch(function () {});
</script>
</body>
</html>`

  async function apiHandler(req, res) {
    let pathname = API_PREFIX
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname
    } catch {
      /* keep default */
    }
    let query = new URLSearchParams()
    try {
      query = new URL(req.url || '/', 'http://localhost').searchParams
    } catch {
      /* keep default */
    }
    const sub = (pathname.startsWith(API_PREFIX) ? pathname.slice(API_PREFIX.length) : pathname).replace(/\/+$/, '') || '/'
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        res.end()
        return
      }
      if (req.method === 'GET' && (sub === '/' || sub === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(DASHBOARD_HTML)
        return
      }
      // PWA 清单：让 Edge/Chrome 能把状态页「安装为应用」，装完任务栏就是插件自己的图标。
      if (req.method === 'GET' && sub === '/manifest.webmanifest') {
        const manifest = {
          name: '屏幕教学助手 · 实时状态',
          short_name: '教学助手',
          description: '屏幕教学助手插件的实时状态页',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#0f1218',
          theme_color: '#14181f',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          ],
        }
        res.writeHead(200, {
          'Content-Type': 'application/manifest+json; charset=utf-8',
          'Cache-Control': 'no-cache',
        })
        res.end(JSON.stringify(manifest))
        return
      }
      if (req.method === 'GET' && (sub === '/icon-192.png' || sub === '/icon-512.png')) {
        try {
          const png = fs.readFileSync(path.join(HERE, 'assets', sub.slice(1)))
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' })
          res.end(png)
        } catch {
          res.writeHead(404)
          res.end()
        }
        return
      }
      if (req.method === 'GET' && sub === '/status') {
        sendJson(res, 200, statusSnapshot())
        return
      }
      if (req.method === 'GET' && sub === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'X-Accel-Buffering': 'no',
        })
        res.write('retry: 2000\n\n')
        res.write(`event: hello\ndata: ${JSON.stringify(statusSnapshot())}\n\n`)
        apiClients.add(res)
        req.on('close', () => apiClients.delete(res))
        return
      }
      if (req.method === 'POST' && sub === '/teach') {
        const body = await readBody(req)
        sendJson(res, 200, { ok: true, result: applyTeach(body), state: statusSnapshot() })
        return
      }
      if (req.method === 'POST' && sub === '/capture') {
        const shot = await requestCapture()
        sendJson(res, 200, { ok: true, ...shot })
        return
      }
      if (req.method === 'POST' && sub === '/next') {
        handleNextStep()
        sendJson(res, 200, { ok: true, state: statusSnapshot() })
        return
      }
      if (req.method === 'POST' && sub === '/listen') {
        void handleListen()
        sendJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && sub === '/always-listen') {
        const body = await readBody(req)
        setAlwaysListen(body.on === true || body.on === 'true')
        sendJson(res, 200, { ok: true, state: statusSnapshot() })
        return
      }
      if (req.method === 'POST' && sub === '/finish') {
        const body = await readBody(req)
        sendJson(res, 200, { ok: true, result: applyFinish(body), state: statusSnapshot() })
        return
      }
      if (req.method === 'POST' && sub === '/overlay') {
        const body = await readBody(req)
        sendJson(res, 200, { ok: true, result: runOverlayAction(String(body.action || 'status')) })
        return
      }
      if (sub === '/kb') {
        const body = req.method === 'POST' ? await readBody(req) : {}
        const action = String(body.action || query.get('action') || 'list')
        const name = body.name ?? query.get('name') ?? undefined
        const result = await kbRun({ action, name, content: body.content, source: body.source })
        sendJson(res, 200, { ok: true, result })
        return
      }
      if (sub === '/journal') {
        const date = String(query.get('date') || todayKey(new Date()))
        const file = path.join(dataDir, `daylog-${date}.jsonl`)
        let entries = []
        try {
          entries = fs
            .readFileSync(file, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              try {
                return JSON.parse(line)
              } catch {
                return null
              }
            })
            .filter(Boolean)
        } catch {
          entries = []
        }
        sendJson(res, 200, { ok: true, date, count: entries.length, entries })
        return
      }
      if (sub === '/clock') {
        sendJson(res, 200, tickerInfo())
        return
      }
      if (sub === '/camera') {
        const body = req.method === 'POST' ? await readBody(req) : {}
        const action = String(body.action || query.get('action') || 'status')
        const result = await cameraRun({ action, note: body.note })
        sendJson(res, 200, { ok: true, result })
        return
      }
      if (sub === '/plan/history') {
        const days = planHistoryData()
        sendJson(res, 200, { ok: true, days })
        return
      }
      if (sub === '/plan') {
        const body = req.method === 'POST' ? await readBody(req) : {}
        const action = String(body.action || query.get('action') || 'list')
        const result = await planRun({ ...body, action })
        sendJson(res, 200, { ok: true, result })
        return
      }
      if (sub === '/chatlog') {
        const limit = Math.max(1, Math.min(120, Number(query.get('limit')) || 40))
        sendJson(res, 200, { ok: true, count: chatLog.length, entries: chatLog.slice(-limit) })
        return
      }
      if (req.method === 'POST' && sub === '/say') {
        const body = await readBody(req)
        const seq = speakText(body.text ?? '')
        sendJson(res, 200, { ok: Boolean(seq), seq })
        return
      }
      if (req.method === 'POST' && sub === '/auto-speak') {
        const body = await readBody(req)
        setAutoSpeak(body.on === true || body.on === 'true')
        sendJson(res, 200, { ok: true, autoSpeak })
        return
      }
      if (req.method === 'POST' && sub === '/settings') {
        const body = await readBody(req)
        if (body.subtitleSize !== undefined) setSubtitleSize(body.subtitleSize)
        if (body.volume !== undefined) setSpeechVolume(body.volume)
        if (body.rate !== undefined) {
          speechSettings.rate = Math.max(-10, Math.min(10, Number(body.rate) || 0))
          saveSpeechSettings()
          broadcast('settings', { ...speechSettings })
        }
        sendJson(res, 200, { ok: true, settings: { ...speechSettings } })
        return
      }
      sendJson(res, 404, { ok: false, error: `未知接口 ${req.method} ${sub}` })
    } catch (error) {
      log(`api error ${req.method} ${sub}: ${error?.stack ?? error}`)
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
      else res.end()
    }
  }

  let apiDispose = null
  let apiAttempts = 0
  function registerApi() {
    if (disposed || apiDispose) return
    let web
    try {
      web = ctx.get('webServer')
    } catch {
      web = null
    }
    if (!web) {
      if (apiAttempts++ < 20) later(registerApi, 1000)
      else log('http api unavailable: webServer service never appeared')
      return
    }
    try {
      apiDispose = web.register({ kind: 'prefix', path: API_PREFIX, handler: apiHandler })
      let origin = ''
      try {
        origin = web.getOrigin()
      } catch {
        /* origin may be unavailable before listen binds */
      }
      log(`http api ready at ${origin || '?'}${API_PREFIX}`)
    } catch (error) {
      log(`http api registration failed: ${error?.stack ?? error}`)
    }
  }

  // The DSH web server guards every route behind its own session token, so the
  // same handler is also exposed on a dedicated loopback port that any local
  // script, browser tab or automation tool can reach without a token.
  const API_PORT = Number(config.apiPort) || 41999
  let apiServer = null
  let apiPort = 0

  function startApiServer(port = API_PORT, attempt = 0) {
    if (disposed || apiServer) return
    const server = createServer(apiHandler)
    server.once('error', (error) => {
      if (error?.code === 'EADDRINUSE' && attempt < 8) {
        log(`api port ${port} busy, trying ${port + 1}`)
        startApiServer(port + 1, attempt + 1)
        return
      }
      log(`api server failed: ${error?.message ?? error}`)
    })
    server.listen(port, '127.0.0.1', () => {
      apiServer = server
      apiPort = server.address()?.port ?? port
      log(`api server listening on http://127.0.0.1:${apiPort}/`)
    })
  }

  ctx.effect(() => {
    registerApi()
    startApiServer()
    const ping = setInterval(() => {
      for (const client of apiClients) {
        try {
          client.write(': ping\n\n')
        } catch {
          apiClients.delete(client)
        }
      }
    }, 15000)
    return () => {
      clearInterval(ping)
      for (const client of apiClients) {
        try {
          client.end()
        } catch {
          /* ignore */
        }
      }
      apiClients.clear()
      try {
        apiDispose?.()
      } catch {
        /* ignore */
      }
      apiDispose = null
      try {
        apiServer?.close()
        apiServer?.closeAllConnections?.()
      } catch {
        /* ignore */
      }
      apiServer = null
      apiServer = null
    }
  })

  // ------------------------------------------------------------ lifecycle
  // 管理类工具（清单 / 专注环 / 都市指令 / 日记 / 时钟 / 摄像头）已迁到 guide-coach。
  // 只有显式 config.manage === true 时才在 tutor 里注册，默认关闭，避免两边同时弹卡片。
  const manage = config.manage === true
  ctx.effect(() => ctx.tools.register(guideScreenTool))
  ctx.effect(() => ctx.tools.register(guideTeachTool))
  ctx.effect(() => ctx.tools.register(guideKbTool))
  ctx.effect(() => ctx.tools.register(guideSayTool))
  ctx.effect(() => ctx.tools.register(guideOverlayTool))
  ctx.effect(() => ctx.tools.register(guideFinishTool))
  for (const tool of videoTools) ctx.effect(() => ctx.tools.register(tool))
  // 清单归 tutor（用户 2026-11-13 决定：清单在 guide，记录在 coach），始终注册。
  ctx.effect(() => ctx.tools.register(guidePlanTool))
  if (manage) {
    ctx.effect(() => ctx.tools.register(guideClockTool))
    ctx.effect(() => ctx.tools.register(guideJournalTool))
    ctx.effect(() => ctx.tools.register(guideCameraTool))
    ctx.effect(() => ctx.tools.register(guideDirectiveTool))
    ctx.effect(() => ctx.tools.register(guideFocusTool))
  }
  ctx.effect(() =>
    ctx.systemPrompt.section({ name: 'guide-tutor', order: 900, text: TUTOR_PROMPT }),
  )

  ctx.effect(() => {
    const poll = setInterval(pollEvents, 300)
    if (config.autoStart !== false) startOverlay()
    // 清单归 tutor：启动即对齐，否则卡片会显示上一次的旧清单。
    try {
      pushPlanState(planForToday())
    } catch (error) {
      log(`plan state sync failed: ${error?.message ?? error}`)
    }
    // 启动时把历史汇总写一遍：老归档也能立刻出现在「历史」窗里。
    try {
      plan.writeHistory()
    } catch (error) {
      log(`plan history sync failed: ${error?.message ?? error}`)
    }
    let tickTimer = null
    if (ticker.enabled) {
      ticker.startedAt = new Date().toISOString()
      // 清单与日程提醒归 tutor（始终跑）
      registerTickHandler(() => {
        try {
          checkSchedule(new Date())
        } catch (error) {
          log(`schedule check failed: ${error?.message ?? error}`)
        }
      })
      registerTickHandler(() => {
        try {
          planTick(new Date())
        } catch (error) {
          log(`plan tick failed: ${error?.message ?? error}`)
        }
      })
      if (manage) {
        registerTickHandler(() => {
          camera.tick().catch((error) => log(`camera tick failed: ${error?.message ?? error}`))
        })
        registerTickHandler(() => {
          try {
            edict.tick(new Date())
          } catch (error) {
            log(`edict tick failed: ${error?.message ?? error}`)
          }
        })
        registerTickHandler(() => {
          focus.tick(new Date()).catch((error) => log(`focus tick failed: ${error?.message ?? error}`))
        })
      }
      fireTick('start')
      tickTimer = setInterval(() => {
        if (!disposed) fireTick('interval')
      }, ticker.intervalMs)
      log(`ticker started (every ${Math.round(ticker.intervalMs / 1000)}s)`)
    }
    log(`guide-tutor ready (dataDir=${dataDir}, autoStart=${config.autoStart !== false})`)
    return () => {
      disposed = true
      clearInterval(poll)
      if (tickTimer) clearInterval(tickTimer)
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      stopSpeech()
      stopOverlay()
      log('guide-tutor disposed')
    }
  })
}
