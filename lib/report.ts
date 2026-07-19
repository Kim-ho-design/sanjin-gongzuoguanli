// 周报：服务端聚合 + 双口径模板渲染（模板与数据分离，需求文档第 5 节 + 用户追加格式要求）
import { getDb } from './db';
import { inRange, todayStr } from './utils';
import type { Task, Log, Deliverable, Project } from './types';

interface TaskRow extends Task {
  project_name: string;
  project_color: string;
}

function loadTasks(): TaskRow[] {
  return getDb()
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color
       FROM tasks t JOIN projects p ON p.id = t.project_id`,
    )
    .all() as TaskRow[];
}

function loadLogs(start: string, end: string): (Log & { task_name: string; project_name: string })[] {
  return getDb()
    .prepare(
      `SELECT l.*, t.name AS task_name, p.name AS project_name
       FROM logs l JOIN tasks t ON t.id = l.task_id JOIN projects p ON p.id = t.project_id
       WHERE date(l.created_at) BETWEEN ? AND ?
       ORDER BY l.created_at ASC`,
    )
    .all(start, end) as (Log & { task_name: string; project_name: string })[];
}

function loadDeliverables(taskIds: number[]): Deliverable[] {
  if (taskIds.length === 0) return [];
  const marks = taskIds.map(() => '?').join(',');
  return getDb()
    .prepare(`SELECT * FROM deliverables WHERE task_id IN (${marks})`)
    .all(...taskIds) as Deliverable[];
}

function nextRange(end: string, days = 7): { start: string; end: string } {
  const s = new Date(`${end}T00:00:00`);
  s.setDate(s.getDate() + 1);
  const e = new Date(s);
  e.setDate(e.getDate() + days - 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(s), end: fmt(e) };
}

export type ReportType = 'brief' | 'full';

/** 按时间区间生成报告（start/end 为 YYYY-MM-DD，闭区间） */
export function generateReport(start: string, end: string, type: ReportType): string {
  const tasks = loadTasks();
  const logs = loadLogs(start, end);
  const title = `${start} ~ ${end}`;
  return type === 'brief' ? renderBrief(title, tasks, logs, start, end) : renderFull(title, tasks, logs, start, end);
}

/* ---------------- 简版（向上汇报） ----------------
 * 用户追加要求：一句话一个点；本周完成情况+进度 ≤10 条；
 * 下周计划仅收录明确涉及下周的事项，同样 ≤10 条。 */
function renderBrief(
  title: string,
  tasks: TaskRow[],
  logs: ReturnType<typeof loadLogs>,
  start: string,
  end: string,
): string {
  const done = tasks.filter((t) => inRange(t.completed_at, start, end) || (inRange(t.created_at, start, end) && t.status === '已完成'));
  const doneThisWeek = done.filter((t) => t.status === '已完成' || t.status === '待确认审核');
  const deliverables = loadDeliverables(doneThisWeek.map((t) => t.id));

  const inProgress = tasks.filter((t) => t.status === '进行中' || t.status === '待确认审核');

  // 每个进行中任务取本周最后一条 log 作为「一句话进度」
  const latestLogByTask = new Map<number, string>();
  for (const l of logs) latestLogByTask.set(l.task_id, l.raw_text);

  const lines: string[] = [];
  // 先排已完成（按完成时间倒序），再排进行中进度
  const doneSorted = [...doneThisWeek].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  for (const t of doneSorted) {
    if (lines.length >= 10) break;
    const dlist = deliverables.filter((d) => d.task_id === t.id).map((d) => d.name);
    lines.push(`- 完成「${t.name}」（${t.project_name}）${dlist.length ? `，交付：${dlist.join('、')}` : ''}`);
  }
  for (const t of inProgress) {
    if (lines.length >= 10) break;
    if (doneThisWeek.some((d) => d.id === t.id)) continue;
    const progress = latestLogByTask.get(t.id);
    lines.push(`- 「${t.name}」（${t.project_name}）推进中${progress ? `：${progress}` : ''}`);
  }

  // 风险/卡点
  const blockers = logs.filter((l) => l.blocker);
  const blockerLines = blockers.map((l) => `- 「${l.task_name}」：${l.blocker}`);

  // 下周计划：仅下周有明确日期的事项（planned_date / deadline 落在下周）
  const nw = nextRange(end);
  const nextItems = tasks.filter(
    (t) =>
      t.status !== '已完成' &&
      (inRange(t.planned_date, nw.start, nw.end) || inRange(t.deadline, nw.start, nw.end)),
  );
  const nextLines = nextItems.slice(0, 10).map((t) => {
    const date = t.planned_date ?? t.deadline;
    const kind = t.planned_date ? '计划' : '截止';
    return `- ${date} ${kind}：「${t.name}」（${t.project_name}）`;
  });

  return [
    `# 工作周报（${title}）`,
    '',
    '## 完成情况',
    ...(lines.length ? lines : ['- （本周暂无记录）']),
    '',
    '## 风险 / 卡点',
    ...(blockerLines.length ? blockerLines : ['- 无']),
    '',
    '## 后续 7 天计划',
    ...(nextLines.length ? nextLines : ['- （暂无明确排期）']),
    '',
  ].join('\n');
}

