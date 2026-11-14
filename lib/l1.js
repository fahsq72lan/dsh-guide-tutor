/**
 * l1.js —— L1 视觉子模型（智谱 GLM-4.6V-Flash）
 *
 * 只做三件事：判断「这一步完成了吗」、定位「错在哪」、描述「画面变了什么」。
 * 不读知识库、不编步骤、不写话术——那些是主模型的活。
 *
 * 配置读 ~/.dsh/guide-tutor/ai.json：{ apiKey, baseUrl, model }
 * 用法：
 *   await askL1({ task: 'done', goal: '在 Excel 里插入数据透视表', image: 'shots/x.png' })
 *   → { ok: true, ok_: true, confidence: 0.9, reason: '已插入', ms: 1800 }
 */

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const AI_FILE = join(homedir(), '.dsh', 'guide-tutor', 'ai.json')
const THUMB_DIR = join(homedir(), '.dsh', 'guide-tutor', 'thumbs')
const THUMB_SCRIPT = join(HERE, '..', 'native', 'thumb.ps1')
const MIN_SIZE = 250 * 1024
const DEFAULT_BASE = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_MODEL = 'glm-4.6v-flash'

export function readAiConfig() {
  try {
    return JSON.parse(readFileSync(AI_FILE, 'utf8'))
  } catch {
    return null
  }
}

const PROMPTS = {
  done: (goal) =>
    `你是操作检查员。用户的目标是：${goal}。看这张截图，判断这一步是否已经完成。` +
    `只输出 JSON，不要任何解释：{"ok":true 或 false,"confidence":0 到 1 之间的小数,"reason":"一句话"}`,
  locate: (goal) =>
    `用户的目标是：${goal}。看这张截图，找出用户应该操作但还没操作、或者点错的位置。` +
    `只输出 JSON，不要任何解释：{"boxes":[{"x":0到1,"y":0到1,"w":0到1,"h":0到1,"why":"一句话"}]}` +
    `（x/y/w/h 是相对整张图的比例，左上角为 0,0）`,
  diff: () =>
    `用一句话描述这张截图里最值得注意的变化。` +
    `只输出 JSON：{"what":"一句话","changed":true 或 false}`,
  label: () =>
    `看这张截图，用一句话记下用户此刻具体在做什么，像写日记：说清「在做什么动作、对什么对象」。` +
    `1. 不超过 16 个字；` +
    `2. 不要写「使用某某软件」「处理工作」这种笼统说法；` +
    `3. 能看出内容就写内容，比如「在给活动卡片改时间条」「在翻今天的记录列表」；` +
    `4. 不要写文件名、代码路径、变量名这类技术细节，写人能看懂的事；` +
    `5. 只说看得见的，不要猜；` +
    `6. 如果补充信息说键鼠很久没动：屏幕上有视频画面、图片或长文，就照实写在看什么（比如「在看 B 站视频」）；` +
    `   屏幕停在桌面、黑屏或明显没变化，才写「离开了电脑」；拿不准就按屏幕内容写，别一律判成休息。` +
    `只输出 JSON，不要任何解释：{"category":"学习" 或 "工作" 或 "娱乐" 或 "休息" 或 "其他","detail":"一句话"}`,
}

function extractJson(text) {
  if (!text) return null
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try {
    return JSON.parse(text.slice(s, e + 1))
  } catch {
    return null
  }
}


/** 大图先缩成 1280 宽的 JPEG（智谱对超大 base64 会超时），结果缓存在 thumbs/ */
export function prepareImage(file) {
  let st
  try {
    st = statSync(file)
  } catch {
    return file
  }
  if (st.size <= MIN_SIZE) return file
  const name = basename(file).replace(/\.[^.]+$/, '') + '.jpg'
  const out = join(THUMB_DIR, name)
  try {
    if (existsSync(out) && statSync(out).mtimeMs >= st.mtimeMs) return out
  } catch {
    /* ignore */
  }
  try {
    mkdirSync(THUMB_DIR, { recursive: true })
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', THUMB_SCRIPT, '-In', file, '-Out', out],
      { timeout: 20000, windowsHide: true },
    )
    return out
  } catch (e) {
    return file
  }
}
/**
 * @param {object} opts
 * @param {'done'|'locate'|'diff'} opts.task
 * @param {string} [opts.goal]     目标描述（done / locate 必填）
 * @param {string} opts.image      截图的绝对路径（png / jpg）
 * @param {string} [opts.hint]     额外提示，比如「用户说他点了菜单」
 * @param {number} [opts.timeoutMs] 默认 2000
 * @param {object} [opts.config]   不传就读 ai.json
 */
