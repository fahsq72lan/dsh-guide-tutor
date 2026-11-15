// 杂务：每天那些「不做会积起来、做起来又不用动脑」的琐事。
// 洗衣服、洗澡、倒垃圾、剪指甲——它们不属于任何目标，但每天占了真实的时间。
// 这里只管两件事：记下来、按偏好时段塞进今天的空档。排不下的如实说「排不下」。

import fs from 'node:fs'
import path from 'node:path'

export const CHORE_WINDOWS = ['morning', 'noon', 'afternoon', 'evening', 'any']

export const WINDOW_LABEL = {
  morning: '上午',
  noon: '中午',
  afternoon: '下午',
  evening: '晚上',
  any: '随时',
}

// 每条杂务倾向落在哪个区间。晚上要洗澡、下午洗衣服，是生活里长出来的偏好。
export const WINDOW_RANGE = {
  morning: ['08:00', '11:00'],
  noon: ['11:30', '13:30'],
  afternoon: ['14:00', '18:00'],
  evening: ['19:00', '22:30'],
  any: ['09:00', '22:30'],
}

export const EVERY = ['daily', 'weekdays', 'weekly', 'every2', 'every3']

export const EVERY_LABEL = {
  daily: '每天',
  weekdays: '工作日',
  weekly: '每周',
  every2: '隔天',
  every3: '每三天',
}

const DEFAULT_MINUTES = 20
const GAP = 5 // 两条杂务之间留 5 分钟喘气
const DAY_END = '22:30'

export function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''))
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return h * 60 + mi
}

