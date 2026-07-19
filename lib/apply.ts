// 解析结果落库：用户确认后把 ParseResult 应用到数据库
// 原则：能匹配就匹配，匹配不到按解析意图创建；挂不上的进待认领区
import { getDb, nextColor } from './db';
import { nowStr } from './utils';
import { TASK_STATUSES } from './types';
import type { ParseResult, ParsedTask, Task } from './types';

export interface ApplySummary {
  actions: string[];
  task_ids: number[];
  unclaimed_id: number | null;
}

function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/** 名称匹配现有任务：先精确（归一化），再互相包含；限定未归档任务 */
export function matchTask(name: string): Task | null {
  const db = getDb();
  const all = db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.status != '归档'`,
    )
    .all() as Task[];
  const target = norm(name);
  if (!target) return null;
  const exact = all.find((t) => norm(t.name) === target);
  if (exact) return exact;
  const partial = all.filter((t) => norm(t.name).includes(target) || target.includes(norm(t.name)));
  return partial[0] ?? null;
}

function findProject(name: string): { id: number; name: string } | null {
  const db = getDb();
  const all = db.prepare('SELECT id, name FROM projects').all() as { id: number; name: string }[];
  const target = norm(name);
  if (!target) return null;
  return (
    all.find((p) => norm(p.name) === target) ??
    all.find((p) => norm(p.name).includes(target) || target.includes(norm(p.name))) ??
    null
  );
}

function createTask(pt: ParsedTask, projectId: number, parentTaskId: number | null): number {
  const db = getDb();
  const status = TASK_STATUSES.includes(pt.status as never) && pt.status ? pt.status : '待启动';
  const completedAt = status === '已完成' || status === '待确认审核' ? nowStr() : null;
  const r = db
    .prepare(
      `INSERT INTO tasks (name, project_id, status, deadline, planned_date, is_plan_item, parent_task_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(pt.name, projectId, status, pt.deadline, pt.planned_date, pt.is_plan_item ? 1 : 0, parentTaskId, completedAt);
  return Number(r.lastInsertRowid);
}

/**
 * 应用解析结果。
 * @param projectChoice 用户在反问环节选择的项目处理方式：
 *   { mode: 'existing', project_id } | { mode: 'new', name } | null（无需反问/维持解析结果）
 */
export function applyParseResult(
  rawText: string,
  parsed: ParseResult,
  projectChoice?: { mode: 'existing'; project_id: number } | { mode: 'new'; name: string } | null,
): ApplySummary {
  const db = getDb();
  const summary: ApplySummary = { actions: [], task_ids: [], unclaimed_id: null };

  // ---- 服务端兜底：拆任务规则确定性执行（不依赖 LLM 发挥） ----
  // 1) 同一任务同时带 deadline 和 planned_date 且不同 → 自动拆出计划任务
  const expanded: ParsedTask[] = [];
  for (const pt of parsed.tasks) {
    if (!pt.is_plan_item && pt.deadline && pt.planned_date && pt.deadline !== pt.planned_date) {
      expanded.push({ ...pt, planned_date: null });
      expanded.push({
        name: pt.name,
        matched_existing: false,
        status: pt.status,
        deadline: null,
        planned_date: pt.planned_date,
        is_plan_item: true,
        parent_task_name: pt.name,
      });
    } else {
      expanded.push(pt);
    }
  }
  // 2) 计划任务没带 parent_task_name → 若同次解析只有一个主任务则指向它
  const mainTasks = expanded.filter((t) => !t.is_plan_item);
  for (const pt of expanded) {
    if (pt.is_plan_item && !pt.parent_task_name && mainTasks.length === 1) {
      pt.parent_task_name = mainTasks[0].name;
    }
  }
  parsed = { ...parsed, tasks: expanded };
  // ----------------------------------------------------------

  const parsedJson = JSON.stringify(parsed);

  // 1. 解析项目归属
  let projectId: number | null = null;
  let projectName = parsed.project.name;

  if (projectChoice?.mode === 'existing') {
    projectId = projectChoice.project_id;
  } else if (projectChoice?.mode === 'new') {
    projectName = projectChoice.name;
  }

  if (projectId === null && projectName) {
    const found = findProject(projectName);
    if (found) {
      projectId = found.id;
      projectName = found.name;
    } else if (parsed.project.is_new || projectChoice?.mode === 'new') {
      const r = db
        .prepare('INSERT INTO projects (name, color) VALUES (?, ?)')
        .run(projectName, nextColor());
      projectId = Number(r.lastInsertRowid);
      summary.actions.push(`新建项目「${projectName}」`);
    }
  }

  // 2. 处理任务列表（先建主任务，再处理 parent 关联，支持拆任务）
  const createdByName = new Map<string, number>();
  const resolvedTaskIds: { pt: ParsedTask; id: number; existed: boolean }[] = [];

  for (const pt of parsed.tasks) {
    if (!pt.name) continue;
    if (pt.matched_existing) {
      const existing = matchTask(pt.name);
      if (existing) {
        resolvedTaskIds.push({ pt, id: existing.id, existed: true });
        if (!createdByName.has(norm(pt.name))) createdByName.set(norm(pt.name), existing.id);
        if (projectId === null) projectId = existing.project_id;
        continue;
      }
      // 声称匹配但库里没有 → 当成新任务（落库时如实记录，不编造）
    }
    if (projectId === null) {
      // 挂不上项目：整条进待认领区（需求文档第 6 节）
      const r = db
        .prepare('INSERT INTO unclaimed (raw_text, parsed) VALUES (?, ?)')
        .run(rawText, parsedJson);
      summary.unclaimed_id = Number(r.lastInsertRowid);
      summary.actions.push('无法确定项目归属，已放入待认领区');
      return summary;
    }
    const id = createTask(pt, projectId, null);
    resolvedTaskIds.push({ pt, id, existed: false });
    // 同名任务保留先建的（主任务）映射，避免计划任务覆盖导致父子关联指向自己
    if (!createdByName.has(norm(pt.name))) createdByName.set(norm(pt.name), id);
    summary.task_ids.push(id);
    summary.actions.push(`新建任务「${pt.name}」${pt.deadline ? `（截止 ${pt.deadline}）` : ''}${pt.planned_date ? `（计划 ${pt.planned_date}）` : ''}`);
  }

  // 回填 parent_task_id（拆任务规则：计划任务指向主任务）
  for (const { pt, id } of resolvedTaskIds) {
    if (pt.parent_task_name) {
      const parentId =
        createdByName.get(norm(pt.parent_task_name)) ?? matchTask(pt.parent_task_name)?.id ?? null;
      if (parentId && parentId !== id) {
        db.prepare('UPDATE tasks SET parent_task_id = ? WHERE id = ?').run(parentId, id);
      }
    }
  }

  // 3. 按意图执行状态变更 / 记日志
  const firstTask = resolvedTaskIds[0];

  if (parsed.intent === 'update_task') {
    for (const { pt, id } of resolvedTaskIds) {
      const target = TASK_STATUSES.includes(pt.status as never) && pt.status ? pt.status : '待确认审核';
      db.prepare(
        `UPDATE tasks SET status = ?, completed_at = CASE WHEN ? IN ('已完成','待确认审核') THEN ? ELSE completed_at END WHERE id = ?`,
      ).run(target, target, nowStr(), id);
      summary.actions.push(`任务状态 → ${target}`);
    }
  }

  if (parsed.intent === 'log_progress' || parsed.log.content || parsed.log.blocker || parsed.log.deliverable) {
    if (firstTask) {
      db.prepare(
        `INSERT INTO logs (task_id, raw_text, parsed, duration_hours, blocker) VALUES (?, ?, ?, ?, ?)`,
      ).run(firstTask.id, rawText, parsedJson, parsed.log.duration_hours, parsed.log.blocker || null);
      summary.actions.push('已记录进展');
      // log_progress 时若任务还在「待启动」，顺手推进到「进行中」
      db.prepare(`UPDATE tasks SET status = '进行中' WHERE id = ? AND status = '待启动'`).run(firstTask.id);
      if (parsed.log.deliverable) {
        db.prepare('INSERT INTO deliverables (task_id, name) VALUES (?, ?)').run(
          firstTask.id,
          parsed.log.deliverable,
        );
        summary.actions.push(`交付物「${parsed.log.deliverable}」已登记`);
      }
    } else if (parsed.intent === 'log_progress') {
      // 有日志内容但挂不上任务 → 待认领区
      const r = db
        .prepare('INSERT INTO unclaimed (raw_text, parsed) VALUES (?, ?)')
        .run(rawText, parsedJson);
      summary.unclaimed_id = Number(r.lastInsertRowid);
      summary.actions.push('这句话暂时挂不上任务，已放入待认领区');
      return summary;
    }
  }

  if (parsed.intent === 'unclear' || (resolvedTaskIds.length === 0 && parsed.intent !== 'weekly_review')) {
    const r = db
      .prepare('INSERT INTO unclaimed (raw_text, parsed) VALUES (?, ?)')
      .run(rawText, parsedJson);
    summary.unclaimed_id = Number(r.lastInsertRowid);
    summary.actions.push('未识别出明确意图，已放入待认领区');
  }

  return summary;
}
