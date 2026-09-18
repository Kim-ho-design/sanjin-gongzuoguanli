// 复盘对话：单个会话的全部消息（GET，时间正序）+ 删会话（DELETE，连同消息）
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, getSessionMessages } from '@/lib/chat';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  }
  const messages = getSessionMessages(id);
  if (messages == null) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  }
  return NextResponse.json({ messages });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  }
  if (!deleteSession(id)) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
