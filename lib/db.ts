// SQLite 数据层（better-sqlite3，单例，WAL 模式）
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'work-os.db');

const PROJECT_COLORS = [
  '#4D6BFE', // Kimi 蓝
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
      color TEXT NOT NULL DEFAULT '#4D6BFE',
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
