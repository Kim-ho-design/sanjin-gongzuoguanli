// 周报：两层结构 —— 聚合层收集结构化数据，生成层调 DeepSeek 产出 markdown
// LLM 失败时回退到模板渲染，保证周报永远出得来
import { getDb } from './db';
import { inRange, isOverdue } from './utils';
import { callReport } from './llm';
import type { Task } from './types';

export type ReportType = 'brief' | 'full';

/* ---------------- 聚合层：结构化数据 ---------------- */

export interface ReportDoneTask {
  name: string;
  project_name: string;
  status: string;
  completed_at: string | null;
}

export interface ReportOpenTask {
  name: string;
  project_name: string;
  status: string;
  deadline: string | null;
  sub_done: number;
  sub_total: number;
  open_subtasks: { name: string; planned_date: string | null }[];
}

export interface ReportLog {
  created_at: string;
  task_name: string;
  project_name: string;
  raw_text: string;
}

export interface ReportData {
  start: string;
  end: string;
  /** 区间内完成的父任务（子任务不混入完成统计） */
  done_tasks: ReportDoneTask[];
  /** 全部未完成父任务（状态 ∉ 已完成/待确认审核），含子任务推进情况 → 下周计划平移 */
  open_tasks: ReportOpenTask[];
  /** 区间内全部日志（含挂在子任务上的） */
  logs: ReportLog[];
  /** 历史交付物（若有），由 AI 决定是否提及 */
  deliverables: { task_name: string; name: string; link: string | null }[];
}

type TaskRow = Task & { project_name: string };

export function collectReportData(start: string, end: string): ReportData {
  const db = getDb();
  const parents = db
    .prepare(
      `SELECT t.*, p.name AS project_name
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.parent_task_id IS NULL`,
    )
    .all() as TaskRow[];
  const subs = db
    .prepare(`SELECT id, name, status, planned_date, parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL`)
    .all() as Pick<Task, 'id' | 'name' | 'status' | 'planned_date' | 'parent_task_id'>[];

  const subsByParent = new Map<number, typeof subs>();
  for (const s of subs) {
    if (s.parent_task_id === null) continue;
    const arr = subsByParent.get(s.parent_task_id) ?? [];
    arr.push(s);
    subsByParent.set(s.parent_task_id, arr);
  }

  const done_tasks: ReportDoneTask[] = parents
    .filter(
      (t) =>
        (t.status === '已完成' || t.status === '待确认审核') && inRange(t.completed_at, start, end),
    )
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .map((t) => ({ name: t.name, project_name: t.project_name, status: t.status, completed_at: t.completed_at }));

  const open_tasks: ReportOpenTask[] = parents
    .filter((t) => t.status !== '已完成' && t.status !== '待确认审核')
    .map((t) => {
      const children = subsByParent.get(t.id) ?? [];
      const open = children.filter((s) => s.status !== '已完成');
      return {
        name: t.name,
        project_name: t.project_name,
        status: t.status,
        deadline: t.deadline,
        sub_total: children.length,
        sub_done: children.length - open.length,
        open_subtasks: open.map((s) => ({ name: s.name, planned_date: s.planned_date })),
      };
    });

  const logs = db
    .prepare(
      `SELECT l.created_at, l.raw_text, t.name AS task_name, p.name AS project_name
       FROM logs l JOIN tasks t ON t.id = l.task_id JOIN projects p ON p.id = t.project_id
       WHERE date(l.created_at) BETWEEN ? AND ?
       ORDER BY l.created_at ASC`,
    )
    .all(start, end) as ReportLog[];

  const deliverables = db
    .prepare(
      `SELECT d.name, d.link, t.name AS task_name
       FROM deliverables d JOIN tasks t ON t.id = d.task_id
       ORDER BY d.id`,
    )
    .all() as ReportData['deliverables'];

  return { start, end, done_tasks, open_tasks, logs, deliverables };
}

/* ---------------- 生成层：DeepSeek prompt ---------------- */

const LANGUAGE_RULES = `【语言硬性规则】
- 用真实工作汇报的语言、陈述句描述每一项工作，就像本人亲手写的周报。
- 绝不出现"子任务""副任务""父任务""主任务"这类模板化术语。数据里的 sub_done / sub_total / open_subtasks 描述的是一项工作内部的执行步骤，直接把步骤的进展表述为该工作本身的一部分。例如不要写"子任务「初稿」已完成"，而要写"「XX方案」已完成初稿与排版，剩终审"。
- 不编造数据里没有的事实、数字、日期；拿不准就不写。`;

export function buildReportPrompt(type: ReportType): string {
  const shared = `你是用户的周报撰写助手。用户是实验室仪器行业的内容策划。根据用户提供的工作数据（JSON）写一份中文周报 markdown。

【数据说明】
- done_tasks：区间内完成的工作（completed_at 为完成时间）
- logs：区间内的全部工作记录（raw_text 是用户原话）
- open_tasks：全部未完成的工作；sub_done/sub_total/open_subtasks 是该项工作内部步骤的推进情况
- deliverables：历史交付物，可选择性提及，不要单设区块

${LANGUAGE_RULES}`;
  if (type === 'brief') {
    return `${shared}

【简版要求：向上汇报】
- 结构：# 工作周报（区间） → ## 完成情况 → ## 下周计划
- 完成情况：一句话一个点，先写完成的、再写推进中的，合计 ≤10 条
- 下周计划：把 open_tasks 里的未完成工作平移组织成计划（可结合 deadline 和步骤推进情况排优先级），≤10 条
- 不要"风险/卡点""耗时汇总""交付物"等独立区块
- 只输出 markdown 正文，不要任何解释`;
  }
  return `${shared}

【详版要求：自留复盘】
- 结构：# 工作周报 · 详版（区间） → 按项目分章节（## 项目名）复盘 → ## 下周计划
- 每个项目下结合 logs 里的记录原话，把工作过程和当前进展讲清楚
- 下周计划：把 open_tasks 里的未完成工作平移组织成计划
- 不要"风险/卡点""耗时汇总""交付物"等独立区块
- 只输出 markdown 正文，不要任何解释`;
}

