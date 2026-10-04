// 脚本工作台：脚本 CRUD + 版本/配套产出/参考链接 + 看板同步（需求文档 3.6/3.7）
// 薄封装层（仿 notes.ts），路由只做参数校验
import { getDb, nextColor } from './db';
import { regenAutoRules } from './prompts';
import { cascadeCompleteChildren } from './task-status';
import { nowStr } from './utils';

export type ScriptAccount = 'yizhanshi' | 'laiqiao';
export type ScriptStatus = '写作中' | '初稿' | '定稿' | '已发布';
export type ScriptExtraType = 'caption' | 'tags' | 'comments';
export type ScriptVersionKind = 'ai_draft' | 'manual';

export const SCRIPT_ACCOUNTS: ScriptAccount[] = ['yizhanshi', 'laiqiao'];
export const SCRIPT_STATUSES: ScriptStatus[] = ['写作中', '初稿', '定稿', '已发布'];
export const SCRIPT_EXTRA_TYPES: ScriptExtraType[] = ['caption', 'tags', 'comments'];

export function isScriptAccount(v: unknown): v is ScriptAccount {
  return SCRIPT_ACCOUNTS.includes(v as ScriptAccount);
}
export function isScriptStatus(v: unknown): v is ScriptStatus {
  return SCRIPT_STATUSES.includes(v as ScriptStatus);
}
export function isScriptExtraType(v: unknown): v is ScriptExtraType {
  return SCRIPT_EXTRA_TYPES.includes(v as ScriptExtraType);
}

/** 账号 → 看板项目名（3.7：新建脚本自动归入对应项目，项目不存在则创建；对齐线上既有项目名「账号运营-一站式」「账号运营-徕乔」） */
export const ACCOUNT_PROJECT: Record<ScriptAccount, string> = { yizhanshi: '账号运营-一站式', laiqiao: '账号运营-徕乔' };

export interface Script {
  id: number;
  account: ScriptAccount;
  title: string;
  direction: string;
  notes: string | null;
  status: ScriptStatus;
  is_sample: number;
  linked_task_id: number | null;
  draft_task_id: number | null;
  final_task_id: number | null;
  draft_date: string | null;
  final_date: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ScriptVersion {
  id: number;
  script_id: number;
  version_no: number;
  kind: ScriptVersionKind;
  content: string;
  created_at: string;
}

export interface ScriptExtra {
  id: number;
  script_id: number;
  type: ScriptExtraType;
  content: string;
  created_at: string;
}

export interface ScriptRef {
  id: number;
  script_id: number;
  url: string;
  title: string | null;
  fetched_content: string | null;
  fetch_status: 'pending' | 'ok' | 'failed';
  created_at: string;
}

/** getScript 的完整视图：脚本行 + 最新版本正文 + 参考链接 + 各类型配套产出最新一条 + 全部产出历史 */
export interface ScriptDetail extends Script {
  content: string | null;
  refs: ScriptRef[];
  extras: ScriptExtra[];
  extras_all: ScriptExtra[];
}

export interface PromptProfile {
  account: ScriptAccount;
  base_prompt: string;
  auto_rules: string;
  auto_rules_updated_at: string | null;
  manual_notes: string;
  updated_at: string;
}

export interface ScriptListFilter {
  account?: ScriptAccount;
  status?: ScriptStatus;
  q?: string;
}

export function listScripts(filter: ScriptListFilter = {}): Script[] {
  const db = getDb();
  const where: string[] = [];
  const vals: unknown[] = [];
  if (filter.account) {
    where.push('account = ?');
    vals.push(filter.account);
  }
  if (filter.status) {
    where.push('status = ?');
    vals.push(filter.status);
  }
  if (filter.q) {
    where.push('(title LIKE ? OR direction LIKE ? OR notes LIKE ?)');
    const like = `%${filter.q}%`;
    vals.push(like, like, like);
  }
  const sql = `SELECT s.*,
      (SELECT COUNT(*) FROM script_versions v WHERE v.script_id = s.id) AS version_count
    FROM scripts s ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY updated_at DESC, id DESC`;
  return db.prepare(sql).all(...vals) as (Script & { version_count: number })[];
}

export function getScript(id: number): ScriptDetail | null {
  const db = getDb();
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Script | undefined;
  if (!script) return null;
  const version = db
    .prepare('SELECT content FROM script_versions WHERE script_id = ? ORDER BY version_no DESC LIMIT 1')
    .get(id) as { content: string } | undefined;
  const refs = db
    .prepare('SELECT * FROM script_refs WHERE script_id = ? ORDER BY id ASC')
    .all(id) as ScriptRef[];
  // 每个 type 只留最新一条（配套产出可重复生成）
  const allExtras = db
    .prepare('SELECT * FROM script_extras WHERE script_id = ? ORDER BY id DESC')
    .all(id) as ScriptExtra[];
  const seen = new Set<string>();
  const extras = allExtras.filter((e) => (seen.has(e.type) ? false : (seen.add(e.type), true)));
  const extras_all = db
    .prepare('SELECT * FROM script_extras WHERE script_id = ? ORDER BY id ASC')
    .all(id) as ScriptExtra[];
  return { ...script, content: version?.content ?? null, refs, extras, extras_all };
}

export interface CreateScriptInput {
  account: ScriptAccount;
  title: string;
  direction: string;
  notes?: string;
  draft_date?: string | null;
  final_date?: string | null;
  /** 历史样稿导入等场景：不建看板任务、不回写 task id，避免污染看板 */
  skip_kanban?: boolean;
}

/** 新建脚本：事务内落库 + 看板同步（父任务「脚本：《title》」+ 初稿/定稿子任务，回写任务 id）；skip_kanban 时跳过看板 */
export function createScript(input: CreateScriptInput): ScriptDetail {
  const db = getDb();
  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO scripts (account, title, direction, notes, draft_date, final_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.account,
        input.title.trim(),
        input.direction.trim(),
        input.notes?.trim() || null,
        input.draft_date ?? null,
        input.final_date ?? null,
      );
    const id = Number(info.lastInsertRowid);
    if (!input.skip_kanban) syncScriptToKanban(id);
    return getScript(id)!;
  })();
}

