import fs from 'node:fs'

// state.json 的唯一写入口：内存快照 + 原子写（tmp → rename）+ 失败兜底。
// 悬浮层每 250ms 读一次这个文件，rename 撞上读取时 Windows 会回 EPERM，
// 所以这里绝不能把异常抛出去——宿主会当成致命错误退出（2026-10-23 崩过一次）。
export function createStateStore({ file, defaults, log, broadcast }) {
  const { panel, card, ball, topbar, subtitle, session } = defaults
  let state = null

  function readFile() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }

  function current() {
    if (!state) {
      state = readFile() || {
        v: 1,
        panel: { ...panel },
        card: { ...card },
        ball: { ...ball },
        plan: { date: '', items: [] },
        annots: [],
        subtitle: { ...subtitle },
        session: { ...session },
        captureMode: false,
      }
    }
    if (!state.card) state.card = { ...card }
    if (!state.ball) state.ball = { ...ball }
    if (!state.topbar) state.topbar = { ...topbar }
    if (!state.plan) state.plan = { date: '', items: [] }
    return state
  }

  function write(patch = {}) {
    try {
      const base = current()
      state = {
        ...base,
        ...patch,
        panel: { ...base.panel, ...(patch.panel || {}) },
        card: { ...(base.card || card), ...(patch.card || {}) },
        ball: { ...(base.ball || ball), ...(patch.ball || {}) },
        topbar: { ...(base.topbar || topbar), ...(patch.topbar || {}) },
        subtitle: { ...(base.subtitle || subtitle), ...(patch.subtitle || {}) },
        annots: patch.annots !== undefined ? patch.annots : base.annots,
        updatedAt: Date.now(),
      }
      const text = JSON.stringify(state, null, 2)
      const tmp = `${file}.tmp`
      try {
        fs.writeFileSync(tmp, text, 'utf8')
        fs.renameSync(tmp, file)
      } catch (error) {
        // 读取方恰好打开着文件时 rename 会失败；退回直接覆盖，仍然不能抛。
        try {
          fs.writeFileSync(file, text, 'utf8')
        } catch {
          /* 写不进就跳过这一帧，下一帧再来 */
        }
        try {
          fs.rmSync(tmp, { force: true })
        } catch {
          /* 残留的 .tmp 下次会被覆盖 */
        }
        if (error?.code && !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) {
          log(`writeState fallback (${error.code}): ${error?.message ?? error}`)
        }
      }
      broadcast('state', state)
    } catch (error) {
      log(`writeState failed: ${error?.stack ?? error}`)
    }
    return state
  }

  return { current, write, readFile }
}
