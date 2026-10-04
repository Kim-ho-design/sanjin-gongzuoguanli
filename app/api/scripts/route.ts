// 脚本列表（GET ?account=&status=&q=）+ 新建（POST，account/title/direction 必填）
import { NextRequest, NextResponse } from 'next/server';
import {
  createScript,
  isScriptAccount,
  isScriptStatus,
  listScripts,
} from '@/lib/scripts';
import { isValidDateStr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const account = sp.get('account');
  const status = sp.get('status');
  const q = sp.get('q')?.trim();
  if (account !== null && !isScriptAccount(account)) {
    return NextResponse.json({ error: 'account 应为 yizhanshi 或 laiqiao' }, { status: 400 });
  }
  if (status !== null && !isScriptStatus(status)) {
    return NextResponse.json({ error: 'status 应为 写作中/初稿/定稿/已发布' }, { status: 400 });
  }
  const filter: { account?: 'yizhanshi' | 'laiqiao'; status?: '写作中' | '初稿' | '定稿' | '已发布'; q?: string } = {};
  if (account) filter.account = account;
  if (status) filter.status = status;
  if (q) filter.q = q;
  return NextResponse.json({ scripts: listScripts(filter) });
}

export async function POST(req: NextRequest) {
  let body: {
    account?: unknown;
    title?: unknown;
    direction?: unknown;
    notes?: unknown;
    draft_date?: unknown;
    final_date?: unknown;
    skip_kanban?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  if (!isScriptAccount(body.account)) {
    return NextResponse.json({ error: 'account 应为 yizhanshi 或 laiqiao' }, { status: 400 });
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'title 不能为空' }, { status: 400 });
  }
  const direction = typeof body.direction === 'string' ? body.direction.trim() : '';
  if (!direction) {
    return NextResponse.json({ error: '选题方向 direction 不能为空' }, { status: 400 });
  }
  for (const [key, val] of [
    ['draft_date', body.draft_date],
    ['final_date', body.final_date],
  ] as const) {
    if (val !== undefined && val !== null && (typeof val !== 'string' || !isValidDateStr(val))) {
      return NextResponse.json({ error: `${key} 格式应为 YYYY-MM-DD` }, { status: 400 });
    }
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;
  if (body.skip_kanban !== undefined && typeof body.skip_kanban !== 'boolean') {
    return NextResponse.json({ error: 'skip_kanban 应为布尔值' }, { status: 400 });
  }
  try {
    const script = createScript({
      account: body.account,
      title,
      direction,
      notes,
      draft_date: (body.draft_date as string | null | undefined) ?? null,
      final_date: (body.final_date as string | null | undefined) ?? null,
      skip_kanban: body.skip_kanban === true,
    });
    return NextResponse.json({ script });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '新建脚本失败，请稍后重试' }, { status: 500 });
  }
}
