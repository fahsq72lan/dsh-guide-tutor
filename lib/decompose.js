/**
 * lib/decompose.js —— 目标拆解的纯函数：校验、排序、派发、进度、回写。
 *
 * 只做「数据形状」的事，不调模型。拆解草案由模型在聊天里生成，
 * 这里负责把它校验成能落地的东西，并且把「做完一步」反映到目标进度上。
 *
 * 结构（2026-11-15 15:40 起，步骤可以无限往下分）：
 *   Goal
 *    └ milestones[]
 *       └ steps[]
 *          └ children[]     ← 同构递归，想拆多深拆多深
 *             └ children[] …
 *
 * 规则（这几条是行为约定，不只是形状）：
 *   - 有子步骤的步骤叫「组步」，没有的叫「实步」。
 *   - 进度、格数、派发只算实步（叶子），组步不重复计数。
 *   - 勾组步 = 把它的子步骤全勾上；子步骤全做完，组步自动算完成。
 *   - 派发只派实步，且祖先链上没有 dropped。
 *
 * 术语见 knowledge/目标拆解与格-设计摘要.md。
 */

export const STEP_STATUS = Object.freeze({
  TODO: 'todo',
  DOING: 'doing',
  DONE: 'done',
  DROPPED: 'dropped',
});

export const GOAL_STATUS = Object.freeze({
  ACTIVE: 'active',
  DONE: 'done',
  PAUSED: 'paused',
});

/** 产物类型 → 默认格数（和 lib/units.js 的 KIND_UNITS 保持一致）。 */
export const KIND_UNITS = Object.freeze({
  read: 0.5,
  demo: 1,
  fix: 1,
  drill: 1,
  feature: 2,
  design: 3,
});

export const MAX_UNITS = 3;
export const MAX_MILESTONES = 6;
export const MAX_STEPS_PER_MILESTONE = 12;
/** 嵌套深度硬上限。用户要求「一直分支下去」，这里只防手滑写出无穷递归。 */
export const MAX_DEPTH = 8;

/** 验收句里不允许出现的「不可判定动词」。 */
// 2026-11-15 14:15：不再做语义判断——验收句只要用户自己认，不硬拦。
// 保留这条注释备查：曾用 ['掌握','了解','熟悉','学好','学会','搞懂','理解'] 判 vague-acceptance，已移除。

export function makeStepId(goalId, milestoneId, stepId) {
  return [goalId, milestoneId, stepId].filter(Boolean).join('-');
}

export function makeMilestoneId(index) {
  return `m${index + 1}`;
}

export function makeLocalStepId(index) {
  return `s${index + 1}`;
}

