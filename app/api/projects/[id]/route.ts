// 项目：删除（任务不丢，转入待认领区，可再恢复到其他项目）
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id) as
    | { id: number; name: string }
    | undefined;
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

  const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ?').all(params.id) as {
    id: number;
    priority: number | null;
    name: string;
    status: string;
    deadline: string | null;
    planned_date: string | null;
    is_today: number;
    created_at: string;
    completed_at: string | null;
  }[];

  // 每个任务连同记录/交付物整体快照进待认领区（原话永存原则：raw_text = 任务名）
  const insertUnclaimed = db.prepare('INSERT INTO unclaimed (raw_text, parsed) VALUES (?, ?)');
  for (const t of tasks) {
    const logs = db
      .prepare('SELECT raw_text, parsed, duration_hours, blocker, created_at FROM logs WHERE task_id = ? ORDER BY created_at ASC')
      .all(t.id);
    const deliverables = db.prepare('SELECT name, link, created_at FROM deliverables WHERE task_id = ?').all(t.id);
    const snapshot = JSON.stringify({
      kind: 'project_deleted',
      project_name: project.name,
      task: {
        name: t.name,
        priority: t.priority,
        status: t.status,
        deadline: t.deadline,
        planned_date: t.planned_date,
        is_today: t.is_today,
        created_at: t.created_at,
        completed_at: t.completed_at,
      },
      logs,
      deliverables,
    });
    insertUnclaimed.run(t.name, snapshot);
  }

  db.prepare('DELETE FROM deliverables WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(params.id);
  db.prepare('DELETE FROM logs WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(params.id);
  db.prepare('UPDATE tasks SET parent_task_id = NULL WHERE parent_task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(params.id);
  db.prepare('DELETE FROM tasks WHERE project_id = ?').run(params.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(params.id);

  return NextResponse.json({ ok: true, moved: tasks.length });
}
