// 随手记月度复盘：聚合层收集记录，生成层调 DeepSeek 产出 markdown；LLM 失败回退模板渲染
import { getDb } from './db';
import { callReport } from './llm';
import { weekdayCn, weekRange } from './utils';

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

/* ---------------- 生成层：DeepSeek prompt ---------------- */

export function buildNotesPrompt(): string {
  return `你是用户的月度工作复盘助手。用户是实验室仪器行业的内容策划。用户在一个月里随手记下了一些工作过程中遇到的问题、卡点和现象（JSON 数组，每项含 date 和 content 原话）。请基于这些记录写一份中文的月度问题复盘 markdown。

【要求】
- 按主题聚类归纳这些零散记录：主题从记录内容里自然长出来（如进度把控、协作沟通、流程工具、外部依赖等），不要硬套模板，有几个算几个，宁缺毋滥
- 每个主题下按时间顺序列出涉及的原话（保留日期），并一句话点明这个问题反复出现的模式
- 最后给出 2~3 条下个月可执行的改进建议，要具体、可落地，不喊口号
- 不编造记录里没有的事实；拿不准的不写
- 只输出 markdown 正文，不要任何解释`;
}

/* ---------------- 兜底：模板渲染（纯函数，不依赖 LLM） ---------------- */

export function renderNotesTemplate(month: string, notes: Note[]): string {
  const lines: string[] = [
    `# 随手记 · 月度复盘（${month}）`,
    '',
    '> ⚠ AI 总结失败，以下为模板兜底版（仅按周平铺，未做归纳）。',
    '',
  ];
  // 按周分组（周一为界），周内按日期升序
  const groups = new Map<string, Note[]>();
  for (const n of [...notes].sort((a, b) => a.note_date.localeCompare(b.note_date) || a.id - b.id)) {
    const key = weekRange(n.note_date).start;
    const arr = groups.get(key) ?? [];
    arr.push(n);
    groups.set(key, arr);
  }
  let i = 0;
  for (const [weekStart, arr] of Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    i += 1;
    const { end } = weekRange(weekStart);
    lines.push(`## 第${i}周（${weekStart.slice(5)} ~ ${end.slice(5)}）`, '');
    for (const n of arr) {
      lines.push(`- ${n.note_date.slice(5)}（${weekdayCn(n.note_date)}）：${n.content}`);
    }
    lines.push('');
  }
  if (notes.length === 0) lines.push('（本月暂无记录）', '');
  return lines.join('\n');
}

/* ---------------- 入口 ---------------- */

export interface NotesSummaryResult {
  markdown: string;
  /** true = LLM 生成失败，回退到了模板整理 */
  fallback: boolean;
}

/** 按月生成随手记复盘；LLM 失败自动回退模板渲染 */
export async function generateNotesSummary(month: string): Promise<NotesSummaryResult> {
  const notes = listNotes(month);
  if (notes.length === 0) {
    return { markdown: `# 随手记 · 月度复盘（${month}）\n\n（本月暂无记录）\n`, fallback: false };
  }
  try {
    const payload = JSON.stringify(notes.map((n) => ({ date: n.note_date, content: n.content })));
    return { markdown: await callReport(buildNotesPrompt(), payload), fallback: false };
  } catch (e) {
    console.warn('[notes] LLM 总结失败，回退模板渲染：', e instanceof Error ? e.message : e);
    return { markdown: renderNotesTemplate(month, notes), fallback: true };
  }
}
