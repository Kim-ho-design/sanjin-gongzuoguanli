// 两账号提示词档案：GET ?account= / POST / PATCH（读写接口；base_prompt 种子下阶段填）
import { NextRequest, NextResponse } from 'next/server';
import { getPromptProfile, isScriptAccount, upsertPromptProfile } from '@/lib/scripts';

export const dynamic = 'force-dynamic';

function parseAccount(body: { account?: unknown }): 'yizhanshi' | 'laiqiao' | null {
  return isScriptAccount(body.account) ? body.account : null;
}

export async function GET(req: NextRequest) {
  const account = parseAccount({ account: req.nextUrl.searchParams.get('account') });
  if (!account) {
    return NextResponse.json({ error: 'account 应为 yizhanshi 或 laiqiao' }, { status: 400 });
  }
  return NextResponse.json({ profile: getPromptProfile(account) });
}

async function write(req: NextRequest) {
  let body: { account?: unknown; base_prompt?: unknown; auto_rules?: unknown; manual_notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  const account = parseAccount(body);
  if (!account) {
    return NextResponse.json({ error: 'account 应为 yizhanshi 或 laiqiao' }, { status: 400 });
  }
  const patch: Parameters<typeof upsertPromptProfile>[1] = {};
  for (const key of ['base_prompt', 'auto_rules', 'manual_notes'] as const) {
    const val = body[key];
    if (val !== undefined) {
      if (typeof val !== 'string') {
        return NextResponse.json({ error: `${key} 应为字符串` }, { status: 400 });
      }
      patch[key] = val;
    }
  }
  return NextResponse.json({ profile: upsertPromptProfile(account, patch) });
}

export async function POST(req: NextRequest) {
  return write(req);
}

export async function PATCH(req: NextRequest) {
  return write(req);
}