/* ---------------- 详版（自留复盘） ---------------- */
function renderFull(
  title: string,
  tasks: TaskRow[],
  logs: ReturnType<typeof loadLogs>,
  start: string,
  end: string,
): string {
  const projects = getDb().prepare('SELECT * FROM projects ORDER BY id').all() as Project[];
  const today = todayStr();
  const lines: string[] = [`# 工作周报 · 详版（${title}）`, ''];

  const weekLogsByTask = new Map<number, typeof logs>();
  for (const l of logs) {
    const arr = weekLogsByTask.get(l.task_id) ?? [];
    arr.push(l);
    weekLogsByTask.set(l.task_id, arr);
  }

  for (const p of projects) {
    const pts = tasks.filter((t) => t.project_id === p.id);
    // 本周相关：本周有日志 / 本周完成 / 本周创建 / 进行中
    const relevant = pts.filter(
      (t) =>
        weekLogsByTask.has(t.id) ||
        inRange(t.completed_at, start, end) ||
        inRange(t.created_at, start, end) ||
        t.status === '进行中' ||
        t.status === '待确认审核',
    );
    if (relevant.length === 0) continue;

    lines.push(`## ${p.name}`, '');
    for (const t of relevant) {
      const dlist = loadDeliverables([t.id]);
      lines.push(`### 「${t.name}」— ${t.status}`);
      lines.push(
        `- 计划：${t.planned_date ?? '未排'} ｜ 截止：${t.deadline ?? '无'} ｜ 完成：${t.completed_at ? t.completed_at.slice(0, 10) : '未完成'}`,
      );
      const tlogs = weekLogsByTask.get(t.id) ?? [];
      if (tlogs.length) {
        lines.push('- 区间记录：');
        for (const l of tlogs) {
          const meta = [l.duration_hours ? `${l.duration_hours}h` : '', l.blocker ? `卡点：${l.blocker}` : '']
            .filter(Boolean)
            .join(' ｜ ');
          lines.push(`  - ${l.created_at.slice(0, 16)}：${l.raw_text}${meta ? `（${meta}）` : ''}`);
        }
      }
      if (dlist.length) lines.push(`- 交付物：${dlist.map((d) => (d.link ? `[${d.name}](${d.link})` : d.name)).join('、')}`);
      lines.push('');
    }
  }

  // 耗时汇总
  const totalHours = logs.reduce((s, l) => s + (l.duration_hours ?? 0), 0);
  lines.push('## 耗时汇总', '');
  lines.push(`- 区间记录总耗时：${totalHours > 0 ? `${totalHours} 小时` : '未记录'}`, '');

  // 未完成漂流瓶：逾期未动
  const drifting = tasks.filter(
    (t) =>
      t.status !== '已完成' &&
      ((t.deadline && t.deadline < today) || (t.planned_date && t.planned_date < today)),
  );
  lines.push('## 漂流瓶（超期未完成）', '');
  if (drifting.length) {
    for (const t of drifting) {
      lines.push(`- 「${t.name}」（${t.project_name}）— ${t.deadline ? `截止 ${t.deadline}` : `计划 ${t.planned_date}`}，当前：${t.status}`);
    }
  } else {
    lines.push('- 无');
  }
  lines.push('');

  // 下周计划
  const nw = nextRange(end);
  const nextItems = tasks.filter(
    (t) =>
      t.status !== '已完成' &&
      (inRange(t.planned_date, nw.start, nw.end) || inRange(t.deadline, nw.start, nw.end)),
  );
  lines.push('## 后续 7 天计划', '');
  if (nextItems.length) {
    for (const t of nextItems) {
      const date = t.planned_date ?? t.deadline;
      lines.push(`- ${date}：「${t.name}」（${t.project_name}）`);
    }
  } else {
    lines.push('- （暂无明确排期）');
  }
  lines.push('');

  return lines.join('\n');
}
