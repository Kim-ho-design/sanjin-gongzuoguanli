// Agent 向接口测试：GET /api/report?format=data（原始聚合 JSON）与 GET /api/tasks（过滤列表）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { SCHEMA_SQL } from '../db';
import { GET as reportGET } from '../../app/api/report/route';
import { GET as tasksGET } from '../../app/api/tasks/route';

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
  db.prepare(
    `INSERT INTO tasks (name, project_id, status, deadline, completed_at)
     VALUES ('已完成任务', ?, '已完成', '2026-08-05', '2026-08-01 18:00:00')`,
  ).run(projectId);
  db.prepare(
    `INSERT INTO tasks (name, project_id, status, deadline) VALUES ('未完成任务', ?, '进行中', '2026-08-10')`,
  ).run(projectId);
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

describe('GET /api/report?format=data', () => {
  it('返回原始聚合 JSON，不经 LLM', async () => {
    const res = await reportGET(
      new NextRequest('http://localhost/api/report?format=data&start=2026-08-01&end=2026-08-07'),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.start).toBe('2026-08-01');
    expect(json.end).toBe('2026-08-07');
    expect(json.data).toBeDefined();
    // 聚合里应包含本周完成的任务
    expect(JSON.stringify(json.data)).toContain('已完成任务');
  });

  it('日期格式非法返回 400', async () => {
    const res = await reportGET(new NextRequest('http://localhost/api/report?format=data&start=0801'));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/tasks', () => {
  it('无过滤时返回全部父任务', async () => {
    const res = await tasksGET(new NextRequest('http://localhost/api/tasks'));
    const json = await res.json();
    expect(json.tasks).toHaveLength(2);
    expect(json.tasks[0].project_name).toBe('测试项目');
  });

  it('按 status 过滤', async () => {
    const res = await tasksGET(
      new NextRequest(`http://localhost/api/tasks?status=${encodeURIComponent('已完成')}`),
    );
    const json = await res.json();
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0].name).toBe('已完成任务');
  });

  it('非法 status 返回 400', async () => {
    const res = await tasksGET(new NextRequest('http://localhost/api/tasks?status=归档'));
    expect(res.status).toBe(400);
  });
});
