// 临时排查脚本 2：验证「B 站 player 接口需要 WBI 签名，否则返回错乱字幕」这个猜想。
const fs = require('fs')
const crypto = require('crypto')

const DATA = 'C:/Users/<User>/.dsh/guide-tutor'
const BV = process.argv[2] || 'BV1oCJf62EkR'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const cookie = fs.readFileSync(DATA + '/bili-cookie.txt', 'utf8').trim()
const H = {
  'User-Agent': UA,
  Referer: 'https://www.bilibili.com/',
  Accept: 'application/json, text/plain, */*',
  Cookie: cookie,
}

const MIXIN_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]

async function getJson(url, headers) {
  const r = await fetch(url, { headers })
  const text = await r.text()
  let body
  try { body = JSON.parse(text) } catch { body = { code: -1, raw: text.slice(0, 160) } }
  body.__status = r.status
  return body
}

async function wbiKeys() {
  const nav = await getJson('https://api.bilibili.com/x/web-interface/nav', H)
  const img = nav.data && nav.data.wbi_img ? nav.data.wbi_img.img_url : ''
  const sub = nav.data && nav.data.wbi_img ? nav.data.wbi_img.sub_url : ''
  const pick = (u) => u.slice(u.lastIndexOf('/') + 1).split('.')[0]
  return { img: pick(img), sub: pick(sub), navCode: nav.code }
}

function sign(params, mixin) {
  const wts = Math.round(Date.now() / 1000)
  const all = { ...params, wts }
  const query = Object.keys(all)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(all[k]).replace(/[!'()*]/g, ''))}`)
    .join('&')
  const w_rid = crypto.createHash('md5').update(query + mixin).digest('hex')
  return `${query}&w_rid=${w_rid}`
}

;(async () => {
  const keys = await wbiKeys()
  const mixin = MIXIN_TAB.map((i) => (keys.img + keys.sub)[i]).join('').slice(0, 32)
  console.log('nav.code=' + keys.navCode + ' img=' + keys.img.slice(0, 8) + '… sub=' + keys.sub.slice(0, 8) + '… mixin=' + mixin.slice(0, 8) + '…')

  const view = await getJson(`https://api.bilibili.com/x/web-interface/view?bvid=${BV}`, H)
  const v = view.data
  const cid = (v.pages && v.pages[0] && v.pages[0].cid) || v.cid
  console.log('title=' + v.title + ' dur=' + v.duration + ' cid=' + cid)

  for (let run = 1; run <= 3; run += 1) {
    const q = sign({ bvid: v.bvid, cid }, mixin)
    const player = await getJson(`https://api.bilibili.com/x/player/wbi/v2?${q}`, H)
    const subs = (player.data && player.data.subtitle && player.data.subtitle.subtitles) || []
    console.log('--- run' + run + ' code=' + player.code + ' subs=' + subs.length)
    if (!subs.length) continue
    const raw = subs[0].subtitle_url
    const url = raw.startsWith('//') ? 'https:' + raw : raw
    console.log('    path=' + url.split('/prod/')[1].split('?')[0].slice(0, 40))
    const sub = await getJson(url, H)
    const cues = Array.isArray(sub.body) ? sub.body : []
    const maxFrom = cues.length ? Math.max(...cues.map((c) => c.from)) : 0
    const rawText = await (await fetch(url, { headers: H })).text()
    console.log('    keys=' + Object.keys(sub).join(',') + ' len=' + rawText.length + ' head=' + rawText.slice(0, 160).replace(/\s+/g, ' '))
    console.log('    cues=' + cues.length + ' maxFrom=' + maxFrom + ' fits=' + (maxFrom <= v.duration + 5))
    console.log('    first=' + cues.slice(0, 2).map((c) => c.content).join(' | '))
  }
})().catch((e) => console.log('ERR ' + e.message))
