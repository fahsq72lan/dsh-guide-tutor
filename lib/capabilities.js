/**
 * lib/capabilities.js —— 前置能力牌（capability）的状态机与成功率贡献。
 *
 * 一句话：任务背后压着一串「必须会的能力」，每张牌只有四种状态——
 *   有(havn't) / 半会(partial) / 没有(lack) / 不知道(unknown)。
 * 「不知道」的那几张，就是用户说的「隐藏项」。
 *
 * 设计依据：knowledge/目标拆解与格-设计摘要.md 与设计表第 5 页。
 * 纯函数，无 IO。
 */

export const CAP_STATE = Object.freeze({
  HAVE: 'have',
  PARTIAL: 'partial',
  LACK: 'lack',
  UNKNOWN: 'unknown',
});

/** 每张牌对成功率的贡献。unknown 取 0.75 而不是 0：不知道有没有 ≠ 没有。 */
export const SATISFACTION = Object.freeze({
  have: 1,
  partial: 0.5,
  lack: 0,
  unknown: 0.75,
});

export const CAP_PARAMS = Object.freeze({
  unknown: 0.75,
  /** 两个以上 unknown 时，每多一个再乘这个系数（未知会互相咬）。 */
  multiUnknown: 0.9,
  /** 没有 lack 时的下限，避免多张 unknown 把概率压到接近 0。 */
  floor: 0.2,
  /** 一个 step 最多挂多少张牌，超过说明这步该拆了。 */
  maxCaps: 10,
});

/** 人人都有、有/无都无所谓的通用能力：展开时到此为止。 */
export const GENERIC_CAPS = Object.freeze([
  'cap-power-on',
  'cap-type',
  'cap-double-click',
  'cap-password',
  'cap-read-cn',
]);

export function isGeneric(capId) {
  return GENERIC_CAPS.includes(capId);
}

/** 旧模型里的 mastery（0~1）换算成牌的状态。 */
export function stateFromMastery(mastery) {
  const v = Number(mastery);
  if (!Number.isFinite(v) || v <= 0) return CAP_STATE.LACK;
  if (v >= 0.8) return CAP_STATE.HAVE;
  return CAP_STATE.PARTIAL;
}

/**
 * 把一个 step 上的前置条件统一成 [{ref, state}]。
 * 兼容四种写法：
 *   capabilities: [{ref, state}]
 *   caps:         [{ref, state}]          （lib/decompose.js 的步骤用这个）
 *   requires:     ['java-basic']          （旧格式，按 knowledge.mastery 推状态）
 *   requires:     [{ref:'java-basic', state:'unknown'}]
 */
export function normalizeCaps(step, skill) {
  const raw = Array.isArray(step?.capabilities)
    ? step.capabilities
    : Array.isArray(step?.caps)
      ? step.caps
      : Array.isArray(step?.requires)
        ? step.requires
        : [];

  const knowledge = skill?.knowledge || {};
  const out = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const mastery = knowledge[item]?.mastery;
      out.push({ ref: item, state: stateFromMastery(mastery) });
    } else if (item && typeof item === 'object' && item.ref) {
      out.push({
        ref: item.ref,
        state: Object.values(CAP_STATE).includes(item.state) ? item.state : CAP_STATE.UNKNOWN,
      });
    }
  }
  return out;
}

/**
 * 前置能力的总满足度：连乘。
 * - 任何一张是 lack，整体直接 0（缺一块拼图就做不成，不接受平均值稀释）
 * - unknown 有两张以上，每多一张再打一折
 * - 没有 lack 时不低于 floor
 */
export function pCap(step, skill, params = CAP_PARAMS) {
  const p = { ...CAP_PARAMS, ...params };
  const caps = normalizeCaps(step, skill);
  if (caps.length === 0) return 1;

  let total = 1;
  let unknown = 0;
  let hasLack = false;

  for (const cap of caps) {
    const factor = Number.isFinite(SATISFACTION[cap.state]) ? SATISFACTION[cap.state] : p.unknown;
    if (cap.state === CAP_STATE.LACK) hasLack = true;
    if (cap.state === CAP_STATE.UNKNOWN) unknown += 1;
    total *= factor;
  }

  if (hasLack) return 0;
  if (unknown >= 2) total *= Math.pow(p.multiUnknown, unknown - 1);
  return Math.max(p.floor, total);
}

/** 按状态分桶，给界面用：已具备 / 缺 / 不确定。 */
export function partitionCaps(step, skill) {
  const caps = normalizeCaps(step, skill);
  return {
    have: caps.filter((c) => c.state === CAP_STATE.HAVE),
    lack: caps.filter((c) => c.state === CAP_STATE.LACK),
    unknown: caps.filter((c) => c.state === CAP_STATE.UNKNOWN),
    partial: caps.filter((c) => c.state === CAP_STATE.PARTIAL),
  };
}

/**
 * 这道闸门决定「要不要把这张牌继续往下拆」。
 * 三条同时满足才展开，否则到此为止——这是防无限归因的唯一机关。
 */
export function expandable(capId, state, { advancing = false, generic = null } = {}) {
  if (state !== CAP_STATE.LACK) return false;
  if (!advancing) return false;
  if (generic === null ? isGeneric(capId) : generic) return false;
  return true;
}

/** 改一张牌的状态，返回新的 step（不改入参）。 */
export function setCapState(step, capId, state) {
  if (!Object.values(CAP_STATE).includes(state)) {
    throw new Error(`unknown cap state: ${state}`);
  }
  const next = JSON.parse(JSON.stringify(step || {}));
  const list = Array.isArray(next.capabilities)
    ? next.capabilities
    : Array.isArray(next.requires)
      ? next.requires.map((r) => (typeof r === 'string' ? { ref: r, state: CAP_STATE.UNKNOWN } : r))
      : [];
  const hit = list.find((c) => c?.ref === capId);
  if (hit) hit.state = state;
  else list.push({ ref: capId, state });
  next.capabilities = list;
  delete next.requires;
  return next;
}

/** 一张 step 还差几张牌、差哪几张，给清单条目上那行小字用。 */
export function capGap(step, skill) {
  const { lack, unknown, partial } = partitionCaps(step, skill);
  return {
    missing: lack.length,
    unsure: unknown.length,
    half: partial.length,
    text:
      lack.length || unknown.length
        ? [lack.length ? `缺 ${lack.length}` : '', unknown.length ? `不确定 ${unknown.length}` : '']
            .filter(Boolean)
            .join(' · ')
        : '齐了',
  };
}