function str(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeStep(st, { goalId, milestoneId, parentStepId = null, depth = 1, index = 0 }) {
  const localId = str(st?.id, 20) || makeLocalStepId(index);
  const stepId = parentStepId ? `${parentStepId}-${localId}` : makeStepId(goalId, milestoneId, localId);
  const kind = Object.keys(KIND_UNITS).includes(st?.kind) ? st.kind : 'demo';
  // 不在这夹上限：超限要让 validateGoal 报出来，别悄悄改小。
  const units = Number.isFinite(Number(st?.units)) ? Math.max(0.5, Number(st.units)) : KIND_UNITS[kind];
  const childrenRaw = Array.isArray(st?.children) ? st.children : [];
  const children = childrenRaw.map((c, i) =>
    normalizeStep(c, { goalId, milestoneId, parentStepId: stepId, depth: depth + 1, index: i }),
  );
  return {
    id: localId,
    stepId,
    depth,
    title: str(st?.title, 120),
    product: str(st?.product, 160),
    check: str(st?.check, 200),
    kind,
    units,
    children,
    dependsOn: Array.isArray(st?.dependsOn) ? st.dependsOn.map((x) => str(x, 40)).filter(Boolean) : [],
    caps: Array.isArray(st?.caps) ? st.caps.filter((c) => c && c.ref) : [],
    status: Object.values(STEP_STATUS).includes(st?.status) ? st.status : STEP_STATUS.TODO,
    doneAt: st?.doneAt || null,
    attempts: Array.isArray(st?.attempts) ? st.attempts.slice(-20) : [],
  };
}

/** 把外部传来的目标补成完整形状（缺的字段给默认值，不丢已有的）。 */
export function normalizeGoal(raw = {}, index = 0) {
  const id = str(raw.id, 40) || `g${index + 1}`;
  const milestones = Array.isArray(raw.milestones) ? raw.milestones : [];
  return {
    id,
    text: str(raw.text ?? raw.title, 200),
    acceptance: str(raw.acceptance, 300),
    status: Object.values(GOAL_STATUS).includes(raw.status) ? raw.status : GOAL_STATUS.ACTIVE,
    createdAt: raw.createdAt || new Date().toISOString(),
    milestones: milestones.map((ms, mi) => {
      const mId = str(ms?.id, 20) || makeMilestoneId(mi);
      const steps = Array.isArray(ms?.steps) ? ms.steps : [];
      return {
        id: mId,
        title: str(ms?.title, 120),
        status: Object.values(GOAL_STATUS).includes(ms?.status) ? ms.status : GOAL_STATUS.ACTIVE,
        steps: steps.map((st, si) => normalizeStep(st, { goalId: id, milestoneId: mId, depth: 1, index: si })),
      };
    }),
  };
}

/** 深度优先遍历一棵步骤树，回调拿到 (step, parentStep, ancestors)。 */
export function walkSteps(steps, visit, parent = null, ancestors = []) {
  for (const step of steps) {
    visit(step, parent, ancestors);
    if (step.children && step.children.length) walkSteps(step.children, visit, step, [...ancestors, step]);
  }
}

/** 所有层级的步骤（组步 + 实步）。 */
export function flattenSteps(goal) {
  const out = [];
  for (const ms of goal.milestones) walkSteps(ms.steps, (step) => out.push(step));
  return out;
}

/** 只有叶子（实步）——进度、格数、派发都按这个算。 */
export function leafSteps(goal) {
  const out = [];
  for (const ms of goal.milestones) walkSteps(ms.steps, (step) => {
    if (!step.children || step.children.length === 0) out.push(step);
  });
  return out;
}

export function isBranch(step) {
  return Boolean(step.children && step.children.length);
}

/** 摊平成 [{goal, milestone, step, parent}]，含所有层级。 */
export function flattenGoals(goals) {
  const out = [];
  for (const goal of goals) {
    for (const ms of goal.milestones) {
      walkSteps(ms.steps, (step, parent) => out.push({ goal, milestone: ms, step, parent }));
    }
  }
  return out;
}

/** 按 stepId 找一个步骤。 */
export function findStep(goal, stepId) {
  for (const ms of goal.milestones) {
    let found = null;
    walkSteps(ms.steps, (step) => {
      if (step.stepId === stepId) found = step;
    });
    if (found) return found;
  }
  return null;
}

/**
 * 校验一个目标能不能落地。返回 problems 数组，空数组 = 通过。
 * 每条 problem 形如 { code, where, message }。
 */
export function validateGoal(goal) {
  const g = normalizeGoal(goal);
  const problems = [];

  if (!g.text) problems.push({ code: 'goal-text', where: g.id, message: '目标一句话是空的' });

  if (!g.acceptance) {
    problems.push({ code: 'no-acceptance', where: g.id, message: '缺验收句：怎么算做完，说一句你认的就行' });
  }

  if (!g.milestones.length) {
    problems.push({ code: 'no-milestone', where: g.id, message: '还没有阶段：目标 → 阶段 → 步骤 中间缺一层' });
  }
  if (g.milestones.length > MAX_MILESTONES) {
    problems.push({
      code: 'too-many-milestones',
      where: g.id,
      message: `阶段 ${g.milestones.length} 个，超过 ${MAX_MILESTONES}：先合并成几个大台阶`,
    });
  }

  for (const ms of g.milestones) {
    if (!ms.title) problems.push({ code: 'milestone-title', where: `${g.id}/${ms.id}`, message: '阶段没有标题' });
    if (!ms.steps.length) {
      problems.push({ code: 'milestone-empty', where: `${g.id}/${ms.id}`, message: '这个阶段还没有步骤' });
    }
    if (ms.steps.length > MAX_STEPS_PER_MILESTONE) {
      problems.push({
        code: 'too-many-steps',
        where: `${g.id}/${ms.id}`,
        message: `这阶段 ${ms.steps.length} 步，超过 ${MAX_STEPS_PER_MILESTONE}：说明阶段本身还太大`,
      });
    }
    walkSteps(ms.steps, (st) => {
      if (!st.title) problems.push({ code: 'step-title', where: st.stepId, message: '步骤没有标题' });
      if (!isBranch(st)) {
        if (!st.product) problems.push({ code: 'step-product', where: st.stepId, message: '步骤没写产物：做完能拿出什么' });
        if (!st.check) problems.push({ code: 'step-check', where: st.stepId, message: '步骤没写怎么验：看到什么算过' });
        if (st.units > MAX_UNITS) {
          problems.push({
            code: 'step-too-big',
            where: st.stepId,
            message: `${st.units} 格超过上限 ${MAX_UNITS}，继续拆`,
          });
        }
      }
      if (st.depth > MAX_DEPTH) {
        problems.push({
          code: 'too-deep',
          where: st.stepId,
          message: `嵌套到第 ${st.depth} 层了，超过 ${MAX_DEPTH} 层基本是拆歪了`,
        });
      }
    });
  }

  // 依赖必须存在，且不能成环
  const all = new Set(flattenGoals([g]).map((x) => x.step.stepId));
  for (const { step } of flattenGoals([g])) {
    for (const dep of step.dependsOn) {
      if (!all.has(dep)) {
        problems.push({ code: 'dep-missing', where: step.stepId, message: `依赖的 ${dep} 不存在` });
      }
    }
  }
  if (hasCycle(g)) problems.push({ code: 'dep-cycle', where: g.id, message: '步骤依赖成环了' });

  return problems;
}

function hasCycle(goal) {
  const deps = new Map();
  for (const { step } of flattenGoals([goal])) deps.set(step.stepId, step.dependsOn || []);
  const state = new Map(); // 0 未访问 1 栈中 2 完成
  const visit = (id) => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const next of deps.get(id) || []) if (visit(next)) return true;
    state.set(id, 2);
    return false;
  };
  for (const id of deps.keys()) if (visit(id)) return true;
  return false;
}

