// 自然语言解析：只解析不入库，返回 ParseResult 供前端确认卡片预览
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/prompt';
import { callParse, LlmError } from '@/lib/llm';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { text } = (await req.json()) as { text?: string };
    if (!text || !text.trim()) {
      return NextResponse.json({ error: '输入不能为空' }, { status: 400 });
    }
    const db = getDb();
    const projects = db.prepare("SELECT name FROM projects WHERE status != '完结'").all() as { name: string }[];
    const tasks = db
      .prepare(
        `SELECT t.name, p.name AS project_name, t.status
         FROM tasks t JOIN projects p ON p.id = t.project_id
         WHERE t.status != '已完成'
         ORDER BY t.id DESC LIMIT 100`,
      )
      .all() as { name: string; project_name: string; status: string }[];

    const parsed = await callParse(buildSystemPrompt(projects, tasks), text.trim());
    return NextResponse.json({ parsed });
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error(e);
    return NextResponse.json({ error: '解析失败，请稍后重试' }, { status: 500 });
  }
}
