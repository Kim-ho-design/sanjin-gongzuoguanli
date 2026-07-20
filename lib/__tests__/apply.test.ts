// applyParseResult 落库测试：独立 :memory: 库，通过 globalThis 单例注入，不碰 data/
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../db';
import { applyParseResult } from '../apply';
import type { ParseResult, Task } from '../types';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;
let projectId: number;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db; // getDb() 每次调用都读 globalThis，直接注入即可
  projectId = Number(
    db.prepare("INSERT INTO projects (name, color) VALUES ('测试项目', '#3375F6')").run().lastInsertRowid,
  );
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

function makeParse(tasks: ParseResult['tasks']): ParseResult {
  return {
    intent: 'create_task',
    project: { name: '测试项目', is_new: false, confidence: 1 },
    tasks,
    log: { content: '', date: null },
    needs_confirmation: false,
    clarify_question: '',
  };
}

describe('applyParseResult · 子任务落库', () => {
  it('创建带子任务的任务后，子任务行正确（parent 关联/计划日期/项目继承/deadline null）', () => {
    const parsed = makeParse([
      {
        name: '主任务A',
        matched_existing: false,
        status: '待启动',
        deadline: '2026-07-25',
        parent_task_name: null,
        subtasks: [
          { name: '第一步', planned_date: '2026-07-21' },
          { name: '第二步', planned_date: null },
        ],
      },
    ]);

    const summary = applyParseResult('新建主任务A', parsed, { mode: 'existing', project_id: projectId });
    expect(summary.task_ids).toHaveLength(1);
    const parentId = summary.task_ids[0];

    const parent = db.prepare('SELECT * FROM tasks WHERE id = ?').get(parentId) as Task;
    expect(parent.planned_date).toBeNull(); // 父任务不再写 planned_date
    expect(parent.parent_task_id).toBeNull();
    expect(parent.deadline).toBe('2026-07-25');

    const subs = db
      .prepare('SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY id')
      .all(parentId) as Task[];
    expect(subs).toHaveLength(2);
    expect(subs[0]).toMatchObject({
      name: '第一步',
      project_id: projectId, // 项目继承父任务
      status: '待办事项',
      planned_date: '2026-07-21',
      deadline: null,
      is_today: 0,
    });
    expect(subs[1]).toMatchObject({
      name: '第二步',
      project_id: projectId,
      planned_date: null,
      deadline: null,
      is_today: 0,
    });
  });

  it('无子任务时不产生额外行；空名子任务被跳过', () => {
    const parsed = makeParse([
      {
        name: '主任务B',
        matched_existing: false,
        status: '',
        deadline: null,
        parent_task_name: null,
        subtasks: [{ name: '   ', planned_date: '2026-07-21' }],
      },
    ]);
    const summary = applyParseResult('新建主任务B', parsed, { mode: 'existing', project_id: projectId });
    const subs = db.prepare('SELECT * FROM tasks WHERE parent_task_id = ?').all(summary.task_ids[0]);
    expect(subs).toHaveLength(0);
  });
});

describe('applyParseResult · 跨日期补记', () => {
  const baseTask = {
    name: '补记的活',
    matched_existing: false,
    status: '已完成',
    deadline: null,
    parent_task_name: null,
    subtasks: [],
  };

  it('带 log.date：log.created_at 与 task.completed_at 都落在指定日期（18:00）', () => {
    const parsed = makeParse([baseTask]);
    parsed.intent = 'log_progress';
    parsed.log = { content: '昨天把活干完了', date: '2026-07-18' };

    const summary = applyParseResult('昨天把活干完了', parsed, { mode: 'existing', project_id: projectId });
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(summary.task_ids[0]) as Task;
    expect(task.completed_at).toBe('2026-07-18 18:00:00');

    const log = db.prepare('SELECT * FROM logs WHERE task_id = ?').get(task.id) as { created_at: string };
    expect(log.created_at).toBe('2026-07-18 18:00:00');
  });

  it('无 log.date：维持 now（今天）', () => {
    const parsed = makeParse([baseTask]);
    parsed.intent = 'log_progress';
    parsed.log = { content: '今天把活干完了', date: null };

    const summary = applyParseResult('今天把活干完了', parsed, { mode: 'existing', project_id: projectId });
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(summary.task_ids[0]) as Task;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(task.completed_at?.slice(0, 10)).toBe(todayStr);

    const log = db.prepare('SELECT * FROM logs WHERE task_id = ?').get(task.id) as { created_at: string };
    expect(log.created_at.slice(0, 10)).toBe(todayStr);
  });
});
