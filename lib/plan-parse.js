// 一句话清单解析：把「明天下午三点在图书馆复习概率论」拆成
// date / from / to / place / title。纯规则，不联网、不调模型；
// 解析不出的部分原样留在 title 里，missing 交给调用方回显确认。

const WEEKDAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }
const CN = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

const pad2 = (n) => String(n).padStart(2, '0')

export function cnToNum(text) {
  const s = String(text || '').trim()
  if (!s) return null
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s)
  if (s === '半') return 0.5
  const ten = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(s)
  if (ten) {
    const a = ten[1] ? CN[ten[1]] : 1
    const b = ten[2] ? CN[ten[2]] : 0
    return a * 10 + b
  }
  if (s.length === 1 && CN[s] !== undefined) return CN[s]
  return null
}

const PERIOD_RE = /凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|今晚|夜里|半夜/

function dayInfo(text, now) {
  if (/大后天/.test(text)) return { offset: 3, matched: '大后天' }
  if (/后天/.test(text)) return { offset: 2, matched: '后天' }
  const tomorrow = /明天|明儿|明早|明晚/.exec(text)
  if (tomorrow) return { offset: 1, matched: tomorrow[0] }
  const today = /今天|今儿|今早|今晚/.exec(text)
  if (today) return { offset: 0, matched: today[0] }
  const week = /(下|这|本)?(?:周|星期|礼拜)([一二三四五六日天])/.exec(text)
  if (week) {
    const target = WEEKDAY[week[2]]
    let offset = target - now.getDay()
    if (offset < 0) offset += 7
    if (week[1] === '下') offset += 7
    return { offset, matched: week[0] }
  }
  const md = /(\d{1,2})月(\d{1,2})[日号]?/.exec(text)
  if (md) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let date = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]))
    if (date.getTime() < base.getTime()) date = new Date(now.getFullYear() + 1, Number(md[1]) - 1, Number(md[2]))
    return { offset: Math.round((date - base) / 86400000), matched: md[0] }
  }
  return { offset: null, matched: '' }
}

function timeInfo(text, now) {
  const relMin = /(\d{1,3}|半|[一二两三四五六七八九十]+)\s*分钟后/.exec(text)
  if (relMin) {
    const n = cnToNum(relMin[1])
    if (n !== null) {
      const d = new Date(now.getTime() + n * 60000)
      return { from: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, to: null, matched: [relMin[0]], exact: true }
    }
  }
  const relHour = /(\d{1,3}|半|[一二两三四五六七八九十]+)\s*个?(?:小时|钟头)后/.exec(text)
  if (relHour) {
    const n = cnToNum(relHour[1])
    if (n !== null) {
      const d = new Date(now.getTime() + n * 3600000)
      return { from: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, to: null, matched: [relHour[0]], exact: true }
    }
  }
  const span = /(\d{1,2})[:：](\d{2})\s*[-–~—至到]\s*(\d{1,2})[:：](\d{2})/.exec(text)
  if (span) {
    return {
      from: `${pad2(Number(span[1]))}:${pad2(Number(span[2]))}`,
      to: `${pad2(Number(span[3]))}:${pad2(Number(span[4]))}`,
      matched: [span[0]],
      exact: true,
    }
  }
  const clock = /(\d{1,2})[:：](\d{2})/.exec(text)
  if (clock) {
    return {
      from: `${pad2(Number(clock[1]))}:${pad2(Number(clock[2]))}`,
      to: null,
      matched: [clock[0]],
      exact: true,
    }
  }
  const point = /(\d{1,2}|[一二两三四五六七八九十]+)点(半|一刻|三刻|\d{1,2}分?|[一二三四五六七八九十]+分?)?/.exec(text)
  if (!point) return null
  let hour = cnToNum(point[1])
  if (hour === null) return null
  let minute = 0
  const tail = point[2] || ''
  if (tail === '半') minute = 30
  else if (tail === '一刻') minute = 15
  else if (tail === '三刻') minute = 45
  else if (/^\d{1,2}分?$/.test(tail)) minute = Number(tail.replace('分', ''))
  else if (/^[一二两三四五六七八九十]+分?$/.test(tail)) minute = cnToNum(tail.replace('分', '')) || 0
  const period = PERIOD_RE.exec(text)?.[0] || ''
  if (period) {
    if ((period === '下午' || period === '傍晚' || period === '晚上' || period === '今晚' || period === '夜里' || period === '半夜') && hour < 12) hour += 12
    if (period === '中午' && hour < 11) hour += 12
    if (period === '凌晨' && hour === 12) hour = 0
  }
  return {
    from: `${pad2(hour)}:${pad2(minute)}`,
    to: null,
    matched: [point[0], period].filter(Boolean),
    exact: true,
  }
}

