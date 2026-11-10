import fs from 'node:fs'
import path from 'node:path'

export function createEdict({
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
}) {
  const edictStatePath = path.join(dataDir, 'edict-state.json')
  const edictLogPath = path.join(dataDir, 'directives.jsonl')
  const edictConfigPath = path.join(dataDir, 'edict.json')

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

  const tool = {
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

  return { tool, tick: edictTick, run: directiveRun, config: readEdictConfig, configPath: edictConfigPath }
}
