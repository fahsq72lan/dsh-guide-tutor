/**
 * judge.js —— 用 L1 做「完成判定」和「错误定位」，判断不了就返回 null 让上层走主模型。
 *
 * 设计原则：这里只做「看一眼就能答」的事，任何不确定都返回 null，绝不猜。
 * 调用方拿到 null 就退回 L2（主模型），保证质量不降。
 */

import { askDone, askLocate, readAiConfig } from './l1.js'

/** 低于这个置信度就算「L1 说不准」，交回主模型 */
const MIN_CONFIDENCE = 0.6

export function createJudge({ log = () => {}, getConfig = readAiConfig } = {}) {
  const stats = { calls: 0, answered: 0, fallback: 0, lastMs: 0 }

  /**
   * 判断「这一步做完了吗」
   * @returns {Promise<{verdict:'done'|'not_done', confidence:number, reason:string, ms:number}|null>}
   */
  async function done({ goal, image, hint = '', timeoutMs = 2000 }) {
    stats.calls += 1
    const r = await askDone({ goal, image, hint, timeoutMs, config: getConfig() })
    if (!r) {
      stats.fallback += 1
      log('judge.done -> null（L1 超时或返回不合法，交回主模型）')
      return null
    }
    stats.lastMs = r.ms
    if (r.confidence < MIN_CONFIDENCE) {
      stats.fallback += 1
      log(`judge.done -> null（置信度 ${r.confidence} 低于 ${MIN_CONFIDENCE}）`)
      return null
    }
    stats.answered += 1
    return {
      verdict: r.done ? 'done' : 'not_done',
      confidence: r.confidence,
      reason: r.reason,
      ms: r.ms,
    }
  }

  /**
   * 定位「用户该点哪儿 / 点错了哪儿」
   * @returns {Promise<{boxes:Array<{x:number,y:number,w:number,h:number,why:string}>, ms:number}|null>}
   */
  async function locate({ goal, image, hint = '', timeoutMs = 2000 }) {
    stats.calls += 1
    const r = await askLocate({ goal, image, hint, timeoutMs, config: getConfig() })
    if (!r || !Array.isArray(r.boxes) || r.boxes.length === 0) {
      stats.fallback += 1
      log('judge.locate -> null（L1 没给出框，交回主模型）')
      return null
    }
    stats.lastMs = r.ms
    stats.answered += 1
    return { boxes: r.boxes, ms: r.ms }
  }

  return { done, locate, stats }
}
