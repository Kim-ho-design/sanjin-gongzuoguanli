// 父任务级联完成 / 重新打开恢复子任务 测试（PATCH /api/tasks/[id]）
// 独立 :memory: 库，通过 globalThis 单例注入，不碰 data/
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { NextRequest } from 'next/server';
import { SCHEMA_SQL } from '../db';
import { PATCH } from '../../app/api/tasks/[id]/route';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;
let projectId: number;
let parentId: number;

function insertTask(name: string, status: string, parent: number | null): number {
  return Number(
    db
      .prepare('INSERT INTO tasks (name, project_id, status, parent_task_id) VALUES (?, ?, ?, ?)')
      .run(name, projectId, status, parent).lastInsertRowid,
  );
}

async function patch(id: number, body: Record<string, unknown>) {
  const req = { json: async () => body } as unknown as NextRequest;
  const res = await PATCH(req, { params: { id: String(id) } });
  return res.status;
}

function row(id: number) {
  return db.prepare('SELECT id, status, completed_at, prev_status FROM tasks WHERE id = ?').get(id) as {
    id: number;
    status: string;
    completed_at: string | null;
    prev_status: string | null;
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
  projectId = Number(
    db.prepare("INSERT INTO projects (name, color) VALUES ('测试项目', '#3375F6')").run().lastInsertRowid,
  );
  parentId = insertTask('父任务', '进行中', null);
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

describe('父任务级联完成', () => {
  it('父任务标记完成 → 未完成子任务一并完成并记住原状态，已完成的子任务不动', async () => {
    const s1 = insertTask('子一', '待启动', parentId);
    const s2 = insertTask('子二', '进行中', parentId);
    const s3 = insertTask('子三', '已完成', parentId); // 手动提前完成

    expect(await patch(parentId, { status: '已完成' })).toBe(200);

    expect(row(s1)).toMatchObject({ status: '已完成', prev_status: '待启动' });
    expect(row(s2)).toMatchObject({ status: '已完成', prev_status: '进行中' });
    expect(row(s1).completed_at).not.toBeNull();
    expect(row(s3)).toMatchObject({ status: '已完成', prev_status: null }); // 未被级联触碰
  });

  it('子任务直接改状态不触发级联，也不写 prev_status', async () => {
    const s1 = insertTask('子一', '待启动', parentId);
    const s2 = insertTask('子二', '待启动', parentId);

    expect(await patch(s1, { status: '已完成' })).toBe(200);

    expect(row(s1)).toMatchObject({ status: '已完成', prev_status: null });
    expect(row(s2)).toMatchObject({ status: '待启动', prev_status: null });
    expect(row(parentId).status).toBe('进行中'); // 父任务不受影响
  });
});

describe('父任务重新打开', () => {
  it('恢复被级联完成的子任务到各自原状态，手动完成的不动', async () => {
    const s1 = insertTask('子一', '待启动', parentId);
    const s2 = insertTask('子二', '进行中', parentId);
    const s3 = insertTask('子三', '已完成', parentId);

    await patch(parentId, { status: '已完成' }); // 级联完成
    expect(await patch(parentId, { status: '待启动' })).toBe(200); // 重新打开

    expect(row(s1)).toMatchObject({ status: '待启动', completed_at: null, prev_status: null });
    expect(row(s2)).toMatchObject({ status: '进行中', completed_at: null, prev_status: null });
    expect(row(s3)).toMatchObject({ status: '已完成', prev_status: null }); // 手动完成的保持
  });

  it('级联完成后子任务被单独重开 → 父任务再重开时不误恢复该子任务', async () => {
    const s1 = insertTask('子一', '待启动', parentId);

    await patch(parentId, { status: '已完成' }); // s1 被级联完成，prev_status=待启动
    await patch(s1, { status: '待启动' }); // 子任务单独重开，prev_status 应被清掉
    expect(row(s1)).toMatchObject({ status: '待启动', prev_status: null });

    await patch(parentId, { status: '待启动' });
    await patch(parentId, { status: '已完成' }); // 再次级联（s1 未完成→记住待启动）
    expect(row(s1)).toMatchObject({ status: '已完成', prev_status: '待启动' });
  });
});
