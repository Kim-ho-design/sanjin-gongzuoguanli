// 手动触发样稿自动提炼：POST { account } → 同步等待提炼完成返回最新档案；LLM 失败 502
import { NextRequest, NextResponse } from 'next/server';
import { LlmError } from '@/lib/llm';
import { getPromptProfile, isScriptAccount } from '@/lib/scripts';
import { regenAutoRules } from '@/lib/prompts';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { account?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  if (!isScriptAccount(body.account)) {
    return NextResponse.json({ error: 'account 应为 yizhanshi 或 laiqiao' }, { status: 400 });
  }
  const account = body.account;
  try {
    await regenAutoRules(account);
    return NextResponse.json({ profile: getPromptProfile(account) });
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error(e);
    return NextResponse.json({ error: '提炼失败，请稍后重试' }, { status: 500 });
  }
}
