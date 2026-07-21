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

/** 是否逾期：date 早于今天且任务未完成（父任务看 deadline，子任务看 planned_date） */
export function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline) return false;
  if (status === '已完成') return false;
  return deadline < todayStr();
}

/**
 * 本周完成率口径（v7.1 起纳入子任务）：
 * 分母 = deadline 落在本周的父任务 + planned_date 落在本周的子任务（不论状态）
 * 分子 = 其中状态「已完成」的
 */
export function weekCompletion(
  tasks: { deadline: string | null; planned_date: string | null; status: string; parent_task_id: number | null }[],
  today: string,
): { done: number; total: number } {
  const { start, end } = weekRange(today);
  const inWeek = tasks.filter((t) => {
    const date = t.parent_task_id === null ? t.deadline : t.planned_date; // 父看截止，子看计划
    return date !== null && date >= start && date <= end;
  });
  return { done: inWeek.filter((t) => t.status === '已完成').length, total: inWeek.length };
}

export function inRange(dateStr: string | null, start: string, end: string): boolean {
  if (!dateStr) return false;
  const day = dateStr.slice(0, 10);
  return day >= start && day <= end;
}

/** 严格校验：YYYY-MM-DD 格式且为真实存在的日期 */
export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toDateStr(d) === s;
}

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

/** YYYY-MM-DD → 周X（本地时区） */
export function weekdayCn(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS_CN[d.getDay()];
}

/** 自动统计看板分列（v8）：父任务看 deadline、子任务看 planned_date；未完结=状态≠已完成 */
export function splitByProgress<
  T extends { deadline: string | null; planned_date: string | null; status: string; parent_task_id: number | null },
>(tasks: T[], today: string): { todo: T[]; doing: T[]; done: T[] } {
  const todo: T[] = [];
  const doing: T[] = [];
  const done: T[] = [];
  const dateOf = (t: T) => (t.parent_task_id === null ? t.deadline : t.planned_date);
  for (const t of tasks) {
    if (t.status === '已完成') {
      done.push(t);
      continue;
    }
    const date = dateOf(t);
    // 待启动 = 日期在未来或无日期；进行中 = 日期≤今天（含超期）
    if (date === null || date > today) todo.push(t);
    else doing.push(t);
  }
  // 超期置顶：进行中按日期升序（最久超期在最前）
  doing.sort((a, b) => (dateOf(a) ?? '').localeCompare(dateOf(b) ?? ''));
  return { todo, doing, done };
}

/** 补记兜底：日志有内容但任务列表为空时，生成一条可编辑的预填任务（名称取日志内容摘要） */
export function prefillTaskFromLog(logContent: string): ParsedTask {
  const summary = logContent.replace(/\s+/g, '').slice(0, 20);
  return {
    name: summary || '补记的工作',
    matched_existing: false,
    status: '已完成',
    deadline: null,
    parent_task_name: null,
    subtasks: [],
  };
}
