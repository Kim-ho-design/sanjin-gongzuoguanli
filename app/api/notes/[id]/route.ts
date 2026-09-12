// 随手记：删除
import { NextRequest, NextResponse } from 'next/server';
import { deleteNote } from '@/lib/notes';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  }
  if (!deleteNote(id)) {
    return NextResponse.json({ error: '记录不存在' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
