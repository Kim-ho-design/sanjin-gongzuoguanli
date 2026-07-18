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
  };
  if (!body.name?.trim() || !body.project_id) {
    return NextResponse.json({ error: '任务名和项目必填' }, { status: 400 });
  }
  const status = TASK_STATUSES.includes(body.status as never) ? body.status : '待启动';
  const r = getDb()
    .prepare(
      `INSERT INTO tasks (name, project_id, status, deadline, planned_date, is_today)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      body.name.trim(),
      body.project_id,
      status,
      body.deadline || null,
      body.planned_date || null,
      body.is_today ? 1 : 0,
    );
  return NextResponse.json({ id: Number(r.lastInsertRowid) });
}
