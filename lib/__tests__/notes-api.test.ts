// 随手记 API 路由测试：GET/POST /api/notes、DELETE /api/notes/[id]
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { SCHEMA_SQL } from '../db';
import { GET as notesGET, POST as notesPOST } from '../../app/api/notes/route';
import { DELETE as noteDELETE } from '../../app/api/notes/[id]/route';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

describe('GET /api/notes', () => {
  it('默认返回当月记录', async () => {
    db.prepare("INSERT INTO notes (note_date, content) VALUES ('2026-09-11', '今天的记录')").run();
    db.prepare("INSERT INTO notes (note_date, content) VALUES ('2026-08-01', '上月的记录')").run();
    const res = await notesGET(new NextRequest('http://localhost/api/notes'));
    const json = await res.json();
    expect(json.month).toMatch(/^\d{4}-\d{2}$/);
    expect(json.notes).toHaveLength(1);
    expect(json.notes[0].content).toBe('今天的记录');
  });

  it('指定月份 + 非法月份 400', async () => {
    db.prepare("INSERT INTO notes (note_date, content) VALUES ('2026-08-01', '上月的记录')").run();
    const ok = await notesGET(new NextRequest('http://localhost/api/notes?month=2026-08'));
    expect((await ok.json()).notes).toHaveLength(1);
    const bad = await notesGET(new NextRequest('http://localhost/api/notes?month=2026-13'));
    expect(bad.status).toBe(400);
  });
});

describe('POST /api/notes', () => {
  it('正常创建：缺省日期记为今天，返回完整记录', async () => {
    const res = await notesPOST(postReq({ content: '  一句话  ' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.note.content).toBe('一句话'); // 已 trim
    expect(json.note.note_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('指定合法日期创建成功', async () => {
    const res = await notesPOST(postReq({ content: '补记', note_date: '2026-09-01' }));
    expect(res.status).toBe(200);
    expect((await res.json()).note.note_date).toBe('2026-09-01');
  });

  it('空内容 / 超长内容 / 非法日期 / 非 JSON 均 400', async () => {
    expect((await notesPOST(postReq({ content: '   ' }))).status).toBe(400);
    expect((await notesPOST(postReq({ content: 'x'.repeat(501) }))).status).toBe(400);
    expect((await notesPOST(postReq({ content: 'ok', note_date: '9月1日' }))).status).toBe(400);
    expect((await notesPOST(postReq({ content: 'ok', note_date: '2026-02-30' }))).status).toBe(400);
    expect((await notesPOST(postReq(null))).status).toBe(400);
  });
});

describe('DELETE /api/notes/[id]', () => {
  it('删除存在记录返回 ok；重复删除 404；非法 id 400', async () => {
    const id = Number(db.prepare("INSERT INTO notes (note_date, content) VALUES ('2026-09-11', 'x')").run().lastInsertRowid);
    const ctx = { params: { id: String(id) } };
    expect((await noteDELETE(new NextRequest('http://localhost/api/notes/1', { method: 'DELETE' }), ctx)).status).toBe(200);
    expect((await noteDELETE(new NextRequest('http://localhost/api/notes/1', { method: 'DELETE' }), ctx)).status).toBe(404);
    const bad = await noteDELETE(new NextRequest('http://localhost/api/notes/abc', { method: 'DELETE' }), { params: { id: 'abc' } });
    expect(bad.status).toBe(400);
  });
});
