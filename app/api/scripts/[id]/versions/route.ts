// 脚本版本：GET 列表（version_no 倒序）+ POST 手动保存版本 { content, kind? }
import { NextRequest, NextResponse } from 'next/server';
import { getScript, getVersions, saveVersion } from '@/lib/scripts';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

function parseId(params: { id: string }): number | null {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const id = parseId(params);
  if (id === null) return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  if (!getScript(id)) return NextResponse.json({ error: '脚本不存在' }, { status: 404 });
  return NextResponse.json({ versions: getVersions(id) });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const id = parseId(params);
  if (id === null) return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  if (!getScript(id)) return NextResponse.json({ error: '脚本不存在' }, { status: 404 });
  let body: { content?: unknown; kind?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  if (typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json({ error: 'content 不能为空' }, { status: 400 });
  }
  const kind = body.kind ?? 'manual';
  if (kind !== 'manual' && kind !== 'ai_draft') {
    return NextResponse.json({ error: 'kind 应为 manual 或 ai_draft' }, { status: 400 });
  }
  const version = saveVersion(id, body.content, kind);
  return NextResponse.json({ version });
}