/** 依赖都做完了、且自己还没开始的实步。按依赖拓扑 + 阶段顺序排。 */
export function availableSteps(goals) {
  const all = flattenGoals(goals);
  const doneSet = new Set(all.filter((x) => x.step.status === STEP_STATUS.DONE).map((x) => x.step.stepId));
  const droppedSet = new Set(
    all.filter((x) => x.step.status === STEP_STATUS.DROPPED).map((x) => x.step.stepId),
  );
  return all.filter(({ step, parent }) => {
    if (isBranch(step)) return false; // 组步不派，派它的孩子
    if (step.status !== STEP_STATUS.TODO && step.status !== STEP_STATUS.DOING) return false;
    if (parent && droppedSet.has(parent.stepId)) return false;
    return step.dependsOn.every((dep) => doneSet.has(dep));
  });
}

/**
 * 今天该派哪几步。规则：
 *  1. 只派实步（叶子）
 *  2. 依赖已满足
 *  3. 目标 active（暂停的目标不派）
 *  4. 按「阶段顺序 → 步骤顺序」排
 *  5. 最多 limit 步，且累计格数不超过 maxUnits（默认 3 格/天）
 */
export function nextSteps(goals, { limit = 3, maxUnits = 3 } = {}) {
  const picked = [];
  let units = 0;
  for (const item of availableSteps(goals)) {
    if (picked.length >= limit) break;
    if (item.goal.status !== GOAL_STATUS.ACTIVE) continue;
    if (units + item.step.units > maxUnits && picked.length > 0) continue;
    picked.push(item);
    units += item.step.units;
  }
  return picked;
}

