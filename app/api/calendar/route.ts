// 月视图数据：按天聚合工作量
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month'); // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month 格式应为 YYYY-MM' }, { status: 400 });
  }
  const db = getDb();

  // 每天：日志数 + 耗时 + 完成的任务数 + 当天截止/计划任务数
  const logs = db
    .prepare(
      `SELECT date(l.created_at) AS day, COUNT(*) AS log_count, COALESCE(SUM(l.duration_hours),0) AS hours
       FROM logs l WHERE strftime('%Y-%m', l.created_at) = ? GROUP BY day`,
    )
    .all(month) as { day: string; log_count: number; hours: number }[];

  const completed = db
    .prepare(
      `SELECT date(completed_at) AS day, COUNT(*) AS c FROM tasks
       WHERE completed_at IS NOT NULL AND strftime('%Y-%m', completed_at) = ? GROUP BY day`,
    )
    .all(month) as { day: string; c: number }[];

  const due = db
    .prepare(
      `SELECT deadline AS day, COUNT(*) AS c FROM tasks
       WHERE deadline IS NOT NULL AND status != '已完成' AND strftime('%Y-%m', deadline) = ? GROUP BY deadline`,
    )
    .all(month) as { day: string; c: number }[];

  const planned = db
    .prepare(
      `SELECT planned_date AS day, COUNT(*) AS c FROM tasks
       WHERE planned_date IS NOT NULL AND status != '已完成' AND strftime('%Y-%m', planned_date) = ? GROUP BY planned_date`,
    )
    .all(month) as { day: string; c: number }[];

  const days: Record<string, { log_count: number; hours: number; completed: number; due: number; planned: number }> = {};
  const ensure = (d: string) => (days[d] ??= { log_count: 0, hours: 0, completed: 0, due: 0, planned: 0 });
  for (const r of logs) { const e = ensure(r.day); e.log_count = r.log_count; e.hours = Math.round(r.hours * 10) / 10; }
  for (const r of completed) ensure(r.day).completed = r.c;
  for (const r of due) ensure(r.day).due = r.c;
  for (const r of planned) ensure(r.day).planned = r.c;

  return NextResponse.json({ month, days });
}