export function hhmm(minutes) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function dateKeyOf(value) {
  const d = value instanceof Date ? value : new Date(value)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function dayIndex(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

function weekdayIndex(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=周日
}

export function normalizeChore(raw, index = 0) {
  const src = raw && typeof raw === 'object' ? raw : { title: String(raw ?? '') }
  const title = String(src.title ?? src.text ?? '').trim()
  const id = String(src.id ?? '') || `c${index + 1}`
  const every = EVERY.includes(String(src.every)) ? String(src.every) : 'daily'
  const window = CHORE_WINDOWS.includes(String(src.window)) ? String(src.window) : 'any'
  let minutes = Number(src.minutes)
  if (!Number.isFinite(minutes) || minutes <= 0) minutes = DEFAULT_MINUTES
  minutes = Math.max(5, Math.min(180, Math.round(minutes)))
  const days = Array.isArray(src.days)
    ? src.days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : []
  const skip = Array.isArray(src.skip) ? src.skip.map((d) => String(d)) : []
  return {
    id,
    title,
    minutes,
    window,
    every,
    days,
    skip,
    lastDone: src.lastDone ? String(src.lastDone) : '',
    note: src.note ? String(src.note) : '',
  }
}

// 今天该不该做。every 是节律，skip 是「这几天先别排」。
export function dueToday(chore, dateKey) {
  if (!chore || !chore.title) return false
  if (chore.skip.includes(dateKey)) return false
  if (chore.every === 'daily') return true
  const wd = weekdayIndex(dateKey)
  if (chore.every === 'weekdays') return wd >= 1 && wd <= 5
  if (chore.every === 'weekly') return chore.days.length ? chore.days.includes(wd) : wd === 1
  const gap = chore.every === 'every2' ? 2 : chore.every === 'every3' ? 3 : 0
  if (!gap) return true
  if (!chore.lastDone) return true
  return Math.abs(dayIndex(dateKey) - dayIndex(chore.lastDone)) >= gap
}

function overlaps(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2
}

// 在偏好区间里给这条杂务找第一个空位；找不到返回 null。
function findSlot(chore, busy, cursor) {
  const range = WINDOW_RANGE[chore.window] ?? WINDOW_RANGE.any
  let start = Math.max(minutesOf(range[0]) ?? 0, cursor)
  const limit = Math.min(minutesOf(range[1]) ?? minutesOf(DAY_END), minutesOf(DAY_END))
  // 整点对齐看起来更像人排的
  start = Math.ceil(start / 5) * 5
  while (start + chore.minutes <= limit) {
    const end = start + chore.minutes
    const hit = busy.find((b) => overlaps(start, end, b.fromMin, b.toMin))
    if (!hit) return { from: start, to: end }
    start = Math.ceil((hit.toMin + GAP) / 5) * 5
  }
  return null
}

// 把今天该做的杂务排进空档。busy 是已经占了的时间（清单条目、已排的杂务）。
export function planChores({ chores, dateKey, nowMin = 0, busy = [], dayEnd = DAY_END }) {
  // 传进来的可能是裸对象（测试、外部调用），先按同一套规则规范化。
  const list = (Array.isArray(chores) ? chores : []).map((c, i) => normalizeChore(c, i))
  const todo = list.filter((c) => dueToday(c, dateKey))
  const busyList = busy
    .map((b) => ({ fromMin: minutesOf(b.from), toMin: minutesOf(b.to) }))
    .filter((b) => b.fromMin !== null && b.toMin !== null && b.toMin > b.fromMin)
  const items = []
  const skipped = []
  // 早做完早解脱：短的先排，长的往后放，避免一条 60 分钟的把整段吃掉。
  const ordered = [...todo].sort((a, b) => a.minutes - b.minutes)
  let cursor = Math.max(0, nowMin)
  for (const chore of ordered) {
    const slot = findSlot(chore, busyList, cursor)
    if (!slot) {
      skipped.push({ chore, reason: `${WINDOW_LABEL[chore.window] ?? '随时'}没有 ${chore.minutes} 分钟的空档` })
      continue
    }
    items.push({ chore, from: hhmm(slot.from), to: hhmm(slot.to), minutes: chore.minutes })
    busyList.push({ fromMin: slot.from, toMin: slot.to })
    cursor = slot.to + GAP
  }
  return { items, skipped, todo, dayEnd }
}

export function createChores({ dataDir, log = () => {} }) {
  const file = path.join(dataDir, 'chores.json')
  let cache = null

  function readRaw() {
    try {
      const text = fs.readFileSync(file, 'utf8')
      const data = JSON.parse(text)
      if (Array.isArray(data)) return { chores: data }
      if (data && Array.isArray(data.chores)) return data
      return { chores: [] }
    } catch {
      return { chores: [] }
    }
  }

  function read() {
    const raw = readRaw()
    const chores = raw.chores.map((c, i) => normalizeChore(c, i))
    // id 必须唯一，重复的按顺序补号
    const seen = new Set()
    for (const c of chores) {
      let id = c.id
      let n = 1
      while (seen.has(id)) {
        id = `${c.id}-${n++}`
      }
      c.id = id
      seen.add(id)
    }
    cache = { updatedAt: raw.updatedAt ?? null, chores }
    return cache
  }

  function save(chores) {
    const data = { updatedAt: new Date().toISOString(), chores }
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      log(`chores saved: ${chores.length}`)
      return true
    } catch (error) {
      log(`chores save failed: ${error?.message ?? error}`)
      return false
    }
  }

  function nextId(chores) {
    let n = chores.length + 1
    const used = new Set(chores.map((c) => c.id))
    while (used.has(`c${n}`)) n++
    return `c${n}`
  }

  return {
    file,
    read,
    save,
    list: () => read().chores,
    add(input = {}) {
      const current = read().chores
      const chore = normalizeChore({ ...input, id: input.id || nextId(current) }, current.length)
      const next = [...current, chore]
      if (!save(next)) return { ok: false, error: '写盘失败' }
      return { ok: true, chore }
    },
    update(id, patch = {}) {
      const current = read().chores
      const index = current.findIndex((c) => c.id === id)
      if (index < 0) return { ok: false, error: `没有 ${id}` }
      const merged = normalizeChore({ ...current[index], ...patch, id }, index)
      const next = current.slice()
      next[index] = merged
      if (!save(next)) return { ok: false, error: '写盘失败' }
      return { ok: true, chore: merged }
    },
    remove(id) {
      const current = read().chores
      const next = current.filter((c) => c.id !== id)
      if (next.length === current.length) return { ok: false, error: `没有 ${id}` }
      if (!save(next)) return { ok: false, error: '写盘失败' }
      return { ok: true, removed: current.find((c) => c.id === id) }
    },
    done(id, dateKey = dateKeyOf(new Date())) {
      return this.update(id, { lastDone: dateKey })
    },
    today(dateKey = dateKeyOf(new Date())) {
      return read().chores.filter((c) => dueToday(c, dateKey))
    },
  }
}
