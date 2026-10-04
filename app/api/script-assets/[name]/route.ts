// 脚本附件读取：GET /api/script-assets/<name>，文件名白名单 + 目录约束防路径穿越，按扩展名回 Content-Type
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { Readable } from 'stream';
import { mimeOf, resolveAsset } from '@/lib/assets';

export const dynamic = 'force-dynamic';

type Ctx = { params: { name: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const fp = resolveAsset(params.name);
  if (fp === null) {
    return NextResponse.json({ error: '文件名不合法' }, { status: 400 });
  }
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    return NextResponse.json({ error: '附件不存在' }, { status: 404 });
  }
  const stream = Readable.toWeb(fs.createReadStream(fp)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': mimeOf(params.name),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
