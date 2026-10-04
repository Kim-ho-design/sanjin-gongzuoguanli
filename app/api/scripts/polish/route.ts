// 润色脚本：POST { account, text } → { polished }；text ≤8000 字，LLM 失败 502
import { NextRequest, NextResponse } from 'next/server';
import { polishScript } from '@/lib/generate';
import { LlmError } from '@/lib/llm';
import { isScriptAccount } from '@/lib/scripts';

export const dynamic = 'force-dynamic';

const MAX_LEN = 8000;

export async function POST(req: NextRequest) {
  let body: { account?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  if (!isScriptAccount(body.account)) {
    return NextResponse.json({ error: 'account 应为 yizhanshi 或 laiqiao' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'text 不能为空' }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: `text 最长 ${MAX_LEN} 字` }, { status: 400 });
  }
  try {
    return NextResponse.json(await polishScript(body.account, text));
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error(e);
    return NextResponse.json({ error: '润色失败，请稍后重试' }, { status: 500 });
  }
}