/* ---------------- 兜底：模板渲染（纯函数，不依赖 LLM） ---------------- */

export function renderTemplate(data: ReportData, type: ReportType): string {
  return type === 'brief' ? renderBrief(data) : renderFull(data);
}

function renderBrief(data: ReportData): string {
  const lines: string[] = [];
  for (const t of data.done_tasks) {
    if (lines.length >= 10) break;
    lines.push(`- 完成「${t.name}」（${t.project_name}）`);
  }
  const latestLog = new Map<string, string>();
  for (const l of data.logs) latestLog.set(l.task_name, l.raw_text);
  for (const t of data.open_tasks) {
    if (lines.length >= 10) break;
    const progress = latestLog.get(t.name);
    const subNote = t.sub_total > 0 ? `（已推进 ${t.sub_done}/${t.sub_total} 步）` : '';
    lines.push(`- 「${t.name}」（${t.project_name}）推进中${subNote}${progress ? `：${progress}` : ''}`);
  }

  const nextLines = data.open_tasks.slice(0, 10).map((t) => {
    const subNote =
      t.open_subtasks.length > 0 ? `，剩：${t.open_subtasks.map((s) => s.name).join('、')}` : '';
    return `- 「${t.name}」（${t.project_name}）— 当前：${t.status}${t.deadline ? `，截止 ${t.deadline}` : ''}${subNote}`;
  });

  return [
    `# 工作周报（${data.start} ~ ${data.end}）`,
    '',
    '## 完成情况',
    ...(lines.length ? lines : ['- （本周暂无记录）']),
    '',
    '## 下周计划',
    ...(nextLines.length ? nextLines : ['- （暂无待办）']),
    '',
  ].join('\n');
}

function renderFull(data: ReportData): string {
  const lines: string[] = [`# 工作周报 · 详版（${data.start} ~ ${data.end}）`, ''];

  // 按项目复盘：相关 = 区间内完成 / 未完成 / 区间内有日志
  const projects = Array.from(new Set([...data.done_tasks, ...data.open_tasks].map((t) => t.project_name)));
  const logsByTask = new Map<string, ReportLog[]>();
  for (const l of data.logs) {
    const arr = logsByTask.get(l.task_name) ?? [];
    arr.push(l);
    logsByTask.set(l.task_name, arr);
  }
  for (const p of projects) {
    lines.push(`## ${p}`, '');
    for (const t of data.done_tasks.filter((t) => t.project_name === p)) {
      lines.push(`### 「${t.name}」— ${t.status}`);
      lines.push(`- 完成：${t.completed_at ? t.completed_at.slice(0, 10) : '—'}`);
      lines.push('');
    }
    for (const t of data.open_tasks.filter((t) => t.project_name === p)) {
      lines.push(`### 「${t.name}」— ${t.status}`);
      lines.push(
        `- 截止：${t.deadline ?? '无'} ｜ 步骤推进：${t.sub_total > 0 ? `${t.sub_done}/${t.sub_total}` : '—'}${
          t.open_subtasks.length ? `（剩：${t.open_subtasks.map((s) => s.name).join('、')}）` : ''
        }`,
      );
      lines.push('');
    }
    // 该项目区间内的日志流水
    const plogs = data.logs.filter((l) => l.project_name === p);
    if (plogs.length) {
      lines.push('- 区间记录：');
      for (const l of plogs) lines.push(`  - ${l.created_at.slice(0, 16)}：${l.raw_text}`);
      lines.push('');
    }
  }

  // 漂流瓶：超期未完成（只认 deadline，数据里只有父任务）
  const drifting = data.open_tasks.filter((t) => isOverdue(t.deadline, t.status));
  lines.push('## 漂流瓶（超期未完成）', '');
  if (drifting.length) {
    for (const t of drifting) {
      lines.push(`- 「${t.name}」（${t.project_name}）— 截止 ${t.deadline}，当前：${t.status}`);
    }
  } else {
    lines.push('- 无');
  }
  lines.push('');

  // 下周计划 = 未完成任务平移
  lines.push('## 下周计划', '');
  if (data.open_tasks.length) {
    for (const t of data.open_tasks) {
      const subNote =
        t.open_subtasks.length > 0 ? `，剩：${t.open_subtasks.map((s) => s.name).join('、')}` : '';
      lines.push(`- 「${t.name}」（${t.project_name}）— ${t.status}${t.deadline ? `，截止 ${t.deadline}` : ''}${subNote}`);
    }
  } else {
    lines.push('- （暂无待办）');
  }
  lines.push('');

  return lines.join('\n');
}

/* ---------------- 入口 ---------------- */

/** 按时间区间生成周报（start/end 为 YYYY-MM-DD，闭区间）；LLM 失败自动回退模板渲染 */
export async function generateReport(start: string, end: string, type: ReportType): Promise<string> {
  const data = collectReportData(start, end);
  try {
    return await callReport(buildReportPrompt(type), JSON.stringify(data));
  } catch {
    return renderTemplate(data, type);
  }
}
