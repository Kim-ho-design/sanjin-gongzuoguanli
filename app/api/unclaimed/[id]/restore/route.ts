// 待认领区：把「已删项目的任务」恢复到指定项目（连记录/交付物一起还原）
import { NextRequest, NextResponse } from 'next/server';
import { getDb, nextColor } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

interface DeletedTaskSnapshot {
  kind: 'project_deleted';
  project_name: string;
  task: {
    name: string;
    status: string;
    deadline: string | null;
    planned_date: string | null;
    is_today: number;
    created_at: string;
    completed_at: string | null;
  };
  logs: { raw_text: string; parsed: string | null; duration_hours: number | null; blocker: string | null; created_at: string }[];
  deliverables: { name: string; link: string | null; created_at: string }[];
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const body = (await req.json()) as { project_id?: number; new_project_name?: string };
  const db = getDb();
  const item = db.prepare('SELECT * FROM unclaimed WHERE id = ?').get(params.id) as
    | { raw_text: string; parsed: string | null }
    | undefined;
  if (!item) return NextResponse.json({ error: '记录不存在' }, { status: 404 });

  let snap: DeletedTaskSnapshot | null = null;
  try {
    const p = item.parsed ? (JSON.parse(item.parsed) as DeletedTaskSnapshot) : null;
    if (p && p.kind === 'project_deleted' && p.task?.name) snap = p;
  } catch {
    /* 非快照格式 */
  }
  if (!snap) return NextResponse.json({ error: '这条不是已删项目的任务，无法恢复' }, { status: 400 });

  // 解析目标项目：existing id 优先，其次按名新建
  let projectId = body.project_id ?? null;
  if (projectId !== null) {
    const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!exists) return NextResponse.json({ error: '目标项目不存在' }, { status: 404 });
  } else if (body.new_project_name?.trim()) {
    const name = body.new_project_name.trim();
    const found = db.prepare('SELECT id FROM projects WHERE name = ?').get(name) as { id: number } | undefined;
    if (found) {
      projectId = found.id;
    } else {
      const r = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)').run(name, nextColor());
      projectId = Number(r.lastInsertRowid);
    }
  } else {
    return NextResponse.json({ error: '请选择要恢复到的项目' }, { status: 400 });
  }

  const t = snap.task;
  const r = db
    .prepare(
      `INSERT INTO tasks (name, project_id, status, deadline, planned_date, is_plan_item, parent_task_id, is_today, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
    )
    .run(t.name, projectId, t.status, t.deadline, t.planned_date, t.is_today ? 1 : 0, t.created_at, t.completed_at);
  const taskId = Number(r.lastInsertRowid);

  const insertLog = db.prepare(
    'INSERT INTO logs (task_id, raw_text, parsed, duration_hours, blocker, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const l of snap.logs) insertLog.run(taskId, l.raw_text, l.parsed, l.duration_hours, l.blocker, l.created_at);

  const insertDel = db.prepare('INSERT INTO deliverables (task_id, name, link, created_at) VALUES (?, ?, ?, ?)');
  for (const d of snap.deliverables) insertDel.run(taskId, d.name, d.link, d.created_at);

  db.prepare('DELETE FROM unclaimed WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true, task_id: taskId });
}
