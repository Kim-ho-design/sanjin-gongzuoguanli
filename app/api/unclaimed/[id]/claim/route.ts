// 待认领区：认领 → 挂到指定任务（记为 Log）
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { task_id } = (await req.json()) as { task_id?: number };
  if (!task_id) return NextResponse.json({ error: 'task_id 必填' }, { status: 400 });
  const db = getDb();
  const item = db.prepare('SELECT * FROM unclaimed WHERE id = ?').get(params.id) as
    | { raw_text: string; parsed: string | null }
    | undefined;
  if (!item) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
  db.prepare('INSERT INTO logs (task_id, raw_text, parsed) VALUES (?, ?, ?)').run(
    task_id,
    item.raw_text,
    item.parsed,
  );
  db.prepare(`UPDATE tasks SET status = '进行中' WHERE id = ? AND status = '待启动'`).run(task_id);
  db.prepare('DELETE FROM unclaimed WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
