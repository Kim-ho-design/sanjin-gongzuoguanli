// 待认领区：删除
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  getDb().prepare('DELETE FROM unclaimed WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
