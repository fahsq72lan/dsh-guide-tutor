/**
 * lib/units.js —— 「格」度量与任务成功率估计。
 *
 * 一句话：1 格 = 一个专注单元 + 一个可自检的产物。
 * 这里只做两件事：
 *   1. 把一个 step 换算成「预估几格」；
 *   2. 估计「这个 step 对这个人、现在，做成的概率」。
 *
 * 纯函数，无 IO、无副作用，方便单测与在 coach/tutor 两边复用。
 * 设计依据见 knowledge/目标拆解与格-设计摘要.md 第 1、3 节。
 *
 * 参数为什么是这样（2026-11-15 首版试算后调整，见 CHANGELOG 12:58 条）：
 *   - 熟练度按「产物类型」（kind）统计，不按「信息类型」（type）。首版按 type 统计，
 *     结果「装 JDK」和「写 CRUD 接口」共用同一个成功率，装环境被判 56% 太难。
 *   - 先验用 Beta(2,1)：没历史时 2/3，而不是 1/2。人对常见任务的成功率天然偏高，
 *     首版 1/2 的先验让全部分档往下掉了一档。
 *   - 新异度下限从 0.75 提到 0.85：第一次做不等于八成会失败。
 */

export const VERDICT = Object.freeze({
  TOO_HARD: 'too-hard',
  GOOD: 'good',
  TOO_EASY: 'too-easy',
});

/** 默认参数。lambda 决定规模惩罚强度；区间来自「最近发展区」。 */
export const DEFAULT_PARAMS = Object.freeze({
  lambda: 0.15,
  hardBelow: 0.55,
  easyAbove: 0.85,
});

/**
 * 没给 units 时，按产物类型给先验格数。
 * read 是「读/看」，不产出东西，只算半格。
 */
export const KIND_UNITS = Object.freeze({
  read: 0.5,
  demo: 1,
  fix: 1,
  drill: 1,
  feature: 2,
  design: 3,
});

/** 新异度系数：同类做过几次。 */
const NOVELTY_BY_SEEN = Object.freeze({
  often: 1.0, // >= 3 次
  some: 0.93, // 1-2 次
  fresh: 0.85, // 0 次，但知道大概怎么做
  unknown: 0.7, // 完全没接触过这个领域
});

