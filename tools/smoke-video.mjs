// T03 冒烟测试：video 模块。
// 目标不是覆盖全部分支，而是回答「拆完之后这九个工具还能不能跑」。
// 网络层用 fetch 桩，不碰真实 B 站，也不动真实视频库。

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createVideoLibrary } from '../lib/video.js'

let passed = 0
let failed = 0

async function check(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed += 1
  } catch (error) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${error?.message ?? error}`)
    failed += 1
  }
}

function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-video-'))
}

function jsonResponse(payload) {
  return { ok: true, status: 200, async json() { return payload } }
}

const BV = 'BV1TEST00001'

const viewPayload = {
  code: 0,
  data: {
    bvid: BV,
    aid: 1,
    cid: 100,
    title: '冒烟测试视频',
    owner: { name: '测试UP' },
    duration: 100,
    desc: 'desc',
    pages: [{ cid: 100, page: 1, part: 'P1', duration: 100 }],
  },
}

const navPayload = {
  code: 0,
  data: {
    wbi_img: {
      img_url: 'https://i0.hdslb.com/bfs/wbi/0123456789abcdef0123456789abcdef.png',
      sub_url: 'https://i0.hdslb.com/bfs/wbi/fedcba9876543210fedcba9876543210.png',
    },
  },
}

function playerPayload(cuesTo, withSubtitle = true) {
  return {
    code: 0,
    data: {
      login_mid: 42,
      subtitle: withSubtitle
        ? { subtitles: [{ lan: 'zh-Hans', subtitle_url: '//sub.test/1.json' }] }
        : { subtitles: [] },
    },
  }
}

function makeFetch({ player, cues }) {
  return async (url) => {
    const text = String(url)
    if (text.includes('/x/web-interface/view')) return jsonResponse(viewPayload)
    if (text.includes('/x/web-interface/nav')) return jsonResponse(navPayload)
    if (text.includes('/x/player/wbi/v2')) return jsonResponse(player)
    if (text.includes('sub.test')) {
      return jsonResponse({
        body: cues.map((cue) => ({ from: cue.from, to: cue.to, content: cue.text })),
      })
    }
    throw new Error(`unexpected fetch: ${text}`)
  }
}

async function main() {
  console.log('纯函数')
  const dir = tempDataDir()
  const lib = createVideoLibrary({
    dataDir: dir,
    log: () => {},
    broadcast: () => {},
    config: { biliCookie: 'SESSDATA=test' },
    fetchImpl: makeFetch({ player: playerPayload(20), cues: [{ from: 0, to: 10, text: '第一句' }] }),
  })

  await check('parseVideoUrl 识别 BV 号与分P', () => {
    const parsed = lib.parseVideoUrl('https://www.bilibili.com/video/BV1xx411c7mD?p=3')
    assert.equal(parsed?.bvid, 'BV1xx411c7mD')
    assert.equal(parsed?.page, 3)
  })
  await check('parseVideoUrl 识别 av 号', () => {
    const parsed = lib.parseVideoUrl('av12345')
    assert.equal(parsed?.aid, 12345)
  })
  await check('parseVideoUrl 对无效输入返回 null', () => {
    assert.equal(lib.parseVideoUrl('这不是链接'), null)
  })
  await check('videoStamp 显示 0:00 与 1:02:05', () => {
    assert.equal(lib.videoStamp(0), '0:00')
    assert.equal(lib.videoStamp(3725), '1:02:05')
  })
  await check('parseDurationText 解析 mm:ss 与 hh:mm:ss', () => {
    assert.equal(lib.parseDurationText('3:11'), 191)
    assert.equal(lib.parseDurationText('1:02:05'), 3725)
  })
  await check('subtitleFitsVideo 拒绝超出时长（含 5 秒容差）的字幕', () => {
    assert.equal(lib.subtitleFitsVideo([{ from: 0, to: 16 }], 5), false)
    assert.equal(lib.subtitleFitsVideo([{ from: 0, to: 5 }], 5), true)
  })
  await check('videoDigest 在没写摘要时也给标题和字幕', () => {
    const digest = lib.videoDigest({
      bvid: BV,
      title: '冒烟测试视频',
      owner: '测试UP',
      duration: 100,
      learnedAt: '2026-11-09T00:00:00.000Z',
      subtitleLan: 'zh-Hans',
      cues: [{ from: 0, to: 10, text: '第一句' }],
    })
    assert.match(digest, /# 冒烟测试视频/)
    assert.match(digest, /## 字幕全文/)
    assert.match(digest, /\[0:00\] 第一句/)
  })

  console.log('库 CRUD')
  await check('空库 list 返回 0 条', () => {
    assert.equal(lib.readVideoRecords().length, 0)
  })
  await check('saveVideoRecord 同时写 json 与 md', () => {
    const id = lib.saveVideoRecord({
      bvid: BV,
      title: '冒烟测试视频',
      owner: '测试UP',
      duration: 100,
      learnedAt: new Date().toISOString(),
      cues: [{ from: 0, to: 10, text: '第一句' }],
      summary: '',
      points: [],
    })
    assert.equal(id, BV)
    assert.ok(fs.existsSync(path.join(lib.videoDir, `${BV}.json`)))
    assert.ok(fs.existsSync(path.join(lib.videoDir, `${BV}.md`)))
    assert.equal(lib.readVideoRecords().length, 1)
  })
  await check('video_note 写入后 video_show 能读到', async () => {
    const note = lib.tools.find((tool) => tool.name === 'video_note')
    await note.execute({ bvid: BV, summary: '一句话摘要', points: ['要点一'] })
    const show = lib.tools.find((tool) => tool.name === 'video_show')
    const value = await show.execute({ bvid: BV })
    assert.equal(value.summary, '一句话摘要')
    assert.equal(value.points.length, 1)
  })
  await check('video_transcript 能分页并给出 nextOffset', async () => {
    const transcript = lib.tools.find((tool) => tool.name === 'video_transcript')
    const page = await transcript.execute({ bvid: BV, offset: 0, maxChars: 500 })
    assert.equal(page.total, 1)
    assert.equal(page.nextOffset, null)
    assert.match(page.text, /第一句/)
  })
  await check('video_forget 删除后 video_show 报错', async () => {
    const forget = lib.tools.find((tool) => tool.name === 'video_forget')
    await forget.execute({ bvid: BV })
    const show = lib.tools.find((tool) => tool.name === 'video_show')
    await assert.rejects(() => show.execute({ bvid: BV }), /视频库里没有/)
  })

  console.log('video_learn 分支')
  const learnDir = tempDataDir()
  const learnLib = createVideoLibrary({
    dataDir: learnDir,
    log: () => {},
    broadcast: () => {},
    config: { biliCookie: 'SESSDATA=test' },
    fetchImpl: makeFetch({
      player: playerPayload(20),
      cues: [
        { from: 0, to: 10, text: '第一句' },
        { from: 10, to: 20, text: '第二句' },
      ],
    }),
  })
  await check('正常路径返回字幕与转写文本', async () => {
    const value = await learnLib.tools.find((tool) => tool.name === 'video_learn').execute({ url: BV })
    assert.equal(value.cues, 2)
    assert.match(value.transcript, /第一句/)
    assert.match(value.transcript, /第二句/)
  })

  const mismatchDir = tempDataDir()
  const mismatchLib = createVideoLibrary({
    dataDir: mismatchDir,
    log: () => {},
    broadcast: () => {},
    config: { biliCookie: 'SESSDATA=test' },
    fetchImpl: makeFetch({
      player: playerPayload(20),
      cues: [{ from: 0, to: 9999, text: '别人的字幕' }],
    }),
  })
  await check('字幕时间轴不符时丢弃并给出 mismatch', async () => {
    const value = await mismatchLib.tools.find((tool) => tool.name === 'video_learn').execute({ url: BV })
    assert.equal(value.cues, 0)
    assert.equal(value.reason, 'mismatch')
  })

  const emptyDir = tempDataDir()
  const emptyLib = createVideoLibrary({
    dataDir: emptyDir,
    log: () => {},
    broadcast: () => {},
    config: { biliCookie: 'SESSDATA=test' },
    fetchImpl: makeFetch({ player: playerPayload(20, false), cues: [] }),
  })
  await check('没有字幕时返回 no-subtitle 而不是抛异常', async () => {
    const value = await emptyLib.tools.find((tool) => tool.name === 'video_learn').execute({ url: BV })
    assert.equal(value.cues, 0)
    assert.equal(value.reason, 'no-subtitle')
    assert.equal(value.needCookie, false)
  })

  console.log('video_search')
  const searchDir = tempDataDir()
  const searchLib = createVideoLibrary({
    dataDir: searchDir,
    log: () => {},
    broadcast: () => {},
    config: {},
    fetchImpl: async (url) => {
      const text = String(url)
      if (text.includes('/x/web-interface/nav')) return jsonResponse(navPayload)
      if (text.includes('/search/type')) {
        return jsonResponse({
          code: 0,
          data: {
            numResults: 1,
            result: [
              {
                bvid: BV,
                title: '<em>测试</em>视频',
                author: '测试UP',
                duration: '1:40',
                play: 123,
                video_review: 4,
                pubdate: 0,
                description: 'd',
              },
            ],
          },
        })
      }
      throw new Error(`unexpected fetch: ${text}`)
    },
  })
  await check('搜索返回结果并去掉标题里的标签', async () => {
    const value = await searchLib.tools.find((tool) => tool.name === 'video_search').execute({ keyword: '测试' })
    assert.equal(value.count, 1)
    assert.equal(value.items[0].title, '测试视频')
    assert.equal(value.items[0].duration, 100)
  })

  for (const directory of [dir, learnDir, mismatchDir, emptyDir, searchDir]) {
    fs.rmSync(directory, { recursive: true, force: true })
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
