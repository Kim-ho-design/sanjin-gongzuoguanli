import { isPriority } from '@/lib/priority';
// 任务详情 / 更新 / 删除
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { TASK_STATUSES } from '@/lib/types';
import { nowStr, isValidDateStr } from '@/lib/utils';
import { cascadeCompleteChildren, restoreCascadeChildren } from '@/lib/task-status';

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
    .prepare('SELECT id, name, status, planned_date, deadline, priority, parent_task_id FROM tasks WHERE parent_task_id = ?')
    .all(params.id);
  return NextResponse.json({ task, logs, deliverables, sub_tasks: subTasks });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const body = (await req.json()) as Partial<{
    priority: unknown;
    name: string;
    status: string;
    deadline: string | null;
    planned_date: string | null;
    is_today: boolean;
    project_id: number;
    completed_date: string | null;
  }>;
  if ('priority' in body && !isPriority(body.priority)) {
    return NextResponse.json({ error: 'priority 必须为 1、2、3、4 或 null' }, { status: 400 });
  }
  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: '任务名不能为空' }, { status: 400 });
  }
  if (body.completed_date !== undefined && body.completed_date !== null && !isValidDateStr(body.completed_date)) {
    return NextResponse.json({ error: 'completed_date 格式应为 YYYY-MM-DD' }, { status: 400 });
  }
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as
    | { status: string; parent_task_id: number | null }
    | undefined;
  if (!existing) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  if (body.project_id !== undefined) {
    const proj = db.prepare('SELECT id FROM projects WHERE id = ?').get(body.project_id);
    if (!proj) return NextResponse.json({ error: '目标项目不存在' }, { status: 400 });
  }

  // 日期校验：格式必须合法；父任务不写 planned_date（排期用子任务）、子任务不写 deadline（恒 null）
  if (body.deadline !== undefined) {
    if (existing.parent_task_id !== null) {
      return NextResponse.json({ error: '子任务没有对外截止，日期请改 planned_date' }, { status: 400 });
    }
    if (body.deadline !== null && !isValidDateStr(body.deadline)) {
      return NextResponse.json({ error: 'deadline 格式应为 YYYY-MM-DD' }, { status: 400 });
    }
  }
  if (body.planned_date !== undefined) {
    if (existing.parent_task_id === null) {
      return NextResponse.json({ error: '父任务不使用计划日期，排期请通过子任务' }, { status: 400 });
    }
    if (body.planned_date !== null && !isValidDateStr(body.planned_date)) {
      return NextResponse.json({ error: 'planned_date 格式应为 YYYY-MM-DD' }, { status: 400 });
    }
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  // 级联动作先记账，最终随主 UPDATE 一起进事务执行（审查修复 M2：多步写原子化）
  let cascadeCompleteAt: string | null = null;
  let cascadeRestore = false;
  if (body.priority !== undefined) {
    sets.push('priority = ?');
    vals.push(body.priority);
  }
  if (body.name !== undefined) {
    sets.push('name = ?');
    vals.push(body.name.trim());
  }
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status as never)) {
      return NextResponse.json({ error: '非法状态' }, { status: 400 });
    }
    sets.push('status = ?');
    vals.push(body.status);
    if (body.status === '已完成') {
      // 同请求内完成时间统一：手动修正 completed_date 时级联子任务用同一时间，避免父子落不同天（审查修复 L9）
      const at = body.completed_date ? `${body.completed_date} 12:00:00` : nowStr();
      sets.push('completed_at = ?');
      vals.push(at);
      if (existing.parent_task_id === null) cascadeCompleteAt = at;
    } else {
      if (existing.status === '已完成') {
        sets.push('completed_at = NULL');
        if (existing.parent_task_id === null) cascadeRestore = true;
      }
      // 子任务被单独改状态 → 清掉 prev_status，避免脏数据导致误恢复
      if (existing.parent_task_id !== null) {
        sets.push('prev_status = NULL');
      }
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
  const taskId = Number(params.id);
  db.transaction(() => {
    if (cascadeCompleteAt) cascadeCompleteChildren(taskId, cascadeCompleteAt);
    if (cascadeRestore) restoreCascadeChildren(taskId);
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  })();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM deliverables WHERE task_id = ?').run(params.id);
    db.prepare('DELETE FROM logs WHERE task_id = ?').run(params.id);
    db.prepare('UPDATE tasks SET parent_task_id = NULL WHERE parent_task_id = ?').run(params.id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(params.id);
  })();
  return NextResponse.json({ ok: true });
}
