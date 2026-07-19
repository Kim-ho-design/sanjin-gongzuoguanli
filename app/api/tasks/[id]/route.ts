// 任务详情 / 更新 / 删除
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { TASK_STATUSES } from '@/lib/types';
import { nowStr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const db = getDb();
  const task = db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color
       FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`,
    )
    .get(params.id);
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  const logs = db
    .prepare('SELECT id, task_id, raw_text, duration_hours, blocker, created_at FROM logs WHERE task_id = ? ORDER BY created_at ASC')
    .all(params.id);
  const deliverables = db.prepare('SELECT * FROM deliverables WHERE task_id = ?').all(params.id);
  const subTasks = db
    .prepare('SELECT id, name, status, planned_date, deadline FROM tasks WHERE parent_task_id = ?')
    .all(params.id);
  return NextResponse.json({ task, logs, deliverables, sub_tasks: subTasks });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const body = (await req.json()) as Partial<{
    name: string;
    status: string;
    deadline: string | null;
    planned_date: string | null;
    is_today: boolean;
    project_id: number;
    completed_date: string | null;
  }>;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as
    | { status: string }
    | undefined;
  if (!existing) return NextResponse.json({ error: '任务不存在' }, { status: 404 });

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.name !== undefined) {
    sets.push('name = ?');
    vals.push(body.name);
  }
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status as never)) {
      return NextResponse.json({ error: '非法状态' }, { status: 400 });
    }
    sets.push('status = ?');
    vals.push(body.status);
    if (body.status === '已完成' || body.status === '待确认审核') {
      sets.push('completed_at = ?');
      vals.push(nowStr());
    } else if (existing.status === '已完成' || existing.status === '待确认审核') {
      sets.push('completed_at = NULL');
    }
  }
  if (body.deadline !== undefined) {
    sets.push('deadline = ?');
    vals.push(body.deadline);
  }
  if (body.planned_date !== undefined) {
    sets.push('planned_date = ?');
    vals.push(body.planned_date);
  }
  if (body.is_today !== undefined) {
    sets.push('is_today = ?');
    vals.push(body.is_today ? 1 : 0);
  }
  if (body.completed_date !== undefined) {
    // 手动修正实际完成时间（YYYY-MM-DD 或 null）
    sets.push('completed_at = ?');
    vals.push(body.completed_date ? `${body.completed_date} 12:00:00` : null);
  }
  if (body.project_id !== undefined) {
    sets.push('project_id = ?');
    vals.push(body.project_id);
  }
  if (sets.length === 0) return NextResponse.json({ ok: true });
  vals.push(params.id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const db = getDb();
  db.prepare('DELETE FROM deliverables WHERE task_id = ?').run(params.id);
  db.prepare('DELETE FROM logs WHERE task_id = ?').run(params.id);
  db.prepare('UPDATE tasks SET parent_task_id = NULL WHERE parent_task_id = ?').run(params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
