// 日期工具：统一本地时区，日期格式 YYYY-MM-DD

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

/** 是否逾期：deadline 早于今天且任务未完结 */
export function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline) return false;
  if (status === '已完成') return false;
  return deadline < todayStr();
}

export function inRange(dateStr: string | null, start: string, end: string): boolean {
  if (!dateStr) return false;
  const day = dateStr.slice(0, 10);
  return day >= start && day <= end;
}
