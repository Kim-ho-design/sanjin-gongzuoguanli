// 复盘对话：会话列表（最近 20 个，按 updated_at 倒序）
import { NextResponse } from 'next/server';
import { listSessions } from '@/lib/chat';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ sessions: listSessions() });
}
