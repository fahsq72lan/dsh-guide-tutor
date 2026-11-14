/**
 * pixel.js —— 图像指纹（pHash）
 *
 * 只依赖 node 内置模块：纯 JS 解 PNG → 32×32 灰度 → DCT 取左上 8×8 → 中位数二值化 → 64 bit hex
 * 用法：
 *   phash('a.png') → '9f3c...'（16 位 hex）
 *   hamming(a, b) → 0..64（0 = 一样，>10 通常算「明显不同」）
 */

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10]

function readChunks(buf) {
  const out = []
  let p = 8
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    if (p + 8 + len + 4 > buf.length) break
    out.push({ type, data: buf.subarray(p + 8, p + 8 + len) })
    p += 12 + len
    if (type === 'IEND') break
  }
  return out
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** 解 PNG（8 bit、非隔行：灰度 / 灰度+A / RGB / RGBA）→ { width, height, data: RGBA } */
export function decodePng(buf) {
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIG[i]) throw new Error('not a png')
  }
  const chunks = readChunks(buf)
  const ihdr = chunks.find((c) => c.type === 'IHDR')
  if (!ihdr) throw new Error('no IHDR')
  const width = ihdr.data.readUInt32BE(0)
  const height = ihdr.data.readUInt32BE(4)
  const depth = ihdr.data[8]
  const colorType = ihdr.data[9]
  const interlace = ihdr.data[12]
  if (depth !== 8 || interlace !== 0) {
    throw new Error(`unsupported png: depth=${depth} interlace=${interlace}`)
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`unsupported colorType ${colorType}`)

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data))
  const raw = inflateSync(idat)
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)
  let p = 0

  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    const line = raw.subarray(p, p + stride)
    p += stride
    const cur = new Uint8Array(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) v += paeth(a, b, c)
      cur[x] = v & 0xff
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (channels === 1) {
        const g = cur[x]
        out[o] = g
        out[o + 1] = g
        out[o + 2] = g
        out[o + 3] = 255
      } else if (channels === 2) {
        const g = cur[x * 2]
        out[o] = g
        out[o + 1] = g
        out[o + 2] = g
        out[o + 3] = cur[x * 2 + 1]
      } else if (channels === 3) {
        out[o] = cur[x * 3]
        out[o + 1] = cur[x * 3 + 1]
        out[o + 2] = cur[x * 3 + 2]
        out[o + 3] = 255
      } else {
        out[o] = cur[x * 4]
        out[o + 1] = cur[x * 4 + 1]
        out[o + 2] = cur[x * 4 + 2]
        out[o + 3] = cur[x * 4 + 3]
      }
    }
    prev = cur
  }
  return { width, height, data: out }
}

/** 32×32 灰度 + 8×8 DCT → 64 bit hex */
export function phashFromPixels({ width, height, data }, size = 32) {
  const gray = new Float64Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / size))
      const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / size))
      const o = (sy * width + sx) * 4
      gray[y * size + x] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
    }
  }

  const n = 8
  const coef = new Float64Array(n * n)
  const cos = []
  for (let i = 0; i < size; i++) {
    cos.push([])
    for (let u = 0; u < n; u++) cos[i].push(Math.cos(((2 * i + 1) * u * Math.PI) / (2 * size)))
  }

  for (let u = 0; u < n; u++) {
    for (let v = 0; v < n; v++) {
      let sum = 0
      for (let x = 0; x < size; x++) {
        const cx = cos[x][u]
        for (let y = 0; y < size; y++) {
          sum += gray[y * size + x] * cx * cos[y][v]
        }
      }
      coef[u * n + v] = sum
    }
  }

  const sorted = Array.from(coef.slice(1)).sort((a, b) => a - b)
  const med = sorted[Math.floor(sorted.length / 2)]
  let bits = ''
  for (let i = 0; i < n * n; i++) bits += coef[i] > med ? '1' : '0'
  let hex = ''
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

export function phash(filePath, size = 32) {
  return phashFromPixels(decodePng(readFileSync(filePath)), size)
}

/** 汉明距离：两串等长 hex，返回不同 bit 数 */
export function hamming(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return 64
  let d = 0
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) {
      d += x & 1
      x >>= 1
    }
  }
  return d
}