export interface ScriptPatch {
  title?: string;
  direction?: string;
  notes?: string | null;
  status?: ScriptStatus;
  is_sample?: boolean;
  draft_date?: string | null;
  final_date?: string | null;
}

/** 更新脚本：updated_at 刷新；日期变化同步子任务 planned_date；转「已发布」级联完成看板任务（v9 语义） */
export function updateScript(id: number, patch: ScriptPatch): ScriptDetail {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Script | undefined;
  if (!existing) throw new Error('脚本不存在');

  const updated = db.transaction(() => {
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [nowStr()];

    if (patch.title !== undefined) {
      sets.push('title = ?');
      vals.push(patch.title.trim());
    }
    if (patch.direction !== undefined) {
      sets.push('direction = ?');
      vals.push(patch.direction.trim());
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      vals.push(patch.notes?.trim() || null);
    }
    if (patch.is_sample !== undefined) {
      sets.push('is_sample = ?');
      vals.push(patch.is_sample ? 1 : 0);
    }
    if (patch.draft_date !== undefined) {
      sets.push('draft_date = ?');
      vals.push(patch.draft_date);
    }
    if (patch.final_date !== undefined) {
      sets.push('final_date = ?');
      vals.push(patch.final_date);
    }

    const publishing = patch.status === '已发布' && existing.status !== '已发布';
    if (patch.status !== undefined) {
      sets.push('status = ?');
      vals.push(patch.status);
    }
    if (publishing) {
      sets.push('published_at = ?');
      vals.push(nowStr());
    }

    vals.push(id);
    db.prepare(`UPDATE scripts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

    // 看板同步（单向：脚本侧为准）
    if (patch.title !== undefined && existing.linked_task_id) {
      db.prepare('UPDATE tasks SET name = ? WHERE id = ?').run(
        `脚本：${patch.title.trim()}`,
        existing.linked_task_id,
      );
    }
    if (patch.draft_date !== undefined && existing.draft_task_id) {
      db.prepare('UPDATE tasks SET planned_date = ? WHERE id = ?').run(
        patch.draft_date,
        existing.draft_task_id,
      );
    }
    if (patch.final_date !== undefined && existing.final_task_id) {
      db.prepare('UPDATE tasks SET planned_date = ? WHERE id = ?').run(
        patch.final_date,
        existing.final_task_id,
      );
    }
    if (publishing && existing.linked_task_id) {
      const at = nowStr();
      cascadeCompleteChildren(existing.linked_task_id, at);
      db.prepare(`UPDATE tasks SET status = '已完成', completed_at = ? WHERE id = ?`).run(
        at,
        existing.linked_task_id,
      );
    }

    return getScript(id)!;
  })();
  // 样稿开关切换（0↔1）→ 后台重跑自动提炼（fire-and-forget，失败不影响本次响应）
  if (patch.is_sample !== undefined && patch.is_sample !== (existing.is_sample === 1)) {
    void regenAutoRules(existing.account).catch((e) =>
      console.error('[prompts] 样稿自动提炼失败：', e),
    );
  }
  return updated;
}

/** 删除脚本：版本/配套产出/参考链接随 ON DELETE CASCADE 一并清掉；看板任务保留不动 */
export function deleteScript(id: number): boolean {
  return getDb().prepare('DELETE FROM scripts WHERE id = ?').run(id).changes > 0;
}

/** 看板同步（lib 内部）：项目不存在则新建（颜色 nextColor），建父子三任务并回写 linked/draft/final_task_id */
function syncScriptToKanban(scriptId: number): void {
  const db = getDb();
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(scriptId) as Script;
  const projectName = ACCOUNT_PROJECT[script.account];
  let project = db.prepare('SELECT id FROM projects WHERE name = ?').get(projectName) as
    | { id: number }
    | undefined;
  if (!project) {
    const info = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)').run(projectName, nextColor());
    project = { id: Number(info.lastInsertRowid) };
  }

  const parentInfo = db
    .prepare(`INSERT INTO tasks (name, project_id, status) VALUES (?, ?, '待启动')`)
    .run(`脚本：${script.title}`, project.id);
  const parentId = Number(parentInfo.lastInsertRowid);

  const draftInfo = db
    .prepare(`INSERT INTO tasks (name, project_id, status, planned_date, parent_task_id) VALUES (?, ?, '待启动', ?, ?)`)
    .run('初稿', project.id, script.draft_date, parentId);
  const finalInfo = db
    .prepare(`INSERT INTO tasks (name, project_id, status, planned_date, parent_task_id) VALUES (?, ?, '待启动', ?, ?)`)
    .run('定稿', project.id, script.final_date, parentId);

  db.prepare('UPDATE scripts SET linked_task_id = ?, draft_task_id = ?, final_task_id = ? WHERE id = ?').run(
    parentId,
    Number(draftInfo.lastInsertRowid),
    Number(finalInfo.lastInsertRowid),
    scriptId,
  );
}

/** 保存一个版本：version_no 递增（max+1），kind=ai_draft|manual（默认 manual） */
export function saveVersion(
  scriptId: number,
  content: string,
  kind: ScriptVersionKind = 'manual',
): ScriptVersion {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO script_versions (script_id, version_no, kind, content)
       VALUES (?, COALESCE((SELECT MAX(version_no) FROM script_versions WHERE script_id = ?), 0) + 1, ?, ?)`,
    )
    .run(scriptId, scriptId, kind, content);
  return db.prepare('SELECT * FROM script_versions WHERE id = ?').get(info.lastInsertRowid) as ScriptVersion;
}

export function getVersions(scriptId: number): ScriptVersion[] {
  return getDb()
    .prepare('SELECT * FROM script_versions WHERE script_id = ? ORDER BY version_no DESC')
    .all(scriptId) as ScriptVersion[];
}

export function addExtra(scriptId: number, type: ScriptExtraType, content: string): ScriptExtra {
  const db = getDb();
  const info = db
    .prepare('INSERT INTO script_extras (script_id, type, content) VALUES (?, ?, ?)')
    .run(scriptId, type, content);
  return db.prepare('SELECT * FROM script_extras WHERE id = ?').get(info.lastInsertRowid) as ScriptExtra;
}

export function listExtras(scriptId: number): ScriptExtra[] {
  return getDb()
    .prepare('SELECT * FROM script_extras WHERE script_id = ? ORDER BY id ASC')
    .all(scriptId) as ScriptExtra[];
}

/** 参考链接条目：纯 url 走自动抓取（初始 pending）；带 manual_content 直接存为 ok（手动粘贴兜底） */
export type ScriptRefEntry = string | { url: string; manual_content?: string };

/** 批量登记参考链接，返回插入的行；自动抓取的抓取逻辑见 lib/refetch.ts */
export function addRefs(scriptId: number, entries: ScriptRefEntry[]): ScriptRef[] {
  const db = getDb();
  const insertAuto = db.prepare('INSERT INTO script_refs (script_id, url) VALUES (?, ?)');
  const insertManual = db.prepare(
    "INSERT INTO script_refs (script_id, url, fetched_content, fetch_status) VALUES (?, ?, ?, 'ok')",
  );
  return entries.map((entry) => {
    const info =
      typeof entry === 'string'
        ? insertAuto.run(scriptId, entry)
        : insertManual.run(scriptId, entry.url, entry.manual_content ?? '');
    return db.prepare('SELECT * FROM script_refs WHERE id = ?').get(info.lastInsertRowid) as ScriptRef;
  });
}

/** 提示词档案：不存在则建空档（base_prompt 种子下阶段填） */
export function getPromptProfile(account: ScriptAccount): PromptProfile {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO prompt_profiles (account) VALUES (?)').run(account);
  return db.prepare('SELECT * FROM prompt_profiles WHERE account = ?').get(account) as PromptProfile;
}

export interface PromptPatch {
  base_prompt?: string;
  auto_rules?: string;
  manual_notes?: string;
}

export function upsertPromptProfile(account: ScriptAccount, patch: PromptPatch): PromptProfile {
  const db = getDb();
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO prompt_profiles (account) VALUES (?)').run(account);
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [nowStr()];
    if (patch.base_prompt !== undefined) {
      sets.push('base_prompt = ?');
      vals.push(patch.base_prompt);
    }
    if (patch.auto_rules !== undefined) {
      sets.push('auto_rules = ?', 'auto_rules_updated_at = ?');
      vals.push(patch.auto_rules, nowStr());
    }
    if (patch.manual_notes !== undefined) {
      sets.push('manual_notes = ?');
      vals.push(patch.manual_notes);
    }
    vals.push(account);
    db.prepare(`UPDATE prompt_profiles SET ${sets.join(', ')} WHERE account = ?`).run(...vals);
  })();
  return getPromptProfile(account);
}

