// 随手记聚合层测试：独立 :memory: 库，不打真实 LLM API
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../db';

vi.mock('../llm', () => ({ callReport: vi.fn() }));
import { callReport } from '../llm';
import { isValidMonth, listNotes, addNote, deleteNote, renderNotesTemplate, generateNotesSummary } from '../notes';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
  vi.mocked(callReport).mockReset();
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

describe('renderNotesTemplate', () => {
  it('按周分组平铺，周内按日期升序', () => {
    addNote('周三的事', '2026-09-09');
    addNote('周五的事', '2026-09-11');
    addNote('下周一的事', '2026-09-14');
    const md = renderNotesTemplate('2026-09', listNotes('2026-09'));
    expect(md).toContain('# 随手记 · 月度复盘（2026-09）');
    expect(md).toContain('模板兜底版');
    expect(md).toContain('第1周（09-07 ~ 09-13）');
    expect(md).toContain('第2周（09-14 ~ 09-20）');
    expect(md.indexOf('周三的事')).toBeLessThan(md.indexOf('周五的事'));
  });

  it('空月输出占位文案', () => {
    expect(renderNotesTemplate('2026-09', [])).toContain('本月暂无记录');
  });
});

describe('generateNotesSummary', () => {
  it('LLM 成功：直接返回其输出，不走兜底', async () => {
    addNote('问题A', '2026-09-11');
    vi.mocked(callReport).mockResolvedValue('# 复盘\n\n## 主题');
    const r = await generateNotesSummary('2026-09');
    expect(r.markdown).toBe('# 复盘\n\n## 主题');
    expect(r.fallback).toBe(false);
  });

  it('LLM 失败：回退模板并标记 fallback', async () => {
    addNote('问题B', '2026-09-11');
    vi.mocked(callReport).mockRejectedValue(new Error('boom'));
    const r = await generateNotesSummary('2026-09');
    expect(r.fallback).toBe(true);
    expect(r.markdown).toContain('问题B');
    expect(r.markdown).toContain('模板兜底版');
  });

  it('空月：短路返回占位文案，不打 LLM', async () => {
    const r = await generateNotesSummary('2026-09');
    expect(r.fallback).toBe(false);
    expect(r.markdown).toContain('本月暂无记录');
    expect(callReport).not.toHaveBeenCalled();
  });
});
