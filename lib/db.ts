// SQLite 数据层（better-sqlite3，单例，WAL 模式）
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'work-os.db');

const PROJECT_COLORS = [
  '#3375F6', // 品牌蓝（v6 起，原克莱因蓝 #002FA7）
  '#22B8CF',
  '#845EF7',
  '#F783AC',
  '#FFA94D',
  '#51CF66',
  '#FFD43B',
  '#748FFC',
];

function createDb(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT '进行中',
      color TEXT NOT NULL DEFAULT '#3375F6',
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
      completed_at TEXT
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
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_logs_task ON logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);
  `);

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
