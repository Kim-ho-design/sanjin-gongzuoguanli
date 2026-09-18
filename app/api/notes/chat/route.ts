// 复盘对话：POST { message, session_id? } → { reply, session_id }；LLM 失败 502
import { NextRequest, NextResponse } from 'next/server';
import { chat } from '@/lib/chat';
import { LlmError } from '@/lib/llm';

export const dynamic = 'force-dynamic';

const MAX_LEN = 2000;

export async function POST(req: NextRequest) {
  let body: { message?: unknown; session_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
  }
  if (message.length > MAX_LEN) {
    return NextResponse.json({ error: `消息最长 ${MAX_LEN} 字` }, { status: 400 });
  }
  let sessionId: number | undefined;
  if (body.session_id !== undefined && body.session_id !== null) {
    sessionId = Number(body.session_id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: 'session_id 无效' }, { status: 400 });
    }
  }
  try {
    return NextResponse.json(await chat(message, sessionId));
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof Error && e.message.includes('会话不存在')) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: '对话失败，请稍后重试' }, { status: 500 });
  }
}
