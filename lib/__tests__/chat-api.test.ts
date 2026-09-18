// v20 复盘对话 API 测试：POST /api/notes/chat、GET/DELETE /api/notes/chat/sessions(/[id])
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { SCHEMA_SQL } from '../db';

vi.mock('../llm', () => ({
  callChat: vi.fn(),
  LlmError: class LlmError extends Error {},
}));
import { callChat } from '../llm';
import { POST as chatPOST } from '../../app/api/notes/chat/route';
import { GET as sessionsGET } from '../../app/api/notes/chat/sessions/route';
import {
  GET as sessionGET,
  DELETE as sessionDELETE,
} from '../../app/api/notes/chat/sessions/[id]/route';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
  vi.mocked(callChat).mockReset();
  vi.mocked(callChat).mockResolvedValue('复盘回复。');
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

function chatReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/notes/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

describe('POST /api/notes/chat', () => {
  it('正常发问：返回 reply + session_id，消息落库', async () => {
    const res = await chatPOST(chatReq({ message: '  本月做了什么？  ' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reply).toBe('复盘回复。');
    expect(json.session_id).toBeGreaterThan(0);
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ?').get(json.session_id) as { c: number }).c,
    ).toBe(2);
  });

  it('带 session_id 继续对话：消息落到同一会话', async () => {
    const first = await (await chatPOST(chatReq({ message: '第一条' }))).json();
    const res = await chatPOST(chatReq({ message: '第二条', session_id: first.session_id }));
    expect(res.status).toBe(200);
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ?').get(first.session_id) as { c: number }).c,
    ).toBe(4);
  });

  it('空消息 / 超长消息 / 非 JSON / 非法 session_id 均 400', async () => {
    expect((await chatPOST(chatReq({ message: '  ' }))).status).toBe(400);
    expect((await chatPOST(chatReq({ message: 'x'.repeat(2001) }))).status).toBe(400);
    expect((await chatPOST(chatReq(null))).status).toBe(400);
    expect((await chatPOST(chatReq({ message: 'ok', session_id: 'abc' }))).status).toBe(400);
    expect((await chatPOST(chatReq({ message: 'ok', session_id: -1 }))).status).toBe(400);
  });

  it('LLM 失败：502 + 友好文案，用户消息已回滚', async () => {
    vi.mocked(callChat).mockRejectedValue(new Error('AI 响应超时，请重试'));
    const res = await chatPOST(chatReq({ message: '会失败的请求' }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain('AI 响应超时');
    expect(db.prepare('SELECT COUNT(*) AS c FROM chat_sessions').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM chat_messages').get()).toEqual({ c: 0 });
  });

  it('session_id 不存在：404', async () => {
    const res = await chatPOST(chatReq({ message: '你好', session_id: 999 }));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/notes/chat/sessions', () => {
  it('返回会话列表', async () => {
    db.prepare("INSERT INTO chat_sessions (title) VALUES ('复盘A')").run();
    const res = await sessionsGET();
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0].title).toBe('复盘A');
  });
});

describe('GET /api/notes/chat/sessions/[id]', () => {
  it('存在返回正序消息；不存在 404；非法 id 400', async () => {
    const sid = Number(db.prepare("INSERT INTO chat_sessions (title) VALUES ('s')").run().lastInsertRowid);
    db.prepare("INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', 'q')").run(sid);
    db.prepare("INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'assistant', 'a')").run(sid);
    const ok = await sessionGET(new NextRequest(`http://localhost/api/notes/chat/sessions/${sid}`), {
      params: { id: String(sid) },
    });
    expect((await ok.json()).messages.map((m: { content: string }) => m.content)).toEqual(['q', 'a']);
    const missing = await sessionGET(new NextRequest('http://localhost/api/notes/chat/sessions/999'), {
      params: { id: '999' },
    });
    expect(missing.status).toBe(404);
    const bad = await sessionGET(new NextRequest('http://localhost/api/notes/chat/sessions/abc'), {
      params: { id: 'abc' },
    });
    expect(bad.status).toBe(400);
  });
});

describe('DELETE /api/notes/chat/sessions/[id]', () => {
  it('删除存在会话连同消息；重复删 404；非法 id 400', async () => {
    const sid = Number(db.prepare("INSERT INTO chat_sessions (title) VALUES ('s')").run().lastInsertRowid);
    db.prepare("INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', 'q')").run(sid);
    const ctx = { params: { id: String(sid) } };
    const res = await sessionDELETE(
      new NextRequest('http://localhost/api/notes/chat/sessions/1', { method: 'DELETE' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS c FROM chat_messages').get()).toEqual({ c: 0 });
    const again = await sessionDELETE(
      new NextRequest('http://localhost/api/notes/chat/sessions/1', { method: 'DELETE' }),
      ctx,
    );
    expect(again.status).toBe(404);
    const bad = await sessionDELETE(
      new NextRequest('http://localhost/api/notes/chat/sessions/abc', { method: 'DELETE' }),
      { params: { id: 'abc' } },
    );
    expect(bad.status).toBe(400);
  });
});
