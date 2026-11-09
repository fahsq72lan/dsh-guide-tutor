import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

// B 站视频库：从 index.js 搬出的 9 个 video_* 工具与其依赖。
// 每个视频一条 JSON + 一份可读 Markdown，故意和教学手册（kb/）分开。
// 依赖宿主注入：dataDir、log、broadcast、config（读取 config.biliCookie）、
// fetchImpl（默认全局 fetch；冒烟测试可传桩，避免打真实网络）。
export function createVideoLibrary({ dataDir, log, broadcast, config, fetchImpl = globalThis.fetch }) {
  // ------------------------------------------------------------------ video
  // Bilibili videos get their own library (videos/), deliberately apart from the
  // teaching handbook (kb/): one JSON per video plus a readable Markdown digest,
  // so recall never mixes tutorial steps with video notes.
  const videoDir = path.join(dataDir, 'videos')
  fs.mkdirSync(videoDir, { recursive: true })
  const BILI_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

  function parseVideoUrl(url) {
    const text = String(url || '')
    const pageMatch = text.match(/[?&]p=(\d+)/)
    const page = pageMatch ? Math.max(1, Number(pageMatch[1])) : 1
    const bv = text.match(/BV[0-9A-Za-z]{10}/)
    if (bv) return { bvid: bv[0], page }
    const av = text.match(/av(\d+)/i)
    if (av) return { aid: Number(av[1]), page }
    return null
  }

  function biliHeaders(cookie) {
    const headers = {
      'User-Agent': BILI_UA,
      Referer: 'https://www.bilibili.com/',
      Accept: 'application/json, text/plain, */*',
    }
    if (cookie) headers.Cookie = String(cookie)
    return headers
  }

  async function biliApi(target, cookie) {
    if (typeof fetchImpl !== 'function') throw new Error('当前运行时不带 fetch，无法访问 B 站')
    let response
    try {
      response = await fetchImpl(target, { headers: biliHeaders(cookie) })
    } catch (error) {
      throw new Error(`访问 B 站失败（网络不可达）：${error?.message ?? error}`)
    }
    if (!response.ok) throw new Error(`B 站接口 HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.code !== 0) throw new Error(`B 站接口返回 ${payload?.code}：${payload?.message ?? ''}`)
    return payload.data
  }

  function biliCookie() {
    if (config.biliCookie) return String(config.biliCookie)
    try {
      return fs.readFileSync(path.join(dataDir, 'bili-cookie.txt'), 'utf8').trim()
    } catch {
      return ''
    }
  }

  // B 站 player 接口现在要求 WBI 签名。不带签名时接口照样返回 200，但给出的字幕
  // 常常是**别的视频**的（歌词、别的教程），这就是"读不出视频内容"的真正原因。
  const WBI_MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12,
    38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
  ]
  let wbiMixin = ''
  let wbiMixinAt = 0

  async function biliWbiMixin(cookie) {
    if (wbiMixin && Date.now() - wbiMixinAt < 30 * 60 * 1000) return wbiMixin
    const nav = await biliApi('https://api.bilibili.com/x/web-interface/nav', cookie)
    const img = String(nav?.wbi_img?.img_url || '')
    const sub = String(nav?.wbi_img?.sub_url || '')
    if (!img || !sub) throw new Error('没拿到 WBI 密钥')
    const pick = (url) => url.slice(url.lastIndexOf('/') + 1).split('.')[0]
    const raw = pick(img) + pick(sub)
    wbiMixin = WBI_MIXIN_TAB.map((index) => raw[index]).join('').slice(0, 32)
    wbiMixinAt = Date.now()
    return wbiMixin
  }

  function biliSignParams(params, mixin) {
    const wts = Math.round(Date.now() / 1000)
    const all = { ...params, wts }
    const query = Object.keys(all)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(all[key]).replace(/[!'()*]/g, ''))}`)
      .join('&')
    const w_rid = createHash('md5').update(query + mixin).digest('hex')
    return `${query}&w_rid=${w_rid}`
  }

  // 字幕的时间轴必须落在视频时长里，否则就是接口塞过来的别人的字幕。
  function subtitleFitsVideo(cues, duration) {
    if (!Array.isArray(cues) || !cues.length) return false
    const last = cues.reduce((max, cue) => Math.max(max, Number(cue.to) || Number(cue.from) || 0), 0)
    return last <= Number(duration || 0) + 5
  }

  function videoStamp(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0))
    const hh = Math.floor(total / 3600)
    const mm = Math.floor((total % 3600) / 60)
    const ss = total % 60
    const pad = (n) => String(n).padStart(2, '0')
    return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`
  }

  function videoDigest(record) {
    const lines = [
      `# ${record.title || record.bvid}`,
      '',
      `- 视频：https://www.bilibili.com/video/${record.bvid}`,
      `- UP 主：${record.owner || '未知'}`,
      `- 时长：${videoStamp(record.duration)}`,
      `- 收录：${record.learnedAt}`,
      `- 字幕：${record.subtitleLan || '无'}`,
      '',
    ]
    if (record.summary) {
      lines.push('## 摘要', '', record.summary, '')
    }
    if (Array.isArray(record.points) && record.points.length > 0) {
      lines.push('## 要点', '')
      for (const point of record.points) lines.push(`- ${point}`)
      lines.push('')
    }
    if (Array.isArray(record.cues) && record.cues.length > 0) {
      lines.push('## 字幕全文', '')
      for (const cue of record.cues) lines.push(`- [${videoStamp(cue.from)}] ${cue.text}`)
      lines.push('')
    }
    return lines.join('\n')
  }

  function saveVideoRecord(record) {
    const id = record.bvid || `av${record.aid}`
    fs.writeFileSync(path.join(videoDir, `${id}.json`), JSON.stringify(record, null, 2), 'utf8')
    fs.writeFileSync(path.join(videoDir, `${id}.md`), videoDigest(record), 'utf8')
    return id
  }

  function readVideoRecords() {
    const records = []
    let names = []
    try {
      names = fs.readdirSync(videoDir).filter((name) => name.toLowerCase().endsWith('.json'))
    } catch {
      return records
    }
    for (const name of names) {
      try {
        records.push(JSON.parse(fs.readFileSync(path.join(videoDir, name), 'utf8')))
      } catch {
        /* a broken record must not hide the rest */
      }
    }
    return records
  }

  async function videoLearn(args = {}) {
    const parsed = parseVideoUrl(args.url)
    if (!parsed) throw new Error('没认出 BV 号：请给完整的 B 站视频链接或 BV 号')
    const cookie = biliCookie()
    const query = parsed.bvid ? `bvid=${parsed.bvid}` : `aid=${parsed.aid}`
    const view = await biliApi(`https://api.bilibili.com/x/web-interface/view?${query}`, cookie)
    const pages = Array.isArray(view.pages) ? view.pages : []
    const pageIndex = Math.min(Math.max(1, parsed.page || 1), Math.max(1, pages.length))
    const pageInfo = pages[pageIndex - 1] || null
    const cid = pageInfo?.cid ?? view.cid
    // 先走带签名的 wbi 接口；万一签名失败才退回老接口（老接口可能给错字幕）。
    const loadPlayer = async () => {
      try {
        const mixin = await biliWbiMixin(cookie)
        const signed = biliSignParams({ bvid: view.bvid, cid }, mixin)
        return await biliApi(`https://api.bilibili.com/x/player/wbi/v2?${signed}`, cookie)
      } catch (error) {
        log(`wbi player failed: ${error?.message ?? error}`)
        return await biliApi(`https://api.bilibili.com/x/player/v2?bvid=${view.bvid}&cid=${cid}`, cookie)
      }
    }

    const readCues = async (player) => {
      const subtitles = Array.isArray(player?.subtitle?.subtitles) ? player.subtitle.subtitles : []
      const rank = (lan) => (lan === 'zh-Hans' ? 0 : lan === 'zh-CN' ? 1 : /^ai-zh/.test(lan) ? 2 : 3)
      subtitles.sort((a, b) => rank(a.lan) - rank(b.lan))
      const pick = subtitles[0]
      if (!pick?.subtitle_url) return { chosen: null, cues: [], url: '' }
      const url = pick.subtitle_url.startsWith('//') ? `https:${pick.subtitle_url}` : pick.subtitle_url
      const response = await fetchImpl(url, { headers: biliHeaders(cookie) })
      if (!response.ok) return { chosen: pick, cues: [], url, error: `字幕文件 HTTP ${response.status}` }
      const body = await response.json()
      const list = (Array.isArray(body?.body) ? body.body : [])
        .map((cue) => ({ from: Number(cue.from) || 0, to: Number(cue.to) || 0, text: String(cue.content || '').trim() }))
        .filter((cue) => cue.text)
      return { chosen: pick, cues: list, url }
    }

    const pageDuration = Number(pageInfo?.duration) || Number(view.duration) || 0
    let player = await loadPlayer()
    const loggedIn = Number(player?.login_mid) > 0
    let picked = await readCues(player)
    let mismatch = false
    if (picked.cues.length && !subtitleFitsVideo(picked.cues, pageDuration)) {
      mismatch = true
      log(`subtitle mismatch ${view.bvid}: ${picked.cues.length} 条超时长，重取一次`)
      player = await loadPlayer()
      picked = await readCues(player)
      if (picked.cues.length && !subtitleFitsVideo(picked.cues, pageDuration)) {
        log(`subtitle mismatch ${view.bvid}: 重取仍不符，丢弃`)
        picked = { ...picked, cues: [] }
      } else {
        mismatch = false
      }
    }
    const chosen = picked.chosen
    const cues = picked.cues
    // 重新收录同一条视频时保留已经写过的摘要和要点，别把用户的笔记冲掉。
    let previous = null
    try {
      const previousFile = path.join(videoDir, `${view.bvid}.json`)
      if (fs.existsSync(previousFile)) previous = JSON.parse(fs.readFileSync(previousFile, 'utf8'))
    } catch {
      previous = null
    }
    const record = {
      bvid: view.bvid,
      aid: view.aid,
      cid,
      title: view.title,
      owner: view.owner?.name || '',
      duration: pageDuration || view.duration,
      desc: String(view.desc || '').slice(0, 800),
      url: `https://www.bilibili.com/video/${view.bvid}`,
      page: pageIndex,
      pageCount: pages.length || 1,
      pageTitle: pageInfo?.part || '',
      learnedAt: new Date().toISOString(),
      subtitleLan: chosen?.lan || '',
      subtitleUrl: picked.url || '',
      cues,
      summary: previous?.summary || '',
      points: Array.isArray(previous?.points) ? previous.points : [],
    }
    const id = saveVideoRecord(record)
    broadcast('video', { learned: id, cues: cues.length })
    const transcript = cues.map((cue) => `[${videoStamp(cue.from)}] ${cue.text}`).join('\n')
    if (!transcript) {
      return {
        ok: true,
        bvid: id,
        title: record.title,
        owner: record.owner,
        duration: record.duration,
        page: record.page,
        pageCount: record.pageCount,
        cues: 0,
        needCookie: !cookie,
        loggedIn,
        reason: mismatch ? 'mismatch' : !chosen ? 'no-subtitle' : 'empty-subtitle',
        note: mismatch
          ? '接口返回的字幕时间轴超出视频长度，判定不是这条视频的字幕，已丢弃（再试一次或稍后再收录）。'
          : cookie
            ? loggedIn
              ? 'Cookie 有效，但这个视频没有可读取的字幕（UP 主可能没上传，也没开 AI 字幕）。'
              : 'Cookie 没被 B 站认出来（可能过期或复制不全），重新复制一次 SESSDATA。'
            : '没有拿到字幕：B 站要登录才返回字幕。可以把浏览器里的 SESSDATA 存到 %USERPROFILE%\\.dsh\\guide-tutor\\bili-cookie.txt，或调用 video_cookie 保存。',
      }
    }
    return {
      ok: true,
      bvid: id,
      title: record.title,
      owner: record.owner,
      duration: record.duration,
      page: record.page,
      pageCount: record.pageCount,
      pageTitle: record.pageTitle,
      cid,
      cues: cues.length,
      loggedIn,
      subtitleLan: record.subtitleLan,
      retried: mismatch,
      keptNotes: Boolean(previous?.summary || (previous?.points || []).length),
      transcript: transcript.slice(0, 14000),
      totalChars: transcript.length,
      truncated: transcript.length > 14000,
      hint: transcript.length > 14000 ? `已经截断，用 video_transcript 从 offset 继续翻页` : '',
    }
  }

  async function videoNote(args = {}) {
    const id = String(args.bvid || '').trim()
    if (!id) throw new Error('缺少 bvid')
    const file = path.join(videoDir, `${id}.json`)
    if (!fs.existsSync(file)) throw new Error(`视频库里没有 ${id}`)
    const record = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (args.summary !== undefined) record.summary = String(args.summary)
    if (Array.isArray(args.points)) record.points = args.points.map((point) => String(point)).slice(0, 30)
    record.updatedAt = new Date().toISOString()
    saveVideoRecord(record)
    return { ok: true, bvid: id, summary: record.summary, points: record.points.length }
  }

  function videoRecall(args = {}) {
    const query = String(args.query || '').trim()
    if (!query) throw new Error('缺少 query')
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const limit = Math.max(1, Math.min(10, Number(args.limit) || 3))
    const scored = []
    for (const record of readVideoRecords()) {
      const haystackTitle = String(record.title || '').toLowerCase()
      const haystackSummary = `${record.summary || ''} ${(record.points || []).join(' ')}`.toLowerCase()
      let score = 0
      const hits = []
      for (const term of terms) {
        if (haystackTitle.includes(term)) score += 5
        if (haystackSummary.includes(term)) score += 3
        for (const cue of record.cues || []) {
          if (cue.text.toLowerCase().includes(term)) {
            score += 1
            if (hits.length < 12) hits.push(`[${videoStamp(cue.from)}] ${cue.text}`)
          }
        }
      }
      if (score > 0) {
        scored.push({
          bvid: record.bvid,
          title: record.title,
          owner: record.owner,
          duration: record.duration,
          summary: record.summary || '',
          score,
          hits: hits.slice(0, 8),
        })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return { ok: true, query, matches: scored.slice(0, limit) }
  }

  function videoList() {
    return {
      ok: true,
      count: readVideoRecords().length,
      videos: readVideoRecords().map((record) => ({
        bvid: record.bvid,
        title: record.title,
        owner: record.owner,
        duration: record.duration,
        learnedAt: record.learnedAt,
        cues: Array.isArray(record.cues) ? record.cues.length : 0,
        hasSummary: Boolean(record.summary),
      })),
    }
  }

  function readVideoRecord(id) {
    const key = String(id || '').trim()
    if (!key) throw new Error('缺少 bvid')
    const file = path.join(videoDir, `${key}.json`)
    if (!fs.existsSync(file)) throw new Error(`视频库里没有 ${key}`)
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }

  function videoTranscript(args = {}) {
    const record = readVideoRecord(args.bvid)
    const cues = Array.isArray(record.cues) ? record.cues : []
    const offset = Math.max(0, Number(args.offset) || 0)
    const maxChars = Math.max(500, Math.min(20000, Number(args.maxChars) || 8000))
    let text = ''
    let index = offset
    while (index < cues.length) {
      const line = `[${videoStamp(cues[index].from)}] ${cues[index].text}`
      if (text && text.length + line.length + 1 > maxChars) break
      text += (text ? '\n' : '') + line
      index += 1
    }
    return {
      ok: true,
      bvid: record.bvid,
      title: record.title,
      total: cues.length,
      offset,
      nextOffset: index < cues.length ? index : null,
      text,
    }
  }

  function videoShow(args = {}) {
    const record = readVideoRecord(args.bvid)
    return {
      ok: true,
      bvid: record.bvid,
      title: record.title,
      owner: record.owner,
      duration: record.duration,
      page: record.page || 1,
      pageCount: record.pageCount || 1,
      pageTitle: record.pageTitle || '',
      url: record.url,
      learnedAt: record.learnedAt,
      subtitleLan: record.subtitleLan || '',
      cues: Array.isArray(record.cues) ? record.cues.length : 0,
      summary: record.summary || '',
      points: Array.isArray(record.points) ? record.points : [],
      desc: record.desc || '',
    }
  }

  function videoForget(args = {}) {
    const id = String(args.bvid || '').trim()
    if (!id) throw new Error('缺少 bvid')
    let removed = 0
    for (const ext of ['json', 'md']) {
      const file = path.join(videoDir, `${id}.${ext}`)
      if (fs.existsSync(file)) {
        fs.rmSync(file, { force: true })
        removed += 1
      }
    }
    if (removed === 0) throw new Error(`视频库里没有 ${id}`)
    broadcast('video', { removed: id })
    return { ok: true, bvid: id, removed }
  }

  function videoCookie(args = {}) {
    const raw = String(args.cookie || '').trim()
    if (!raw) throw new Error('缺少 cookie')
    const value = /^SESSDATA=/i.test(raw) ? raw : `SESSDATA=${raw}`
    fs.writeFileSync(path.join(dataDir, 'bili-cookie.txt'), `${value}\n`, 'utf8')
    log('bili cookie saved')
    return { ok: true, saved: true, masked: `${value.slice(0, 14)}…` }
  }

  const videoLearnTool = {
    name: 'video_learn',
    description:
      '学习一个 B 站视频并存入独立的视频库（不是教学知识库）：取标题/UP/时长与字幕全文，返回带时间戳的转写文本。拿到转写后自己总结，再调用 video_note 把摘要和要点写回这条视频记录。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'B 站视频链接或 BV 号' },
        cookie: { type: 'string', description: '可选：B 站 Cookie（SESSDATA=...），不填则用数据目录里的 bili-cookie.txt' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: value.cues
            ? `已收录：${value.title}（${videoStamp(value.duration)}，${value.cues} 条字幕）。\n\n${value.transcript ?? ''}${value.truncated ? '\n\n（已截断，用 video_transcript 从 offset 继续）' : ''}`
            : `已记录：${value.title}，但没有拿到字幕。${value.note ?? ''}`,
        },
      ],
    },
    async execute(args = {}) {
      return await videoLearn(args)
    },
  }

  const videoNoteTool = {
    name: 'video_note',
    description: '把摘要和要点写回视频库里的某条视频记录（配合 video_learn 使用），之后用 video_recall 就能想起来。',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: 'video_learn 返回的 bvid' },
        summary: { type: 'string', description: '两三句话的摘要' },
        points: { type: 'array', items: { type: 'string' }, description: '要点列表，每条一句话' },
      },
      required: ['bvid'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: `已更新 ${value.bvid}：摘要 ${value.summary ? '有' : '无'}，要点 ${value.points} 条。` }],
    },
    async execute(args = {}) {
      return await videoNote(args)
    },
  }

  const videoRecallTool = {
    name: 'video_recall',
    description: '在视频库里按关键词回忆：搜标题、摘要、要点和字幕原文，返回命中的视频与带时间戳的片段。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词，空格分隔多个词' },
        limit: { type: 'integer', description: '最多返回几条，默认 3' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: value.matches.length
            ? value.matches
                .map((match) => `${match.title}（${match.bvid}）命中 ${match.hits.length} 段${match.summary ? `\n  摘要：${match.summary.slice(0, 80)}` : ''}`)
                .join('\n')
            : `视频库里没有和「${value.query}」相关的内容。`,
        },
      ],
    },
    async execute(args = {}) {
      return videoRecall(args)
    },
  }

  const videoListTool = {
    name: 'video_list',
    description: '列出视频库里已收录的视频（标题、UP、时长、是否已写摘要）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        { type: 'text', text: value.count ? `视频库共 ${value.count} 条：\n` + value.videos.map((v) => `- ${v.title}（${v.bvid}）${v.cues} 条字幕`).join('\n') : '视频库还是空的。' },
      ],
    },
    async execute() {
      return videoList()
    },
  }

  const videoTranscriptTool = {
    name: 'video_transcript',
    description: '分页读取视频库里某条视频的字幕全文（带时间戳）。长视频用 nextOffset 继续翻页。',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string' },
        offset: { type: 'integer', description: '从第几条字幕开始，默认 0' },
        maxChars: { type: 'integer', description: '本次最多返回多少字符，默认 8000' },
      },
      required: ['bvid'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: `${value.title}：第 ${value.offset}~${value.offset + (value.text ? value.text.split('\n').length : 0)} 条 / 共 ${value.total} 条${value.nextOffset !== null ? `，下一页 offset=${value.nextOffset}` : '，已到末尾'}\n\n${value.text}`,
        },
      ],
    },
    async execute(args = {}) {
      return videoTranscript(args)
    },
  }

  const videoShowTool = {
    name: 'video_show',
    description: '查看视频库里某条视频的详情：标题、UP、分P、字幕条数、摘要和要点。',
    parameters: {
      type: 'object',
      properties: { bvid: { type: 'string' } },
      required: ['bvid'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: `${value.title}（${value.owner || '未知 UP'}，${videoStamp(value.duration)}，${value.cues} 条字幕）\n摘要：${value.summary || '（还没写）'}\n要点：${value.points.length} 条`,
        },
      ],
    },
    async execute(args = {}) {
      return videoShow(args)
    },
  }

  const videoForgetTool = {
    name: 'video_forget',
    description: '从视频库里删除一条视频记录（同时删掉它的 .json 和 .md）。',
    parameters: {
      type: 'object',
      properties: { bvid: { type: 'string' } },
      required: ['bvid'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: `已从视频库删除 ${value.bvid}` }],
    },
    async execute(args = {}) {
      return videoForget(args)
    },
  }

  // B 站搜索：和取字幕共用 WBI 签名。接口比取字幕更容易触发风控，所以加了节流
  // （两次搜索至少间隔 4 秒）和结果裁剪（默认只回 8 条，读完再挑）。
  let lastSearchAt = 0
  const SEARCH_COOLDOWN_MS = 4000

  function parseDurationText(text) {
    const parts = String(text || '')
      .split(':')
      .map((part) => Number(part) || 0)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  async function videoSearch(args = {}) {
    const keyword = String(args.keyword || '').trim()
    if (!keyword) throw new Error('缺少 keyword')
    const wait = SEARCH_COOLDOWN_MS - (Date.now() - lastSearchAt)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastSearchAt = Date.now()
    const cookie = biliCookie()
    const page = Math.max(1, Math.min(10, Number(args.page) || 1))
    const order = ['totalrank', 'click', 'pubdate', 'dm', 'stow'].includes(String(args.order))
      ? String(args.order)
      : 'totalrank'
    const limit = Math.max(1, Math.min(15, Number(args.limit) || 8))
    let data
    try {
      const mixin = await biliWbiMixin(cookie)
      const signed = biliSignParams({ search_type: 'video', keyword, page, order }, mixin)
      data = await biliApi(`https://api.bilibili.com/x/web-interface/wbi/search/type?${signed}`, cookie)
    } catch (error) {
      const message = String(error?.message ?? error)
      log(`search failed: ${message}`)
      if (/-412|-352/.test(message)) {
        throw new Error('B 站风控拦了这次搜索（-412），等一两分钟再试，或者确认 bili-cookie.txt 里的登录态还有效。')
      }
      throw new Error(`搜索失败：${message}`)
    }
    const list = Array.isArray(data?.result) ? data.result : []
    const items = list
      .filter((item) => item?.bvid)
      .slice(0, limit)
      .map((item) => ({
        bvid: item.bvid,
        title: String(item.title || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&'),
        author: item.author || '',
        duration: parseDurationText(item.duration),
        durationText: item.duration || '',
        play: Number(item.play) || 0,
        danmaku: Number(item.video_review) || 0,
        pubdate: Number(item.pubdate) || 0,
        description: String(item.description || '').slice(0, 80),
      }))
    return {
      ok: true,
      keyword,
      page,
      order,
      total: Number(data?.numResults) || items.length,
      count: items.length,
      items,
    }
  }

  const videoSearchTool = {
    name: 'video_search',
    description:
      '在 B 站按关键词搜视频（需要 bili-cookie.txt 里的登录态）。返回 BV 号、标题、UP 主、时长、播放量；挑中一条再调用 video_learn 抓字幕。默认只回 8 条，按播放量/最新排序可传 order。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词' },
        page: { type: 'integer', description: '页码，默认 1，最多 10' },
        order: { type: 'string', description: '排序：totalrank 综合（默认）/ click 播放 / pubdate 最新 / dm 弹幕 / stow 收藏' },
        limit: { type: 'integer', description: '返回几条，默认 8，最多 15' },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [
        {
          type: 'text',
          text: value.count
            ? `${value.keyword}：共 ${value.total} 条，返回前 ${value.count} 条\n` +
              value.items
                .map((item) => `- ${item.title}（${item.bvid}，${item.durationText}，播放 ${item.play}）UP：${item.author}`)
                .join('\n')
            : `没搜到「${value.keyword}」`,
        },
      ],
    },
    async execute(args = {}) {
      return videoSearch(args)
    },
  }

  const videoCookieTool = {
    name: 'video_cookie',
    description:
      '保存 B 站登录 Cookie（SESSDATA）到数据目录的 bili-cookie.txt，供 video_learn 取字幕用。只需传 SESSDATA 的值或整条 SESSDATA=xxx。',
    parameters: {
      type: 'object',
      properties: { cookie: { type: 'string', description: 'SESSDATA 的值，或完整的 SESSDATA=xxx' } },
      required: ['cookie'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: `已保存 B 站 Cookie（${value.masked}），之后 video_learn 会带上它。` }],
    },
    async execute(args = {}) {
      return videoCookie(args)
    },
  }

  const tools = [
    videoLearnTool,
    videoNoteTool,
    videoRecallTool,
    videoListTool,
    videoTranscriptTool,
    videoShowTool,
    videoForgetTool,
    videoSearchTool,
    videoCookieTool,
  ]

  // 冒烟测试用的出口：纯函数与库读写不经过工具注册也能单独调用。
  return {
    tools,
    readVideoRecords,
    saveVideoRecord,
    parseVideoUrl,
    parseDurationText,
    videoStamp,
    subtitleFitsVideo,
    videoDigest,
    videoDir,
  }
}
