// 脚本附件上传/读取测试：multipart 上传、类型/大小/扩展名校验、路径穿越防护；附件目录指向临时目录
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SCHEMA_SQL } from '../db';
import { createScript } from '../scripts';
import { POST as uploadPOST } from '../../app/api/scripts/[id]/assets/route';
import { GET as assetGET } from '../../app/api/script-assets/[name]/route';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;
let tmpDir: string;
const savedEnv = process.env.WORK_OS_DATA_DIR;

function pngBytes() {
  // 最小合法 PNG 头即可（路由不解析内容）
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
}

function uploadReq(scriptId: number | string, file: Blob | null, filename = 'a.png') {
  const form = new FormData();
  if (file) form.append('file', file, filename);
  return new NextRequest(`http://localhost/api/scripts/${scriptId}/assets`, {
    method: 'POST',
    body: form,
  }) as NextRequest;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workos-assets-'));
  process.env.WORK_OS_DATA_DIR = tmpDir;
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env.WORK_OS_DATA_DIR;
  else process.env.WORK_OS_DATA_DIR = savedEnv;
});

describe('POST /api/scripts/[id]/assets', () => {
  it('上传 png → 返回 url，文件落盘到 script-assets/', async () => {
    const s = createScript({ account: 'laiqiao', title: 'T', direction: 'D' });
    const res = await uploadPOST(uploadReq(s.id, new Blob([pngBytes()], { type: 'image/png' })), {
      params: { id: String(s.id) },
    });
    expect(res.status).toBe(200);
    const d = (await res.json()) as { url: string; name: string };
    expect(d.url).toMatch(/^\/api\/script-assets\/\d+-\d+\.png$/);
    expect(fs.existsSync(path.join(tmpDir, 'script-assets', d.name))).toBe(true);
  });

  it('非图片 / 超 5MB / 非法扩展名 / 缺 file / 脚本不存在 均拒绝', async () => {
    const s = createScript({ account: 'laiqiao', title: 'T', direction: 'D' });
    const ctx = { params: { id: String(s.id) } };
    expect((await uploadPOST(uploadReq(s.id, new Blob(['text'], { type: 'text/plain' }), 'a.txt'), ctx)).status).toBe(400);
    expect(
      (await uploadPOST(uploadReq(s.id, new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' })), ctx)).status,
    ).toBe(400);
    expect((await uploadPOST(uploadReq(s.id, new Blob([pngBytes()], { type: 'image/png' }), 'a.svg'), ctx)).status).toBe(400);
    expect((await uploadPOST(uploadReq(s.id, null), ctx)).status).toBe(400);
    expect(
      (await uploadPOST(uploadReq(999, new Blob([pngBytes()], { type: 'image/png' })), { params: { id: '999' } })).status,
    ).toBe(404);
  });
});

describe('GET /api/script-assets/[name]', () => {
  it('读取已上传文件：200 + Content-Type；不存在 404；穿越/非法名 400', async () => {
    const s = createScript({ account: 'laiqiao', title: 'T', direction: 'D' });
    const up = await uploadPOST(uploadReq(s.id, new Blob([pngBytes()], { type: 'image/png' })), {
      params: { id: String(s.id) },
    });
    const { url } = (await up.json()) as { url: string };
    const name = url.split('/').pop()!;

    const ok = await assetGET(new NextRequest(`http://localhost${url}`), { params: { name } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    const buf = Buffer.from(await ok.arrayBuffer());
    expect(buf.length).toBe(pngBytes().length);

    expect((await assetGET(new NextRequest('http://localhost/api/script-assets/nope.png'), { params: { name: 'nope.png' } })).status).toBe(404);
    expect((await assetGET(new NextRequest('http://localhost/api/script-assets/..%2F..%2Fdb'), { params: { name: '../db' } })).status).toBe(400);
    expect((await assetGET(new NextRequest('http://localhost/api/script-assets/a%20b.png'), { params: { name: 'a b.png' } })).status).toBe(400);
  });
});
