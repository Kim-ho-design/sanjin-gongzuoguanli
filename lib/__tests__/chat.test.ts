// v20 复盘对话测试：独立 :memory: 库，callChat 打桩不打真实 LLM API
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../db';

vi.mock('../llm', () => ({
  callChat: vi.fn(),
  LlmError: class LlmError extends Error {},
}));
import { callChat, LlmError } from '../llm';
import {
  chat,
  listSessions,
  getSessionMessages,
  deleteSession,
  buildWorkSnapshot,
} from '../chat';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;

function seedProject(name = '测试项目'): number {
  return Number(db.prepare('INSERT INTO projects (name) VALUES (?)').run(name).lastInsertRowid);
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
  vi.mocked(callChat).mockReset();
  vi.mocked(callChat).mockResolvedValue('好的，这是复盘回复。');
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

/** 直接向会话插一条消息 */
function insertMsg(sessionId: number, role: 'user' | 'assistant', content: string): number {
  return Number(
    db
      .prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)')
      .run(sessionId, role, content).lastInsertRowid,
  );
}

describe('chat 会话创建', () => {
  it('无 sessionId：新建会话，title = 首条消息前 20 字，双方消息落库', async () => {
    const longMsg = '这是一条超过二十个字的用于验证标题截断的消息内容啊啊啊啊';
    const r = await chat(longMsg);
    expect(r.session_id).toBeGreaterThan(0);
    expect(r.reply).toBe('好的，这是复盘回复。');
    const s = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(r.session_id) as { title: string };
    expect(s.title).toBe(longMsg.slice(0, 20));
    expect(s.title).toHaveLength(20);
    const msgs = db
      .prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id')
      .all(r.session_id) as { role: string; content: string }[];
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[0].content).toBe(longMsg);
  });

  it('空消息直接抛错，不打 LLM', async () => {
    await expect(chat('   ')).rejects.toThrow('消息不能为空');
    expect(callChat).not.toHaveBeenCalled();
  });

  it('会话不存在抛错，不打 LLM', async () => {
    await expect(chat('你好', 999)).rejects.toThrow('会话不存在');
    expect(callChat).not.toHaveBeenCalled();
  });
});

describe('chat 上下文组装', () => {
  it('messages = system 快照 + 历史（含刚写入的用户消息）', async () => {
    await chat('第一条');
    const msgs = vi.mocked(callChat).mock.calls[0][0];
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('用户工作数据快照');
    expect(msgs.slice(1)).toEqual([{ role: 'user', content: '第一条' }]);
  });

  it('多轮对话：历史里带上一轮 assistant 回复', async () => {
    const r = await chat('第一条');
    vi.mocked(callChat).mockResolvedValue('第二轮回复');
    await chat('第二条', r.session_id);
    const msgs = vi.mocked(callChat).mock.calls[1][0];
    expect(msgs.slice(1)).toEqual([
      { role: 'user', content: '第一条' },
      { role: 'assistant', content: '好的，这是复盘回复。' },
      { role: 'user', content: '第二条' },
    ]);
  });

  it('历史截断：超过 20 条时只带最近 20 条', async () => {
    const sid = Number(db.prepare("INSERT INTO chat_sessions (title) VALUES ('长会话')").run().lastInsertRowid);
    for (let i = 1; i <= 25; i += 1) {
      insertMsg(sid, i % 2 === 1 ? 'user' : 'assistant', `消息${i}`);
    }
    await chat('新消息', sid);
    const msgs = vi.mocked(callChat).mock.calls[0][0];
    // system + 最近 20 条（含刚写入的新消息）
    expect(msgs).toHaveLength(21);
    expect(msgs[1].content).toBe('消息7'); // 26 条里取最近 20 条，从第 7 条开始
    expect(msgs[20].content).toBe('新消息');
    expect(msgs[20].role).toBe('user');
  });
});

