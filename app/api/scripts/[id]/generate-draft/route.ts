// AI 生成初稿：POST → 存 ai_draft 版本并返回；LLM/JSON 校验失败 502，脚本不存在 404
import { NextRequest, NextResponse } from 'next/server';
import { generateDraft } from '@/lib/generate';
import { LlmError } from '@/lib/llm';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  }
  try {
    const { version, draft } = await generateDraft(id);
    return NextResponse.json({ version, draft });
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
