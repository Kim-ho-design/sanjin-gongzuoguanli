// 随手记：记录「日期+一句话」，按月翻看；月度 AI 复盘已迁移为对话式（v20，见 lib/chat.ts）
import { getDb } from './db';

export interface Note {
  id: number;
  note_date: string;
  content: string;
  created_at: string;
}

/** 严格校验 YYYY-MM 月份 */
export function isValidMonth(s: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(s)) return false;
  const m = Number(s.slice(5));
  return m >= 1 && m <= 12;
}

/** 当月全部记录：note_date DESC, id DESC（同日内后写的在前） */
export function listNotes(month: string): Note[] {
  const db = getDb();
  // 字符串区间比较：一个月内任何日期都落在 YYYY-MM-01 ~ YYYY-MM-31 之间
  return db
    .prepare(`SELECT * FROM notes WHERE note_date BETWEEN ? AND ? ORDER BY note_date DESC, id DESC`)
    .all(`${month}-01`, `${month}-31`) as Note[];
}

export function addNote(content: string, noteDate: string): Note {
  const db = getDb();
  const info = db.prepare('INSERT INTO notes (note_date, content) VALUES (?, ?)').run(noteDate, content);
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid) as Note;
}

/** 返回 false = 记录不存在 */
export function deleteNote(id: number): boolean {
  const db = getDb();
  return db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
}
