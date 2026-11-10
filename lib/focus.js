import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function createFocus({ dataDir, nativeDir, log, speak, readTimetable, minutesOf, hhmm }) {
  // 「专注环」：纯本地闹钟，不叫模型、不花 token。到点只说一句短话（TTS + 字幕）。
  // 说话之前先看键鼠空闲时间——人走开了就不对着空气说话；上课时间也不吵。
  const focusPath = path.join(dataDir, 'focus.json')
  const focusLogPath = path.join(dataDir, 'focus-log.jsonl')
  const idleScript = path.join(nativeDir, 'idle.ps1')
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
    speak(text)
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

  const tool = {
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

  return { tool, tick: focusTick, run: focusRun, statusText: focusStatusText }
}
