import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function createCamera({
  dataDir,
  nativeDir,
  shotsDir,
  log,
  broadcast,
  appendDaylog,
  pickAgent,
  buildUserMessage,
  mutedSpeakMessages,
}) {
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
            path.join(nativeDir, 'cam.ps1'),
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

  const tool = {
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

  return { tool, tick: cameraTick, run: cameraRun, status: cameraStatus, snap: cameraSnap }
}
