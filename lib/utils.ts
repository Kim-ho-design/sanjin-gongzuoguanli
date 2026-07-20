// 日期工具：统一本地时区，日期格式 YYYY-MM-DD
import type { ParsedTask } from './types';

export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function nowStr(): string {
  const d = new Date();
  return `${toDateStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** 以周一为起点的自然周，返回 [周一, 周日] */
export function weekRange(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // 周一=1 ... 周日=7
  const start = addDays(dateStr, 1 - dow);
  const end = addDays(start, 6);
  return { start, end };
}

/** 是否逾期：deadline 早于今天且任务未完结（待确认审核=已交付待验收，不算逾期） */
export function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline) return false;
  if (status === '已完成' || status === '待确认审核') return false;
  return deadline < todayStr();
}

/** 本周完成率口径：分母 = deadline 落在本周的父任务（不论状态）；分子 = 其中「已完成」（待确认审核不计入） */
export function weekCompletion(
  tasks: { deadline: string | null; status: string; parent_task_id: number | null }[],
  today: string,
): { done: number; total: number } {
  const { start, end } = weekRange(today);
  const parents = tasks.filter(
    (t) =>
      t.parent_task_id === null &&
      t.deadline !== null &&
      t.deadline >= start &&
      t.deadline <= end,
  );
  return { done: parents.filter((t) => t.status === '已完成').length, total: parents.length };
}

export function inRange(dateStr: string | null, start: string, end: string): boolean {
  if (!dateStr) return false;
  const day = dateStr.slice(0, 10);
  return day >= start && day <= end;
}

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

/** YYYY-MM-DD → 周X（本地时区） */
export function weekdayCn(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS_CN[d.getDay()];
}

/** 今日计划分组：父任务满足今日条件（星标/今天截止）或有今日到期的未完成子任务 → 成组返回 */
export function groupTodayItems<
  T extends { id: number; status: string; is_today: number; deadline: string | null },
  S extends { status: string; planned_date: string | null; parent_task_id: number | null },
>(tasks: T[], subtasks: S[], today: string): { task: T; subs: S[] }[] {
  const subsByParent = new Map<number, S[]>();
  for (const s of subtasks) {
    if (s.parent_task_id === null) continue;
    if (s.status === '已完成' || s.planned_date !== today) continue;
    const arr = subsByParent.get(s.parent_task_id) ?? [];
    arr.push(s);
    subsByParent.set(s.parent_task_id, arr);
  }
  const groups: { task: T; subs: S[] }[] = [];
  for (const t of tasks) {
    const isToday = t.status !== '已完成' && (t.is_today === 1 || t.deadline === today);
    const subs = subsByParent.get(t.id) ?? [];
    if (isToday || subs.length > 0) groups.push({ task: t, subs });
  }
  // 星标父任务置顶
  groups.sort((a, b) => (b.task.is_today ?? 0) - (a.task.is_today ?? 0));
  return groups;
}

/** 补记兜底：日志有内容但任务列表为空时，生成一条可编辑的预填任务（名称取日志内容摘要） */
export function prefillTaskFromLog(logContent: string): ParsedTask {
  const summary = logContent.replace(/\s+/g, '').slice(0, 20);
  return {
    name: summary || '补记的工作',
    matched_existing: false,
    status: '待确认审核',
    deadline: null,
    parent_task_name: null,
    subtasks: [],
  };
}
