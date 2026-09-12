// 对抗性审查修复的行为回归测试（M1/L1/L2/L5/L6/L9/L11/M4 缓解）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { SCHEMA_SQL } from '../db';
import { applyParseResult } from '../apply';
import { validateParseResult } from '../llm';
import type { ParseResult, Task } from '../types';
import { PATCH as taskPATCH } from '../../app/api/tasks/[id]/route';
import { GET as tasksGET, POST as tasksPOST } from '../../app/api/tasks/route';
import { POST as restorePOST } from '../../app/api/unclaimed/[id]/restore/route';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;
let projectId: number;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
  projectId = Number(
    db.prepare("INSERT INTO projects (name, color) VALUES ('测试项目', '#007CFF')").run().lastInsertRowid,
  );
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

function makeParse(intent: ParseResult['intent'], tasks: ParseResult['tasks']): ParseResult {
  return {
    intent,
    project: { name: '测试项目', is_new: false, confidence: 1 },
    tasks,
    log: { content: '', date: null },
    needs_confirmation: false,
    clarify_question: '',
  };
}

function insertTask(over: Partial<Task> = {}): number {
  const r = db
    .prepare(
      `INSERT INTO tasks (name, project_id, status, deadline, planned_date, parent_task_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      over.name ?? '任务',
      over.project_id ?? projectId,
      over.status ?? '进行中',
      over.deadline ?? null,
      over.planned_date ?? null,
      over.parent_task_id ?? null,
      over.completed_at ?? null,
    );
  return Number(r.lastInsertRowid);
}

/* ---------- M1：apply 与 PATCH 语义对齐 ---------- */

describe('审查修复 M1：语言重新打开/完成与 PATCH 同语义', () => {
  it('重新打开：completed_at 被清空', () => {
    const id = insertTask({ name: '已完成的活', status: '已完成', completed_at: '2026-09-01 10:00:00' });
    const parsed = makeParse('update_task', [
      { name: '已完成的活', matched_existing: true, status: '待启动', deadline: null, parent_task_name: null, subtasks: [] },
    ]);
    applyParseResult('已完成的活重新做一下', parsed, null);
    const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
    expect(t.status).toBe('待启动');
    expect(t.completed_at).toBeNull();
  });

  it('语言完成父任务：未完成子任务级联完成并记 prev_status；重新打开恢复', () => {
    const parent = insertTask({ name: '父任务', status: '进行中' });
    const child = insertTask({ name: '子任务', status: '进行中', parent_task_id: parent });
    const done = makeParse('update_task', [
      { name: '父任务', matched_existing: true, status: '已完成', deadline: null, parent_task_name: null, subtasks: [] },
    ]);
    applyParseResult('父任务做完了', done, null);
    let c = db.prepare('SELECT * FROM tasks WHERE id = ?').get(child) as Task;
    expect(c.status).toBe('已完成');
    expect(c.prev_status).toBe('进行中');

    const reopen = makeParse('update_task', [
      { name: '父任务', matched_existing: true, status: '待启动', deadline: null, parent_task_name: null, subtasks: [] },
    ]);
    applyParseResult('父任务重新打开', reopen, null);
    c = db.prepare('SELECT * FROM tasks WHERE id = ?').get(child) as Task;
    expect(c.status).toBe('进行中');
    expect(c.prev_status).toBeNull();
  });
});

/* ---------- L1/L2：apply 不丢任务 ---------- */

describe('审查修复 L1/L2：apply 不提前返回、不丢子任务', () => {
  it('一条挂不上项目时，其余任务照常处理，待认领区只进一条', () => {
    insertTask({ name: '既有任务', status: '进行中' });
    const parsed = makeParse('create_task', [
      { name: '幽灵项目的事', matched_existing: false, status: '待启动', deadline: null, parent_task_name: null, subtasks: [] },
      { name: '既有任务', matched_existing: true, status: '', deadline: null, parent_task_name: null, subtasks: [] },
    ]);
    // 项目名指向不存在的项目且不新建 → 第一条进待认领，第二条匹配既有任务
    parsed.project = { name: '不存在的项目', is_new: false, confidence: 1 };
    const summary = applyParseResult('两句混说', parsed, null);
    expect(db.prepare('SELECT COUNT(*) AS c FROM unclaimed').get()).toEqual({ c: 1 });
    expect(summary.unclaimed_id).not.toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE name = '既有任务'").get()).toEqual({ c: 1 });
  });

  it('matched_existing 命中时子任务并入既有任务', () => {
    const id = insertTask({ name: '既有任务', status: '进行中' });
    const parsed = makeParse('create_task', [
      {
        name: '既有任务',
        matched_existing: true,
        status: '',
        deadline: null,
        parent_task_name: null,
        subtasks: [{ name: '新增的步骤', planned_date: '2026-09-15' }],
      },
    ]);
    const summary = applyParseResult('既有任务拆一步', parsed, null);
    expect(summary.task_ids).toHaveLength(0);
    const subs = db.prepare('SELECT * FROM tasks WHERE parent_task_id = ?').all(id) as Task[];
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ name: '新增的步骤', planned_date: '2026-09-15', project_id: projectId });
  });
});

/* ---------- L5/L9/L11：API 校验 ---------- */

function patchReq(id: number, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('审查修复 L9：PATCH 输入校验', () => {
  it('空 name / 非法 completed_date / 不存在 project_id 均 400', async () => {
    const id = insertTask({});
    expect((await taskPATCH(patchReq(id, { name: '  ' }), { params: { id: String(id) } })).status).toBe(400);
    expect((await taskPATCH(patchReq(id, { completed_date: '昨天' }), { params: { id: String(id) } })).status).toBe(400);
    expect((await taskPATCH(patchReq(id, { completed_date: '2026-02-30' }), { params: { id: String(id) } })).status).toBe(400);
    expect((await taskPATCH(patchReq(id, { project_id: 99999 }), { params: { id: String(id) } })).status).toBe(400);
    // 合法 completed_date 通过
    expect((await taskPATCH(patchReq(id, { completed_date: '2026-09-10' }), { params: { id: String(id) } })).status).toBe(200);
  });

  it('同请求 completed_date + 完成：级联子任务用同一完成时间', async () => {
    const parent = insertTask({});
    const child = insertTask({ parent_task_id: parent, planned_date: '2026-09-05' });
    const res = await taskPATCH(
      patchReq(parent, { status: '已完成', completed_date: '2026-09-10' }),
      { params: { id: String(parent) } },
    );
    expect(res.status).toBe(200);
    const p = db.prepare('SELECT * FROM tasks WHERE id = ?').get(parent) as Task;
    const c = db.prepare('SELECT * FROM tasks WHERE id = ?').get(child) as Task;
    expect(p.completed_at).toBe('2026-09-10 12:00:00');
    expect(c.completed_at).toBe('2026-09-10 12:00:00');
  });
});

describe('审查修复 L5/L11：列表与新建校验', () => {
  it('GET /api/tasks 数值参数非法返回 400（不再静默空集）', async () => {
    expect((await tasksGET(new NextRequest('http://localhost/api/tasks?project_id=abc'))).status).toBe(400);
    expect((await tasksGET(new NextRequest('http://localhost/api/tasks?parent_task_id=xyz'))).status).toBe(400);
  });

  it('POST /api/tasks 拒绝子任务的子任务', async () => {
    const parent = insertTask({});
    const child = insertTask({ parent_task_id: parent, planned_date: '2026-09-05' });
    const res = await tasksPOST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '三层嵌套', project_id: projectId, parent_task_id: child }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

/* ---------- L6：LLM 日期必须是真实日期 ---------- */

describe('审查修复 L6：validateParseResult 真实日期校验', () => {
  it('格式对但日期不存在的 deadline/planned_date/log.date 一律归 null', () => {
    const r = validateParseResult({
      intent: 'create_task',
      project: { name: 'x', is_new: true, confidence: 1 },
      tasks: [
        {
          name: 'a',
          matched_existing: false,
          status: '待启动',
          deadline: '2026-13-45',
          parent_task_name: null,
          subtasks: [{ name: 's', planned_date: '2026-02-30' }],
        },
      ],
      log: { content: 'x', date: '2026-04-31' },
      needs_confirmation: false,
      clarify_question: '',
    });
    expect(r.tasks[0].deadline).toBeNull();
    expect(r.tasks[0].subtasks[0].planned_date).toBeNull();
    expect(r.log.date).toBeNull();
  });
});

/* ---------- M4 缓解：恢复快照时 planned_date 归位 ---------- */

describe('审查修复 M4 缓解：恢复被拍平的子任务', () => {
  it('planned_date 非空且 deadline 空的快照，恢复后 planned_date 归位为同名子任务', async () => {
    const snapshot = JSON.stringify({
      kind: 'project_deleted',
      project_name: '旧项目',
      task: {
        name: '被拍平的子任务',
        status: '进行中',
        deadline: null,
        planned_date: '2026-09-05',
        is_today: 0,
        created_at: '2026-09-01 09:00:00',
        completed_at: null,
      },
      logs: [],
      deliverables: [],
    });
    const unclaimedId = Number(
      db.prepare('INSERT INTO unclaimed (raw_text, parsed) VALUES (?, ?)').run('被拍平的子任务', snapshot)
        .lastInsertRowid,
    );
    const res = await restorePOST(
      new NextRequest(`http://localhost/api/unclaimed/${unclaimedId}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      }),
      { params: { id: String(unclaimedId) } },
    );
    expect(res.status).toBe(200);
    const { task_id } = (await res.json()) as { task_id: number };
    const parent = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id) as Task;
    expect(parent.planned_date).toBeNull();
    expect(parent.deadline).toBeNull();
    const subs = db.prepare('SELECT * FROM tasks WHERE parent_task_id = ?').all(task_id) as Task[];
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ name: '被拍平的子任务', planned_date: '2026-09-05', deadline: null });
  });
});
