/**
 * lib/goals.js —— goals.json 的读写层。
 *
 * 文件形状兼容两种：
 *   [{id, text, status}]                 老版本（只有名字）
 *   {updatedAt, goals:[...]}             现在用的（带 milestones/steps）
 * 写回一律用后者。
 *
 * 所有写操作都走 save()，会顺手把 updatedAt 刷新。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  GOAL_STATUS,
  STEP_STATUS,
  normalizeGoal,
  setStepStatus,
  splitStep,
  findStep,
  validateGoal,
  goalProgress,
} from './decompose.js';

export function createGoals({ dataDir, log = () => {} }) {
  const file = path.join(dataDir, 'goals.json');
  let cache = { mtime: -1, list: [] };
  // 读失败时不要把「空列表」当成事实：add/remove 一写就会把整份文件冲掉。
  // 出错就把坏文件另存一份，并禁止后续写盘，等人来看。
  let broken = false;

  function readRaw() {
    try {
      const stat = fs.statSync(file);
      if (cache.mtime === stat.mtimeMs) return cache.list;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const raw = Array.isArray(data) ? data : Array.isArray(data?.goals) ? data.goals : [];
      const list = raw.map((item, index) => normalizeGoal(item, index)).filter((g) => g.text);
      broken = false;
      cache = { mtime: stat.mtimeMs, list };
      return list;
    } catch (error) {
      cache = { mtime: -1, list: [] };
      if (error?.code === 'ENOENT') {
        broken = false;
        return [];
      }
      broken = true;
      log(`goals read failed: ${error?.message ?? error}`);
      try {
        const backup = path.join(dataDir, `goals.broken-${Date.now()}.json`);
        fs.copyFileSync(file, backup);
        log(`goals.json 读不出来，已另存 ${backup}，本次不写盘`);
      } catch {}
      return [];
    }
  }

  function save(list) {
    if (broken) throw new Error('goals.json 当前读不出来，为防覆盖已拒绝写盘（坏文件另有备份）');
    const payload = {
      updatedAt: new Date().toISOString(),
      goals: list.map((g, index) => normalizeGoal(g, index)),
    };
    fs.mkdirSync(dataDir, { recursive: true });
    const text = `${JSON.stringify(payload, null, 2)}\n`;
    fs.writeFileSync(file, text, 'utf8');
    cache = { mtime: -1, list: payload.goals };
    return payload.goals;
  }

  return {
    file,
    /** 全部目标（含已完成的）。 */
    read: readRaw,
    /** 只在用的目标，给 edict / plan 用。 */
    active: () => readRaw().filter((g) => g.status === GOAL_STATUS.ACTIVE),
    get: (id) => readRaw().find((g) => g.id === id) || null,

    /** 新建一个空目标（还没拆）。 */
    add({ text, acceptance = '' }) {
      const list = readRaw();
      const n = list.length + 1;
      let id = `g${n}`;
      while (list.some((g) => g.id === id)) id = `g${Number(id.slice(1)) + 1}`;
      const goal = normalizeGoal({ id, text, acceptance, status: GOAL_STATUS.ACTIVE, milestones: [] });
      save([...list, goal]);
      return goal;
    },

    /** 覆盖某个目标的阶段/步骤（模型拆完以后整块写回）。 */
    setMilestones(id, milestones) {
      const list = readRaw();
      const index = list.findIndex((g) => g.id === id);
      if (index < 0) throw new Error(`goal not found: ${id}`);
      const goal = normalizeGoal({ ...list[index], milestones });
      const problems = validateGoal(goal);
      if (problems.length) {
        const error = new Error(`goal invalid: ${problems.map((p) => p.message).join('；')}`);
        error.problems = problems;
        throw error;
      }
      list[index] = goal;
      save(list);
      return goal;
    },

    /** 只改验收句 / 标题 / 状态。 */
    patch(id, patch = {}) {
      const list = readRaw();
      const index = list.findIndex((g) => g.id === id);
      if (index < 0) throw new Error(`goal not found: ${id}`);
      const goal = normalizeGoal({ ...list[index], ...patch });
      list[index] = goal;
      save(list);
      return goal;
    },

    remove(id) {
      const list = readRaw().filter((g) => g.id !== id);
      save(list);
      return list;
    },

    /** 勾一步完成/退回。返回 { goal, step, progress }。 */
    setStepStatus(stepId, status, { minutes = 0 } = {}) {
      const list = readRaw();
      const next = setStepStatus(list, stepId, status, { minutes });
      save(next);
      const goal = next.find((g) => Boolean(findStep(g, stepId))) || null;
      const step = goal ? findStep(goal, stepId) : null;
      return {
        goal: goal ? { id: goal.id, text: goal.text, status: goal.status } : null,
        step: step ? { stepId: step.stepId, title: step.title, status: step.status } : null,
        progress: goal ? goalProgress(goal) : null,
      };
    },

    /** 把一步拆成子步骤（可反复调用，越拆越细）。 */
    splitStep(stepId, children = []) {
      const list = readRaw();
      const next = splitStep(list, stepId, children);
      save(next);
      const goal = next.find((g) => Boolean(findStep(g, stepId))) || null;
      const step = goal ? findStep(goal, stepId) : null;
      return {
        goal: goal ? { id: goal.id, text: goal.text } : null,
        step: step ? { stepId: step.stepId, title: step.title, children: step.children?.length || 0 } : null,
        progress: goal ? goalProgress(goal) : null,
      };
    },

    snapshot() {
      return readRaw().map((g) => ({ ...g, progress: goalProgress(g) }));
    },

    STEP_STATUS,
  };
}