function durationMinutes(text) {
  if (/分钟(?:后|以后)|小时后|钟头后/.test(text)) return null
  if (/一个半小时|一小时半/.test(text)) return 90
  const m = /(\d{1,3}|半|[一二两三四五六七八九十]+)个?(小时|钟头|分钟)/.exec(text)
  if (!m) return null
  const n = cnToNum(m[1])
  if (n === null) return null
  return m[2] === '分钟' ? n : n * 60
}

const VERB = '复习|做|写|看|上|吃|见|买|开|交|学|练|等|背|读|听|记|算|画|敲|改|查|整|玩|逛|洗|收|睡|跑|打|坐|考|抄|拿|送|找|问|说|聊|关|修|装|搬|借|还|充|晒|倒|扔|扫|擦|排|报|填|签|领|取|寄|约|陪|带|教|帮'

function placeInfo(text) {
  const at = new RegExp(`在([^，。；,;、\\s]{2,12}?)(?=${VERB}|啦|了|，|。|$)`).exec(text)
  if (at) return { place: at[1], matched: at[0] }
  const go = new RegExp(`去([^，。；,;、\\s]{2,12}?)(?=${VERB}|啦|了|，|。|$)`).exec(text)
  if (go) return { place: go[1], matched: go[0] }
  return null
}

function dateKey(now, offset) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (offset || 0))
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function cleanTitle(text, parts) {
  let rest = text
  for (const part of parts) {
    if (part) rest = rest.split(part).join(' ')
  }
  rest = rest.replace(/^[\s,，。；;、:：-]+|[\s,，。；;、:：-]+$/g, '')
  rest = rest.replace(/\s+/g, ' ').trim()
  return rest
}

export function parsePlanText(text, now = new Date()) {
  const raw = String(text || '').trim()
  if (!raw) {
    return { ok: false, from: '', to: '', place: '', title: '', date: dateKey(now, 0), dayOffset: null, missing: ['from', 'title'], raw }
  }
  const day = dayInfo(raw, now)
  const time = timeInfo(raw, now)
  const duration = durationMinutes(raw)
  const place = placeInfo(raw)
  const parts = [day.matched, ...(time?.matched || []), place?.matched]
  let title = cleanTitle(raw, parts)
  if (!title) title = cleanTitle(raw, [day.matched, ...(time?.matched || [])])

  let from = time?.from || ''
  let to = time?.to || ''
  if (from && !to && duration) {
    const [h, m] = from.split(':').map(Number)
    const end = h * 60 + m + duration
    to = `${pad2(Math.min(23, Math.floor(end / 60)))}:${pad2(end % 60)}`
  }
  const offset = day.offset === null ? 0 : day.offset
  const missing = []
  if (!from) missing.push('from')
  if (!title) missing.push('title')
  return {
    ok: Boolean(from && title),
    from,
    to,
    place: place?.place || '',
    title: title || raw,
    date: dateKey(now, offset),
    dayOffset: day.offset,
    missing,
    raw,
  }
}
