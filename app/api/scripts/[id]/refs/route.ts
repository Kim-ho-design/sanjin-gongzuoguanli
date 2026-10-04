// 参考链接：POST { urls: [] } 登记并逐条触发服务器端抓取（10s 超时），返回每条抓取结果
// urls 元素可为字符串（自动抓取）或 { url, manual_content }（手动粘贴正文，直接存 ok）
import { NextRequest, NextResponse } from 'next/server';
import { fetchRef } from '@/lib/refetch';
import { addRefs, getScript, type ScriptRefEntry } from '@/lib/scripts';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const MAX_REFS = 10;

export async function POST(req: NextRequest, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  }
  if (!getScript(id)) return NextResponse.json({ error: '脚本不存在' }, { status: 404 });
  let body: { urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.urls)) {
    return NextResponse.json({ error: 'urls 应为字符串数组' }, { status: 400 });
  }
  const entries: ScriptRefEntry[] = [];
  for (const item of body.urls.slice(0, MAX_REFS)) {
    if (typeof item === 'string') {
      const url = item.trim();
      if (url) entries.push(url);
    } else if (item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string') {
      const url = ((item as { url: string }).url || '').trim();
      const manual = (item as { manual_content?: unknown }).manual_content;
      if (url) {
        entries.push({
          url,
          manual_content: typeof manual === 'string' && manual.trim() ? manual : undefined,
        });
      }
    }
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: 'urls 至少需要一个有效链接' }, { status: 400 });
  }
  const refs = addRefs(id, entries);
  // 逐条抓取自动链接，单条失败不影响其余；手动粘贴的条目已是 ok，跳过
  const results = [];
  for (const ref of refs) {
    if (ref.fetch_status !== 'pending') {
      results.push(ref);
      continue;
    }
    try {
      results.push(await fetchRef(ref.id));
    } catch (e) {
      console.error(e);
      results.push(ref);
    }
  }
  return NextResponse.json({ refs: results });
}
