// 脚本详情 / 更新 / 删除
import { NextRequest, NextResponse } from 'next/server';
import { deleteScript, getScript, isScriptStatus, updateScript } from '@/lib/scripts';
import { isValidDateStr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

function parseId(params: { id: string }): number | null {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const id = parseId(params);
  if (id === null) return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  const script = getScript(id);
  if (!script) return NextResponse.json({ error: '脚本不存在' }, { status: 404 });
  return NextResponse.json({ script });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const id = parseId(params);
  if (id === null) return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  let body: {
    title?: unknown;
    direction?: unknown;
    notes?: unknown;
    status?: unknown;
    is_sample?: unknown;
    draft_date?: unknown;
    final_date?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  const patch: Parameters<typeof updateScript>[1] = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'title 不能为空' }, { status: 400 });
    }
    patch.title = body.title;
  }
  if (body.direction !== undefined) {
    if (typeof body.direction !== 'string' || !body.direction.trim()) {
      return NextResponse.json({ error: 'direction 不能为空' }, { status: 400 });
    }
    patch.direction = body.direction;
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'notes 应为字符串或 null' }, { status: 400 });
    }
    patch.notes = body.notes;
  }
  if (body.status !== undefined) {
    if (!isScriptStatus(body.status)) {
      return NextResponse.json({ error: 'status 应为 写作中/初稿/定稿/已发布' }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.is_sample !== undefined) {
    if (typeof body.is_sample !== 'boolean') {
      return NextResponse.json({ error: 'is_sample 应为布尔值' }, { status: 400 });
    }
    patch.is_sample = body.is_sample;
  }
  for (const [key, val] of [
    ['draft_date', body.draft_date],
    ['final_date', body.final_date],
  ] as const) {
    if (val !== undefined && val !== null && (typeof val !== 'string' || !isValidDateStr(val))) {
      return NextResponse.json({ error: `${key} 格式应为 YYYY-MM-DD` }, { status: 400 });
    }
  }
  if (body.draft_date !== undefined) patch.draft_date = body.draft_date as string | null;
  if (body.final_date !== undefined) patch.final_date = body.final_date as string | null;

  try {
    const script = updateScript(id, patch);
    return NextResponse.json({ script });
  } catch (e) {
    if (e instanceof Error && e.message === '脚本不存在') {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: '更新脚本失败，请稍后重试' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const id = parseId(params);
  if (id === null) return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  if (!deleteScript(id)) {
    return NextResponse.json({ error: '脚本不存在' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