// —— 阶段 F：脚本统计（首页数据条 / 单篇与合计口播字数） —— //
import { countSpeakable, normalizeLqRows, normalizeYzContent } from './script-content';

export interface ScriptRecentItem {
  id: number;
  title: string;
  account: ScriptAccount;
  status: ScriptStatus;
  draft_date: string | null;
  final_date: string | null;
  updated_at: string;
  words: number;
}

export interface ScriptStats {
  total: number;
  by_account: Record<ScriptAccount, number>;
  by_status: Partial<Record<ScriptStatus, number>>;
  samples: number;
  month_new: number;
  total_words: number;
  recent: ScriptRecentItem[];
}

/** 单篇口播字数：一站式=body 去括号注释后的字数（旧 sections 格式自动归一）；徕乔=rows.voiceover 合计 */
export function scriptWords(script: Script, content: string | null): number {
  if (!content) return 0;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return 0;
  }
  if (script.account === 'yizhanshi') {
    return countSpeakable(normalizeYzContent(o).body);
  }
  const rows = normalizeLqRows(o.rows);
  return countSpeakable(rows.map((r) => String(r.voiceover ?? '')).join(''));
}

export function collectScriptStats(): ScriptStats {
  const db = getDb();
  const all = db.prepare('SELECT * FROM scripts').all() as Script[];
  const latestStmt = db
    .prepare('SELECT content FROM script_versions WHERE script_id = ? ORDER BY version_no DESC LIMIT 1');
  const month = (
    db.prepare("SELECT strftime('%Y-%m','now','localtime') AS m").get() as { m: string }
  ).m;

  const by_account: Record<ScriptAccount, number> = { yizhanshi: 0, laiqiao: 0 };
  const by_status: Partial<Record<ScriptStatus, number>> = {};
  let samples = 0;
  let month_new = 0;
  let total_words = 0;

  const wordsOf = (s: Script): number => {
    const v = latestStmt.get(s.id) as { content: string } | undefined;
    return scriptWords(s, v?.content ?? null);
  };

  for (const s of all) {
    by_account[s.account]++;
    by_status[s.status] = (by_status[s.status] ?? 0) + 1;
    if (s.is_sample === 1) samples++;
    if (s.created_at.slice(0, 7) === month) month_new++;
    total_words += wordsOf(s);
  }

  const recent = [...all]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
    .slice(0, 8)
    .map((s) => ({
      id: s.id,
      title: s.title,
      account: s.account,
      status: s.status,
      draft_date: s.draft_date,
      final_date: s.final_date,
      updated_at: s.updated_at,
      words: wordsOf(s),
    }));

  return { total: all.length, by_account, by_status, samples, month_new, total_words, recent };
}
