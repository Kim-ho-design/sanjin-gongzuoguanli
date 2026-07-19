// 某一天的详情：当天日志 + 完成任务 + 截止/计划任务
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date'); // YYYY-MM-DD
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date 格式应为 YYYY-MM-DD' }, { status: 400 });
  }
  const db = getDb();

  const logs = db
    .prepare(
      `SELECT l.id, l.raw_text, l.duration_hours, l.blocker, l.created_at,
              t.name AS task_name, p.name AS project_name, p.color AS project_color
       FROM logs l JOIN tasks t ON t.id = l.task_id JOIN projects p ON p.id = t.project_id
       WHERE date(l.created_at) = ? ORDER BY l.created_at ASC`,
    )
    .all(date);

  const completed = db
    .prepare(
      `SELECT t.id, t.name, t.status, p.name AS project_name, p.color AS project_color
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE date(t.completed_at) = ?`,
    )
    .all(date);

  const due = db
    .prepare(
      `SELECT t.id, t.name, t.status, t.deadline, p.name AS project_name, p.color AS project_color
       FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.deadline = ?`,
    )
    .all(date);

  const planned = db
    .prepare(
      `SELECT t.id, t.name, t.status, t.planned_date, p.name AS project_name, p.color AS project_color
       FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.planned_date = ?`,
    )
    .all(date);

  return NextResponse.json({ date, logs, completed, due, planned });
}
