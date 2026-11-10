#!/usr/bin/env node
// B05：改 index.js / lib/*.js 后自动触发宿主热重载。
// 做法：监听文件变更 → 改 cordis.patch.yml 的 reload: 行 → 等 plugin.log 出现 disposed → ready。
// 用法：node scripts/dev-watch.mjs（或 npm run dev）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const patchFile =
  process.env.GUIDE_CORDIS_PATCH ||
  path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'cordis.patch.yml')
const logFile =
  process.env.GUIDE_PLUGIN_LOG || path.join(os.homedir(), '.dsh', 'guide-tutor', 'plugin.log')
const watchDirs = [root, path.join(root, 'lib')]
const DEBOUNCE_MS = 700

let timer = null

function touchReload() {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  let text = ''
  try {
    text = fs.readFileSync(patchFile, 'utf8')
  } catch (error) {
    console.error(`[dev-watch] 读不到 ${patchFile}：${error.message}`)
    return
  }
  // 这行在 patch 里是「注释 + reload: 值」同一行（历史原因），所以不锚定行首，
  // 直接替换 reload: 到行尾，注释文字保留。
  const next = text.replace(/(reload:\s*)[^\n]*/, `$1${now} dev-watch`)
  if (next === text) {
    console.error('[dev-watch] 没找到 reload: 行，跳过')
    return
  }
  fs.writeFileSync(patchFile, next, 'utf8')
  console.log(`[dev-watch] ${now} 已触发，等宿主 disposed → ready...`)
  waitReload()
}

function waitReload() {
  const start = Date.now()
  const iv = setInterval(() => {
    try {
      if (fs.existsSync(logFile)) {
        const tail = fs.readFileSync(logFile, 'utf8').slice(-8000)
        const ready = tail.lastIndexOf('guide-tutor ready')
        const disposed = tail.lastIndexOf('guide-tutor disposed')
        if (ready > 0 && disposed > 0 && ready > disposed) {
          clearInterval(iv)
          console.log(`[dev-watch] 重载完成（${Date.now() - start}ms）`)
        }
      }
    } catch {
      /* 日志读不到就再等 */
    }
    if (Date.now() - start > 20000) {
      clearInterval(iv)
      console.warn('[dev-watch] 20 秒没等到 ready，去看 plugin.log')
    }
  }, 300)
}

function schedule(file) {
  if (!/\.(js|mjs)$/.test(file)) return
  if (file.includes('node_modules') || file.includes(`${path.sep}tmp${path.sep}`)) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    console.log(`[dev-watch] 变更：${path.relative(root, file)}`)
    touchReload()
  }, DEBOUNCE_MS)
}

for (const dir of watchDirs) {
  if (!fs.existsSync(dir)) continue
  fs.watch(dir, (event, filename) => {
    if (filename) schedule(path.join(dir, filename))
  })
}
console.log(`[dev-watch] 监听：${watchDirs.map((d) => path.relative(root, d) || '.').join(', ')}`)
console.log(`[dev-watch] 触发文件：${patchFile}`)
