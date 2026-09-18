// 随手记聚合层测试：独立 :memory: 库，不打真实 LLM API
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../db';
import { isValidMonth, listNotes, addNote, deleteNote } from '../notes';

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

describe('isValidMonth', () => {
  it('接受合法月份', () => {
    expect(isValidMonth('2026-01')).toBe(true);
    expect(isValidMonth('2026-12')).toBe(true);
  });
  it('拒绝非法格式与越界月份', () => {
    expect(isValidMonth('2026-1')).toBe(false);
    expect(isValidMonth('2026-00')).toBe(false);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidMonth('202609')).toBe(false);
    expect(isValidMonth('2026-09-01')).toBe(false);
  });
});

describe('listNotes', () => {
  it('只返回当月记录，按日期倒序、同日按 id 倒序', () => {
    addNote('上月的', '2026-08-31');
    addNote('本月早的', '2026-09-02');
    const b = addNote('本月晚的', '2026-09-11');
    const a = addNote('同天后写的', '2026-09-11');
    addNote('下月的', '2026-10-01');
    const notes = listNotes('2026-09');
    expect(notes.map((n) => n.id)).toEqual([a.id, b.id, notes[2].id]);
    expect(notes.map((n) => n.content)).toEqual(['同天后写的', '本月晚的', '本月早的']);
  });

  it('当月无记录返回空数组', () => {
    expect(listNotes('2026-09')).toEqual([]);
  });
});

describe('addNote / deleteNote', () => {
  it('addNote 落库并回读完整行', () => {
    const n = addNote('一句话', '2026-09-11');
    expect(n.note_date).toBe('2026-09-11');
    expect(n.content).toBe('一句话');
    expect(n.created_at).toBeTruthy();
  });

  it('deleteNote 存在返回 true，不存在返回 false', () => {
    const n = addNote('待删', '2026-09-11');
    expect(deleteNote(n.id)).toBe(true);
    expect(deleteNote(n.id)).toBe(false);
    expect(deleteNote(999)).toBe(false);
  });
});
