// 交付物：登记
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { task_id?: number; name?: string; link?: string | null };
  if (!body.task_id || !body.name?.trim()) {
    return NextResponse.json({ error: 'task_id 和 name 必填' }, { status: 400 });
  }
  const r = getDb()
    .prepare('INSERT INTO deliverables (task_id, name, link) VALUES (?, ?, ?)')
    .run(body.task_id, body.name.trim(), body.link || null);
  return NextResponse.json({ id: Number(r.lastInsertRowid) });
}
