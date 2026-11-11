import fs from 'node:fs'
import path from 'node:path'

export function createPlan({
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
  speak,
}) {
  const planPath = path.join(dataDir, 'plan.json')
  const planStatePath = path.join(dataDir, 'plan-state.json')
  const planArchiveDir = path.join(dataDir, 'plan-archive')
  const planHistoryPath = path.join(dataDir, 'plan-history.json')
  const planLaterPath = path.join(dataDir, 'plan-later.json')
  const planDeletedPath = path.join(dataDir, 'plan-deleted.json')
  const planRepeatsPath = path.join(dataDir, 'plan-repeats.json')
  const planTemplatesPath = path.join(dataDir, 'plan-templates.json')
  const PLAN_DELETED_TTL_MS = 24 * 60 * 60 * 1000

  // 今天课表的文字摘要（GuidePlan auto 与指令语气都用它）。
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
      ? rest.map((item) => `${item.start} ${item.course}${item.room ? `@${item.room}` : ''}`).join('，')
      : '今天的课都上完了'
    return `${passed > 0 ? `已上 ${passed} 节，` : ''}接下来：${restText}`
  }
  const REPEAT_LABEL = { daily: '每天', weekdays: '工作日', weekly: '每周' }

  // B02：划掉的条目不直接消失，留 24 小时可撤回（guide_plan action=restore）。
  function readPlanDeleted() {
    try {
      const data = JSON.parse(fs.readFileSync(planDeletedPath, 'utf8'))
      const items = Array.isArray(data?.items) ? data.items : []
      const cutoff = Date.now() - PLAN_DELETED_TTL_MS
      return items.filter((item) => {
        const at = Date.parse(String(item?.deletedAt || ''))
        return Number.isFinite(at) && at >= cutoff
      })
    } catch {
      return []
    }
  }

  function writePlanDeleted(items) {
    try {
      fs.writeFileSync(planDeletedPath, JSON.stringify({ items }, null, 2), 'utf8')
    } catch (error) {
      log(`plan-deleted write failed: ${error?.message ?? error}`)
    }
  }

  const PLAN_TONE = {
    strict: '严厉，短句，不容商量',
    normal: '正常，像同学提醒一句',
    buddy: '损友口吻，可以损两句但不刻薄',
    minimal: '极简，只说时间和事，不超过 12 个字',
  }

  function planToneText() {
    const key = String(edict.config().tone || 'normal')
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
            note: String(item?.note || '').trim(),
            priority: normalizePriority(item?.priority),
            repeat: normalizeRepeat(item?.repeat),
            repeatRuleId: item?.repeatRuleId ? String(item.repeatRuleId) : '',
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

  // 不是今天的条目先存 plan-later.json，当天第一次读清单时并进来。
  function readPlanLater() {
    try {
      const data = JSON.parse(fs.readFileSync(planLaterPath, 'utf8'))
      return Array.isArray(data?.items) ? data.items : []
    } catch {
      return []
    }
  }

  function writePlanLater(items) {
    try {
      fs.writeFileSync(planLaterPath, JSON.stringify({ items }, null, 2), 'utf8')
    } catch (error) {
      log(`plan later write failed: ${error?.message ?? error}`)
    }
  }

  function takePlanLaterFor(date) {
    const all = readPlanLater()
    const usable = (item) => item?.date === date && String(item?.title || '').trim()
    const mine = all.filter(usable)
    if (!mine.length) return []
    writePlanLater(all.filter((item) => !usable(item)))
    return mine.map((item, index) => ({
      id: String(item.id || `t${Date.now().toString(36)}${index}`),
      from: String(item.from || ''),
      to: String(item.to || ''),
      place: String(item.place || ''),
      title: String(item.title || '').slice(0, 40),
      goalId: item.goalId ? String(item.goalId) : '',
      note: String(item.note || ''),
      priority: normalizePriority(item.priority),
      repeat: normalizeRepeat(item.repeat),
      repeatRuleId: item.repeatRuleId ? String(item.repeatRuleId) : '',
      done: false,
      doneAt: null,
      remindedAt: null,
      nudgedAt: null,
    }))
  }

  // 跨天自动归旧：昨天的清单进 plan-archive/，今天重新开始。
  function planForToday(now = new Date()) {
    const today = todayKey(now)
    const plan = readPlanFile()
    if (plan.date && plan.date < today) {
      archivePlan(plan)
      const fresh = { date: today, items: takePlanLaterFor(today) }
      materializeRepeats(fresh)
      savePlanFile(fresh)
      // 换天要立刻推给悬浮层，否则卡片还挂着昨天那几条（isToday 也会是错的）。
      try { pushPlanState(fresh) } catch (error) { log(`plan push after rollover failed: ${error?.message ?? error}`) }
      return fresh
    }
    if (!plan.date) plan.date = today
    const carry = takePlanLaterFor(today)
    if (carry.length) plan.items.push(...carry)
    const repeated = materializeRepeats(plan)
    if (carry.length || repeated) savePlanFile(plan)
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

  let planState = { buildPromptedFor: '', buildAttemptAt: '', buildFailedNoteFor: '' }
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

  // 清单优先级：P0 最急、P3 可以缓；只给颜色和排序用，不影响时间轴。
  function normalizePriority(value) {
    const raw = String(value || '').trim().toLowerCase()
    if (!raw) return ''
    const table = {
      p0: 'P0', '0': 'P0', 最高: 'P0',
      p1: 'P1', '1': 'P1', 高: 'P1',
      p2: 'P2', '2': 'P2', 中: 'P2',
      p3: 'P3', '3': 'P3', 低: 'P3',
    }
    return table[raw] || ''
  }

  // F03：重复任务。规则单独存 plan-repeats.json，每天由 materializeRepeats 铺进清单；
  // 条目只带 repeatRuleId 指回规则，删掉某一天不会把规则一起带走。
  function normalizeRepeat(value) {
    const raw = String(value || '').trim().toLowerCase()
    const table = {
      daily: 'daily', 每天: 'daily', everyday: 'daily',
      weekdays: 'weekdays', 工作日: 'weekdays', weekday: 'weekdays',
      weekly: 'weekly', 每周: 'weekly', week: 'weekly',
    }
    return table[raw] || ''
  }

  function readRepeatRules() {
    try {
      const data = JSON.parse(fs.readFileSync(planRepeatsPath, 'utf8'))
      return Array.isArray(data?.rules) ? data.rules : []
    } catch {
      return []
    }
  }

  function writeRepeatRules(rules) {
    try {
      fs.writeFileSync(planRepeatsPath, JSON.stringify({ rules }, null, 2), 'utf8')
    } catch (error) {
      log(`plan repeat write failed: ${error?.message ?? error}`)
    }
  }

  function repeatDayOf(dateKey) {
    const d = new Date(`${dateKey}T12:00:00`)
    return Number.isFinite(d.getTime()) ? d.getDay() : new Date().getDay()
  }

  function repeatDue(rule, dateKey) {
    const mode = normalizeRepeat(rule?.repeat)
    if (!mode) return false
    const dow = repeatDayOf(dateKey)
    if (mode === 'daily') return true
    if (mode === 'weekdays') return dow >= 1 && dow <= 5
    return dow === (Number(rule?.repeatDay) || 0)
  }

  // 把今天该出现的重复任务补进清单；已经有的（repeatRuleId 相同）跳过，幂等。
  function materializeRepeats(plan) {
    const rules = readRepeatRules()
    if (!rules.length) return false
    const date = plan.date || todayKey(new Date())
    let changed = false
    for (const rule of rules) {
      if (!rule?.id || !repeatDue(rule, date)) continue
      if (plan.items.some((item) => item.repeatRuleId === rule.id)) continue
      plan.items.push({
        id: `t${Date.now().toString(36)}${String(rule.id).slice(-3)}`,
        from: String(rule.from || ''),
        to: String(rule.to || ''),
        place: String(rule.place || ''),
        title: String(rule.title || ''),
        goalId: rule.goalId ? String(rule.goalId) : '',
        note: String(rule.note || ''),
        priority: normalizePriority(rule.priority),
        repeat: normalizeRepeat(rule.repeat),
        repeatRuleId: String(rule.id),
        done: false,
        doneAt: null,
        remindedAt: null,
        nudgedAt: null,
      })
      changed = true
    }
    if (changed) plan.items.sort((a, b) => (planMinutes(a.from) ?? 9999) - (planMinutes(b.from) ?? 9999))
    return changed
  }

  function readTemplates() {
    try {
      const data = JSON.parse(fs.readFileSync(planTemplatesPath, 'utf8'))
      return data?.templates && typeof data.templates === 'object' ? data.templates : {}
    } catch {
      return {}
    }
  }

  function writeTemplates(templates) {
    try {
      fs.writeFileSync(planTemplatesPath, JSON.stringify({ templates }, null, 2), 'utf8')
    } catch (error) {
      log(`plan template write failed: ${error?.message ?? error}`)
    }
  }

  function dayKeyWithOffset(offset) {
    const d = new Date()
    d.setDate(d.getDate() + Number(offset || 0))
    return todayKey(d)
  }

  // 模板是「某一天清单的快照」：今天取当前清单，未来取 plan-later，过去取归档。
  function itemsForDate(date) {
    const today = todayKey(new Date())
    if (date === today) return planForToday().items
    if (date > today) return readPlanLater().filter((item) => item?.date === date)
    try {
      const archived = JSON.parse(fs.readFileSync(path.join(planArchiveDir, `${date}.json`), 'utf8'))
      return Array.isArray(archived?.items) ? archived.items : []
    } catch {
      return []
    }
  }

  function planItemLine(item) {
    const span = item.from ? `${item.from}${item.to ? `–${item.to}` : ''}` : '随时'
    const tag = item.priority ? `[${item.priority}] ` : ''
    const note = item.note ? `（${item.note}）` : ''
    const rep = item.repeat ? ` ↻${REPEAT_LABEL[item.repeat] || ''}` : ''
    return `${item.done ? '☑' : '☐'} ${tag}${span}${item.place ? ` @${item.place}` : ''} ${item.title}${note}${rep}`
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
    // 只有真正把提示送进主会话才记 buildPromptedFor；DSH 刚启动、用户还没
    // 打开对话时 pickAgent() 会返回空，这时候 5 分钟后重试，别把这一天直接放弃。
    const today = todayKey(now)
    if (isToday && !plan.items.length && planState.buildPromptedFor !== today) {
      const lastTry = Date.parse(planState.buildAttemptAt || '')
      const waitMs = 5 * 60 * 1000
      if (!Number.isFinite(lastTry) || now.getTime() - lastTry >= waitMs) {
        planState.buildAttemptAt = now.toISOString()
        savePlanState()
        if (wakePlan(planBuildPrompt(now, '今天'))) {
          planState.buildPromptedFor = today
          savePlanState()
        } else if (planState.buildFailedNoteFor !== today) {
          planState.buildFailedNoteFor = today
          savePlanState()
          appendDaylog('note', '计划排程这次没叫起来：DSH 里还没有打开的对话，5 分钟后重试。')
        }
      }
    }
  }

  async function planRun(args = {}) {
    const action = String(args.action || 'list')
    if (action === 'add') {
      const text = String(args.text || '').trim()
      let title = String(args.title || '').trim()
      let fromArg = args.from
      let toArg = args.to
      let placeArg = args.place
      let noteArg = String(args.note || '').trim()
      const priorityArg = normalizePriority(args.priority)
      const repeatArg = normalizeRepeat(args.repeat)
      let parsed = null
      if (!title && text) {
        parsed = parsePlanText(text)
        title = parsed.title
        if (!parsed.ok) {
          return {
            ok: false,
            error: '这句话没解析出完整时间，先别写进清单',
            need: parsed.missing,
            parsed,
          }
        }
        fromArg = fromArg || parsed.from
        toArg = toArg || parsed.to
        placeArg = placeArg || parsed.place
      }
      if (text && !noteArg) {
        // 「带电脑、课本」这种从原话里拣出来，标题里不再重复。
        const hit = /(?:^|[，,。；;])\s*带\s*([^，,。；;]{1,24})/.exec(text)
        if (hit) {
          noteArg = hit[1].trim()
          title = title.replace(/[，,。；;]?\s*带\s*[^，,。；;]{1,24}/, '').trim()
        }
      }
      if (!title) return { ok: false, error: 'title 不能为空' }
      // 不是今天的事先记到 plan-later.json，当天第一次读清单时再并进来。
      if (parsed && parsed.date !== todayKey(new Date())) {
        const id = `f${Date.now().toString(36)}`
        const items = readPlanLater()
        items.push({
          id,
          date: parsed.date,
          from: parsed.from,
          to: parsed.to,
          place: parsed.place,
          title: title.slice(0, 40),
          goalId: args.goalId ? String(args.goalId) : '',
          note: noteArg.slice(0, 40),
          priority: priorityArg,
        })
        writePlanLater(items)
        appendDaylog('note', `清单记到 ${parsed.date}：${parsed.from || '随时'} ${title.slice(0, 20)}`)
        return {
          ok: true,
          later: true,
          date: parsed.date,
          id,
          plan: `${parsed.date} 先记下了：${parsed.from || '随时'}${parsed.place ? ` @${parsed.place}` : ''} ${title.slice(0, 40)}。当天打开清单会自动并入。`,
        }
      }
      // 番茄钟：把开始时间吸到最近的整点/半点，结束固定 +25 分钟，后 5 分钟休息。
      // 一句话解析来的时间不吸附，用户说几点就是几点。
      const rawFrom = planMinutes(fromArg)
      let slot = null
      if (rawFrom !== null) {
        if (parsed) {
          slot = rawFrom
        } else {
          slot = Math.floor(rawFrom / 30) * 30
          if (rawFrom - slot >= 25) slot += 30
          // 时间轴画到 22:30（他一般十点半收工），再晚的条目会落在卡片外面，收进最后一格。
          const planDayEnd = 22 * 60 + 30
          if (slot >= planDayEnd) slot = 22 * 60
        }
      }
      const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
      // 显式给了 from+to 且跨度大于一个番茄钟（比如整节课 08:30–10:10），按真实区间存，
      // 不再强拗成 25 分钟——卡片的时间轴是按真实时长画的。
      const rawTo = planMinutes(toArg)
      // 只要用户/模型明确给了 from 和 to（to 在 from 之后），就按真实区间存，不再往番茄钟上拗；
      // 只给 from 才走"吸附到整点/半点 + 25 分钟"那套。卡片上的「＋」是手填时间，必须原样落。
      const explicitSpan = rawFrom !== null && rawTo !== null && rawTo > rawFrom
      if (explicitSpan) {
        slot = rawFrom
      }
      const from = slot === null ? '' : hhmm(slot)
      const to = slot === null ? '' : hhmm(explicitSpan ? rawTo : slot + 25)
      if (repeatArg && parsed && parsed.date !== todayKey(new Date())) {
        return { ok: false, error: '重复任务只支持从今天开始；先记到当天，再在当天设重复' }
      }
      // 先取今天的清单，再写规则：否则 materializeRepeats 会先铺一条，下面又 push 一条。
      const plan = planForToday()
      let repeatRuleId = ''
      if (repeatArg) {
        repeatRuleId = `r${Date.now().toString(36)}`
        const rules = readRepeatRules()
        rules.push({
          id: repeatRuleId,
          repeat: repeatArg,
          repeatDay: new Date().getDay(),
          from,
          to,
          place: String(placeArg || '').trim(),
          title: title.slice(0, 40),
          goalId: args.goalId ? String(args.goalId) : '',
          note: noteArg.slice(0, 40),
          priority: priorityArg,
        })
        writeRepeatRules(rules)
      }
      const id = `t${Date.now().toString(36)}`
      plan.items.push({
        id,
        from,
        to,
        place: String(placeArg || '').trim(),
        title: title.slice(0, 40),
        goalId: args.goalId ? String(args.goalId) : '',
        note: noteArg.slice(0, 40),
        priority: priorityArg,
        repeat: repeatArg,
        repeatRuleId,
        done: false,
        doneAt: null,
        remindedAt: null,
        nudgedAt: null,
      })
      plan.items.sort((a, b) => (planMinutes(a.from) ?? 9999) - (planMinutes(b.from) ?? 9999))
      savePlanFile(plan)
      pushPlanState(plan)
      // DSH 的工具返回值走 lossless JSON 序列化，值为 undefined 的键会让整个结果报
      // "value is not lossless JSON"（虽然清单已经写盘）。parsed 不存在时干脆不放这个键。
      const result = { ok: true, id, plan: planSummary(plan) }
      if (parsed) result.parsed = parsed
      if (repeatArg) result.repeat = REPEAT_LABEL[repeatArg]
      return result
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
      if (args.note !== undefined) item.note = String(args.note || '').trim().slice(0, 40)
      if (args.priority !== undefined) item.priority = normalizePriority(args.priority)
      if (args.repeat !== undefined) {
        const next = normalizeRepeat(args.repeat)
        if (next && !item.repeatRuleId) {
          item.repeatRuleId = `r${Date.now().toString(36)}`
          const rules = readRepeatRules()
          rules.push({
            id: item.repeatRuleId,
            repeat: next,
            repeatDay: new Date().getDay(),
            from: item.from,
            to: item.to,
            place: item.place,
            title: item.title,
            goalId: item.goalId,
            note: item.note,
            priority: item.priority,
          })
          writeRepeatRules(rules)
        } else if (item.repeatRuleId && !next) {
          writeRepeatRules(readRepeatRules().filter((r) => r.id !== item.repeatRuleId))
          item.repeatRuleId = ''
        } else if (item.repeatRuleId) {
          const rules = readRepeatRules()
          const rule = rules.find((r) => r.id === item.repeatRuleId)
          if (rule) {
            rule.repeat = next
            writeRepeatRules(rules)
          }
        }
        item.repeat = next
      }
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
      // 改了内容就同步回规则，明天生成的是新版本，不是旧标题。
      if (item.repeatRuleId) {
        const rules = readRepeatRules()
        const rule = rules.find((r) => r.id === item.repeatRuleId)
        if (rule) {
          Object.assign(rule, {
            from: item.from,
            to: item.to,
            place: item.place,
            title: item.title,
            goalId: item.goalId,
            note: item.note,
            priority: item.priority,
          })
          writeRepeatRules(rules)
        }
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
      const item = plan.items.find((it) => it.id === id)
      if (!item) return { ok: false, error: `没有 id=${id} 这一项` }
      plan.items = plan.items.filter((it) => it.id !== id)
      if (item.repeatRuleId) writeRepeatRules(readRepeatRules().filter((r) => r.id !== item.repeatRuleId))
      savePlanFile(plan)
      pushPlanState(plan)
      const deleted = readPlanDeleted()
      deleted.push({
        ...item,
        deletedAt: new Date().toISOString(),
        deletedFrom: plan.date || todayKey(new Date()),
      })
      writePlanDeleted(deleted)
      const full = `${item.from || '随时'}${item.to ? `-${item.to}` : ''}${item.place ? ` @${item.place}` : ''} ${item.title}`
      const repeatNote = item.repeatRuleId ? '（同时取消重复）' : ''
      appendDaylog('note', args.note ? `清单划掉：${args.note}｜${full}${repeatNote}` : `清单划掉：${full}${repeatNote}`, {
        item: { id: item.id, from: item.from, to: item.to, place: item.place, title: item.title },
      })
      return {
        ok: true,
        plan: planSummary(plan),
        removed: { id: item.id, from: item.from, to: item.to, place: item.place, title: item.title },
        repeatRemoved: Boolean(item.repeatRuleId),
        restoreHint: `24 小时内可用 guide_plan action=restore id=${item.id} 撤回`,
      }
    }
    if (action === 'restore') {
      const id = String(args.id || '')
      const deleted = readPlanDeleted()
      if (!id) {
        return {
          ok: true,
          recent: deleted.map((it) => ({
            id: it.id,
            from: it.from,
            to: it.to,
            place: it.place,
            title: it.title,
            deletedAt: it.deletedAt,
          })),
          hint: '给 id 就能恢复；只保留最近 24 小时的删除',
        }
      }
      const idx = deleted.findIndex((it) => String(it.id) === id)
      if (idx < 0) return { ok: false, error: `最近 24 小时没有 id=${id} 的删除记录` }
      const [dead] = deleted.splice(idx, 1)
      writePlanDeleted(deleted)
      const plan = planForToday()
      const restore = { ...dead }
      delete restore.deletedAt
      delete restore.deletedFrom
      // 规则可能已经被删了，别恢复出一条指向不存在规则的「重复」。
      if (restore.repeatRuleId && !readRepeatRules().some((r) => r.id === restore.repeatRuleId)) {
        restore.repeat = ''
        restore.repeatRuleId = ''
      }
      if (plan.items.some((it) => it.id === restore.id)) restore.id = `t${Date.now().toString(36)}`
      plan.items.push({
        ...restore,
        done: Boolean(restore.done),
        doneAt: restore.doneAt || null,
        remindedAt: null,
        nudgedAt: null,
      })
      plan.items.sort((a, b) => (planMinutes(a.from) ?? 9999) - (planMinutes(b.from) ?? 9999))
      savePlanFile(plan)
      pushPlanState(plan)
      appendDaylog('note', `清单恢复：${restore.from}-${restore.to} ${restore.title}`)
      return {
        ok: true,
        restored: { id: restore.id, from: restore.from, to: restore.to, place: restore.place, title: restore.title },
        plan: planSummary(plan),
      }
    }
    if (action === 'done' || action === 'undo') {
      const id = String(args.id || '')
      if (!setPlanItemDone(id, action === 'done')) return { ok: false, error: `没有 id=${id} 这一项` }
      return { ok: true, plan: planSummary() }
    }
    if (action === 'clear') {
      if (!args.confirm) {
        const plan = planForToday()
        return {
          ok: false,
          need: ['confirm'],
          error: `清空会一次删掉 ${plan.items.length} 条，确认请带 confirm=true`,
        }
      }
      const plan = planForToday()
      const deleted = readPlanDeleted()
      const nowIso = new Date().toISOString()
      for (const item of plan.items) {
        deleted.push({ ...item, deletedAt: nowIso, deletedFrom: plan.date || todayKey(new Date()) })
      }
      writePlanDeleted(deleted)
      plan.items = []
      savePlanFile(plan)
      pushPlanState(plan)
      appendDaylog('note', `清单清空：${deleted.length} 条可在 24 小时内 restore`)
      return { ok: true, plan: planSummary(), removed: deleted.length }
    }
    if (action === 'template_save') {
      const name = String(args.name || '').trim().slice(0, 20)
      if (!name) return { ok: false, error: '模板要有个名字（name）' }
      const date = args.date ? String(args.date) : dayKeyWithOffset(args.dayOffset)
      const source = itemsForDate(date)
      if (!source.length) return { ok: false, error: `${date} 的清单是空的，先加两条再存模板` }
      const items = source.map((item) => ({
        from: item.from,
        to: item.to,
        place: item.place,
        title: item.title,
        goalId: item.goalId,
        note: item.note,
        priority: normalizePriority(item.priority),
      }))
      const templates = readTemplates()
      templates[name] = { savedAt: new Date().toISOString(), date, items }
      writeTemplates(templates)
      appendDaylog('note', `清单模板「${name}」已存（${items.length} 条，来自 ${date}）`)
      return { ok: true, name, count: items.length, date, templates: Object.keys(templates), plan: `${name}：${items.length} 条（来自 ${date}）` }
    }
    if (action === 'template_apply') {
      const name = String(args.name || '').trim()
      const templates = readTemplates()
      const tpl = templates[name]
      if (!tpl) {
        return { ok: false, error: `没有叫「${name}」的模板`, templates: Object.keys(templates) }
      }
      const date = args.date ? String(args.date) : dayKeyWithOffset(args.dayOffset)
      const today = todayKey(new Date())
      const base = Date.now().toString(36)
      const fresh = []
      for (const [index, item] of (Array.isArray(tpl.items) ? tpl.items : []).entries()) {
        if (!item?.title) continue
        fresh.push({
          id: `t${base}${index}`,
          from: String(item.from || ''),
          to: String(item.to || ''),
          place: String(item.place || ''),
          title: String(item.title),
          goalId: item.goalId ? String(item.goalId) : '',
          note: String(item.note || ''),
          priority: normalizePriority(item.priority),
          repeat: '',
          repeatRuleId: '',
          done: false,
          doneAt: null,
          remindedAt: null,
          nudgedAt: null,
        })
      }
      if (date === today) {
        const plan = planForToday()
        plan.items.push(...fresh)
        plan.items.sort((a, b) => (planMinutes(a.from) ?? 9999) - (planMinutes(b.from) ?? 9999))
        savePlanFile(plan)
        pushPlanState(plan)
        appendDaylog('note', `清单套用模板「${name}」：${fresh.length} 条（今天）`)
        return { ok: true, name, applied: fresh.length, date, plan: planSummary(plan) }
      }
      const later = readPlanLater()
      later.push(...fresh.map((item) => ({ ...item, date })))
      writePlanLater(later)
      appendDaylog('note', `清单套用模板「${name}」：${fresh.length} 条 → ${date}`)
      return { ok: true, name, applied: fresh.length, date, plan: `已铺到 ${date}：${fresh.length} 条，那天第一次打开清单时会出现。` }
    }
    if (action === 'template_list') {
      const templates = readTemplates()
      return {
        ok: true,
        templates: Object.entries(templates).map(([name, tpl]) => ({
          name,
          count: Array.isArray(tpl?.items) ? tpl.items.length : 0,
          savedAt: String(tpl?.savedAt || ''),
        })),
      }
    }
    if (action === 'template_remove') {
      const name = String(args.name || '').trim()
      const templates = readTemplates()
      if (!templates[name]) return { ok: false, error: `没有叫「${name}」的模板` }
      delete templates[name]
      writeTemplates(templates)
      return { ok: true, name, templates: Object.keys(templates) }
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
      '「桌面清单」：把目标排成今天的清单（几点到几点、在哪、做什么），显示在桌面卡片上。list=看清单；add=加一条（from/to 用 HH:mm、place、title，或直接给 text 一句话；repeat 可设每天/工作日/每周）；remove=划掉（24 小时内可 restore；带 repeat 的条目会同时取消重复）；restore=撤回删掉的条目（不带 id 则列出最近删除）；done/undo=打勾；update=改条目的时间/标题/备注/优先级/重复；clear=清空（必须带 confirm=true）；show/hide=显示或收起卡片；auto=拿目标和课表去排；template_save=把某一天的清单存成模板（dayOffset 0=今天/1=明天/2=后天）；template_apply=把模板铺到指定日期（dayOffset 同上，未来日期到那天自动出现）；template_list/template_remove=列出/删掉模板。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'list / add / update / remove / restore / done / undo / clear / show / hide / auto / template_save / template_apply / template_list / template_remove' },
        id: { type: 'string', description: 'remove/restore/done/undo/update：条目 id' },
        from: { type: 'string', description: 'add/update：开始时间 HH:mm' },
        to: { type: 'string', description: 'add/update：结束时间 HH:mm' },
        text: { type: 'string', description: 'add：一句话加任务，如「明天下午三点在图书馆复习概率论」；解析成 from/to/place/title' },
        place: { type: 'string', description: 'add/update：地点，如 励志楼乙102 / 宿舍 / 实验室' },
        title: { type: 'string', description: 'add/update：做什么，≤18 字，具体到能动手' },
        goalId: { type: 'string', description: 'add：对应哪个目标（可选）' },
        note: { type: 'string', description: 'add/update：备注，如「带电脑、课本」；remove：为什么划掉' },
        priority: { type: 'string', description: 'add/update：优先级 P0/P1/P2/P3（可不填）' },
        repeat: { type: 'string', description: 'add/update：重复 daily（每天）/ weekdays（工作日）/ weekly（每周同一天），空字符串=不重复' },
        name: { type: 'string', description: 'template_*：模板名（≤20 字）' },
        dayOffset: { type: 'integer', description: 'template_*：目标日期偏移，0=今天、1=明天、2=后天（默认 0）' },
        date: { type: 'string', description: 'template_*：直接指定日期 YYYY-MM-DD（优先于 dayOffset）' },
        confirm: { type: 'boolean', description: 'clear：必须为 true 才真的清空' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => {
        if (value.error) {
          const need = Array.isArray(value.need) && value.need.length ? `（缺 ${value.need.join('、')}）` : ''
          return [{ type: 'text', text: `没成：${value.error}${need}` }]
        }
        if (Array.isArray(value.recent)) {
          const lines = value.recent.length
            ? value.recent
                .map((it) => `${it.from || '随时'}${it.to ? `-${it.to}` : ''}${it.place ? ` @${it.place}` : ''} ${it.title}（删除于 ${it.deletedAt}）`)
                .join('\n')
            : '最近 24 小时没有删除记录'
          return [{ type: 'text', text: `${value.hint}\n\n${lines}` }]
        }
        if (value.restored) {
          return [{ type: 'text', text: `已恢复：${value.restored.from}-${value.restored.to} ${value.restored.title}\n\n当前清单：\n${value.plan}` }]
        }
        if (Array.isArray(value.templates)) {
          const lines = value.templates.length
            ? value.templates
                .map((t) => (typeof t === 'string' ? `• ${t}` : `• ${t.name}（${t.count} 条）`))
                .join('\n')
            : '还没有模板'
          return [{ type: 'text', text: `${value.error ? `没成：${value.error}\n\n` : ''}${lines}` }]
        }
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

  return {
    tool: guidePlanTool,
    run: planRun,
    tick: planTick,
    forToday: planForToday,
    summary: planSummary,
    push: pushPlanState,
    history: planHistoryData,
    writeHistory: writePlanHistoryFile,
    setDone: setPlanItemDone,
  }
}
