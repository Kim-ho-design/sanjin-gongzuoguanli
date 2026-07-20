// 任务：手动新建
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { TASK_STATUSES } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    project_id?: number;
    status?: string;
    deadline?: string | null;
    planned_date?: string | null;
    is_today?: boolean;
    parent_task_id?: number | null;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: '任务名必填' }, { status: 400 });
  }
  const db = getDb();
  // 子任务：挂到父任务下，项目跟随父任务，deadline 恒 null、is_today 恒 0
  let parentId: number | null = null;
  let projectId = body.project_id ?? null;
  if (body.parent_task_id) {
    const parent = db
      .prepare('SELECT id, project_id FROM tasks WHERE id = ?')
      .get(body.parent_task_id) as { id: number; project_id: number } | undefined;
    if (!parent) return NextResponse.json({ error: '父任务不存在' }, { status: 404 });
    parentId = parent.id;
    projectId = parent.project_id;
  }
  if (!projectId) {
    return NextResponse.json({ error: '任务名和项目必填' }, { status: 400 });
  }
  const status = TASK_STATUSES.includes(body.status as never) ? body.status : '待启动';
  const completedAt = status === '已完成' || status === '待确认审核' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
  const r = db
    .prepare(
      `INSERT INTO tasks (name, project_id, status, deadline, planned_date, parent_task_id, is_today, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      body.name.trim(),
      projectId,
      status,
      parentId ? null : body.deadline || null,
      body.planned_date || null,
      parentId,
      parentId ? 0 : body.is_today ? 1 : 0,
      completedAt,
    );
  return NextResponse.json({ id: Number(r.lastInsertRowid) });
}
