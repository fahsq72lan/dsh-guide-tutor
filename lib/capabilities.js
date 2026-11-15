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

/**
 * 能力状态的证据来源。只有 output / attempt 算证据；
 * claim（用户自己说的）和 none（没记录）都只能当线索，不能当证据用。
 */
export const EVIDENCE = Object.freeze({
  OUTPUT: 'output', // 有产物、能自检
  ATTEMPT: 'attempt', // 真做过（成或败）
  CLAIM: 'claim', // 用户口头说自己会 / 不会
  NONE: 'none', // 没记录
});

/** 每张牌对成功率的贡献。unknown 取 0.75 而不是 0：不知道有没有 ≠ 没有。 */
export const SATISFACTION = Object.freeze({
  have: 1,
  partial: 0.5,
  lack: 0,
  unknown: 0.75,
  /** 用户自称会、但没有产物 —— 打个折，不能全信。 */
  claimHave: 0.85,
});

/**
 * 把「用户说的」和「实际做过的」分开：
 * - 有证据（output/attempt）→ 按 state 原样计
 * - 只有口头「会」→ 按 claimHave 0.85 计
 * - 只有口头「不会」→ 退回 unknown（没试过不等于不会），并排进验证队列
 * - 没有证据也不能作数的，一律 unknown
 */
export function effectiveState(cap) {
  if (!cap) return CAP_STATE.UNKNOWN;
  const evidence = cap.evidence && typeof cap.evidence === 'object' ? cap.evidence.kind : cap.evidence;
  const hasEvidence = evidence === EVIDENCE.OUTPUT || evidence === EVIDENCE.ATTEMPT;
  if (hasEvidence) return cap.state;
  if (cap.state === CAP_STATE.LACK) return CAP_STATE.UNKNOWN;
  if (cap.state === CAP_STATE.HAVE) return 'claimHave';
  if (cap.state === CAP_STATE.PARTIAL) return 'claimHave';
  return CAP_STATE.UNKNOWN;
}

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
 * 兼容三种写法：
 *   capabilities: [{ref, state}]
 *   requires:     ['java-basic']          （旧格式，按 knowledge.mastery 推状态）
 *   requires:     [{ref:'java-basic', state:'unknown'}]
 */
export function normalizeCaps(step, skill) {
  const raw = Array.isArray(step?.capabilities)
    ? step.capabilities
    : Array.isArray(step?.requires)
      ? step.requires
      : [];

  const knowledge = skill?.knowledge || {};
  const out = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const mastery = knowledge[item]?.mastery;
      out.push({ ref: item, state: stateFromMastery(mastery), evidence: EVIDENCE.ATTEMPT });
    } else if (item && typeof item === 'object' && item.ref) {
      out.push({
        ref: item.ref,
        state: Object.values(CAP_STATE).includes(item.state) ? item.state : CAP_STATE.UNKNOWN,
        evidence: item.evidence || null,
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
    const eff = effectiveState(cap);
    const factor = Number.isFinite(SATISFACTION[eff]) ? SATISFACTION[eff] : p.unknown;
    if (eff === CAP_STATE.LACK) hasLack = true;
    if (eff === CAP_STATE.UNKNOWN) unknown += 1;
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

/**
 * 用一次真实尝试更新一张牌——这是**唯一**能改 state 的入口。
 *
 * 原则：能力状态只由成果推出来，不由用户口头自评改。
 * attempt: {
 *   outcome: 'done' | 'partial' | 'stuck',
 *   artifact: boolean,   // 对得上 check 句、拿得出来的东西
 *   verified: boolean,   // 有没有人（或用户自己）验过
 *   at?: string, stepId?: string,
 * }
 *
 * - done + 有产物 + 验过  → have    （output 证据）
 * - done + 有产物 + 没验  → partial （产物在，但没验货）
 * - done 但没产物         → partial （只算尝试，不算成果）
 * - partial              → partial
 * - stuck                → lack    （真试过，砸了，这才算「不会」）
 */
export function applyAttempt(cap, attempt = {}) {
  const at = attempt.at || new Date().toISOString();
  const outcome = attempt.outcome;
  const artifact = attempt.artifact === true;
  const verified = attempt.verified === true;

  let state = cap?.state || CAP_STATE.UNKNOWN;
  if (outcome === 'done') state = artifact && verified ? CAP_STATE.HAVE : CAP_STATE.PARTIAL;
  else if (outcome === 'partial') state = CAP_STATE.PARTIAL;
  else if (outcome === 'stuck') state = CAP_STATE.LACK;

  return {
    ref: cap?.ref,
    state,
    evidence: {
      kind: artifact ? EVIDENCE.OUTPUT : EVIDENCE.ATTEMPT,
      at,
      outcome,
      stepId: attempt.stepId || null,
    },
  };
}

/**
 * 该先验证哪几张牌。
 * 自称「我会」而没有产物的排最前——这种最危险：它把 p 抬高了，但可能一戳就破。
 * 其次是自称「我不会」但没试过的（可能只是不自信，白拦一道）。
 */
export function verifyQueue(step, skill) {
  const caps = normalizeCaps(step, skill);
  const scored = caps.map((cap) => {
    const evidence = cap.evidence && typeof cap.evidence === 'object' ? cap.evidence.kind : cap.evidence;
    const hasEvidence = evidence === EVIDENCE.OUTPUT || evidence === EVIDENCE.ATTEMPT;
    let priority = 0;
    let why = '';
    if (!hasEvidence && cap.state === CAP_STATE.HAVE) {
      priority = 3;
      why = '自称会，但没有产物';
    } else if (!hasEvidence && cap.state === CAP_STATE.LACK) {
      priority = 2;
      why = '自称不会，但没试过';
    } else if (cap.state === CAP_STATE.UNKNOWN) {
      priority = 1;
      why = '没记录';
    }
    return { ...cap, priority, why };
  });
  return scored.filter((c) => c.priority > 0).sort((a, b) => b.priority - a.priority);
}
