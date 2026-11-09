// 清单解析冒烟测试：纯函数，不打桩、不联网。
// 固定「现在」= 2026-11-09（周一）14:00，避免随运行日期漂。
import assert from 'node:assert/strict'
import { parsePlanText } from '../lib/plan-parse.js'

const NOW = new Date(2026, 10, 9, 14, 0, 0)
let passed = 0
let failed = 0

async function check(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  ✗ ${name}\n    ${error.message}`)
  }
}

console.log('一句话解析')
await check('明天下午三点在图书馆复习概率论', () => {
  const r = parsePlanText('明天下午三点在图书馆复习概率论', NOW)
  assert.equal(r.date, '2026-11-10')
  assert.equal(r.from, '15:00')
  assert.equal(r.place, '图书馆')
  assert.equal(r.title, '复习概率论')
})

await check('今晚八点去操场跑步', () => {
  const r = parsePlanText('今晚八点去操场跑步', NOW)
  assert.equal(r.date, '2026-11-09')
  assert.equal(r.from, '20:00')
  assert.equal(r.place, '操场')
  assert.equal(r.title, '跑步')
})

await check('周三上午十点 励志楼乙102 交作业', () => {
  const r = parsePlanText('周三上午十点 励志楼乙102 交作业', NOW)
  assert.equal(r.date, '2026-11-11')
  assert.equal(r.from, '10:00')
  assert.match(r.title, /交作业/)
})

await check('下午三点半复习', () => {
  const r = parsePlanText('下午三点半复习', NOW)
  assert.equal(r.from, '15:30')
  assert.equal(r.title, '复习')
})

await check('30分钟后喝水', () => {
  const r = parsePlanText('30分钟后喝水', NOW)
  assert.equal(r.from, '14:30')
  assert.equal(r.title, '喝水')
})

await check('半小时后喝水', () => {
  const r = parsePlanText('半小时后喝水', NOW)
  assert.equal(r.from, '14:30')
})

await check('9:00-11:00 在图书馆复习', () => {
  const r = parsePlanText('9:00-11:00 在图书馆复习', NOW)
  assert.equal(r.from, '09:00')
  assert.equal(r.to, '11:00')
  assert.equal(r.place, '图书馆')
})

await check('十点一刻开会', () => {
  const r = parsePlanText('十点一刻开会', NOW)
  assert.equal(r.from, '10:15')
  assert.equal(r.title, '开会')
})

await check('11月15日下午两点体测', () => {
  const r = parsePlanText('11月15日下午两点体测', NOW)
  assert.equal(r.date, '2026-11-15')
  assert.equal(r.from, '14:00')
})

await check('下周三上午九点交实验报告', () => {
  const r = parsePlanText('下周三上午九点交实验报告', NOW)
  assert.equal(r.date, '2026-11-18')
  assert.equal(r.from, '09:00')
})

await check('明天下午三点在图书馆复习一小时', () => {
  const r = parsePlanText('明天下午三点在图书馆复习一小时', NOW)
  assert.equal(r.from, '15:00')
  assert.equal(r.to, '16:00')
})

await check('今天下午五点半在宿舍背单词', () => {
  const r = parsePlanText('今天下午五点半在宿舍背单词', NOW)
  assert.equal(r.ok, true)
  assert.equal(r.from, '17:30')
  assert.equal(r.place, '宿舍')
  assert.equal(r.title, '背单词')
})

await check('没时间的一句话不装懂', () => {
  const r = parsePlanText('复习概率论', NOW)
  assert.equal(r.ok, false)
  assert.ok(r.missing.includes('from'))
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
