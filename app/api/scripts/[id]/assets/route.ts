// 脚本附件上传：POST multipart（字段 file），image/* 且 ≤5MB → 存 DATA_DIR/script-assets/ → {url}
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { assetsDir, isAllowedExt, MAX_SIZE } from '@/lib/assets';
import { getScript } from '@/lib/scripts';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id 无效' }, { status: 400 });
  }
  if (!getScript(id)) return NextResponse.json({ error: '脚本不存在' }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '请求应为 multipart 表单' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少 file 字段' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '只支持图片文件' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '图片不能超过 5MB' }, { status: 400 });
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!isAllowedExt(ext)) {
    return NextResponse.json({ error: '仅支持 png / jpg / jpeg / gif / webp' }, { status: 400 });
  }

  const name = `${id}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(assetsDir(), name), buf);
  return NextResponse.json({ url: `/api/script-assets/${name}`, name, size: buf.length });
}
