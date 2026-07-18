// 项目：列表 + 新建
import { NextRequest, NextResponse } from 'next/server';
import { getDb, nextColor } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const projects = getDb().prepare('SELECT * FROM projects ORDER BY id').all();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const { name, color } = (await req.json()) as { name?: string; color?: string };
  if (!name?.trim()) return NextResponse.json({ error: '项目名不能为空' }, { status: 400 });
  const db = getDb();
  const exists = db.prepare('SELECT id FROM projects WHERE name = ?').get(name.trim());
  if (exists) return NextResponse.json({ error: '项目已存在' }, { status: 409 });
  const r = db
    .prepare('INSERT INTO projects (name, color) VALUES (?, ?)')
    .run(name.trim(), color || nextColor());
  return NextResponse.json({ id: Number(r.lastInsertRowid) });
}