export function emptySkill(overrides = {}) {
  return {
    version: 1,
    updatedAt: null,
    kinds: {},
    types: {},
    knowledge: {},
    domains: {},
    estimateBias: 1,
    params: { ...DEFAULT_PARAMS },
    ...overrides,
  };
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function paramsOf(skill) {
  return { ...DEFAULT_PARAMS, ...(skill?.params || {}) };
}

/**
 * 前置知识命中率。没学过的知识点 mastery 记 0，直接让 p 归零——
 * 「做不了」不需要额外分支，它自动包含在乘法里。
 */
export function pKnow(step, skill) {
  const req = Array.isArray(step?.requires) ? step.requires : [];
  if (req.length === 0) return 1;
  const know = skill?.knowledge || {};
  return req.reduce((acc, kp) => {
    const m = num(know[kp]?.mastery, 0);
    return acc * Math.min(1, Math.max(0, m));
  }, 1);
}

/**
 * 这类产物的历史成色。Beta(2,1) 平滑：
 * 没历史 = 2/3；做成 4 次没失手 = 6/7；全砸也还有 2/9 的余地。
 */
export function pSkill(step, skill) {
  const kind = step?.kind;
  const type = step?.type;
  const bucket =
    (kind && skill?.kinds?.[kind]) ||
    (type && skill?.types?.[type]) ||
    { done: 0, total: 0 };
  const done = num(bucket.done, 0);
  const total = num(bucket.total, 0);
  return (done + 2) / (total + 3);
}

/** 规模惩罚：格数越多，中途被打断的机会越多。用原始预估，不用偏差修正后的值。 */
export function pScale(units, skill) {
  const { lambda } = paramsOf(skill);
  const n = Math.max(1, num(units, 1));
  return Math.exp(-lambda * (n - 1));
}

/** 新异度：第一次做的事，连自己不知道什么都不知道。 */
export function pNovelty(step, skill) {
  if (step?.familiar === false) return NOVELTY_BY_SEEN.unknown;
  const domain = step?.domain;
  if (!domain) return NOVELTY_BY_SEEN.some;
  const seen = num(skill?.domains?.[domain]?.seen, 0);
  if (seen >= 3) return NOVELTY_BY_SEEN.often;
  if (seen >= 1) return NOVELTY_BY_SEEN.some;
  return NOVELTY_BY_SEEN.fresh;
}

/** 原始预估格数（不含偏差修正）。 */
export function plannedUnits(step) {
  const explicit = Number(step?.units);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const k = KIND_UNITS[step?.kind];
  return Number.isFinite(k) && k > 0 ? k : 1;
}

/** 展示用的预估格数：原始预估 × 历史偏差系数，取到 0.25 格。 */
export function estimateUnits(step, skill) {
  const bias = num(skill?.estimateBias, 1);
  const v = plannedUnits(step) * bias;
  return Math.round(v * 4) / 4;
}

export function verdictOf(p, params = DEFAULT_PARAMS) {
  const { hardBelow, easyAbove } = { ...DEFAULT_PARAMS, ...params };
  if (p < hardBelow) return VERDICT.TOO_HARD;
  if (p > easyAbove) return VERDICT.TOO_EASY;
  return VERDICT.GOOD;
}

const ADVICE = Object.freeze({
  [VERDICT.TOO_HARD]: {
    'p_know': '缺前置知识，先派一个「搞懂 X」，别硬做',
    'p_skill': '这类产物你还没做成过，先给一个更小的同类',
    'p_scale': '规模太大，拆成两三个一格的任务',
    'p_novelty': '第一次接触，先给「摸索版」：只要求产出笔记，不要求做成',
  },
  [VERDICT.GOOD]: {
    'p_know': '可以做',
    'p_skill': '可以做',
    'p_scale': '可以做',
    'p_novelty': '可以做',
  },
  [VERDICT.TOO_EASY]: {
    'p_know': '太容易：删提示、要求不看资料完成',
    'p_skill': '太容易：把产物标准提一级，或加一个边界条件',
    'p_scale': '太容易：合并一步，把规模提到 2 格',
    'p_novelty': '太容易：换个没做过的同类变体',
  },
});

/**
 * 估计成功率。
 * @returns {{p:number, units:number, planned:number, parts:object, verdict:string, weak:string, advice:string}}
 */
export function estimateWin(step, skill) {
  const planned = plannedUnits(step);
  const units = estimateUnits(step, skill);
  const parts = {
    p_know: pKnow(step, skill),
    p_skill: pSkill(step, skill),
    p_scale: pScale(planned, skill),
    p_novelty: pNovelty(step, skill),
  };
  const p = parts.p_know * parts.p_skill * parts.p_scale * parts.p_novelty;
  const verdict = verdictOf(p, paramsOf(skill));

  // 找最短板，但 p_know 为 0 时它永远是最该说的那句。
  let weak = 'p_know';
  if (parts.p_know > 0) {
    weak = Object.keys(parts).reduce((a, b) => (parts[b] < parts[a] ? b : a));
  }

  return {
    p: round4(p),
    units,
    planned,
    parts: {
      p_know: round4(parts.p_know),
      p_skill: round4(parts.p_skill),
      p_scale: round4(parts.p_scale),
      p_novelty: round4(parts.p_novelty),
    },
    verdict,
    weak,
    advice: ADVICE[verdict]?.[weak] || '',
  };
}

/**
 * 完成后回写。返回新的 skill 对象（不修改入参）。
 * outcome: 'done' | 'partial' | 'stuck'
 */
export function recordOutcome(skill, step, outcome, actualUnits) {
  const next = JSON.parse(JSON.stringify(skill || emptySkill()));
  next.kinds = next.kinds || {};
  next.types = next.types || {};

  const kind = step?.kind || '其他';
  const k = next.kinds[kind] || { done: 0, total: 0 };
  k.total += 1;
  if (outcome === 'done') k.done += 1;
  next.kinds[kind] = k;

  if (step?.type) {
    const t = next.types[step.type] || { done: 0, total: 0 };
    t.total += 1;
    if (outcome === 'done') t.done += 1;
    next.types[step.type] = t;
  }

  next.domains = next.domains || {};
  if (step?.domain) {
    const d = next.domains[step.domain] || { seen: 0 };
    d.seen += 1;
    next.domains[step.domain] = d;
  }

  // 估时偏差：只认「做完了」的样本，卡住的样本说明的是能力不是估时。
  const est = plannedUnits(step);
  const act = Number(actualUnits);
  if (outcome !== 'stuck' && Number.isFinite(act) && act > 0 && est > 0) {
    const ratio = act / est;
    const bias = Number.isFinite(next.estimateBias) ? next.estimateBias : 1;
    next.estimateBias = Math.round((bias * 0.7 + ratio * 0.3) * 1000) / 1000;
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}