/** 把一步的产物变成清单条目草案（还没进 plan.json）。 */
export function toPlanItem({ goal, milestone, step }, { from = '', to = '', place = '' } = {}) {
  return {
    from,
    to,
    place,
    title: step.title.slice(0, 40),
    goalId: goal.id,
    milestoneId: milestone.id,
    stepId: step.stepId,
    note: step.check ? `验：${step.check}`.slice(0, 40) : '',
    priority: step.units >= 2 ? 'P1' : 'P2',
  };
}

/** 子步骤全 done/dropped 时，把祖先也标成对应状态（自底向上）。 */
function syncAncestors(goal) {
  const visit = (steps, ancestors) => {
    for (const step of steps) {
      if (isBranch(step)) {
        visit(step.children, [...ancestors, step]);
        const kids = step.children;
        const allDone = kids.every((k) => k.status === STEP_STATUS.DONE);
        const allClosed = kids.every((k) => k.status === STEP_STATUS.DONE || k.status === STEP_STATUS.DROPPED);
        if (allDone) {
          step.status = STEP_STATUS.DONE;
          step.doneAt = step.doneAt || new Date().toISOString();
        } else if (allClosed) {
          step.status = STEP_STATUS.DROPPED;
        } else if (step.status === STEP_STATUS.DONE) {
          // 孩子被撤销了，父也得退回去
          step.status = STEP_STATUS.TODO;
          step.doneAt = null;
        }
      }
    }
  };
  for (const ms of goal.milestones) visit(ms.steps, []);
}

/** 把某个组步的所有后代置成同一个状态。 */
function cascade(step, status, at) {
  if (!isBranch(step)) return;
  for (const kid of step.children) {
    kid.status = status;
    kid.doneAt = status === STEP_STATUS.DONE ? at : null;
    cascade(kid, status, at);
  }
}

/** 改一步的状态，返回新的 goals（不改入参）。 */
export function setStepStatus(goals, stepId, status, { at = new Date().toISOString(), minutes = 0 } = {}) {
  if (!Object.values(STEP_STATUS).includes(status)) throw new Error(`unknown step status: ${status}`);
  const next = JSON.parse(JSON.stringify(goals));
  for (const goal of next) {
    const step = findStep(goal, stepId);
    if (!step) continue;
    step.status = status;
    step.doneAt = status === STEP_STATUS.DONE ? at : null;
    if (status === STEP_STATUS.DONE || status === STEP_STATUS.DOING) {
      step.attempts = [...(step.attempts || []), { at, status, minutes }].slice(-20);
    }
    // 勾组步 → 子步全跟着；取消组步 → 子步也全退回
    if (isBranch(step) && (status === STEP_STATUS.DONE || status === STEP_STATUS.TODO)) {
      cascade(step, status, at);
    }
    syncAncestors(goal);
    recomputeProgress(next);
    return next;
  }
  throw new Error(`step not found: ${stepId}`);
}

/**
 * 把一步拆成子步骤。children 形状和普通步骤一样（title/product/check/kind/units 可选）。
 * 已有的子步骤会保留，新的按 id 冲突时递增。
 */
