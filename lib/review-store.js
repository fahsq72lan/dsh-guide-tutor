// 复习卡（艾宾浩斯 / FSRS 简化版）数据层。
// 纯函数一律不碰文件、不取 Date.now()，时间由入参传（INV-7）。
import fs from 'node:fs';
import path from 'node:path';

const DAY_MS = 86400000;
const MIN_MS = 60000;

// 遗忘曲线：R(t,S) = (1 + FACTOR*t/S)^DECAY
export const FACTOR = 19 / 81;
export const DECAY = -0.5;

export const DEFAULT_PARAMS = Object.freeze({
  wantRetention: 0.9,
  sInit: 1.0,
  dInit: 5.0,
  kGood: 8.0,
  kHard: 3.0,
  lapseCoef: 0.35,
  sMax: 180,
  dStep: 1.0,
  dRevert: 0.02,
  leechAt: 4,
  quotaRatio: 0.25,
  sameDayGap: 0.0208,
});

export const GRADE = Object.freeze({ FORGOT: 1, HARD: 2, GOOD: 3 });
export const CARD_STATE = Object.freeze({
  LEARNING: 'learning',
  REVIEW: 'review',
  RELEARNING: 'relearning',
  LEECH: 'leech',
  SUSPENDED: 'suspended',
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 距上次复习 t 天后还能想起的概率
export function retention(tDays, S) {
  const s = Math.max(0.01, Number(S) || 0.01);
  const t = Math.max(0, Number(tDays) || 0);
  return (1 + (FACTOR * t) / s) ** DECAY;
}

// 反解：想让 R 落到 r，需要多少天
export function intervalFor(r, S) {
  const s = Math.max(0.01, Number(S) || 0.01);
  const rr = clamp(Number(r) || 0.9, 0.3, 0.999);
  return (s / FACTOR) * (rr ** (1 / DECAY) - 1);
}

// 答对之后稳定度的增长倍数
export function nextStability(S, D, R, G, params = DEFAULT_PARAMS) {
  const k = G === GRADE.GOOD ? params.kGood : params.kHard;
  const s = Math.max(0.05, Number(S) || 0.05);
  const d = clamp(Number(D) || params.dInit, 1, 10);
  const r = clamp(Number(R) || 0.9, 0.01, 1);
  const inc = 1 + k * ((11 - d) / 10) * (s + 1) ** -0.15 * (Math.exp(1.5 * (1 - r)) - 1);
  return s * Math.max(1.0, inc);
}

// 到期时间吸附到半小时，并限制在 08:00–22:30
export function snapToGrid(date, params = DEFAULT_PARAMS) {
  const d = new Date(date.getTime());
  const openMin = 8 * 60;
  const closeMin = 22 * 60 + 30;
  let min = d.getHours() * 60 + d.getMinutes();
  if (min < openMin) min = openMin;
  if (min > closeMin) {
    d.setDate(d.getDate() + 1);
    min = openMin;
  }
  const snapped = Math.min(closeMin, Math.round(min / 30) * 30);
  d.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0);
  return d;
}

function nowIso(now) {
  return new Date(now).toISOString();
}

// 唯一的状态迁移入口：返回新卡（不改入参）
export function applyGrade(card, G, now, params = DEFAULT_PARAMS) {
  const at = new Date(now);
  const next = { ...card, history: Array.isArray(card.history) ? card.history.slice() : [] };
  const last = card.lastReviewAt ? new Date(card.lastReviewAt).getTime() : null;
  const elapsedD = last ? Math.max(0, (at.getTime() - last) / DAY_MS) : 0;
  // 新卡第一次复习没有「上次」，按到期（R=0.9）算，否则刚建完立刻复习收益恒为 0
  const isFirst = (Number(card.reps) || 0) === 0 && (Number(card.lapses) || 0) === 0;
  const R = isFirst ? params.wantRetention : retention(elapsedD, card.S);

  if (Number(G) === GRADE.FORGOT) {
    next.S = Math.max(0.3, (Number(card.S) || params.sInit) * params.lapseCoef);
    next.lapses = (Number(card.lapses) || 0) + 1;
    next.D = clamp((Number(card.D) || params.dInit) + ((10 - (Number(card.D) || params.dInit)) / 9), 1, 10);
    next.state = next.lapses >= params.leechAt ? CARD_STATE.LEECH : CARD_STATE.RELEARNING;
  } else {
    next.S = Math.max(Number(card.S) || params.sInit, nextStability(card.S, card.D, R, G, params));
    next.reps = (Number(card.reps) || 0) + 1;
    next.D = clamp((Number(card.D) || params.dInit) - (Number(G) - 3) * ((10 - (Number(card.D) || params.dInit)) / 9), 1, 10);
    next.state = CARD_STATE.REVIEW;
  }

  next.S = Math.min(params.sMax, next.S);
  next.D = params.dRevert * params.dInit + (1 - params.dRevert) * next.D;
  next.lastReviewAt = nowIso(at);
  next.lastGrade = Number(G);

  if (next.state === CARD_STATE.LEECH) {
    next.dueAt = null;
  } else if (Number(G) === GRADE.FORGOT) {
    next.dueAt = new Date(at.getTime() + 20 * MIN_MS).toISOString();
  } else {
    const days = Math.min(params.sMax, intervalFor(params.wantRetention, next.S));
    next.dueAt = snapToGrid(new Date(at.getTime() + days * DAY_MS), params).toISOString();
  }

  next.history.push({
    t: nowIso(at),
    g: Number(G),
    elapsedD: Math.round(elapsedD * 10000) / 10000,
    R: Math.round(R * 10000) / 10000,
    SAfter: Math.round(next.S * 10000) / 10000,
  });
  if (next.history.length > 60) next.history = next.history.slice(-60);
  return next;
}

// ---------- 日期工具 ----------

export function dateKeyOf(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function addDays(key, n) {
  const [y, m, d] = String(key).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dateKeyOf(dt);
}

export function weekStartOf(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 周一 = 0
  dt.setDate(dt.getDate() - dow);
  return dateKeyOf(dt);
}

// ---------- 三个视图聚合（纯函数） ----------

function activeCards(cards) {
  return (cards || []).filter((c) => c && c.state !== CARD_STATE.SUSPENDED && c.state !== CARD_STATE.LEECH);
}

export function dueIn(cards, dateKey) {
  return activeCards(cards).filter((c) => c.dueAt && dateKeyOf(c.dueAt) === dateKey);
}

export function dayView(cards, dateKey, now = Date.now()) {
  const nowMs = new Date(now).getTime();
  const all = activeCards(cards);
  const doneToday = [];
  for (const c of cards || []) {
    const last = c?.lastReviewAt ? new Date(c.lastReviewAt) : null;
    if (last && dateKeyOf(last) === dateKey) doneToday.push(c);
  }
  const overdue = [];
  const today = [];
  const later = [];
  for (const c of all) {
    if (!c.dueAt) continue;
    const key = dateKeyOf(c.dueAt);
    if (key < dateKey) overdue.push(c);
    else if (key === dateKey) today.push(c);
    else later.push(c);
  }
  const byDue = (a, b) => new Date(a.dueAt) - new Date(b.dueAt);
  return {
    date: dateKey,
    overdue: overdue.sort(byDue),
    today: today.sort(byDue),
    later: later.sort(byDue).slice(0, 3),
    laterMore: Math.max(0, later.length - 3),
    doneToday: doneToday.sort((a, b) => new Date(a.lastReviewAt) - new Date(b.lastReviewAt)),
  };
}

export function weekView(cards, weekStartKey) {
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const key = addDays(weekStartKey, i);
    const list = dueIn(cards, key);
    days.push({
      date: key,
      count: list.length,
      titles: list.slice(0, 3).map((c) => String(c.title || c.prompt || '').slice(0, 14)),
    });
  }
  const total = days.reduce((s, d) => s + d.count, 0);
  const done = (cards || []).reduce((s, c) => {
    const h = Array.isArray(c?.history) ? c.history : [];
    return s + h.filter((e) => weekStartKey <= dateKeyOf(e.t) && dateKeyOf(e.t) <= addDays(weekStartKey, 6)).length;
  }, 0);
  const peak = days.reduce((m, d) => (d.count > m.count ? d : m), days[0]);
  const empties = days.filter((d) => d.count === 0);
  let suggestion = '';
  if (peak.count > 5 && empties.length) {
    suggestion = `${peak.date.slice(5)} 有 ${peak.count} 张，${empties[0].date.slice(5)} 空着，可挪 2–3 张过去`;
  }
  return { weekStart: weekStartKey, days, total, done, peak: peak.date, suggestion };
}

export function monthView(cards, monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  let total = 0;
  let peak = { date: '', count: 0 };
  for (let d = 1; d <= lastDay; d += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const list = dueIn(cards, key);
    total += list.length;
    if (list.length > peak.count) peak = { date: key, count: list.length };
    cells.push({ date: key, count: list.length });
  }
  const done = (cards || []).reduce((s, c) => {
    const h = Array.isArray(c?.history) ? c.history : [];
    return s + h.filter((e) => dateKeyOf(e.t).startsWith(String(monthKey))).length;
  }, 0);
  return { month: monthKey, cells, total, done, peak };
}

export function stats(cards, now = Date.now()) {
  const nowMs = new Date(now).getTime();
  const today = dateKeyOf(new Date(nowMs));
  const all = Array.isArray(cards) ? cards.filter(Boolean) : [];
  const live = all.filter((c) => c.state !== CARD_STATE.SUSPENDED);
  const avgS = live.length ? live.reduce((s, c) => s + (Number(c.S) || 0), 0) / live.length : 0;
  const dueToday = live.filter((c) => c.dueAt && dateKeyOf(c.dueAt) === today).length;
  // 「逾期」= 日期早于今天（今天已过点的仍算今天到期）
  const overdue = live.filter((c) => c.dueAt && dateKeyOf(c.dueAt) < today).length;
  const leech = live.filter((c) => c.state === CARD_STATE.LEECH).length;
  const suspended = all.filter((c) => c.state === CARD_STATE.SUSPENDED).length;
  return { total: live.length, dueToday, overdue, avgS, leech, suspended };
}

// ---------- store ----------

export function createReviewStore({ dataDir, log = () => {} }) {
  const file = path.join(dataDir, 'review.json');
  const tmp = `${file}.tmp`;

  function emptyDoc() {
    return { schema: 1, params: { ...DEFAULT_PARAMS }, cards: [] };
  }

  function read() {
    if (!fs.existsSync(file)) return emptyDoc();
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
      const doc = JSON.parse(raw);
      if (!doc || !Array.isArray(doc.cards)) throw new Error('cards 不是数组');
      return { schema: doc.schema || 1, params: { ...DEFAULT_PARAMS, ...(doc.params || {}) }, cards: doc.cards };
    } catch (error) {
      const broken = `${file}.broken-${Date.now()}`;
      try { fs.copyFileSync(file, broken); } catch { /* ignore */ }
      log(`review.json 解析失败，已备份到 ${broken}：${error.message}`);
      const err = new Error(`review.json 损坏，拒绝写盘：${error.message}`);
      err.broken = broken;
      throw err;
    }
  }

  function save(doc) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ schema: 1, params: doc.params, cards: doc.cards }, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  function add(card) {
    const doc = read();
    const id = card.id || (card.stepId ? `r-${card.stepId}` : `r-m-${Date.now().toString(36)}`);
    const idx = doc.cards.findIndex((c) => c.id === id);
    const now = new Date();
    const base = {
      id,
      stepId: card.stepId || null,
      goalId: card.goalId || null,
      milestoneId: card.milestoneId || null,
      title: String(card.title || '').slice(0, 60) || '未命名',
      prompt: String(card.prompt || '').slice(0, 200) || String(card.title || '未命名').slice(0, 60),
      product: card.product || '',
      kind: card.kind || 'read',
      state: CARD_STATE.LEARNING,
      S: doc.params.sInit,
      D: doc.params.dInit,
      reps: 0,
      lapses: 0,
      dueAt: snapToGrid(now, doc.params).toISOString(),
      lastReviewAt: null,
      lastGrade: null,
      weak: false,
      history: [],
      lastEventId: null,
    };
    if (idx >= 0) {
      // INV-1：重复建卡只更新元信息，不动 S/D/history；goalId 没传就保留原来的
      const old = doc.cards[idx];
      const patch = { title: base.title, prompt: base.prompt, product: base.product };
      if (card.goalId) patch.goalId = card.goalId;
      if (card.milestoneId) patch.milestoneId = card.milestoneId;
      doc.cards[idx] = { ...old, ...patch };
    } else {
      doc.cards.push(base);
    }
    save(doc);
    return { ok: true, id, created: idx < 0, total: doc.cards.length };
  }

  function grade(id, g, now = Date.now(), eventId = null) {
    const doc = read();
    const idx = doc.cards.findIndex((c) => c.id === id);
    if (idx < 0) return { ok: false, error: '没有这张卡' };
    const card = doc.cards[idx];
    if (eventId && card.lastEventId === eventId) return { ok: true, skipped: true };
    if (card.lastReviewAt && new Date(card.lastReviewAt).getTime() >= new Date(now).getTime()) {
      return { ok: false, error: '这张卡的上次复习时间比现在还晚' };
    }
    const next = applyGrade(card, g, now, doc.params);
    next.lastEventId = eventId || null;
    doc.cards[idx] = next;
    save(doc);
    return { ok: true, card: next };
  }

  function remove(id) {
    const doc = read();
    const before = doc.cards.length;
    doc.cards = doc.cards.filter((c) => c.id !== id);
    save(doc);
    return { ok: true, removed: before - doc.cards.length };
  }

  function suspendGoal(goalId) {
    const doc = read();
    let n = 0;
    for (const c of doc.cards) {
      if (c.goalId === goalId && c.state !== CARD_STATE.SUSPENDED) {
        c.state = CARD_STATE.SUSPENDED;
        c.dueAt = null;
        n += 1;
      }
    }
    if (n) save(doc);
    return { ok: true, suspended: n };
  }

  function resumeGoal(goalId) {
    const doc = read();
    let n = 0;
    const at = new Date();
    for (const c of doc.cards) {
      if (c.goalId === goalId && c.state === CARD_STATE.SUSPENDED) {
        c.state = CARD_STATE.RELEARNING;
        c.dueAt = snapToGrid(at, doc.params).toISOString();
        n += 1;
      }
    }
    if (n) save(doc);
    return { ok: true, resumed: n };
  }

  return {
    file,
    read,
    save,
    add,
    grade,
    remove,
    suspendGoal,
    resumeGoal,
    list: () => read().cards,
    stats: (now) => stats(read().cards, now),
    day: (dateKey, now) => dayView(read().cards, dateKey, now),
    week: (weekStart) => weekView(read().cards, weekStart),
    month: (monthKey) => monthView(read().cards, monthKey),
  };
}

export function dueTodayCards(cards, now = Date.now()) {
  const nowMs = new Date(now).getTime();
  return activeCards(cards)
    .filter((c) => c.dueAt && new Date(c.dueAt).getTime() <= nowMs)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}