describe('chat LLM 失败回滚', () => {
  it('新会话：用户消息和会话一起清掉，抛 LlmError', async () => {
    vi.mocked(callChat).mockRejectedValue(new Error('boom'));
    let err: unknown;
    try {
      await chat('会失败的请求');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LlmError);
    expect((err as Error).message).toBe('boom');
    expect(db.prepare('SELECT COUNT(*) AS c FROM chat_sessions').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM chat_messages').get()).toEqual({ c: 0 });
  });

  it('已有会话：只回滚刚写入的用户消息，旧消息与会话保留', async () => {
    const sid = Number(db.prepare("INSERT INTO chat_sessions (title) VALUES ('旧会话')").run().lastInsertRowid);
    insertMsg(sid, 'user', '旧问题');
    insertMsg(sid, 'assistant', '旧回答');
    vi.mocked(callChat).mockRejectedValue(new Error('网络抖动'));
    await expect(chat('新问题', sid)).rejects.toThrow('网络抖动');
    const remaining = db
      .prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id')
      .all(sid) as { role: string; content: string }[];
    expect(remaining.map((m) => m.content)).toEqual(['旧问题', '旧回答']);
    expect(db.prepare('SELECT COUNT(*) AS c FROM chat_sessions').get()).toEqual({ c: 1 });
  });
});

describe('会话管理', () => {
  it('listSessions 按 updated_at 倒序，最多 20 个', () => {
    for (let i = 1; i <= 25; i += 1) {
      db.prepare("INSERT INTO chat_sessions (title, updated_at) VALUES (?, ?)").run(
        `会话${i}`,
        `2026-09-01 00:00:${String(i % 60).padStart(2, '0')}`,
      );
    }
    const list = listSessions();
    expect(list).toHaveLength(20);
    expect(list[0].title).toBe('会话25');
    expect(list[19].title).toBe('会话6');
  });

  it('getSessionMessages 正序返回；不存在返回 null', () => {
    const sid = Number(db.prepare("INSERT INTO chat_sessions (title) VALUES ('s')").run().lastInsertRowid);
    insertMsg(sid, 'user', 'a');
    insertMsg(sid, 'assistant', 'b');
    const msgs = getSessionMessages(sid);
    expect(msgs?.map((m) => m.content)).toEqual(['a', 'b']);
    expect(getSessionMessages(999)).toBeNull();
  });

  it('deleteSession 级联删消息；删不存在返回 false', () => {
    const sid = Number(db.prepare("INSERT INTO chat_sessions (title) VALUES ('s')").run().lastInsertRowid);
    insertMsg(sid, 'user', 'a');
    insertMsg(sid, 'assistant', 'b');
    expect(deleteSession(sid)).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ?').get(sid)).toEqual({ c: 0 });
    expect(deleteSession(sid)).toBe(false);
    expect(deleteSession(999)).toBe(false);
  });
});

describe('buildWorkSnapshot', () => {
  it('包含项目、未完成任务、已完成任务、日志、随手记', () => {
    const pid = seedProject();
    db.prepare("INSERT INTO tasks (name, project_id, status, deadline) VALUES ('未完成任务A', ?, '进行中', '2026-09-20')").run(pid);
    db.prepare("INSERT INTO tasks (name, project_id, status, completed_at) VALUES ('已完成任务B', ?, '已完成', '2026-09-10 18:00:00')").run(pid);
    const tid = Number(db.prepare('SELECT id FROM tasks WHERE name = ?').get('未完成任务A').id);
    db.prepare("INSERT INTO logs (task_id, raw_text, duration_hours) VALUES (?, '写了脚本', 1.5)").run(tid);
    db.prepare("INSERT INTO notes (note_date, content) VALUES ('2026-09-11', '选题卡壳')").run();
    const snap = buildWorkSnapshot();
    expect(snap).toContain('【项目】');
    expect(snap).toContain('测试项目');
    expect(snap).toContain('未完成任务A');
    expect(snap).toContain('已完成任务B');
    expect(snap).toContain('写了脚本');
    expect(snap).toContain('选题卡壳');
    expect(snap.length).toBeLessThanOrEqual(8000 + 20); // 含截断提示余量
  });

  it('超过 8000 字截断并带提示', () => {
    const pid = seedProject();
    db.prepare("INSERT INTO tasks (name, project_id, status) VALUES ('占位的任务', ?, '进行中')").run(pid);
    for (let i = 1; i <= 200; i += 1) {
      db.prepare('INSERT INTO notes (note_date, content) VALUES (?, ?)').run(
        '2026-09-11',
        `很长的一条随手记内容用于撑爆快照长度上限 ${i} ${'啊'.repeat(50)}`,
      );
    }
    const snap = buildWorkSnapshot();
    expect(snap.length).toBeLessThanOrEqual(8000 + 20);
    expect(snap).toContain('快照过长已截断');
  });
});
