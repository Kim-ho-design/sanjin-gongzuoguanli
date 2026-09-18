// SQLite 数据层（better-sqlite3，单例，WAL 模式）
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.WORK_OS_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'work-os.db');

// Kimi 品牌配色（v17 起，对齐官方品牌手册）：只取白字可读的深中色
const PROJECT_COLORS = [
  '#007CFF', // 品牌蓝（手册核心色）
  '#00A1FF', // 亮蓝
  '#0053B8', // 深蓝
  '#002F5B', // 深海军蓝
  '#17343C', // 墨青
  '#64C656', // 亮绿
  '#E5983C', // 橙
  '#8A9084', // 中性灰
];

/** 建表 SQL（导出供测试用临时库复用） */
export const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT '进行中',
      color TEXT NOT NULL DEFAULT '#007CFF',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      status TEXT NOT NULL DEFAULT '待启动',
      deadline TEXT,
      planned_date TEXT,
      is_plan_item INTEGER NOT NULL DEFAULT 0,
      parent_task_id INTEGER REFERENCES tasks(id),
      is_today INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      completed_at TEXT,
      priority INTEGER CHECK (priority IN (1, 2, 3, 4)),
      prev_status TEXT
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      raw_text TEXT NOT NULL,
      parsed TEXT,
      duration_hours REAL,
      blocker TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS deliverables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      name TEXT NOT NULL,
      link TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS unclaimed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_text TEXT NOT NULL,
      parsed TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_date TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_logs_task ON logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(note_date);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
  `;

/** Nullable migration leaves historical tasks unset; safe on every startup.
 *  审查修复 L10：并发首次启动都检测到缺列时会双 ALTER，吞掉 duplicate column 视为成功 */
export function migratePriority(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'priority')) {
    try {
      db.exec('ALTER TABLE tasks ADD COLUMN priority INTEGER CHECK (priority IN (1, 2, 3, 4))');
    } catch (e) {
      if (!(e instanceof Error && /duplicate column/i.test(e.message))) throw e;
    }
  }
}

function createDb(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA_SQL);
  migratePriority(db);

  // v4 迁移：旧「归档」状态并入「已完成」（归档分类已改为待办事项）
  db.prepare(`UPDATE tasks SET status = '已完成' WHERE status = '归档'`).run();

  // v5 迁移：拆任务规则废除，历史计划任务对合并回主任务
  db.prepare(
    `UPDATE logs SET task_id = (SELECT parent_task_id FROM tasks WHERE tasks.id = logs.task_id)
     WHERE task_id IN (SELECT id FROM tasks WHERE is_plan_item = 1 AND parent_task_id IS NOT NULL)`,
  ).run();
  db.prepare(
    `UPDATE tasks SET planned_date = (
       SELECT c.planned_date FROM tasks c WHERE c.parent_task_id = tasks.id AND c.is_plan_item = 1 AND c.planned_date IS NOT NULL LIMIT 1
     )
     WHERE planned_date IS NULL AND id IN (SELECT DISTINCT parent_task_id FROM tasks WHERE is_plan_item = 1 AND parent_task_id IS NOT NULL)`,
  ).run();
  db.prepare(
    `DELETE FROM deliverables WHERE task_id IN (SELECT id FROM tasks WHERE is_plan_item = 1)`,
  ).run();
  db.prepare(`DELETE FROM tasks WHERE is_plan_item = 1 AND parent_task_id IS NOT NULL`).run();
  db.prepare(`UPDATE tasks SET is_plan_item = 0 WHERE is_plan_item = 1`).run(); // 无主的计划任务转普通任务

  // v6 迁移：品牌蓝 #002FA7 → #3375F6，存量项目色统一换新
  db.prepare(`UPDATE projects SET color = '#3375F6' WHERE color IN ('#002FA7', '#4D6BFE', '#4D7CFE')`).run();

  // v10 迁移：拼豆配色，品牌蓝 #3375F6 → C07 #305FB9
  db.prepare(`UPDATE projects SET color = '#305FB9' WHERE color = '#3375F6'`).run();

  // v10 迁移续：旧预置色板的存量项目统一映射到最近的拼豆色
  db.prepare(
    `UPDATE projects SET color = CASE color
       WHEN '#22B8CF' THEN '#5098BF'  -- 青 → C26 钢青
       WHEN '#845EF7' THEN '#1839A8'  -- 紫 → C08 宝蓝
       WHEN '#F783AC' THEN '#64C656'  -- 粉 → B05 亮绿
       WHEN '#FFA94D' THEN '#E5983C'  -- 橙 → P17 橙
       WHEN '#51CF66' THEN '#64C656'  -- 绿 → B05 亮绿
       WHEN '#FFD43B' THEN '#E5983C'  -- 黄 → P17 橙
       WHEN '#748FFC' THEN '#5996D9'  -- 亮蓝紫 → C06 天蓝
       ELSE color END
     WHERE color IN ('#22B8CF','#845EF7','#F783AC','#FFA94D','#51CF66','#FFD43B','#748FFC')`
  ).run();

  // v11 迁移：Kimi 品牌配色（对齐官方品牌手册），拼豆色统一映射到新色板
  db.prepare(
    `UPDATE projects SET color = CASE color
       WHEN '#305FB9' THEN '#007CFF'  -- C07 主蓝 → 品牌蓝
       WHEN '#5996D9' THEN '#00A1FF'  -- C06 天蓝 → 亮蓝
       WHEN '#5098BF' THEN '#0053B8'  -- C26 钢青 → 深蓝
       WHEN '#1839A8' THEN '#002F5B'  -- C08 宝蓝 → 深海军蓝
       ELSE color END
     WHERE color IN ('#305FB9','#5996D9','#5098BF','#1839A8')`
  ).run();

  // v7 迁移：父任务的 planned_date 迁移为子任务（计划时间改由子任务承接）
  // 未完成且无任何子任务的父任务 → 生成同名子任务承接原 planned_date；随后清空父任务 planned_date（列保留）
  db.prepare(
    `INSERT INTO tasks (name, project_id, status, deadline, planned_date, is_plan_item, parent_task_id, is_today, created_at)
     SELECT t.name, t.project_id, '待办事项', NULL, t.planned_date, 0, t.id, 0, datetime('now','localtime')
     FROM tasks t
     WHERE t.parent_task_id IS NULL
       AND t.planned_date IS NOT NULL
       AND t.status NOT IN ('已完成', '待确认审核')
       AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_task_id = t.id)`,
  ).run();
  db.prepare(`UPDATE tasks SET planned_date = NULL WHERE parent_task_id IS NULL`).run();

  // v8 迁移：状态集收敛为 待启动/进行中/已完成（待确认审核→已完成并回填完成时间，待办事项→待启动）
  db.prepare(
    `UPDATE tasks SET status = '已完成', completed_at = COALESCE(completed_at, datetime('now','localtime'))
     WHERE status = '待确认审核'`,
  ).run();
  db.prepare(`UPDATE tasks SET status = '待启动' WHERE status = '待办事项'`).run();

  // v9 迁移：tasks 加 prev_status 列（父任务级联完成时记录子任务原状态，重新打开时恢复）
  const hasPrevStatus = (db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]).some(
    (c) => c.name === 'prev_status',
  );
  if (!hasPrevStatus) {
    try {
      db.exec(`ALTER TABLE tasks ADD COLUMN prev_status TEXT`);
    } catch (e) {
      if (!(e instanceof Error && /duplicate column/i.test(e.message))) throw e;
    }
  }

  // 首次启动：写入预置项目
  const count = (db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }).c;
  if (count === 0) {
    const seed = (process.env.SEED_PROJECTS || '账号运营-徕乔,GEO执行,微电影策划')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const insert = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)');
    seed.forEach((name, i) => insert.run(name, PROJECT_COLORS[i % PROJECT_COLORS.length]));
  }

  return db;
}

// Next.js dev 热更新会重复执行模块，用 globalThis 缓存单例
const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalForDb.__workOsDb) {
    globalForDb.__workOsDb = createDb();
  }
  return globalForDb.__workOsDb;
}

export function nextColor(): string {
  const db = getDb();
  const c = (db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }).c;
  return PROJECT_COLORS[c % PROJECT_COLORS.length];
}
