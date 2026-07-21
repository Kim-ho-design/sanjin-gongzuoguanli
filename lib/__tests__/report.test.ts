// 周报聚合层测试：独立 :memory: 库，globalThis 注入单例，不碰 data/；不打真实 LLM API
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../db';
import { collectReportData, buildReportPrompt, renderTemplate } from '../report';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;
let projectId: number;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
  projectId = Number(
    db.prepare("INSERT INTO projects (name, color) VALUES ('测试项目', '#3E81F6')").run().lastInsertRowid,
  );
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

function insertTask(over: Partial<{
  name: string; status: string; deadline: string | null; planned_date: string | null;
  parent_task_id: number | null; completed_at: string | null;
}> = {}): number {
  const r = db
    .prepare(
      `INSERT INTO tasks (name, project_id, status, deadline, planned_date, parent_task_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      over.name ?? '任务',
      projectId,
      over.status ?? '进行中',
      over.deadline ?? null,
      over.planned_date ?? null,
      over.parent_task_id ?? null,
      over.completed_at ?? null,
    );
  return Number(r.lastInsertRowid);
}

const START = '2026-07-20';
const END = '2026-07-26';

describe('collectReportData', () => {
  it('完成统计只数父任务：区间内完成的子任务不混入 done_tasks', () => {
    const parent = insertTask({ name: '父任务', status: '进行中' });
    insertTask({ name: '完成的父任务', status: '已完成', completed_at: '2026-07-22 18:00:00' });
    insertTask({ name: '完成的子任务', status: '已完成', parent_task_id: parent, completed_at: '2026-07-22 12:00:00' });

    const data = collectReportData(START, END);
    expect(data.done_tasks.map((t) => t.name)).toEqual(['完成的父任务']);
  });

  it('未完成父任务平移进 open_tasks（不论日期），并带子任务推进情况', () => {
    const p1 = insertTask({ name: '进行中的活', status: '进行中' });
    insertTask({ name: '步骤一', status: '已完成', parent_task_id: p1, planned_date: '2026-07-21' });
    insertTask({ name: '步骤二', status: '待启动', parent_task_id: p1, planned_date: '2026-07-24' });
    insertTask({ name: '步骤三', status: '待启动', parent_task_id: p1, planned_date: null });
    insertTask({ name: '无日期待办', status: '待启动' }); // 无任何日期也应平移
    insertTask({ name: '已完成不算未完成', status: '已完成', completed_at: '2026-07-21 10:00:00' });

    const data = collectReportData(START, END);
    const names = data.open_tasks.map((t) => t.name);
    expect(names).toContain('进行中的活');
    expect(names).toContain('无日期待办');
    expect(names).not.toContain('已完成不算未完成');

    const t = data.open_tasks.find((t) => t.name === '进行中的活')!;
    expect(t.sub_total).toBe(3);
    expect(t.sub_done).toBe(1);
    expect(t.open_subtasks.map((s) => s.name)).toEqual(['步骤二', '步骤三']);
    expect(t.open_subtasks[0].planned_date).toBe('2026-07-24');
  });

  it('区间内日志带任务名与项目名；历史交付物进上下文', () => {
    const t = insertTask({ name: '写脚本' });
    db.prepare(`INSERT INTO logs (task_id, raw_text, created_at) VALUES (?, '写了一半', '2026-07-22 10:00:00')`).run(t);
    db.prepare(`INSERT INTO logs (task_id, raw_text, created_at) VALUES (?, '区间外', '2026-08-01 10:00:00')`).run(t);
    db.prepare(`INSERT INTO deliverables (task_id, name) VALUES (?, '脚本v1.docx')`).run(t);

    const data = collectReportData(START, END);
    expect(data.logs).toHaveLength(1);
    expect(data.logs[0]).toMatchObject({ task_name: '写脚本', project_name: '测试项目', raw_text: '写了一半' });
    expect(data.deliverables[0]).toMatchObject({ task_name: '写脚本', name: '脚本v1.docx' });
  });
});

describe('collectReportData · 漂流瓶口径（与 board API 一致）', () => {
  it('父 deadline 过期 ∪ 子 planned_date 过期，子任务带父名；已完成不算', () => {
    const overdueParent = insertTask({ name: '超期父', status: '进行中', deadline: '2000-01-01' });
    insertTask({ name: '超期子', status: '待启动', parent_task_id: overdueParent, planned_date: '2000-01-02' });
    insertTask({ name: '完成的不算', status: '已完成', parent_task_id: overdueParent, planned_date: '2000-01-03', completed_at: '2026-07-21 10:00:00' });
    insertTask({ name: '未来的不算', status: '进行中', deadline: '2999-01-01' });

    const data = collectReportData(START, END);
    expect(data.drifting).toHaveLength(2);
    const sub = data.drifting.find((t) => t.name === '超期子')!;
    expect(sub.parent_name).toBe('超期父');
    expect(sub.date).toBe('2000-01-02');
    // 详版模板中子任务显示 父 › 子
    const md = renderTemplate(data, 'full');
    expect(md).toContain('「超期父 › 超期子」');
  });
});

describe('buildReportPrompt', () => {  it('含语言硬性规则：禁止模板化术语', () => {
    for (const type of ['brief', 'full'] as const) {
      const p = buildReportPrompt(type);
      expect(p).toContain('绝不出现');
      expect(p).toContain('陈述句');
    }
  });
});

describe('renderTemplate（兜底）', () => {
  it('无卡点/耗时/交付物区块；下周计划=未完成平移', () => {
    const data = collectReportData(START, END);
    for (const type of ['brief', 'full'] as const) {
      const md = renderTemplate(data, type);
      expect(md).not.toContain('卡点');
      expect(md).not.toContain('耗时');
      expect(md).toContain('## 下周计划');
    }
  });
});