export function splitStep(goals, stepId, children = []) {
  const next = JSON.parse(JSON.stringify(goals));
  for (const goal of next) {
    const step = findStep(goal, stepId);
    if (!step) continue;
    const existing = Array.isArray(step.children) ? step.children : [];
    const used = new Set(existing.map((c) => c.id));
    let seq = existing.length;
    for (const raw of children) {
      if (!raw || (!raw.title && !raw.text)) continue;
      let local;
      do {
        seq += 1;
        local = `s${seq}`;
      } while (used.has(local));
      used.add(local);
      const kind = Object.keys(KIND_UNITS).includes(raw.kind) ? raw.kind : 'demo';
      const units = Number.isFinite(Number(raw.units)) ? Math.max(0.5, Number(raw.units)) : KIND_UNITS[kind];
      const child = {
        id: local,
        stepId: `${step.stepId}-${local}`,
        depth: (step.depth || 1) + 1,
        title: str(raw.title ?? raw.text, 120),
        product: str(raw.product, 160),
        check: str(raw.check, 200),
        kind,
        units,
        children: [],
        dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
        caps: Array.isArray(raw.caps) ? raw.caps : [],
        status: STEP_STATUS.TODO,
        doneAt: null,
        attempts: [],
      };
      existing.push(child);
    }
    step.children = existing;
    // 组步自己不再算格数，交给孩子
    if (existing.length && !step.units) step.units = 1;
    syncAncestors(goal);
    recomputeProgress(next);
    return next;
  }
  throw new Error(`step not found: ${stepId}`);
}

function recomputeProgress(goals) {
  for (const goal of goals) {
    for (const ms of goal.milestones) {
      const leaves = [];
      walkSteps(ms.steps, (step) => {
        if (!isBranch(step)) leaves.push(step);
      });
      if (!leaves.length) continue;
      const done = leaves.filter((s) => s.status === STEP_STATUS.DONE).length;
      const dropped = leaves.filter((s) => s.status === STEP_STATUS.DROPPED).length;
      if (done + dropped === leaves.length) ms.status = GOAL_STATUS.DONE;
      else if (ms.status === GOAL_STATUS.DONE) ms.status = GOAL_STATUS.ACTIVE;
    }
    const all = leafSteps(goal);
    if (all.length && all.every((s) => s.status === STEP_STATUS.DONE || s.status === STEP_STATUS.DROPPED)) {
      goal.status = GOAL_STATUS.DONE;
    } else if (goal.status === GOAL_STATUS.DONE) {
      goal.status = GOAL_STATUS.ACTIVE;
    }
  }
}

/** 组步上的「做了几个 / 共几个」，给看板和工具用。 */
export function branchCount(step) {
  const leaves = [];
  walkSteps([step], (s) => {
    if (s !== step && !isBranch(s)) leaves.push(s);
  });
  return {
    done: leaves.filter((s) => s.status === STEP_STATUS.DONE).length,
    total: leaves.length,
  };
}

/** 进度：总体 + 分阶段 + 今天完成了几步（都按实步算）。 */
export function goalProgress(goal) {
  const all = leafSteps(goal);
  const done = all.filter((s) => s.status === STEP_STATUS.DONE).length;
  const dropped = all.filter((s) => s.status === STEP_STATUS.DROPPED).length;
  const total = all.length;
  const unitsDone = all.filter((s) => s.status === STEP_STATUS.DONE).reduce((n, s) => n + s.units, 0);
  const unitsTotal = all.reduce((n, s) => n + s.units, 0);
  return {
    total,
    done,
    dropped,
    percent: total ? Math.round(((done + dropped) / total) * 100) : 0,
    unitsDone: Math.round(unitsDone * 10) / 10,
    unitsTotal: Math.round(unitsTotal * 10) / 10,
    milestones: goal.milestones.map((m) => {
      const leaves = [];
      walkSteps(m.steps, (s) => {
        if (!isBranch(s)) leaves.push(s);
      });
      return {
        id: m.id,
        title: m.title,
        status: m.status,
        done: leaves.filter((s) => s.status === STEP_STATUS.DONE).length,
        total: leaves.length,
      };
    }),
  };
}

/** 一句话进度，给工具返回和卡片用。 */
export function progressLine(goal) {
  const p = goalProgress(goal);
  const unitPart = p.unitsTotal ? `（${p.unitsDone}/${p.unitsTotal} 格）` : '';
  return `${goal.text || goal.id}：${p.done}/${p.total} 步${unitPart} ${p.percent}%`;
}