export async function askL1({ task, goal = '', image, hint = '', timeoutMs = 2000, config = null }) {
  const cfg = config || readAiConfig()
  if (!cfg?.apiKey) return { ok: false, error: 'no api key' }

  const base = String(cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')
  const useImage = prepareImage(image)
  let b64
  try {
    b64 = readFileSync(useImage).toString('base64')
  } catch (e) {
    return { ok: false, error: `read image failed: ${e?.message || e}` }
  }

  const prompt = (PROMPTS[task] || PROMPTS.diff)(goal) + (hint ? `\n补充信息：${hint}` : '')
  const body = {
    model: cfg.model || DEFAULT_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          { type: 'text', text: prompt },
        ],
      },
    ],
    thinking: { type: 'disabled' },
    temperature: 0.1,
    max_tokens: 300,
  }

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    const ms = Date.now() - t0
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `http ${res.status}`, ms }
    }
    const text = json?.choices?.[0]?.message?.content ?? ''
    const parsed = extractJson(text)
    if (!parsed) {
      return { ok: false, error: 'no json in reply', raw: String(text).slice(0, 200), ms }
    }
    return { ok: true, data: parsed, ms, usage: json?.usage }
  } catch (e) {
    const ms = Date.now() - t0
    const msg = e?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : String(e?.message || e)
    return { ok: false, error: msg, ms }
  } finally {
    clearTimeout(timer)
  }
}

/** 方便外部用：只问「完成了吗」，返回 { ok, confidence, reason } 或 null */
export async function askDone({ goal, image, hint = '', timeoutMs = 2000, config = null }) {
  const r = await askL1({ task: 'done', goal, image, hint, timeoutMs, config })
  if (!r.ok) return null
  const d = r.data || {}
  return {
    done: d.ok === true || d.done === true,
    confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
    reason: typeof d.reason === 'string' ? d.reason : String(d.reason ?? ''),
    ms: r.ms,
  }
}

/** 只问「错在哪」，返回 { boxes, ms } 或 null */
export async function askLocate({ goal, image, hint = '', timeoutMs = 2000, config = null }) {
  const r = await askL1({ task: 'locate', goal, image, hint, timeoutMs, config })
  if (!r.ok) return null
  const d = r.data || {}
  return { boxes: Array.isArray(d.boxes) ? d.boxes : [], ms: r.ms }
}

const CATEGORIES = new Set(['学习', '工作', '娱乐', '休息', '其他'])

/** 给一张图打状态标签，返回 { category, detail, ms } 或 null
 *  proc：前台进程名（可选）；prev：上一张的 detail，用来避免每次都说同一句；
 *  idle：距上次键鼠输入的秒数（可选）。空闲是「事实」，交不交给模型判断由调用方决定——
 *  看视频时键鼠同样不动，所以不能用它直接下「休息」的结论。 */
export async function askLabel({ image, proc = '', prev = '', idle = 0, timeoutMs = 6000, config = null }) {
  const idleSec = Number(idle) || 0
  const hint = [
    proc ? `前台程序是「${proc}」。` : '',
    idleSec >= 120 ? `键鼠已经 ${Math.max(1, Math.round(idleSec / 60))} 分钟没动了，但画面可能在放视频或停在长文上，别只看这一点就判休息。` : '',
    prev ? `上一张截图（约 5 分钟前）记的是「${prev}」。如果是同一件事可以沿用；换了事就如实写新的。` : '',
  ].filter(Boolean).join('')
  const r = await askL1({ task: 'label', goal: '', image, hint, timeoutMs, config })
  if (!r.ok) return null
  const d = r.data || {}
  const category = CATEGORIES.has(d.category) ? d.category : '其他'
  let detail = typeof d.detail === 'string' ? d.detail.trim() : ''
  if (detail.length > 18) detail = detail.slice(0, 18)
  return { category, detail, ms: r.ms }
}
