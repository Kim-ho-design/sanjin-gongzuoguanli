// v20 复盘对话：多轮聊天 + 真实工作数据快照注入；LLM 失败回滚不留脏消息
import { getDb } from './db';
import { callChat, LlmError } from './llm';

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatResult {
  reply: string;
  session_id: number;
}

/** 注入 LLM 的最近历史条数（system 快照之外） */
const HISTORY_LIMIT = 20;
/** 工作快照总长度上限（字符） */
const SNAPSHOT_MAX = 8000;

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** n 天前的 YYYY-MM-DD（n=0 即今天） */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateStr(d);
}

/** 系统角色 prompt：复盘助手 + 数据纪律；快照由调用方追加 */
function buildChatSystemPrompt(): string {
  return `你是用户的个人工作复盘助手。用户是实验室仪器行业的内容策划，使用一个个人工作管理看板（项目→任务→工作日志→随手记）。

【铁律】
- 你只依据注入的【用户工作数据快照】回答，快照全部来自真实数据库
- 数据里没有的事，直接说"数据里没有记录"，绝不编造任务、日期、进度或用户的想法
- 快照没覆盖的时间范围就当作未知，不要外推

【能帮用户做的事】
- 归纳一段时间的工作主题与重点
- 发现反复出现的问题与模式（如某类卡点反复出现、某项目长期未推进）
- 给出 2~3 条具体、可执行的建议，不喊口号

【表达】
- 简洁的中文 markdown：要点用列表，必要时用标题
- 不做与问题无关的数据罗列；回答聚焦用户的问题`;
}

/** 从库里组装工作数据快照：项目、未完成任务、近 90 天已完成/日志/随手记，紧凑文本 ≤8000 字 */
export function buildWorkSnapshot(): string {
  const db = getDb();
  const today = daysAgo(0);
  const since = daysAgo(90);

  const projects = db
    .prepare('SELECT name, status FROM projects ORDER BY id')
    .all() as { name: string; status: string }[];
  const openTasks = db
    .prepare(
      `SELECT t.name, p.name AS project_name, t.status, t.deadline, t.planned_date
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.status != '已完成'
       ORDER BY t.id DESC LIMIT 100`,
    )
    .all() as { name: string; project_name: string; status: string; deadline: string | null; planned_date: string | null }[];
  const doneTasks = db
    .prepare(
      `SELECT t.name, p.name AS project_name, t.completed_at
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.status = '已完成' AND t.completed_at IS NOT NULL AND t.completed_at >= ?
       ORDER BY t.completed_at DESC LIMIT 200`,
    )
    .all(since) as { name: string; project_name: string; completed_at: string }[];
  const logs = db
    .prepare(
      `SELECT l.raw_text, l.duration_hours, l.created_at, t.name AS task_name
       FROM logs l JOIN tasks t ON t.id = l.task_id
       WHERE l.created_at >= ?
       ORDER BY l.created_at DESC LIMIT 300`,
    )
    .all(since) as { raw_text: string; duration_hours: number | null; created_at: string; task_name: string }[];
  const notes = db
    .prepare(
      'SELECT note_date, content FROM notes WHERE note_date >= ? ORDER BY note_date DESC, id DESC LIMIT 200',
    )
    .all(since) as { note_date: string; content: string }[];

  const lines: string[] = [`【今天】${today}`, ''];

  lines.push('【项目】');
  if (projects.length === 0) lines.push('（无项目）');
  for (const p of projects) lines.push(`- ${p.name}（${p.status}）`);
  lines.push('');

  lines.push(`【未完成任务】（按创建倒序，最多 100 条）`);
  if (openTasks.length === 0) lines.push('（无）');
  for (const t of openTasks) {
    const date = t.deadline ? ` 截止 ${t.deadline}` : t.planned_date ? ` 计划 ${t.planned_date}` : '';
    lines.push(`- [${t.status}] ${t.name} @${t.project_name}${date}`);
  }
  lines.push('');

  lines.push(`【近 90 天已完成任务】（${since} 起，按完成时间倒序）`);
  if (doneTasks.length === 0) lines.push('（无）');
  for (const t of doneTasks) lines.push(`- ${t.completed_at.slice(0, 10)} ${t.name} @${t.project_name}`);
  lines.push('');

  lines.push(`【近 90 天工作日志】（原话摘要，按时间倒序）`);
  if (logs.length === 0) lines.push('（无）');
  for (const l of logs) {
    const dur = l.duration_hours != null ? `（耗时 ${l.duration_hours}h）` : '';
    lines.push(`- ${l.created_at.slice(0, 10)}「${l.task_name}」${l.raw_text}${dur}`);
  }
  lines.push('');

  lines.push(`【近 90 天随手记】（${since} 起，用户随手记下的问题/卡点/现象）`);
  if (notes.length === 0) lines.push('（无）');
  for (const n of notes) lines.push(`- ${n.note_date}：${n.content}`);
  lines.push('');

  let snapshot = lines.join('\n');
  if (snapshot.length > SNAPSHOT_MAX) {
    snapshot = `${snapshot.slice(0, SNAPSHOT_MAX)}\n…（快照过长已截断）`;
  }
  return snapshot;
}

