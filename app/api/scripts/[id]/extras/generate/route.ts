// 配套产出 AI 生成：POST { type: caption|tags|comments } → 存 script_extras 并返回；LLM 失败 502
import { NextRequest, NextResponse } from 'next/server';
import { generateExtra } from '@/lib/generate';
import { LlmError } from '@/lib/llm';
import { isScriptExtraType } from '@/lib/scripts';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  }
  let body: { type?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  if (!isScriptExtraType(body.type)) {
    return NextResponse.json({ error: 'type 应为 caption、tags 或 comments' }, { status: 400 });
  }
  try {
    return NextResponse.json(await generateExtra(id, body.type));
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof Error && e.message === '脚本不存在') {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: '生成失败，请稍后重试' }, { status: 500 });
  }
}
