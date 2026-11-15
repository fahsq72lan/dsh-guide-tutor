/**
 * lib/skill.js —— user-skill.json 的读写层：这台机器对这个人的能力估计。
 *
 * 和 goals.json 分开：目标是「要做什么」，能力是「他能做多少」。
 * 形状和 lib/units.js 的 emptySkill() 对齐，多一个 caps（全局能力牌状态）。
 *
 * 谁能写：
 *   - 完成/放弃一步时（guide_goal done / guide_plan done）→ record()
 *   - 用户回答「会 / 不会 / 不确定」时 → setCap()
 */
import fs from 'node:fs';
import path from 'node:path';
import { emptySkill } from './units.js';
import { CAP_STATE, SATISFACTION, GENERIC_CAPS, isGeneric } from './capabilities.js';

const OUTCOMES = ['done', 'partial', 'stuck'];

export function createSkill({ dataDir, log = () => {} }) {
  const file = path.join(dataDir, 'user-skill.json');
  let cache = { mtime: -1, data: emptySkill() };

  function read() {
    try {
      const stat = fs.statSync(file);
      if (cache.mtime === stat.mtimeMs) return cache.data;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const merged = { ...emptySkill(), ...data, params: { ...emptySkill().params, ...(data?.params || {}) } };
      cache = { mtime: stat.mtimeMs, data: merged };
      return merged;
    } catch (error) {
      if (error?.code !== 'ENOENT') log(`skill read failed: ${error?.message ?? error}`);
      return cache.data;
    }
  }

  function save(next) {
    const data = { ...next, version: 1, updatedAt: new Date().toISOString() };
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    cache = { mtime: -1, data };
    return data;
  }

  /**
   * 记一次结果。outcome: done / partial / stuck。
   * 只写 kinds 与 estimateBias（旧的 types 保留兼容，不再新增）。
   */
  function record({ kind = 'demo', outcome = 'done', plannedUnits = 1, actualUnits = 0 } = {}) {
    if (!OUTCOMES.includes(outcome)) throw new Error(`unknown outcome: ${outcome}`);
    const skill = read();
    const kinds = { ...(skill.kinds || {}) };
    const cell = { ...(kinds[kind] || { done: 0, partial: 0, stuck: 0 }) };
    cell[outcome] = (cell[outcome] || 0) + 1;
    kinds[kind] = cell;

    // 估时偏差：实际用时 / 计划格数，EMA 平滑，夹在 0.5–2 之间
    let estimateBias = Number(skill.estimateBias) || 1;
    if (actualUnits > 0 && plannedUnits > 0) {
      const ratio = Math.min(2, Math.max(0.5, actualUnits / plannedUnits));
      estimateBias = Math.round((estimateBias * 0.7 + ratio * 0.3) * 100) / 100;
    }

    return save({ ...skill, kinds, estimateBias });
  }

  /** 设置一张能力牌的状态。会 / 半会 / 不会 / 不确定。 */
  function setCap(ref, state) {
    const id = String(ref || '').trim();
    if (!id) throw new Error('cap ref is empty');
    if (!Object.values(CAP_STATE).includes(state)) throw new Error(`unknown cap state: ${state}`);
    if (isGeneric(id)) throw new Error(`generic cap 不用记：${id}`);
    const skill = read();
    const caps = { ...(skill.caps || {}), [id]: state };
    return save({ ...skill, caps });
  }

  /** 种子：从已有 knowledge（mastery）推一把能力牌状态，只补缺的。 */
  function seedFromKnowledge() {
    const skill = read();
    const caps = { ...(skill.caps || {}) };
    let added = 0;
    for (const [ref, mastery] of Object.entries(skill.knowledge || {})) {
      if (caps[ref] !== undefined || isGeneric(ref)) continue;
      const m = Number(mastery);
      caps[ref] = m >= 0.8 ? CAP_STATE.HAVE : m > 0 ? CAP_STATE.PARTIAL : CAP_STATE.LACK;
      added += 1;
    }
    if (!added) return { added: 0, skill };
    return { added, skill: save({ ...skill, caps }) };
  }

  function satisfaction(ref) {
    const state = read().caps?.[ref];
    return state ? SATISFACTION[state] ?? 0.75 : SATISFACTION.unknown;
  }

  function summary() {
    const skill = read();
    const kinds = Object.entries(skill.kinds || {}).map(([kind, cell]) => {
      const total = (cell.done || 0) + (cell.partial || 0) + (cell.stuck || 0);
      const rate = total ? Math.round(((cell.done + cell.partial * 0.5) / total) * 100) : null;
      return { kind, total, rate };
    });
    const caps = Object.entries(skill.caps || {});
    return {
      file,
      kinds,
      estimateBias: skill.estimateBias,
      caps: {
        total: caps.length,
        have: caps.filter(([, s]) => s === CAP_STATE.HAVE).length,
        partial: caps.filter(([, s]) => s === CAP_STATE.PARTIAL).length,
        lack: caps.filter(([, s]) => s === CAP_STATE.LACK).length,
        unknown: caps.filter(([, s]) => s === CAP_STATE.UNKNOWN).length,
      },
      generic: GENERIC_CAPS.length,
    };
  }

  return { file, read, save, record, setCap, seedFromKnowledge, satisfaction, summary, CAP_STATE };
}
