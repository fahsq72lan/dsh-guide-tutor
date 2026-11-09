import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from './lib/log.js'
import { createStateStore } from './lib/state.js'

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

const TUTOR_PROMPT = `【屏幕教学】本环境装有"教学助手"：桌面悬浮球、全屏标注层和半透明步骤面板，由 guide_* 工具控制。\n- 当用户说"教我 / 带我操作 / 帮我做某件事"，或你收到【读屏请求】【语音】【完成确认】消息时，按此流程：guide_screen 截屏 → read_image 看图 → guide_teach 标注并在面板写一步提示。\n- 标注坐标与最近一次截图使用同一像素坐标（原点为虚拟桌面左上角，可直接用截图里的坐标）。\n- 一次只给一步；用户完成后重新截屏确认，再给下一步。多步骤任务把步骤列表放进 panel.steps，当前步放进 panel.stepIndex。\n- 面板文字要短（不超过 30 字），像教练在旁边轻声提示；解释放在聊天回复里。\n- 【收尾】任务达成、用户说"好了/完成了"，或你截屏看到目标已实现时，先 guide_screen 核验，再调用 guide_finish 结束：它会清空标注并把面板折叠回悬浮球。不要一直把标注和面板挂在屏幕上。\n- 【语音】用户可能用语音说话（消息以【语音】开头）：回应要口语化、简短，因为对方可能没在看屏幕。\n- 【面板对话】用户会从面板底部的输入框打字（消息以【面板对话】开头），这是"先沟通、再动手"的通道：新目标先确认理解、把计划写进 panel.steps 并等待用户点开始；回答问题时把短答案写进 panel.text；说"开始/下一步"时才截屏标注。\n- 【目标】确定教学任务后，用 guide_teach 的 goal 字段记录一句话目标（例如"在 Excel 里插入数据透视表"），这样面板和状态页都能显示当前任务。\n- 教学脚本可以存进 guide_kb（Markdown），下次直接读取复用。\n- 不确定屏幕内容时先截屏或直接问用户，不要臆测坐标。\n- 【下一步】用户点面板上的「下一步」＝这步做完了：先 guide_screen 截屏核验，再用 guide_teach 给出下一步标注，并把 panel.stepIndex 推进一格；已经是最后一步或目标达成，就用 guide_finish 收尾。\n- 【常听】面板和托盘都有「常听」开关：打开后每说完一句会自动再听，适合连续口述；用户说"关掉常听"时提醒他在面板或托盘取消勾选。\n- 【口播】每次回复用户前先调用 guide_say。这段是"说"出来给人听的，要像跟熟人聊天，但**总时长控制在 60 秒内**：当前语速约每秒 2.8 字，也就是 150–170 字、8–12 句，每句 ≤30 字。信息要密度高——正文的结论、原因、数字、下一步挑最要紧的塞进去，别用废话铺垫，也别只丢一句概括。可以有"嗯""你看""说实话"这类口头语，可以带情绪和判断，可以反问一句把话头递回去；只略过代码块、表格细节、文件路径。插件会逐句朗读并同步字幕，详细内容留在聊天里。\n- 【摄像头】guide_camera 只在用户要求、或收到【摄像头巡检】消息时用：拍一张→read_image 看→说结论。巡检默认每 2 小时一次，没变化不会叫你，别自己定时、别偷拍。
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
      case 'tone': {
        const tone = String(event.tone || '')
        if (!tone) break
        try {
          const cur = readEdictConfig()
          fs.writeFileSync(edictConfigPath, JSON.stringify({ ...cur, tone }, null, 2) + '\n', 'utf8')
          log(`tone set: ${tone}`)
        } catch (err) {
          log(`tone set failed: ${err && err.message}`)
        }
        break
      }
      case 'voice':
        void handleVoice(event)
        break
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

  function pruneShots(keep = 20) {
    try {
      const files = fs
        .readdirSync(shotsDir)
        .filter((name) => name.startsWith('shot-') && name.endsWith('.png'))
        .map((name) => {
          let at = 0
          try {
            at = fs.statSync(path.join(shotsDir, name)).mtimeMs
          } catch {
            /* ignore */
          }
          return { name, at }
        })
        .sort((a, b) => b.at - a.at)
      for (const file of files.slice(keep)) {
        try {
          fs.unlinkSync(path.join(shotsDir, file.name))
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
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

  const KB_EXTENSIONS = ['.md', '.docx']

  function safeKbName(name) {
    const raw = String(name ?? '').trim().replace(/\\/g, '/')
    if (!raw) throw new Error('缺少 name')
    const parts = raw.split('/').filter((part) => part.length > 0)
    if (!parts.length) throw new Error('缺少 name')
    for (const part of parts) {
      if (part === '.' || part === '..') throw new Error('name 里不能有 . 或 ..')
      if (/[:*?"<>|]/.test(part)) throw new Error('name 里有非法字符')
    }
    const rel = parts.join('/')
    if (!KB_EXTENSIONS.some((ext) => rel.toLowerCase().endsWith(ext))) throw new Error('name 必须是以 .md 或 .docx 结尾')
    return rel
  }

  // 允许 "Linux/实验五.md" 这类相对路径，但解析后必须还在 kb 目录里
  function kbPathOf(rel) {
    const root = path.resolve(kbDir)
    const abs = path.resolve(root, rel)
    if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('路径越出知识库')
    return abs
  }

  function kbSummary(value) {
    if (Array.isArray(value?.files)) {
      if (value.files.length === 0) return '知识库为空。'
      return (
        `知识库共 ${value.files.length} 个文件：\n` +
        value.files.map((f) => `- ${f.name}${f.type === 'docx' ? '（Word）' : ''} (${f.bytes} B)`).join('\n')
      )
    }
    if (typeof value?.content === 'string') {
      const clipped = value.content.slice(0, 4000) + (value.content.length > 4000 ? '…' : '')
      return value.type === 'docx' ? `${clipped}\n\n（以上是 Word 文档抽取的文本）` : clipped
    }
    if (value?.deleted) return `已删除 ${value.name}`
    if (value?.imported) return `已导入 Word：${value.name}（${value.bytes} B）`
    if (value?.type === 'docx' && value?.bytes !== undefined) {
      return `已生成 Word：${value.name}（${value.bytes} B，${value.paragraphs ?? 0} 段 / ${value.tables ?? 0} 表）`
    }
    if (value?.bytes !== undefined) return `已保存 ${value.name}（${value.bytes} B）`
    return JSON.stringify(value)
  }

  function kbListFiles(dir = kbDir, prefix = '', depth = 0, out = []) {
    if (depth > 4) return out
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return out
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        kbListFiles(path.join(dir, entry.name), rel, depth + 1, out)
        continue
      }
      if (!KB_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext))) continue
      const stat = fs.statSync(path.join(dir, entry.name))
      out.push({
        name: rel,
        type: entry.name.toLowerCase().endsWith('.docx') ? 'docx' : 'md',
        bytes: stat.size,
        modified: stat.mtime.toISOString(),
      })
    }
    return out
  }

  async function kbRun(args = {}) {
    const action = args.action
    if (action === 'list') return { files: kbListFiles() }
    const name = safeKbName(args.name)
    const file = kbPathOf(name)
    const isDocx = name.toLowerCase().endsWith('.docx')
    if (action === 'read') {
      if (isDocx) return { name, type: 'docx', content: await docxExtract(file) }
      return { name, type: 'md', content: fs.readFileSync(file, 'utf8') }
    }
    if (action === 'save') {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      if (isDocx && args.source) {
        const source = path.resolve(String(args.source))
        if (!fs.existsSync(source)) throw new Error(`找不到源文件 ${source}`)
        fs.copyFileSync(source, file)
        let preview = ''
        try {
          preview = await docxExtract(file)
        } catch {
          /* the copy is still valid even if extraction fails */
        }
        broadcast('kb', { files: kbListFiles(), saved: name })
        return { name, type: 'docx', bytes: fs.statSync(file).size, imported: true, preview: preview.slice(0, 400) }
      }
      const content = String(args.content ?? '')
      if (content.length > 400000) throw new Error('内容过大（超过 400KB）')
      if (isDocx) {
        if (!content.trim()) throw new Error('生成 Word 需要 content')
        const result = await docxWrite(file, content)
        broadcast('kb', { files: kbListFiles(), saved: name })
        return {
          name,
          type: 'docx',
          bytes: fs.statSync(file).size,
          paragraphs: result.paragraphs,
          tables: result.tables,
        }
      }
      fs.writeFileSync(file, content, 'utf8')
      broadcast('kb', { files: kbListFiles(), saved: name })
      return { name, type: 'md', bytes: Buffer.byteLength(content, 'utf8') }
    }
    if (action === 'delete') {
      fs.rmSync(file, { force: true })
      // 删完顺手清掉空掉的上层目录，别留一堆空壳（不越过 kb 根）
      const root = path.resolve(kbDir)
      let dir = path.dirname(file)
      while (dir !== root && dir.startsWith(root + path.sep)) {
        try {
          if (fs.readdirSync(dir).length) break
          fs.rmdirSync(dir)
        } catch {
          break
        }
        dir = path.dirname(dir)
      }
      broadcast('kb', { files: kbListFiles(), deleted: name })
      return { name, deleted: true }
    }
    throw new Error(`未知 action: ${action}`)
  }

  const guideKbTool = {
    name: 'guide_kb',
    description:
      '教学文件知识库，支持 Markdown（.md）和 Word（.docx）。action=list 列出；read 读取（.docx 会抽取成 Markdown 文本）；save 保存或覆盖（.docx 会用 Markdown 生成排版好的 Word，给 source 则导入已有文件）；delete 删除。name 可以带子目录，写成「课程/文件名.md」，目录会自动创建。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'read', 'save', 'delete'] },
        name: { type: 'string' },
        content: { type: 'string', description: 'save 的内容；.docx 下按 Markdown 解析成标题/列表/表格' },
        source: { type: 'string', description: 'save .docx 时可选：已有 Word 文件的绝对路径，直接导入' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: kbSummary(value) }],
    },
    async execute(args = {}) {
      return await kbRun(args)
    },
  }

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
      kb: kbListFiles().length,
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
        },
      })
    } catch (error) {
      log(`tts spawn failed: ${error?.message ?? error}`)
      writeState({ subtitle: { active: false } })
      return null
    }
    ttsChild = child
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

  function speakText(rawText) {
    const chunks = speechChunks(rawText)
    if (!chunks.length || disposed) return null
    stopSpeech()
    speechQueue = chunks.slice()
    playNextChunk()
    const chars = chunks.join('').length
    log(`speak queue (${chunks.length} 句，${chars} 字，约 ${Math.round(chars / 2.8 + chunks.length * 0.16 + 1)} 秒)`)
    recordChat('我', '语音', chunks.join(''))
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
  const cameraDir = path.join(shotsDir, 'cam')
  fs.mkdirSync(cameraDir, { recursive: true })
  const cameraConfigPath = path.join(dataDir, 'camera.json')
  const cameraStatePath = path.join(dataDir, 'camera-state.json')
  const CAMERA_DEFAULTS = {
    enabled: true,
    intervalMinutes: 120,
    activeFrom: 7,
    activeTo: 23,
    threshold: 0.1,
    keep: 40,
  }

  function cameraConfig() {
    try {
      const saved = JSON.parse(fs.readFileSync(cameraConfigPath, 'utf8'))
      return { ...CAMERA_DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) }
    } catch (error) {
      if (error?.code !== 'ENOENT') log(`camera.json read failed: ${error?.message ?? error}`)
      return { ...CAMERA_DEFAULTS }
    }
  }

  let cameraState = null
  function loadCameraState() {
    if (cameraState) return cameraState
    try {
      const saved = JSON.parse(fs.readFileSync(cameraStatePath, 'utf8'))
      cameraState = { lastAt: 0, lastGrid: null, lastPath: null, pending: [], ...(saved || {}) }
    } catch {
      cameraState = { lastAt: 0, lastGrid: null, lastPath: null, pending: [] }
    }
    if (!Array.isArray(cameraState.pending)) cameraState.pending = []
    return cameraState
  }
  function saveCameraState() {
    try {
      fs.writeFileSync(cameraStatePath, JSON.stringify(cameraState), 'utf8')
    } catch (error) {
      log(`camera state write failed: ${error?.message ?? error}`)
    }
  }

  function camStamp(date) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  }

  // 同一时刻只允许一个 MediaCapture：心跳巡检和手动拍照撞上时排队，
  // 不然第二个会拿到“设备被占用”。
  let captureChain = Promise.resolve()
  function capturePhoto(outPath) {
    const task = captureChain.then(
      () => capturePhotoRaw(outPath),
      () => capturePhotoRaw(outPath),
    )
    captureChain = task.catch(() => {})
    return task
  }

  function capturePhotoRaw(outPath) {
    return new Promise((resolve, reject) => {
      let child
      try {
        child = spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-WindowStyle',
            'Hidden',
            '-File',
            path.join(NATIVE_DIR, 'cam.ps1'),
            '-OutPath',
            outPath,
          ],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
        )
      } catch (error) {
        reject(error)
        return
      }
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
        reject(new Error('摄像头抓图超时（20 秒）'))
      }, 20000)
      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk)
      })
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk)
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        const line = stdout
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter((item) => item.startsWith('{'))
          .pop()
        if (!line) {
          reject(new Error(`摄像头抓图失败（退出码 ${code}）${stderr.trim() ? `：${stderr.trim().slice(-200)}` : ''}`))
          return
        }
        try {
          resolve(JSON.parse(line))
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  // 两张 16x16 灰度指纹的平均差，归一到 0–1。只要 256 个数，不碰原图。
  function gridDiff(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 1
    let sum = 0
    for (let i = 0; i < a.length; i += 1) sum += Math.abs(Number(a[i]) - Number(b[i]))
    return sum / a.length / 255
  }

  function pruneCameraFiles(keep = 40) {
    try {
      const st = loadCameraState()
      const locked = new Set(st.pending.map((item) => path.resolve(item.path)))
      const files = fs
        .readdirSync(cameraDir)
        .filter((name) => name.endsWith('.jpg'))
        .map((name) => {
          const full = path.join(cameraDir, name)
          let at = 0
          try {
            at = fs.statSync(full).mtimeMs
          } catch {
            /* ignore */
          }
          return { full, at }
        })
        .filter((item) => !locked.has(path.resolve(item.full)))
        .sort((a, b) => b.at - a.at)
      for (const item of files.slice(Math.max(1, Number(keep) || 40))) {
        try {
          fs.unlinkSync(item.full)
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      log(`camera prune failed: ${error?.message ?? error}`)
    }
  }

  function cameraWakePrompt(file, diff) {
    return [
      `【摄像头巡检】定时抓了一张：${file}（和上一张差 ${Math.round(diff * 100)}%）。`,
      '做三件事，尽量短：',
      '1. read_image 看一眼，判断有没有值得记的事（有人、桌面/屏幕变了、有异常）。',
      '2. 有价值就 guide_journal 记一条 note；没有就跳过。',
      '3. 抓拍一律不播报：不要调用 guide_say（用户明确要求抓拍不出声），只在聊天里一句话收尾。',
    ].join('\n')
  }

  function cameraStatus() {
    const cfg = cameraConfig()
    const st = loadCameraState()
    const intervalMs = Math.max(5, Number(cfg.intervalMinutes) || 120) * 60000
    return {
      ok: true,
      enabled: cfg.enabled !== false,
      intervalMinutes: Number(cfg.intervalMinutes) || 120,
      activeFrom: Number(cfg.activeFrom ?? 7),
      activeTo: Number(cfg.activeTo ?? 23),
      threshold: Number(cfg.threshold ?? 0.1),
      dir: cameraDir,
      lastAt: st.lastAt ? new Date(st.lastAt).toISOString() : null,
      nextAt: st.lastAt ? new Date(st.lastAt + intervalMs).toISOString() : null,
      pending: st.pending.length,
      lastPath: st.lastPath,
    }
  }

  async function cameraSnap(note) {
    const st = loadCameraState()
    const file = path.join(cameraDir, `cam-${camStamp(new Date())}.jpg`)
    const shot = await capturePhoto(file)
    const { grid, ...rest } = shot
    const diff = st.lastGrid ? gridDiff(st.lastGrid, grid) : null
    st.lastAt = Date.now()
    st.lastGrid = Array.isArray(grid) ? grid : null
    st.lastPath = file
    saveCameraState()
    if (note) appendDaylog('note', `手动拍照：${note}`)
    return { ...rest, diff: diff === null ? null : Number(diff.toFixed(3)) }
  }

  let cameraBusy = false

  async function cameraTick(now = new Date()) {
    const cfg = cameraConfig()
    const st = loadCameraState()
    if (cfg.enabled === false || cameraBusy) return
    const intervalMs = Math.max(5, Number(cfg.intervalMinutes) || 120) * 60000
    if (st.lastAt && now.getTime() - st.lastAt < intervalMs) return
    const from = Number(cfg.activeFrom ?? 7)
    const to = Number(cfg.activeTo ?? 23)
    const hour = now.getHours()
    const inWindow = from <= to ? hour >= from && hour < to : hour >= from || hour < to
    if (!inWindow) return
    cameraBusy = true
    const file = path.join(cameraDir, `cam-${camStamp(now)}.jpg`)
    try {
      const shot = await capturePhoto(file)
      st.lastAt = now.getTime()
      if (!Array.isArray(st.lastGrid)) {
        // 第一张只当基准，不叫模型。
        st.lastGrid = shot.grid
        st.lastPath = file
        saveCameraState()
        log(`camera baseline sealed (${path.basename(file)})`)
        return
      }
      const diff = gridDiff(st.lastGrid, shot.grid)
      const threshold = Math.max(0.02, Math.min(0.9, Number(cfg.threshold) || 0.1))
      if (diff < threshold) {
        try {
          fs.unlinkSync(file)
        } catch {
          /* ignore */
        }
        saveCameraState()
        log(`camera tick: 无变化 ${(diff * 100).toFixed(1)}%，删图不跑模型`)
        return
      }
      st.lastGrid = shot.grid
      st.lastPath = file
      st.pending.push({
        at: now.toISOString(),
        path: file,
        diff: Number(diff.toFixed(3)),
        bytes: shot.bytes,
        mean: shot.mean,
      })
      if (st.pending.length > 20) st.pending = st.pending.slice(-20)
      saveCameraState()
      pruneCameraFiles(cfg.keep)
      appendDaylog('note', `摄像头巡检：画面变化 ${Math.round(diff * 100)}%，留下 ${path.basename(file)} 待看。`)
      broadcast('camera', { event: 'flag', path: file, diff: Number(diff.toFixed(3)) })
      const agent = pickAgent()
      if (!agent) {
        log('camera flag: no agent to deliver to')
        return
      }
      try {
        const wake = buildUserMessage(cameraWakePrompt(file, diff))
        mutedSpeakMessages.add(wake.id)
        agent.followup(wake)
        log(`camera flag delivered diff=${diff.toFixed(3)} (muted speak)`)
      } catch (error) {
        log(`camera flag deliver failed: ${error?.message ?? error}`)
      }
    } catch (error) {
      st.lastAt = now.getTime()
      saveCameraState()
      log(`camera tick failed: ${error?.message ?? error}`)
    } finally {
      cameraBusy = false
    }
  }

  async function cameraRun(args = {}) {
    const action = String(args.action || 'snap')
    if (action === 'snap') return cameraSnap(args.note ? String(args.note) : '')
    if (action === 'pending') {
      return { ok: true, pending: loadCameraState().pending }
    }
    if (action === 'clear') {
      const st = loadCameraState()
      for (const item of st.pending) {
        try {
          fs.unlinkSync(item.path)
        } catch {
          /* ignore */
        }
      }
      st.pending = []
      saveCameraState()
      return { ok: true, cleared: true }
    }
    return cameraStatus()
  }

  const guideCameraTool = {
    name: 'guide_camera',
    description:
      '抓一张摄像头画面存到本地，返回路径和画面指纹；也能查看/清理定时巡检留下的待看照片。巡检默认每 2 小时一次，没变化就删图、不消耗 token。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'snap 现在拍一张 / pending 看待看队列 / status 配置与下次时间 / clear 清空队列',
        },
        note: { type: 'string', description: '可选：为什么拍，会记进当天流水' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => {
        if (Array.isArray(value.pending)) {
          return [
            {
              type: 'text',
              text: value.pending.length
                ? value.pending
                    .map((item) => `${item.at}  变化 ${Math.round(item.diff * 100)}%  ${item.path}`)
                    .join('\n')
                : '没有待看的摄像头照片。',
            },
          ]
        }
        if (value.cleared) return [{ type: 'text', text: '待看队列已清空。' }]
        if (value.path) {
          return [
            {
              type: 'text',
              text: `已拍：${value.path}（${value.width}x${value.height}，${Math.round(value.bytes / 1024)} KB）${value.diff === null ? '' : `，和上一张差 ${Math.round(value.diff * 100)}%`}`,
            },
          ]
        }
        return [
          {
            type: 'text',
            text: `摄像头巡检：${value.enabled ? '开' : '关'}，每 ${value.intervalMinutes} 分钟一次，${value.activeFrom}:00–${value.activeTo}:00 之间拍；上次 ${value.lastAt ?? '还没拍过'}，待看 ${value.pending} 张。`,
          },
        ]
      },
    },
    async execute(args = {}) {
      return cameraRun(args)
    },
  }

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
  const edictStatePath = path.join(dataDir, 'edict-state.json')
  const edictLogPath = path.join(dataDir, 'directives.jsonl')
  const edictConfigPath = path.join(dataDir, 'edict.json')

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

  const EDICT_DEFAULTS = {
    enabled: true,
    from: '08:00',
    to: '23:00',
    intervalMinutes: 30,
    maxPerDay: 20,
  }

  function readEdictConfig() {
    try {
      const data = JSON.parse(fs.readFileSync(edictConfigPath, 'utf8'))
      return { ...EDICT_DEFAULTS, ...(data && typeof data === 'object' ? data : {}) }
    } catch {
      return { ...EDICT_DEFAULTS }
    }
  }

  let edictState = { date: '', count: 0, nextAt: '', pending: null }
  try {
    const saved = JSON.parse(fs.readFileSync(edictStatePath, 'utf8'))
    if (saved && typeof saved === 'object') edictState = { ...edictState, ...saved }
  } catch {
    /* first run */
  }

  function saveEdictState() {
    try {
      fs.writeFileSync(edictStatePath, JSON.stringify(edictState, null, 2), 'utf8')
    } catch (error) {
      log(`edict state write failed: ${error?.message ?? error}`)
    }
  }

  function appendEdict(record) {
    try {
      fs.appendFileSync(edictLogPath, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8')
    } catch (error) {
      log(`directive log write failed: ${error?.message ?? error}`)
    }
  }

  function recentEdicts(count = 6) {
    try {
      const lines = fs.readFileSync(edictLogPath, 'utf8').split('\n').filter(Boolean)
      return lines
        .slice(-count)
        .map((line) => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)
    } catch {
      return []
    }
  }

  function todayClassesText(now) {
    const table = readTimetable()
    if (!table || !Array.isArray(table.classes)) return '课表没读到'
    const weekday = now.getDay() === 0 ? 7 : now.getDay()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const items = table.classes.filter((item) => item.day === weekday && item.active !== false)
    if (items.length === 0) return '今天没有课'
    const rest = items.filter((item) => minutesOf(item.start) > nowMinutes)
    const passed = items.length - rest.length
    const restText = rest.length
      ? rest.map((item) => `${item.start} ${item.course}${item.room ? `@${item.room}` : ''}`).join('；')
      : '今天的课都上完了'
    return `${passed > 0 ? `已上 ${passed} 节，` : ''}接下来：${restText}`
  }

  function wakeEdict(prompt) {
    const agent = pickAgent()
    if (!agent) {
      log('edict wake: no agent')
      return false
    }
    try {
      agent.followup(buildUserMessage(prompt))
      return true
    } catch (error) {
      log(`edict wake failed: ${error?.message ?? error}`)
      return false
    }
  }

  function edictIssuePrompt(now) {
    const goals = readGoals()
    const recent = recentEdicts(12).filter((item) => item.kind === 'issue').slice(-5)
    const goalsText = goals.length
      ? goals.map((item) => `- ${item.text}`).join('\n')
      : '- （还没设目标，先按课表和当下情况发）'
    const recentText = recent.length
      ? recent.map((item) => `- ${item.text}（${item.result || 'pending'}）`).join('\n')
      : '- 今天还没发过'
    return [
      `【都市指令 · 发令】现在是 ${hhmm(now)}。${todayClassesText(now)}`,
      '我设的目标：',
      goalsText,
      '最近发过的：',
      recentText,
      '请发一条指令，只做三件事：',
      '1. 调用 guide_directive，action=issue，text 不超过 40 字，具体到「现在就能动手」，带时间或地点（反例：好好学习；正例：把实验五第三步代码敲进 vscode，40 分钟内）。deadlineMinutes 给 10–45。',
      '2. 用 guide_teach 贴到面板：goal 写「都市指令」，panel.title 写「都市指令」，panel.text 写指令原文（≤30 字），annots 传空数组。',
      '3. 用 guide_say 念一句（最多两句），像传令员递纸条：只说做什么、什么时候。',
      '不要解释这套制度，不要寒暄，不要提问。',
    ].join('\n')
  }

  function edictNagPrompt(now) {
    const pending = edictState.pending
    const late = Math.max(0, Math.round((now.getTime() - new Date(pending.deadlineAt).getTime()) / 60000))
    return [
      `【都市指令 · 催办】${pending.text}`,
      `发令 ${pending.at}，时限 ${hhmm(new Date(pending.deadlineAt))}${late > 0 ? `，已超 ${late} 分钟` : '，快到了'}。`,
      '请做两件事：',
      '1. 用 guide_say 问一句做了没（一句，别超过 20 字）。',
      '2. 等用户回答后调用 guide_directive，action=close，result=done 或 failed，note 写他原话的要点。',
      '只问一遍，不要重复催。',
    ].join('\n')
  }

  function edictTick(now = new Date()) {
    const settings = readEdictConfig()
    if (settings.enabled === false) return
    const dateKey = todayKey(now)
    if (edictState.date !== dateKey) {
      edictState.date = dateKey
      edictState.count = 0
      edictState.pending = null
      saveEdictState()
    }
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    if (nowMinutes < minutesOf(settings.from) || nowMinutes > minutesOf(settings.to)) return

    // 目标空着就别叫醒模型，省 token；一小时后再看一次
    if (!readGoals().length) {
      edictState.waitingGoals = true
      if (!edictState.nextAt || new Date(edictState.nextAt).getTime() < now.getTime()) {
        edictState.nextAt = new Date(now.getTime() + 60 * 60000).toISOString()
        saveEdictState()
      }
      return
    }
    // 刚填上目标：不等下一个整点，这一拍就派
    if (edictState.waitingGoals) {
      edictState.waitingGoals = false
      edictState.nextAt = now.toISOString()
      saveEdictState()
    }

    const pending = edictState.pending
    if (pending) {
      const deadline = new Date(pending.deadlineAt).getTime()
      const nagAt = pending.nagAt ? new Date(pending.nagAt).getTime() : 0
      if (now.getTime() > deadline + 5 * 60000 && now.getTime() - nagAt > 20 * 60000) {
        pending.nagAt = now.toISOString()
        saveEdictState()
        wakeEdict(edictNagPrompt(now))
      }
      return
    }

    const nextAt = edictState.nextAt ? new Date(edictState.nextAt).getTime() : 0
    if (now.getTime() < nextAt) return
    if (Number(edictState.count) >= (Number(settings.maxPerDay) || EDICT_DEFAULTS.maxPerDay)) return
    // 发令后模型可能没调工具，先垫一个 8 分钟的间隔，避免每个心跳都叫它
    edictState.nextAt = new Date(now.getTime() + 8 * 60000).toISOString()
    saveEdictState()
    wakeEdict(edictIssuePrompt(now))
  }

  async function directiveRun(args = {}) {
    const now = new Date()
    const action = String(args.action || 'status')
    if (action === 'issue') {
      const text = String(args.text || '').trim()
      if (!text) return { ok: false, error: 'text 不能为空' }
      if (edictState.pending) {
        return { ok: false, error: `上一条还没回报：「${edictState.pending.text}」，先 close 再发新的` }
      }
      const minutes = Math.max(5, Math.min(180, Number(args.deadlineMinutes) || 20))
      const id = `d${now.getTime().toString(36)}`
      edictState.pending = {
        id,
        text: text.slice(0, 80),
        at: hhmm(now),
        deadlineAt: new Date(now.getTime() + minutes * 60000).toISOString(),
        nagAt: null,
      }
      edictState.count = Number(edictState.count || 0) + 1
      edictState.date = todayKey(now)
      const gap = Math.max(5, Number(readEdictConfig().intervalMinutes) || EDICT_DEFAULTS.intervalMinutes)
      edictState.nextAt = new Date(now.getTime() + gap * 60000).toISOString()
      saveEdictState()
      appendEdict({ kind: 'issue', id, text, deadlineMinutes: minutes, result: 'pending' })
      appendDaylog('note', `都市指令：${text}（${minutes} 分钟内）`)
      broadcast('directive', { event: 'issue', text })
      return { ok: true, id, text, deadline: edictState.pending.deadlineAt, todayCount: edictState.count }
    }
    if (action === 'close') {
      const pending = edictState.pending
      if (!pending) return { ok: false, error: '当前没有待回报的指令' }
      const result = String(args.result || 'done') === 'failed' ? 'failed' : 'done'
      const note = String(args.note || '').trim()
      edictState.pending = null
      saveEdictState()
      appendEdict({ kind: 'close', id: pending.id, text: pending.text, result, note })
      appendDaylog(
        result === 'done' ? 'activity' : 'note',
        `指令${result === 'done' ? '完成' : '未完成'}：${pending.text}${note ? `（${note}）` : ''}`,
      )
      broadcast('directive', { event: 'close', result })
      return { ok: true, result, text: pending.text }
    }
    if (action === 'list') return { ok: true, items: recentEdicts(20) }
    if (action === 'goals') return { ok: true, goals: readGoals() }
    return {
      ok: true,
      status: {
        enabled: readEdictConfig().enabled !== false,
        pending: edictState.pending,
        nextAt: edictState.nextAt,
        todayCount: edictState.count,
        goals: readGoals().length,
      },
    }
  }

  const guideDirectiveTool = {
    name: 'guide_directive',
    description:
      '「都市指令」：从目标/课表里给用户发一条具体指令，并记录他做没做。issue=发令（text、deadlineMinutes）；close=回报（result=done/failed、note）；list=最近记录；goals=当前目标；status=调度状态。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'issue / close / list / goals / status' },
        text: { type: 'string', description: 'issue：指令正文，≤40 字，具体到能立刻动手' },
        deadlineMinutes: { type: 'number', description: 'issue：多少分钟内完成，10–45 比较合适' },
        result: { type: 'string', description: 'close：done 或 failed' },
        note: { type: 'string', description: 'close：用户原话的要点' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => {
        if (value.error) return [{ type: 'text', text: `没成：${value.error}` }]
        if (Array.isArray(value.items)) {
          return [
            {
              type: 'text',
              text: value.items.length
                ? value.items
                    .map((item) => `${String(item.at).slice(11, 16)} ${item.kind === 'issue' ? '发令' : '回报'} ${item.text}${item.result && item.kind === 'issue' ? ` → ${item.result}` : ''}`)
                    .join('\n')
                : '还没有指令记录。',
            },
          ]
        }
        if (Array.isArray(value.goals)) {
          return [
            {
              type: 'text',
              text: value.goals.length ? value.goals.map((goal) => `· ${goal.text}`).join('\n') : '还没设目标，面板右上角「目标」可以写。',
            },
          ]
        }
        if (value.status) {
          const status = value.status
          const next = status.nextAt ? new Date(status.nextAt) : null
          const pad = (n) => String(n).padStart(2, '0')
          const nextText = next ? `${pad(next.getHours())}:${pad(next.getMinutes())}` : '未排'
          return [
            {
              type: 'text',
              text: `指令调度：${status.enabled ? '开' : '关'}；今天已发 ${status.todayCount} 条；下一条约 ${nextText}${status.pending ? `；待回报「${status.pending.text}」` : ''}；目标 ${status.goals} 条${status.goals ? '' : '（面板右上角「目标」先写）'}。`,
            },
          ]
        }
        if (value.text && value.deadline) {
          return [{ type: 'text', text: `已发令：${value.text}（${value.todayCount} 条/今天）` }]
        }
        if (value.result) return [{ type: 'text', text: `已记录：${value.text} → ${value.result}` }]
        return [{ type: 'text', text: 'ok' }]
      },
    },
    async execute(args = {}) {
      return directiveRun(args)
    },
  }

  // ------------------------------------------------------------------ focus
  // 「专注环」：纯本地闹钟，不叫模型、不花 token。到点只说一句短话（TTS + 字幕）。
  // 说话之前先看键鼠空闲时间——人走开了就不对着空气说话；上课时间也不吵。
  const focusPath = path.join(dataDir, 'focus.json')
  const focusLogPath = path.join(dataDir, 'focus-log.jsonl')
  const idleScript = path.join(NATIVE_DIR, 'idle.ps1')
  const FOCUS_DEFAULTS = { workMinutes: 25, breakMinutes: 5, nagMinutes: 8, spanMinutes: 90 }
  const FOCUS_LINES = [
    '回神，手上的事继续。',
    '抬头，眼睛离屏幕远一点，接着来。',
    '还在吗？刚看到哪一步了，接上。',
    '别切走，这一段做完再动。',
    '喝口水，坐直，继续。',
    '这一轮快完了，撑住。',
    '刚才那步做完了没？没完接着做。',
    '深呼吸一口，把注意力拉回屏幕。',
  ]
  const FOCUS_BREAK_LINES = ['这一轮结束，站起来走两分钟。', '休息了，别刷手机，站起来。', '停一下，看看远处。']
  const FOCUS_BACK_LINES = ['休息结束，回来。', '时间到，坐下接着来。', '回来，下一轮开始。']

  let focusState = {
    active: false,
    phase: 'work',
    round: 1,
    startedAt: null,
    workMinutes: FOCUS_DEFAULTS.workMinutes,
    breakMinutes: FOCUS_DEFAULTS.breakMinutes,
    nagMinutes: FOCUS_DEFAULTS.nagMinutes,
    nextNagAt: null,
    phaseEndsAt: null,
    nags: 0,
    until: null,
  }
  try {
    const saved = JSON.parse(fs.readFileSync(focusPath, 'utf8'))
    if (saved && typeof saved === 'object') focusState = { ...focusState, ...saved }
  } catch {
    /* 第一次跑没有这个文件 */
  }

  function saveFocus() {
    try {
      fs.writeFileSync(focusPath, JSON.stringify(focusState, null, 2), 'utf8')
    } catch (error) {
      log(`focus state write failed: ${error?.message ?? error}`)
    }
  }

  function logFocus(kind, text) {
    try {
      fs.appendFileSync(focusLogPath, `${JSON.stringify({ at: new Date().toISOString(), kind, text })}\n`, 'utf8')
    } catch {
      /* 记不上就算了，别影响提醒 */
    }
  }

  function pickLine(list) {
    return list[Math.floor(Math.random() * list.length)]
  }

  // 键鼠多久没动了。取不到就当 0：宁可多提醒一次，也别静默失效。
  function idleMsAsync() {
    return new Promise((resolve) => {
      if (!fs.existsSync(idleScript)) return resolve(0)
      let child
      try {
        child = spawn(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', idleScript],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
        )
      } catch {
        return resolve(0)
      }
      let out = ''
      let settled = false
      const done = (value) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      const timer = setTimeout(() => done(0), 5000)
      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        out += String(chunk)
      })
      child.on('error', () => {
        clearTimeout(timer)
        done(0)
      })
      child.on('exit', () => {
        clearTimeout(timer)
        const value = Number.parseInt(out.trim(), 10)
        done(Number.isFinite(value) ? value : 0)
      })
    })
  }

  function inClassNow(now) {
    const table = readTimetable()
    if (!table || !Array.isArray(table.classes)) return false
    const weekday = now.getDay() === 0 ? 7 : now.getDay()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    return table.classes.some(
      (item) =>
        item.day === weekday &&
        item.active !== false &&
        minutesOf(item.start) <= nowMinutes &&
        nowMinutes < minutesOf(item.end),
    )
  }

  // 提醒音不进 chatlog（那是「记录」按钮看的一次性对话），只走语音和字幕。
  function focusSpeak(text) {
    const chunks = speechChunks(text)
    if (!chunks.length || disposed) return
    stopSpeech()
    speechQueue = chunks.slice()
    playNextChunk()
    log(`focus speak: ${text}`)
  }

  async function focusTick(now = new Date()) {
    if (!focusState.active) return
    const nowMs = now.getTime()
    if (focusState.until && nowMs >= new Date(focusState.until).getTime()) {
      focusState.active = false
      focusState.phase = 'work'
      focusState.nextNagAt = null
      focusState.phaseEndsAt = null
      saveFocus()
      focusSpeak('时间到了，收个尾，起来动动。')
      logFocus('end', '到点自动结束')
      return
    }
    const phaseDue = focusState.phaseEndsAt ? new Date(focusState.phaseEndsAt).getTime() : Infinity
    const nagDue = focusState.nextNagAt ? new Date(focusState.nextNagAt).getTime() : Infinity
    if (nowMs < phaseDue && nowMs < nagDue) return

    const idle = await idleMsAsync()
    if (idle > 5 * 60000) {
      const push = (iso, ms) => (iso ? new Date(new Date(iso).getTime() + ms).toISOString() : iso)
      focusState.nextNagAt = push(focusState.nextNagAt, 10 * 60000)
      focusState.phaseEndsAt = push(focusState.phaseEndsAt, 10 * 60000)
      saveFocus()
      return
    }
    if (inClassNow(now)) {
      focusState.nextNagAt = new Date(nowMs + focusState.nagMinutes * 60000).toISOString()
      saveFocus()
      return
    }

    if (nowMs >= phaseDue) {
      if (focusState.phase === 'work') {
        focusState.phase = 'break'
        focusState.phaseEndsAt = new Date(nowMs + focusState.breakMinutes * 60000).toISOString()
        focusState.nextNagAt = focusState.phaseEndsAt
        focusSpeak(pickLine(FOCUS_BREAK_LINES))
        logFocus('break', `第 ${focusState.round} 轮结束`)
      } else {
        focusState.phase = 'work'
        focusState.round = Number(focusState.round || 1) + 1
        focusState.phaseEndsAt = new Date(nowMs + focusState.workMinutes * 60000).toISOString()
        focusState.nextNagAt = new Date(nowMs + focusState.nagMinutes * 60000).toISOString()
        focusSpeak(pickLine(FOCUS_BACK_LINES))
        logFocus('work', `第 ${focusState.round} 轮开始`)
      }
      saveFocus()
      return
    }

    focusState.nags = Number(focusState.nags || 0) + 1
    focusState.nextNagAt = new Date(nowMs + focusState.nagMinutes * 60000).toISOString()
    saveFocus()
    focusSpeak(pickLine(FOCUS_LINES))
    logFocus('nag', `第 ${focusState.nags} 次`)
  }

  function focusStatusText() {
    if (!focusState.active) return '专注环没开。'
    const phase = focusState.phase === 'break' ? '休息' : '工作'
    const ends = focusState.phaseEndsAt ? new Date(focusState.phaseEndsAt) : null
    const next = focusState.nextNagAt ? new Date(focusState.nextNagAt) : null
    const left = ends ? Math.max(0, Math.round((ends.getTime() - Date.now()) / 60000)) : 0
    const until = focusState.until ? `；${hhmm(new Date(focusState.until))} 自动结束` : ''
    return `专注中 · 第 ${focusState.round} 轮 · ${phase}，这一段还剩 ${left} 分钟；下次提醒 ${next ? hhmm(next) : '未排'}；已提醒 ${focusState.nags} 次${until}。`
  }

  function focusRun(args = {}) {
    const action = String(args.action || 'status')
    const now = new Date()
    if (action === 'start') {
      const work = Math.max(5, Math.min(90, Number(args.workMinutes) || FOCUS_DEFAULTS.workMinutes))
      const brk = Math.max(1, Math.min(30, Number(args.breakMinutes) || FOCUS_DEFAULTS.breakMinutes))
      const nag = Math.max(2, Math.min(45, Number(args.nagMinutes) || FOCUS_DEFAULTS.nagMinutes))
      let until = null
      if (args.until && /^\d{1,2}:\d{2}$/.test(String(args.until))) {
        const [h, m] = String(args.until).split(':').map(Number)
        const t = new Date(now)
        t.setHours(h, m, 0, 0)
        if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1)
        until = t.toISOString()
      } else {
        until = new Date(now.getTime() + FOCUS_DEFAULTS.spanMinutes * 60000).toISOString()
      }
      focusState = {
        active: true,
        phase: 'work',
        round: 1,
        startedAt: now.toISOString(),
        workMinutes: work,
        breakMinutes: brk,
        nagMinutes: nag,
        nextNagAt: new Date(now.getTime() + nag * 60000).toISOString(),
        phaseEndsAt: new Date(now.getTime() + work * 60000).toISOString(),
        nags: 0,
        until,
      }
      saveFocus()
      logFocus('start', `工作 ${work} 分 / 休息 ${brk} 分 / 每 ${nag} 分提醒；${hhmm(new Date(until))} 结束`)
      focusSpeak(`开始专注，${work} 分钟一轮，每 ${nag} 分钟我喊你一次。`)
      return { ok: true, text: focusStatusText(), status: { ...focusState } }
    }
    if (action === 'stop') {
      focusState.active = false
      focusState.nextNagAt = null
      focusState.phaseEndsAt = null
      saveFocus()
      logFocus('stop', `第 ${focusState.round} 轮停`)
      focusSpeak('专注环关了。')
      return { ok: true, text: '已停。' }
    }
    if (action === 'ping') {
      if (!focusState.active) return { ok: false, error: '专注环没开，先 start' }
      focusSpeak(pickLine(FOCUS_LINES))
      return { ok: true, text: '喊了一声。' }
    }
    return { ok: true, text: focusStatusText(), status: { ...focusState } }
  }

  const guideFocusTool = {
    name: 'guide_focus',
    description:
      '「专注环」：纯本地定时提醒，把注意力拉回来。start=开始（workMinutes、breakMinutes、nagMinutes、until）；stop=停；status=看状态；ping=立刻喊一句。不叫模型、不花 token。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'start / stop / status / ping' },
        workMinutes: { type: 'number', description: 'start：一轮工作多少分钟，默认 25' },
        breakMinutes: { type: 'number', description: 'start：休息多少分钟，默认 5' },
        nagMinutes: { type: 'number', description: 'start：工作期间每隔多少分钟喊一次，默认 8' },
        until: { type: 'string', description: 'start：什么时候自动结束，HH:mm，默认 90 分钟后' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: value.error ? `没成：${value.error}` : String(value.text || 'ok') }],
    },
    async execute(args = {}) {
      return focusRun(args)
    },
  }

  // ------------------------------------------------------------------ plan
  // 「桌面清单」：目标 → 今日清单（起止时间 + 地点 + 做什么）→ 桌面卡片。
  // 卡片只是 state 的投影：插件写 state.plan / state.card，overlay 照着画；
  // 用户点勾 → overlay 回一个 plan_done 事件，这里改 plan.json 再写回 state。
  // 故意不做"真嵌进壁纸层"（WorkerW 那套资源管理器一重启就掉），
  // 用无边框 + 强半透明做"看起来融进桌面"的效果。
  const planPath = path.join(dataDir, 'plan.json')
  const planStatePath = path.join(dataDir, 'plan-state.json')
  const planArchiveDir = path.join(dataDir, 'plan-archive')
  const planHistoryPath = path.join(dataDir, 'plan-history.json')

  const PLAN_TONE = {
    strict: '严厉，短句，不容商量',
    normal: '正常，像同学提醒一句',
    buddy: '损友口吻，可以损两句但不刻薄',
    minimal: '极简，只说时间和事，不超过 12 个字',
  }

  function planToneText() {
    const key = String(readEdictConfig().tone || 'normal')
    return PLAN_TONE[key] || PLAN_TONE.normal
  }

  function planMinutes(text) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim())
    if (!m) return null
    const hour = Number(m[1])
    const min = Number(m[2])
    if (hour > 23 || min > 59) return null
    return hour * 60 + min
  }

  function readPlanFile() {
    try {
      const data = JSON.parse(fs.readFileSync(planPath, 'utf8'))
      const items = Array.isArray(data?.items) ? data.items : []
      return {
        date: String(data?.date || ''),
        items: items
          .map((item, index) => ({
            id: String(item?.id || `t${index + 1}`),
            from: String(item?.from || '').trim(),
            to: String(item?.to || '').trim(),
            place: String(item?.place || '').trim(),
            title: String(item?.title || '').trim(),
            goalId: item?.goalId ? String(item.goalId) : '',
            done: Boolean(item?.done),
            doneAt: item?.doneAt || null,
            remindedAt: item?.remindedAt || null,
            nudgedAt: item?.nudgedAt || null,
          }))
          .filter((item) => item.title),
      }
    } catch {
      return { date: '', items: [] }
    }
  }

  function savePlanFile(plan) {
    try {
      fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8')
      recordPlanSnapshot(plan)
    } catch (error) {
      log(`plan write failed: ${error?.message ?? error}`)
    }
  }

  // 每天的清单都留一份底档：plan-archive/YYYY-MM-DD.json。
  // 跨天归档只会在"换天后的第一次调用"发生，插件没跑的那几天就漏了；
  // 所以每次保存都覆盖写当天的快照，历史才连得上。
  function recordPlanSnapshot(plan) {
    if (!plan || !plan.date) return
    try {
      fs.mkdirSync(planArchiveDir, { recursive: true })
      const file = path.join(planArchiveDir, `${plan.date}.json`)
      const next = JSON.stringify(plan, null, 2)
      let prev = ''
      try { if (fs.existsSync(file)) prev = fs.readFileSync(file, 'utf8') } catch {}
      if (prev !== next) {
        fs.writeFileSync(file, next, 'utf8')
        writePlanHistoryFile()
      }
    } catch (error) {
      log(`plan snapshot failed: ${error?.message ?? error}`)
    }
  }

  // 近 N 天的清单汇总，写到 plan-history.json 给悬浮层直接读（不走 HTTP）。
  function planHistoryData(days = 21) {
    const out = []
    const pack = (date, items) => ({
      date,
      total: items.length,
      done: items.filter((x) => x.done === true).length,
      items: items.map((x) => ({
        from: x.from || '',
        to: x.to || '',
        place: x.place || '',
        title: x.title || '',
        done: x.done === true,
      })),
    })
    try {
      // 今天的清单可能还没落归档（当天只保存过一次也算），单独补一条在最前面。
      const today = todayKey(new Date())
      const cur = readPlanFile()
      if (cur && cur.date === today && Array.isArray(cur.items) && cur.items.length) {
        out.push(pack(today, cur.items))
      }
      if (!fs.existsSync(planArchiveDir)) return out
      const files = fs.readdirSync(planArchiveDir).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
      files.sort().reverse()
      for (const name of files.slice(0, days)) {
        const date = name.replace(/\.json$/, '')
        // 今天那条上面已经从 plan.json 补过一次了，归档目录里同日的那份要跳过，否则列表里出现两个同一天。
        if (out.some((d) => d.date === date)) continue
        let plan = null
        try { plan = JSON.parse(fs.readFileSync(path.join(planArchiveDir, name), 'utf8')) } catch { continue }
        const items = Array.isArray(plan?.items) ? plan.items : []
        out.push({
          date,
          total: items.length,
          done: items.filter((x) => x.done === true).length,
          items: items.map((x) => ({
            from: x.from || '',
            to: x.to || '',
            place: x.place || '',
            title: x.title || '',
            done: x.done === true,
          })),
        })
      }
    } catch (error) {
      log(`plan history failed: ${error?.message ?? error}`)
    }
    return out
  }

  function writePlanHistoryFile() {
    try {
      const data = { updatedAt: new Date().toISOString(), days: planHistoryData() }
      fs.writeFileSync(planHistoryPath, JSON.stringify(data, null, 2), 'utf8')
    } catch (error) {
      log(`plan history write failed: ${error?.message ?? error}`)
    }
  }

  function archivePlan(plan) {
    if (!plan.date || !plan.items.length) return
    try {
      fs.mkdirSync(planArchiveDir, { recursive: true })
      fs.writeFileSync(path.join(planArchiveDir, `${plan.date}.json`), JSON.stringify(plan, null, 2), 'utf8')
    } catch (error) {
      log(`plan archive failed: ${error?.message ?? error}`)
    }
  }

  // 跨天自动归旧：昨天的清单进 plan-archive/，今天重新开始。
  function planForToday(now = new Date()) {
    const today = todayKey(now)
    const plan = readPlanFile()
    if (plan.date && plan.date < today) {
      archivePlan(plan)
      const fresh = { date: today, items: [] }
      savePlanFile(fresh)
      // 换天要立刻推给悬浮层，否则卡片还挂着昨天那几条（isToday 也会是错的）。
      try { pushPlanState(fresh) } catch (error) { log(`plan push after rollover failed: ${error?.message ?? error}`) }
      return fresh
    }
    if (!plan.date) plan.date = today
    plan.items.sort((a, b) => (planMinutes(a.from) ?? 9999) - (planMinutes(b.from) ?? 9999))
    return plan
  }

  function pushPlanState(plan = planForToday()) {
    writeState({
      plan: { date: plan.date, items: plan.items, isToday: plan.date === todayKey(new Date()) },
    })
    broadcast('plan', plan)
    return plan
  }

  function setPlanItemDone(id, done) {
    const plan = planForToday()
    const item = plan.items.find((entry) => entry.id === id)
    if (!item) return false
    item.done = done
    item.doneAt = done ? new Date().toISOString() : null
    savePlanFile(plan)
    pushPlanState(plan)
    if (done) appendDaylog('activity', `清单完成：${item.title}`)
    return true
  }

  let planState = { buildPromptedFor: '' }
  try {
    const saved = JSON.parse(fs.readFileSync(planStatePath, 'utf8'))
    if (saved && typeof saved === 'object') planState = { ...planState, ...saved }
  } catch {
    /* first run */
  }

  function savePlanState() {
    try {
      fs.writeFileSync(planStatePath, JSON.stringify(planState, null, 2), 'utf8')
    } catch {
      /* 写不进就下次再说 */
    }
  }

  function planItemLine(item) {
    const span = item.from ? `${item.from}${item.to ? `–${item.to}` : ''}` : '随时'
    return `${item.done ? '☑' : '☐'} ${span}${item.place ? ` @${item.place}` : ''} ${item.title}`
  }

  function planSummary(plan = planForToday()) {
    if (!plan.items.length) return `${plan.date} 还没有清单。`
    const done = plan.items.filter((item) => item.done).length
    return [
      `${plan.date}（${done}/${plan.items.length} 已完成）`,
      ...plan.items.map(planItemLine),
    ].join('\n')
  }

  function planRemindPrompt(item, now) {
    const span = `${item.from}${item.to ? `–${item.to}` : ''}`
    return [
      `【桌面清单 · 快到点】现在是 ${hhmm(now)}，十分钟后是这一项：${span}${item.place ? ` 在 ${item.place}` : ''} ${item.title}`,
      `请只做一件事：用 guide_say 说一句（不超过 25 字，语气：${planToneText()}），提醒他几点、去哪、做什么。`,
      '不要念整张清单，不要提问，不要调用别的工具。',
    ].join('\n')
  }

  function planNudgePrompt(item, now) {
    return [
      `【桌面清单 · 该开始了】${planItemLine(item)}（现在 ${hhmm(now)}，已经过了 ${item.from}）`,
      `请用 guide_say 问一句（不超过 20 字，语气：${planToneText()}）：这一项还做吗。`,
      '他回「做/在做了」就用 guide_plan action=done 打勾；回「不做了」就用 action=remove 划掉并记一句 daylog；别追问第二遍。',
    ].join('\n')
  }

  function planBuildPrompt(now, dateLabel) {
    const goals = readGoals()
    const goalsText = goals.length ? goals.map((item) => `- ${item.text}`).join('\n') : '- （没设目标，按课表和日常排）'
    return [
      `【桌面清单 · 排${dateLabel}】现在是 ${hhmm(now)}，${dateLabel === '今天' ? '今天' : '明天'}还没有清单。`,
      '我设的目标：',
      goalsText,
      `课表：${todayClassesText(now)}`,
      `请按番茄钟排 4–8 条：一条就是一个 25 分钟番茄钟，from 用整点或半点（如 08:00、08:30），结束时间会自动算成 +25 分钟、之后 5 分钟休息；逐条调用 guide_plan（action=add，from 用 HH:mm，place 写地点或「宿舍/机房」，title ≤18 字且是能立刻动手的事，goalId 可选）。`,
      '有课的时间段直接排成上课，别重复排；每条之间留出空档，别排满。',
      dateLabel === '今天'
        ? '排完调用 guide_plan action=show 显示卡片，再用 guide_say 说一句「今天排好了，一共 N 条」。'
        : '排完不用显示卡片，用 guide_say 说一句「明天排好了」就行。',
    ].join('\n')
  }

  function wakePlan(prompt) {
    const agent = pickAgent()
    if (!agent) {
      log('plan wake: no agent')
      return false
    }
    try {
      agent.followup(buildUserMessage(prompt))
      return true
    } catch (error) {
      log(`plan wake failed: ${error?.message ?? error}`)
      return false
    }
  }

  // 心跳：每分钟看一次。只在真的到点/该追问/该排清单时叫醒模型。
  function planTick(now = new Date()) {
    const plan = planForToday(now)
    const isToday = plan.date === todayKey(now)
    if (isToday && plan.items.length) {
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const pending = plan.items.filter((item) => !item.done && planMinutes(item.from) !== null)

      const toRemind = pending.find((item) => {
        if (item.remindedAt) return false
        const from = planMinutes(item.from)
        return nowMin >= from - 10 && nowMin <= from + 2
      })
      if (toRemind) {
        toRemind.remindedAt = now.toISOString()
        savePlanFile(plan)
        pushPlanState(plan)
        wakePlan(planRemindPrompt(toRemind, now))
        return
      }

      const toNudge = pending.find((item) => {
        if (item.nudgedAt) return false
        const from = planMinutes(item.from)
        return nowMin >= from + 15 && nowMin <= from + 35
      })
      if (toNudge) {
        toNudge.nudgedAt = now.toISOString()
        savePlanFile(plan)
        pushPlanState(plan)
        wakePlan(planNudgePrompt(toNudge, now))
        return
      }
    }

    // 今天还没有清单就叫一次去排——不再限定 7:00–9:30：
    // 插件可能中午才启动（或者前一晚被关掉），错过窗口就一整天没有清单。
    // 每天只叫一次，靠 buildPromptedFor 兜住。
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const today = todayKey(now)
    if (isToday && !plan.items.length && planState.buildPromptedFor !== today) {
      planState.buildPromptedFor = today
      savePlanState()
      if (!wakePlan(planBuildPrompt(now, '今天'))) {
        appendDaylog('note', '计划排程没叫起来：插件没能唤醒主代理，今天的清单还是空的。')
      }
    }
  }

  async function planRun(args = {}) {
    const action = String(args.action || 'list')
    if (action === 'add') {
      const title = String(args.title || '').trim()
      if (!title) return { ok: false, error: 'title 不能为空' }
      // 番茄钟：把开始时间吸到最近的整点/半点，结束固定 +25 分钟，后 5 分钟休息。
      const rawFrom = planMinutes(args.from)
      let slot = null
      if (rawFrom !== null) {
        slot = Math.floor(rawFrom / 30) * 30
        if (rawFrom - slot >= 25) slot += 30
        // 时间轴画到 22:30（他一般十点半收工），再晚的条目会落在卡片外面，收进最后一格。
        const planDayEnd = 22 * 60 + 30
        if (slot >= planDayEnd) slot = 22 * 60
      }
      const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
      // 显式给了 from+to 且跨度大于一个番茄钟（比如整节课 08:30–10:10），按真实区间存，
      // 不再强拗成 25 分钟——卡片的时间轴是按真实时长画的。
      const rawTo = planMinutes(args.to)
      // 只要用户/模型明确给了 from 和 to（to 在 from 之后），就按真实区间存，不再往番茄钟上拗；
      // 只给 from 才走"吸附到整点/半点 + 25 分钟"那套。卡片上的「＋」是手填时间，必须原样落。
      const explicitSpan = rawFrom !== null && rawTo !== null && rawTo > rawFrom
      if (explicitSpan) {
        slot = rawFrom
      }
      const from = slot === null ? '' : hhmm(slot)
      const to = slot === null ? '' : hhmm(explicitSpan ? rawTo : slot + 25)
      const plan = planForToday()
      const id = `t${Date.now().toString(36)}`
      plan.items.push({
        id,
        from,
        to,
        place: String(args.place || '').trim(),
        title: title.slice(0, 40),
        goalId: args.goalId ? String(args.goalId) : '',
        done: false,
        doneAt: null,
        remindedAt: null,
        nudgedAt: null,
      })
      plan.items.sort((a, b) => (planMinutes(a.from) ?? 9999) - (planMinutes(b.from) ?? 9999))
      savePlanFile(plan)
      pushPlanState(plan)
      return { ok: true, id, plan: planSummary(plan) }
    }
    if (action === 'update') {
      const id = String(args.id || '')
      const plan = planForToday()
      const item = plan.items.find((it) => it.id === id)
      if (!item) return { ok: false, error: `没有 id=${id} 这一项` }
      const fmt = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
      const title = String(args.title !== undefined ? args.title : item.title).trim()
      if (!title) return { ok: false, error: 'title 不能为空' }
      const rawFrom = planMinutes(args.from)
      const rawTo = planMinutes(args.to)
      if (args.place !== undefined) item.place = String(args.place || '').trim()
      item.title = title.slice(0, 40)
      if (rawFrom !== null) item.from = fmt(rawFrom)
      if (rawTo !== null && rawFrom !== null && rawTo > rawFrom) {
        item.to = fmt(rawTo)
      } else if (rawFrom !== null) {
        // 只改了开始时间：保持原来的时长，没时长就补一个番茄钟。
        const fromMin = planMinutes(item.from)
        const toMin = planMinutes(item.to)
        if (fromMin !== null && (toMin === null || toMin <= fromMin)) item.to = fmt(fromMin + 25)
      }
      // 时间变了，之前的提醒/追问记录作废，让它重新提醒。
      item.remindedAt = null
      item.nudgedAt = null
      plan.items.sort((a, b) => (planMinutes(a.from) ?? 9999) - (planMinutes(b.from) ?? 9999))
      savePlanFile(plan)
      pushPlanState(plan)
      appendDaylog('note', `清单改了：${item.from}-${item.to} ${item.title}`)
      return { ok: true, plan: planSummary(plan) }
    }
    if (action === 'remove') {
      const id = String(args.id || '')
      const plan = planForToday()
      const before = plan.items.length
      plan.items = plan.items.filter((item) => item.id !== id)
      if (plan.items.length === before) return { ok: false, error: `没有 id=${id} 这一项` }
      savePlanFile(plan)
      pushPlanState(plan)
      appendDaylog('note', args.note ? `清单划掉：${args.note}` : '清单划掉一条')
      return { ok: true, plan: planSummary(plan) }
    }
    if (action === 'done' || action === 'undo') {
      const id = String(args.id || '')
      if (!setPlanItemDone(id, action === 'done')) return { ok: false, error: `没有 id=${id} 这一项` }
      return { ok: true, plan: planSummary() }
    }
    if (action === 'clear') {
      const plan = planForToday()
      plan.items = []
      savePlanFile(plan)
      pushPlanState(plan)
      return { ok: true, plan: planSummary() }
    }
    if (action === 'show' || action === 'hide') {
      writeState({ card: { visible: action === 'show' } })
      const plan = planForToday()
      pushPlanState(plan)
      return { ok: true, visible: action === 'show', plan: planSummary(plan) }
    }
    if (action === 'auto') {
      return {
        ok: true,
        hint: '按目标与课表排清单：逐条调用 guide_plan（action=add, from/to=HH:mm, place, title）',
        goals: readGoals(),
        classes: todayClassesText(new Date()),
        now: hhmm(new Date()),
        plan: planSummary(),
      }
    }
    return { ok: true, plan: planSummary(), visible: Boolean(currentState().card?.visible) }
  }

  const guidePlanTool = {
    name: 'guide_plan',
    description:
      '「桌面清单」：把目标排成今天的清单（几点到几点、在哪、做什么），显示在桌面卡片上。list=看清单；add=加一条（from/to 用 HH:mm、place、title）；remove=划掉；done/undo=打勾；clear=清空；show/hide=显示或收起卡片；auto=拿目标和课表去排。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'list / add / remove / done / undo / clear / show / hide / auto' },
        id: { type: 'string', description: 'remove/done/undo：条目 id' },
        from: { type: 'string', description: 'add：开始时间 HH:mm' },
        to: { type: 'string', description: 'add：结束时间 HH:mm' },
        place: { type: 'string', description: 'add：地点，如 励志楼乙102 / 宿舍 / 实验室' },
        title: { type: 'string', description: 'add：做什么，≤18 字，具体到能动手' },
        goalId: { type: 'string', description: 'add：对应哪个目标（可选）' },
        note: { type: 'string', description: 'remove：为什么划掉' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => {
        if (value.error) return [{ type: 'text', text: `没成：${value.error}` }]
        if (value.hint) {
          return [{ type: 'text', text: `${value.hint}\n\n现在是 ${value.now}\n课表：${value.classes}\n\n当前清单：\n${value.plan}` }]
        }
        return [{ type: 'text', text: value.plan || 'ok' }]
      },
    },
    async execute(args = {}) {
      return planRun(args)
    },
  }

  // ------------------------------------------------------------------ chatlog
  // 面板上的「记录」按钮读这个文件：插件端的短期对话流水（谁说的、从哪说、
  // 说了什么、什么时候），只留最近 120 条，纯本机。
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
  // Bilibili videos get their own library (videos/), deliberately apart from the
  // teaching handbook (kb/): one JSON per video plus a readable Markdown digest,
  // so recall never mixes tutorial steps with video notes.
  const videoDir = path.join(dataDir, 'videos')
  fs.mkdirSync(videoDir, { recursive: true })
  const BILI_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

  function parseVideoUrl(url) {
    const text = String(url || '')
    const pageMatch = text.match(/[?&]p=(\d+)/)
    const page = pageMatch ? Math.max(1, Number(pageMatch[1])) : 1
    const bv = text.match(/BV[0-9A-Za-z]{10}/)
    if (bv) return { bvid: bv[0], page }
    const av = text.match(/av(\d+)/i)
    if (av) return { aid: Number(av[1]), page }
    return null
  }

  function biliHeaders(cookie) {
    const headers = {
      'User-Agent': BILI_UA,
      Referer: 'https://www.bilibili.com/',
      Accept: 'application/json, text/plain, */*',
    }
    if (cookie) headers.Cookie = String(cookie)
    return headers
  }

  async function biliApi(target, cookie) {
    if (typeof fetch !== 'function') throw new Error('当前运行时不带 fetch，无法访问 B 站')
    let response
    try {
      response = await fetch(target, { headers: biliHeaders(cookie) })
    } catch (error) {
      throw new Error(`访问 B 站失败（网络不可达）：${error?.message ?? error}`)
    }
    if (!response.ok) throw new Error(`B 站接口 HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.code !== 0) throw new Error(`B 站接口返回 ${payload?.code}：${payload?.message ?? ''}`)
    return payload.data
  }

  function biliCookie() {
    if (config.biliCookie) return String(config.biliCookie)
    try {
      return fs.readFileSync(path.join(dataDir, 'bili-cookie.txt'), 'utf8').trim()
    } catch {
      return ''
    }
  }

  // B 站 player 接口现在要求 WBI 签名。不带签名时接口照样返回 200，但给出的字幕
  // 常常是**别的视频**的（歌词、别的教程），这就是"读不出视频内容"的真正原因。
  const WBI_MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12,
    38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
  ]
  let wbiMixin = ''
  let wbiMixinAt = 0

  async function biliWbiMixin(cookie) {
    if (wbiMixin && Date.now() - wbiMixinAt < 30 * 60 * 1000) return wbiMixin
    const nav = await biliApi('https://api.bilibili.com/x/web-interface/nav', cookie)
    const img = String(nav?.wbi_img?.img_url || '')
    const sub = String(nav?.wbi_img?.sub_url || '')
    if (!img || !sub) throw new Error('没拿到 WBI 密钥')
    const pick = (url) => url.slice(url.lastIndexOf('/') + 1).split('.')[0]
    const raw = pick(img) + pick(sub)
    wbiMixin = WBI_MIXIN_TAB.map((index) => raw[index]).join('').slice(0, 32)
    wbiMixinAt = Date.now()
    return wbiMixin
  }

  function biliSignParams(params, mixin) {
    const wts = Math.round(Date.now() / 1000)
    const all = { ...params, wts }
    const query = Object.keys(all)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(all[key]).replace(/[!'()*]/g, ''))}`)
      .join('&')
    const w_rid = createHash('md5').update(query + mixin).digest('hex')
    return `${query}&w_rid=${w_rid}`
  }

  // 字幕的时间轴必须落在视频时长里，否则就是接口塞过来的别人的字幕。
  function subtitleFitsVideo(cues, duration) {
    if (!Array.isArray(cues) || !cues.length) return false
    const last = cues.reduce((max, cue) => Math.max(max, Number(cue.to) || Number(cue.from) || 0), 0)
    return last <= Number(duration || 0) + 5
  }

  function videoStamp(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0))
    const hh = Math.floor(total / 3600)
    const mm = Math.floor((total % 3600) / 60)
    const ss = total % 60
    const pad = (n) => String(n).padStart(2, '0')
    return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`
  }

  function videoDigest(record) {
    const lines = [
      `# ${record.title || record.bvid}`,
      '',
      `- 视频：https://www.bilibili.com/video/${record.bvid}`,
      `- UP 主：${record.owner || '未知'}`,
      `- 时长：${videoStamp(record.duration)}`,
      `- 收录：${record.learnedAt}`,
      `- 字幕：${record.subtitleLan || '无'}`,
      '',
    ]
    if (record.summary) {
      lines.push('## 摘要', '', record.summary, '')
    }
    if (Array.isArray(record.points) && record.points.length > 0) {
      lines.push('## 要点', '')
      for (const point of record.points) lines.push(`- ${point}`)
      lines.push('')
    }
    if (Array.isArray(record.cues) && record.cues.length > 0) {
      lines.push('## 字幕全文', '')
      for (const cue of record.cues) lines.push(`- [${videoStamp(cue.from)}] ${cue.text}`)
      lines.push('')
    }
    return lines.join('\n')
  }

  function saveVideoRecord(record) {
    const id = record.bvid || `av${record.aid}`
    fs.writeFileSync(path.join(videoDir, `${id}.json`), JSON.stringify(record, null, 2), 'utf8')
    fs.writeFileSync(path.join(videoDir, `${id}.md`), videoDigest(record), 'utf8')
    return id
  }

  function readVideoRecords() {
    const records = []
    let names = []
    try {
      names = fs.readdirSync(videoDir).filter((name) => name.toLowerCase().endsWith('.json'))
    } catch {
      return records
    }
    for (const name of names) {
      try {
        records.push(JSON.parse(fs.readFileSync(path.join(videoDir, name), 'utf8')))
      } catch {
        /* a broken record must not hide the rest */
      }
    }
    return records
  }

  async function videoLearn(args = {}) {
    const parsed = parseVideoUrl(args.url)
    if (!parsed) throw new Error('没认出 BV 号：请给完整的 B 站视频链接或 BV 号')
    const cookie = biliCookie()
    const query = parsed.bvid ? `bvid=${parsed.bvid}` : `aid=${parsed.aid}`
    const view = await biliApi(`https://api.bilibili.com/x/web-interface/view?${query}`, cookie)
    const pages = Array.isArray(view.pages) ? view.pages : []
    const pageIndex = Math.min(Math.max(1, parsed.page || 1), Math.max(1, pages.length))
    const pageInfo = pages[pageIndex - 1] || null
    const cid = pageInfo?.cid ?? view.cid
    // 先走带签名的 wbi 接口；万一签名失败才退回老接口（老接口可能给错字幕）。
    const loadPlayer = async () => {
      try {
        const mixin = await biliWbiMixin(cookie)
        const signed = biliSignParams({ bvid: view.bvid, cid }, mixin)
        return await biliApi(`https://api.bilibili.com/x/player/wbi/v2?${signed}`, cookie)
      } catch (error) {
        log(`wbi player failed: ${error?.message ?? error}`)
        return await biliApi(`https://api.bilibili.com/x/player/v2?bvid=${view.bvid}&cid=${cid}`, cookie)
      }
    }

    const readCues = async (player) => {
      const subtitles = Array.isArray(player?.subtitle?.subtitles) ? player.subtitle.subtitles : []
      const rank = (lan) => (lan === 'zh-Hans' ? 0 : lan === 'zh-CN' ? 1 : /^ai-zh/.test(lan) ? 2 : 3)
      subtitles.sort((a, b) => rank(a.lan) - rank(b.lan))
      const pick = subtitles[0]
      if (!pick?.subtitle_url) return { chosen: null, cues: [], url: '' }
      const url = pick.subtitle_url.startsWith('//') ? `https:${pick.subtitle_url}` : pick.subtitle_url
      const response = await fetch(url, { headers: biliHeaders(cookie) })
      if (!response.ok) return { chosen: pick, cues: [], url, error: `字幕文件 HTTP ${response.status}` }
      const body = await response.json()
      const list = (Array.isArray(body?.body) ? body.body : [])
        .map((cue) => ({ from: Number(cue.from) || 0, to: Number(cue.to) || 0, text: String(cue.content || '').trim() }))
        .filter((cue) => cue.text)
      return { chosen: pick, cues: list, url }
    }

    const pageDuration = Number(pageInfo?.duration) || Number(view.duration) || 0
    let player = await loadPlayer()
    const loggedIn = Number(player?.login_mid) > 0
    let picked = await readCues(player)
    let mismatch = false
    if (picked.cues.length && !subtitleFitsVideo(picked.cues, pageDuration)) {
      mismatch = true
      log(`subtitle mismatch ${view.bvid}: ${picked.cues.length} 条超时长，重取一次`)
      player = await loadPlayer()
      picked = await readCues(player)
      if (picked.cues.length && !subtitleFitsVideo(picked.cues, pageDuration)) {
        log(`subtitle mismatch ${view.bvid}: 重取仍不符，丢弃`)
        picked = { ...picked, cues: [] }
      } else {
        mismatch = false
      }
    }
    const chosen = picked.chosen
    const cues = picked.cues
    // 重新收录同一条视频时保留已经写过的摘要和要点，别把用户的笔记冲掉。
    let previous = null
    try {
      const previousFile = path.join(videoDir, `${view.bvid}.json`)
      if (fs.existsSync(previousFile)) previous = JSON.parse(fs.readFileSync(previousFile, 'utf8'))
    } catch {
      previous = null
    }
    const record = {
      bvid: view.bvid,
      aid: view.aid,
      cid,
      title: view.title,
      owner: view.owner?.name || '',
      duration: pageDuration || view.duration,
      desc: String(view.desc || '').slice(0, 800),
      url: `https://www.bilibili.com/video/${view.bvid}`,
      page: pageIndex,
      pageCount: pages.length || 1,
      pageTitle: pageInfo?.part || '',
      learnedAt: new Date().toISOString(),
      subtitleLan: chosen?.lan || '',
      subtitleUrl: picked.url || '',
      cues,
      summary: previous?.summary || '',
      points: Array.isArray(previous?.points) ? previous.points : [],
    }
    const id = saveVideoRecord(record)
    broadcast('video', { learned: id, cues: cues.length })
    const transcript = cues.map((cue) => `[${videoStamp(cue.from)}] ${cue.text}`).join('\n')
    if (!transcript) {
      return {
        ok: true,
        bvid: id,
        title: record.title,
        owner: record.owner,
        duration: record.duration,
        page: record.page,
        pageCount: record.pageCount,
        cues: 0,
        needCookie: !cookie,
        loggedIn,
        reason: mismatch ? 'mismatch' : !chosen ? 'no-subtitle' : 'empty-subtitle',
        note: mismatch
          ? '接口返回的字幕时间轴超出视频长度，判定不是这条视频的字幕，已丢弃（再试一次或稍后再收录）。'
          : cookie
            ? loggedIn
              ? 'Cookie 有效，但这个视频没有可读取的字幕（UP 主可能没上传，也没开 AI 字幕）。'
              : 'Cookie 没被 B 站认出来（可能过期或复制不全），重新复制一次 SESSDATA。'
            : '没有拿到字幕：B 站要登录才返回字幕。可以把浏览器里的 SESSDATA 存到 %USERPROFILE%\\.dsh\\guide-tutor\\bili-cookie.txt，或调用 video_cookie 保存。',
      }
    }
    return {
      ok: true,
      bvid: id,
      title: record.title,
      owner: record.owner,
      duration: record.duration,
      page: record.page,
      pageCount: record.pageCount,
      pageTitle: record.pageTitle,
      cid,
      cues: cues.length,
      loggedIn,
      subtitleLan: record.subtitleLan,
      retried: mismatch,
      keptNotes: Boolean(previous?.summary || (previous?.points || []).length),
      transcript: transcript.slice(0, 14000),
      totalChars: transcript.length,
      truncated: transcript.length > 14000,
      hint: transcript.length > 14000 ? `已经截断，用 video_transcript 从 offset 继续翻页` : '',
    }
  }

  async function videoNote(args = {}) {
    const id = String(args.bvid || '').trim()
    if (!id) throw new Error('缺少 bvid')
    const file = path.join(videoDir, `${id}.json`)
    if (!fs.existsSync(file)) throw new Error(`视频库里没有 ${id}`)
    const record = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (args.summary !== undefined) record.summary = String(args.summary)
    if (Array.isArray(args.points)) record.points = args.points.map((point) => String(point)).slice(0, 30)
    record.updatedAt = new Date().toISOString()
    saveVideoRecord(record)
    return { ok: true, bvid: id, summary: record.summary, points: record.points.length }
  }

  function videoRecall(args = {}) {
    const query = String(args.query || '').trim()
    if (!query) throw new Error('缺少 query')
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const limit = Math.max(1, Math.min(10, Number(args.limit) || 3))
    const scored = []
    for (const record of readVideoRecords()) {
      const haystackTitle = String(record.title || '').toLowerCase()
      const haystackSummary = `${record.summary || ''} ${(record.points || []).join(' ')}`.toLowerCase()
      let score = 0
      const hits = []
      for (const term of terms) {
        if (haystackTitle.includes(term)) score += 5
        if (haystackSummary.includes(term)) score += 3
        for (const cue of record.cues || []) {
          if (cue.text.toLowerCase().includes(term)) {
            score += 1
            if (hits.length < 12) hits.push(`[${videoStamp(cue.from)}] ${cue.text}`)
          }
        }
      }
      if (score > 0) {
        scored.push({
          bvid: record.bvid,
          title: record.title,
          owner: record.owner,
          duration: record.duration,
          summary: record.summary || '',
          score,
          hits: hits.slice(0, 8),
        })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return { ok: true, query, matches: scored.slice(0, limit) }
  }

  function videoList() {
    return {
      ok: true,
      count: readVideoRecords().length,
      videos: readVideoRecords().map((record) => ({
        bvid: record.bvid,
        title: record.title,
        owner: record.owner,
        duration: record.duration,
        learnedAt: record.learnedAt,
        cues: Array.isArray(record.cues) ? record.cues.length : 0,
        hasSummary: Boolean(record.summary),
      })),
    }
  }

  function readVideoRecord(id) {
    const key = String(id || '').trim()
    if (!key) throw new Error('缺少 bvid')
    const file = path.join(videoDir, `${key}.json`)
    if (!fs.existsSync(file)) throw new Error(`视频库里没有 ${key}`)
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }

  function videoTranscript(args = {}) {
    const record = readVideoRecord(args.bvid)
    const cues = Array.isArray(record.cues) ? record.cues : []
    const offset = Math.max(0, Number(args.offset) || 0)
    const maxChars = Math.max(500, Math.min(20000, Number(args.maxChars) || 8000))
    let text = ''
    let index = offset
    while (index < cues.length) {
      const line = `[${videoStamp(cues[index].from)}] ${cues[index].text}`
      if (text && text.length + line.length + 1 > maxChars) break
      text += (text ? '\n' : '') + line
      index += 1
    }
    return {
      ok: true,
      bvid: record.bvid,
      title: record.title,
      total: cues.length,
      offset,
      nextOffset: index < cues.length ? index : null,
      text,
    }
  }

  function videoShow(args = {}) {
    const record = readVideoRecord(args.bvid)
    return {
      ok: true,
      bvid: record.bvid,
      title: record.title,
      owner: record.owner,
      duration: record.duration,
      page: record.page || 1,
      pageCount: record.pageCount || 1,
      pageTitle: record.pageTitle || '',
      url: record.url,
      learnedAt: record.learnedAt,
      subtitleLan: record.subtitleLan || '',
      cues: Array.isArray(record.cues) ? record.cues.length : 0,
      summary: record.summary || '',
      points: Array.isArray(record.points) ? record.points : [],
      desc: record.desc || '',
    }
  }

  function videoForget(args = {}) {
    const id = String(args.bvid || '').trim()
    if (!id) throw new Error('缺少 bvid')
    let removed = 0
    for (const ext of ['json', 'md']) {
      const file = path.join(videoDir, `${id}.${ext}`)
      if (fs.existsSync(file)) {
        fs.rmSync(file, { force: true })
        removed += 1
      }
    }
    if (removed === 0) throw new Error(`视频库里没有 ${id}`)
    broadcast('video', { removed: id })
    return { ok: true, bvid: id, removed }
  }

  function videoCookie(args = {}) {
    const raw = String(args.cookie || '').trim()
    if (!raw) throw new Error('缺少 cookie')
    const value = /^SESSDATA=/i.test(raw) ? raw : `SESSDATA=${raw}`
    fs.writeFileSync(path.join(dataDir, 'bili-cookie.txt'), `${value}\n`, 'utf8')
    log('bili cookie saved')
    return { ok: true, saved: true, masked: `${value.slice(0, 14)}…` }
  }

  const videoLearnTool = {
    name: 'video_learn',
    description:
      '学习一个 B 站视频并存入独立的视频库（不是教学知识库）：取标题/UP/时长与字幕全文，返回带时间戳的转写文本。拿到转写后自己总结，再调用 video_note 把摘要和要点写回这条视频记录。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'B 站视频链接或 BV 号' },
        cookie: { type: 'string', description: '可选：B 站 Cookie（SESSDATA=...），不填则用数据目录里的 bili-cookie.txt' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: value.cues
            ? `已收录：${value.title}（${videoStamp(value.duration)}，${value.cues} 条字幕）。\n\n${value.transcript ?? ''}${value.truncated ? '\n\n（已截断，用 video_transcript 从 offset 继续）' : ''}`
            : `已记录：${value.title}，但没有拿到字幕。${value.note ?? ''}`,
        },
      ],
    },
    async execute(args = {}) {
      return await videoLearn(args)
    },
  }

  const videoNoteTool = {
    name: 'video_note',
    description: '把摘要和要点写回视频库里的某条视频记录（配合 video_learn 使用），之后用 video_recall 就能想起来。',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: 'video_learn 返回的 bvid' },
        summary: { type: 'string', description: '两三句话的摘要' },
        points: { type: 'array', items: { type: 'string' }, description: '要点列表，每条一句话' },
      },
      required: ['bvid'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: `已更新 ${value.bvid}：摘要 ${value.summary ? '有' : '无'}，要点 ${value.points} 条。` }],
    },
    async execute(args = {}) {
      return await videoNote(args)
    },
  }

  const videoRecallTool = {
    name: 'video_recall',
    description: '在视频库里按关键词回忆：搜标题、摘要、要点和字幕原文，返回命中的视频与带时间戳的片段。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词，空格分隔多个词' },
        limit: { type: 'integer', description: '最多返回几条，默认 3' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: value.matches.length
            ? value.matches
                .map((match) => `${match.title}（${match.bvid}）命中 ${match.hits.length} 段${match.summary ? `\n  摘要：${match.summary.slice(0, 80)}` : ''}`)
                .join('\n')
            : `视频库里没有和「${value.query}」相关的内容。`,
        },
      ],
    },
    async execute(args = {}) {
      return videoRecall(args)
    },
  }

  const videoListTool = {
    name: 'video_list',
    description: '列出视频库里已收录的视频（标题、UP、时长、是否已写摘要）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        { type: 'text', text: value.count ? `视频库共 ${value.count} 条：\n` + value.videos.map((v) => `- ${v.title}（${v.bvid}）${v.cues} 条字幕`).join('\n') : '视频库还是空的。' },
      ],
    },
    async execute() {
      return videoList()
    },
  }

  const videoTranscriptTool = {
    name: 'video_transcript',
    description: '分页读取视频库里某条视频的字幕全文（带时间戳）。长视频用 nextOffset 继续翻页。',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string' },
        offset: { type: 'integer', description: '从第几条字幕开始，默认 0' },
        maxChars: { type: 'integer', description: '本次最多返回多少字符，默认 8000' },
      },
      required: ['bvid'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: `${value.title}：第 ${value.offset}~${value.offset + (value.text ? value.text.split('\n').length : 0)} 条 / 共 ${value.total} 条${value.nextOffset !== null ? `，下一页 offset=${value.nextOffset}` : '，已到末尾'}\n\n${value.text}`,
        },
      ],
    },
    async execute(args = {}) {
      return videoTranscript(args)
    },
  }

  const videoShowTool = {
    name: 'video_show',
    description: '查看视频库里某条视频的详情：标题、UP、分P、字幕条数、摘要和要点。',
    parameters: {
      type: 'object',
      properties: { bvid: { type: 'string' } },
      required: ['bvid'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: `${value.title}（${value.owner || '未知 UP'}，${videoStamp(value.duration)}，${value.cues} 条字幕）\n摘要：${value.summary || '（还没写）'}\n要点：${value.points.length} 条`,
        },
      ],
    },
    async execute(args = {}) {
      return videoShow(args)
    },
  }

  const videoForgetTool = {
    name: 'video_forget',
    description: '从视频库里删除一条视频记录（同时删掉它的 .json 和 .md）。',
    parameters: {
      type: 'object',
      properties: { bvid: { type: 'string' } },
      required: ['bvid'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: `已从视频库删除 ${value.bvid}` }],
    },
    async execute(args = {}) {
      return videoForget(args)
    },
  }

  // B 站搜索：和取字幕共用 WBI 签名。接口比取字幕更容易触发风控，所以加了节流
  // （两次搜索至少间隔 4 秒）和结果裁剪（默认只回 8 条，读完再挑）。
  let lastSearchAt = 0
  const SEARCH_COOLDOWN_MS = 4000

  function parseDurationText(text) {
    const parts = String(text || '')
      .split(':')
      .map((part) => Number(part) || 0)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  async function videoSearch(args = {}) {
    const keyword = String(args.keyword || '').trim()
    if (!keyword) throw new Error('缺少 keyword')
    const wait = SEARCH_COOLDOWN_MS - (Date.now() - lastSearchAt)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastSearchAt = Date.now()
    const cookie = biliCookie()
    const page = Math.max(1, Math.min(10, Number(args.page) || 1))
    const order = ['totalrank', 'click', 'pubdate', 'dm', 'stow'].includes(String(args.order))
      ? String(args.order)
      : 'totalrank'
    const limit = Math.max(1, Math.min(15, Number(args.limit) || 8))
    let data
    try {
      const mixin = await biliWbiMixin(cookie)
      const signed = biliSignParams({ search_type: 'video', keyword, page, order }, mixin)
      data = await biliApi(`https://api.bilibili.com/x/web-interface/wbi/search/type?${signed}`, cookie)
    } catch (error) {
      const message = String(error?.message ?? error)
      log(`search failed: ${message}`)
      if (/-412|-352/.test(message)) {
        throw new Error('B 站风控拦了这次搜索（-412），等一两分钟再试，或者确认 bili-cookie.txt 里的登录态还有效。')
      }
      throw new Error(`搜索失败：${message}`)
    }
    const list = Array.isArray(data?.result) ? data.result : []
    const items = list
      .filter((item) => item?.bvid)
      .slice(0, limit)
      .map((item) => ({
        bvid: item.bvid,
        title: String(item.title || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&'),
        author: item.author || '',
        duration: parseDurationText(item.duration),
        durationText: item.duration || '',
        play: Number(item.play) || 0,
        danmaku: Number(item.video_review) || 0,
        pubdate: Number(item.pubdate) || 0,
        description: String(item.description || '').slice(0, 80),
      }))
    return {
      ok: true,
      keyword,
      page,
      order,
      total: Number(data?.numResults) || items.length,
      count: items.length,
      items,
    }
  }

  const videoSearchTool = {
    name: 'video_search',
    description:
      '在 B 站按关键词搜视频（需要 bili-cookie.txt 里的登录态）。返回 BV 号、标题、UP 主、时长、播放量；挑中一条再调用 video_learn 抓字幕。默认只回 8 条，按播放量/最新排序可传 order。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词' },
        page: { type: 'integer', description: '页码，默认 1，最多 10' },
        order: { type: 'string', description: '排序：totalrank 综合（默认）/ click 播放 / pubdate 最新 / dm 弹幕 / stow 收藏' },
        limit: { type: 'integer', description: '返回几条，默认 8，最多 15' },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: value.count
            ? `${value.keyword}：共 ${value.total} 条，返回前 ${value.count} 条\n` +
              value.items
                .map((item) => `- ${item.title}（${item.bvid}，${item.durationText}，播放 ${item.play}）UP：${item.author}`)
                .join('\n')
            : `没搜到「${value.keyword}」`,
        },
      ],
    },
    async execute(args = {}) {
      return videoSearch(args)
    },
  }

  const videoCookieTool = {
    name: 'video_cookie',
    description:
      '保存 B 站登录 Cookie（SESSDATA）到数据目录的 bili-cookie.txt，供 video_learn 取字幕用。只需传 SESSDATA 的值或整条 SESSDATA=xxx。',
    parameters: {
      type: 'object',
      properties: { cookie: { type: 'string', description: 'SESSDATA 的值，或完整的 SESSDATA=xxx' } },
      required: ['cookie'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: `已保存 B 站 Cookie（${value.masked}），之后 video_learn 会带上它。` }],
    },
    async execute(args = {}) {
      return videoCookie(args)
    },
  }

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
      videos: readVideoRecords().length,
      kb: kbListFiles(),
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
  var API = location.pathname.replace(/\/+$/, '');
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
  ctx.effect(() => ctx.tools.register(guideScreenTool))
  ctx.effect(() => ctx.tools.register(guideTeachTool))
  ctx.effect(() => ctx.tools.register(guideKbTool))
  ctx.effect(() => ctx.tools.register(guideSayTool))
  ctx.effect(() => ctx.tools.register(guideOverlayTool))
  ctx.effect(() => ctx.tools.register(guideFinishTool))
  ctx.effect(() => ctx.tools.register(guideClockTool))
  ctx.effect(() => ctx.tools.register(guideJournalTool))
  ctx.effect(() => ctx.tools.register(guideCameraTool))
  ctx.effect(() => ctx.tools.register(guideDirectiveTool))
  ctx.effect(() => ctx.tools.register(guideFocusTool))
  ctx.effect(() => ctx.tools.register(videoLearnTool))
  ctx.effect(() => ctx.tools.register(videoSearchTool))
  ctx.effect(() => ctx.tools.register(videoNoteTool))
  ctx.effect(() => ctx.tools.register(videoRecallTool))
  ctx.effect(() => ctx.tools.register(videoListTool))
  ctx.effect(() => ctx.tools.register(videoTranscriptTool))
  ctx.effect(() => ctx.tools.register(videoShowTool))
  ctx.effect(() => ctx.tools.register(videoForgetTool))
  ctx.effect(() => ctx.tools.register(videoCookieTool))
  ctx.effect(() => ctx.tools.register(guidePlanTool))
  ctx.effect(() =>
    ctx.systemPrompt.section({ name: 'guide-tutor', order: 900, text: TUTOR_PROMPT }),
  )

  ctx.effect(() => {
    const poll = setInterval(pollEvents, 300)
    if (config.autoStart !== false) startOverlay()
    // 启动即对齐：把 plan.json 的当前状态推给悬浮层，避免卡片显示上一次的旧清单。
    try {
      pushPlanState(planForToday())
    } catch (error) {
      log(`plan state sync failed: ${error?.message ?? error}`)
    }
    // 启动时把历史汇总写一遍：老归档也能立刻出现在「历史」窗里。
    try {
      writePlanHistoryFile()
    } catch (error) {
      log(`plan history sync failed: ${error?.message ?? error}`)
    }
    let tickTimer = null
    if (ticker.enabled) {
      ticker.startedAt = new Date().toISOString()
      registerTickHandler(() => {
        try {
          checkSchedule(new Date())
        } catch (error) {
          log(`schedule check failed: ${error?.message ?? error}`)
        }
      })
      registerTickHandler(() => {
        cameraTick().catch((error) => log(`camera tick failed: ${error?.message ?? error}`))
      })
      registerTickHandler(() => {
        try {
          edictTick(new Date())
        } catch (error) {
          log(`edict tick failed: ${error?.message ?? error}`)
        }
      })
      registerTickHandler(() => {
        focusTick(new Date()).catch((error) => log(`focus tick failed: ${error?.message ?? error}`))
      })
      registerTickHandler(() => {
        try {
          planTick(new Date())
        } catch (error) {
          log(`plan tick failed: ${error?.message ?? error}`)
        }
      })
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
