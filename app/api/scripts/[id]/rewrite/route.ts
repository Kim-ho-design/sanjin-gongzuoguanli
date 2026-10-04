// 局部改写：POST { text, instruction } → { rewritten }；只输出改写后文本，LLM 失败 502
import { NextRequest, NextResponse } from 'next/server';
import { rewrite } from '@/lib/generate';
import { LlmError } from '@/lib/llm';
import { getScript } from '@/lib/scripts';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const MAX_TEXT = 4000;
const MAX_INSTRUCTION = 200;

export async function POST(req: NextRequest, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  }
  let body: { text?: unknown; instruction?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'text 不能为空' }, { status: 400 });
  }
  if (text.length > MAX_TEXT) {
    return NextResponse.json({ error: `text 最长 ${MAX_TEXT} 字` }, { status: 400 });
  }
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (!instruction) {
    return NextResponse.json({ error: 'instruction 不能为空' }, { status: 400 });
  }
  if (instruction.length > MAX_INSTRUCTION) {
    return NextResponse.json({ error: `instruction 最长 ${MAX_INSTRUCTION} 字` }, { status: 400 });
  }
  const script = getScript(id);
  if (!script) return NextResponse.json({ error: '脚本不存在' }, { status: 404 });
  try {
    return NextResponse.json(await rewrite(text, instruction, script.account));
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error(e);
    return NextResponse.json({ error: '改写失败，请稍后重试' }, { status: 500 });
  }
}
