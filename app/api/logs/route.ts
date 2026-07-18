// 进展记录：手动补记
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    task_id?: number;
    raw_text?: string;
    duration_hours?: number | null;
    blocker?: string | null;
  };
  if (!body.task_id || !body.raw_text?.trim()) {
    return NextResponse.json({ error: 'task_id 和 raw_text 必填' }, { status: 400 });
  }
  const r = getDb()
    .prepare('INSERT INTO logs (task_id, raw_text, duration_hours, blocker) VALUES (?, ?, ?, ?)')
    .run(body.task_id, body.raw_text.trim(), body.duration_hours ?? null, body.blocker || null);
  return NextResponse.json({ id: Number(r.lastInsertRowid) });
}