/**
 * 发一条复盘消息：无 sessionId 新建会话（title = 首条消息前 20 字）
 * LLM 失败：回滚刚写入的用户消息（新会话连会话一起删），抛 LlmError
 */
export async function chat(userMessage: string, sessionId?: number): Promise<ChatResult> {
  const db = getDb();
  const content = userMessage.trim();
  if (!content) throw new Error('消息不能为空');

  let sid = sessionId;
  let isNew = false;
  if (sid != null) {
    if (!Number.isInteger(sid) || sid <= 0) throw new Error('会话不存在或已删除');
    const exists = db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(sid);
    if (!exists) throw new Error('会话不存在或已删除');
  }

  let userMsgId = 0;
  db.transaction(() => {
    if (sid == null) {
      isNew = true;
      const info = db.prepare('INSERT INTO chat_sessions (title) VALUES (?)').run(content.slice(0, 20));
      sid = Number(info.lastInsertRowid);
    }
    userMsgId = Number(
      db
        .prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)')
        .run(sid, 'user', content).lastInsertRowid,
    );
    db.prepare("UPDATE chat_sessions SET updated_at = datetime('now','localtime') WHERE id = ?").run(sid);
  })();

  // 只带最近 HISTORY_LIMIT 条进上下文（含刚写入的这条用户消息）
  const history = (
    db
      .prepare(
        'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(sid, HISTORY_LIMIT) as { role: 'user' | 'assistant'; content: string }[]
  ).reverse();

  let reply: string;
  try {
    reply = await callChat([
      { role: 'system', content: `${buildChatSystemPrompt()}\n\n【用户工作数据快照】\n${buildWorkSnapshot()}` },
      ...history,
    ]);
  } catch (e) {
    db.transaction(() => {
      db.prepare('DELETE FROM chat_messages WHERE id = ?').run(userMsgId);
      if (isNew) db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sid);
    })();
    throw new LlmError(e instanceof Error && e.message ? e.message : 'AI 回复失败，请稍后重试。');
  }

  db.transaction(() => {
    db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)').run(sid, 'assistant', reply);
    db.prepare("UPDATE chat_sessions SET updated_at = datetime('now','localtime') WHERE id = ?").run(sid);
  })();

  return { reply, session_id: sid as number };
}

/** 最近 20 个会话，按 updated_at 倒序 */
export function listSessions(): ChatSession[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT 20')
    .all() as ChatSession[];
}

/** 会话全部消息（时间正序）；会话不存在返回 null */
export function getSessionMessages(sessionId: number): ChatMessage[] | null {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(sessionId);
  if (!exists) return null;
  return db
    .prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId) as ChatMessage[];
}

/** 删会话（连同消息一起删）；返回 false = 会话不存在 */
export function deleteSession(sessionId: number): boolean {
  const db = getDb();
  return db.transaction(() => {
    db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId);
    return db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId).changes > 0;
  })();
}
