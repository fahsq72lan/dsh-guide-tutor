import fs from 'node:fs'
import path from 'node:path'

// 插件日志：单文件追加，超过 maxBytes 时轮转成 <file>.1。
// 只保留一份历史，避免数据目录无限膨胀；轮转失败不影响写日志。
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const CHECK_EVERY = 200

export function createLogger(file, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  let writes = 0

  function rotate() {
    try {
      const size = fs.statSync(file).size
      if (size < maxBytes) return
      const backup = `${file}.1`
      try {
        fs.rmSync(backup, { force: true })
      } catch {
        /* ignore */
      }
      fs.renameSync(file, backup)
    } catch {
      /* 文件还不存在或正被占用，忽略 */
    }
  }

  return function log(message) {
    try {
      writes += 1
      if (writes % CHECK_EVERY === 0) rotate()
      fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`, 'utf8')
    } catch {
      /* ignore logging failures */
    }
  }
}

export function loggerFile(dir) {
  return path.join(dir, 'plugin.log')
}
