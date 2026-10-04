// 脚本工作台聚合层测试：独立 :memory: 库，通过 globalThis 单例注入，不打真实 LLM/外网
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// is_sample 切换会 fire-and-forget 触发样稿自动提炼（lib/prompts.ts → llm），统一打桩
vi.mock('../llm', () => ({
  callScript: vi.fn(async () => '自动提炼规则'),
  LlmError: class LlmError extends Error {},
}));

import { SCHEMA_SQL } from '../db';
import {
  ACCOUNT_PROJECT,
  addExtra,
  addRefs,
  createScript,
  deleteScript,
  getPromptProfile,
  getScript,
  getVersions,
  isScriptAccount,
  isScriptExtraType,
  isScriptStatus,
  listExtras,
  listScripts,
  saveVersion,
  updateScript,
  upsertPromptProfile,
  type Script,
} from '../scripts';
import { extractText, fetchRef } from '../refetch';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
  vi.unstubAllGlobals();
});

function taskRow(id: number) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as {
    id: number;
    name: string;
    status: string;
    planned_date: string | null;
    deadline: string | null;
    parent_task_id: number | null;
    completed_at: string | null;
    prev_status: string | null;
    project_id: number;
  };
}

describe('枚举守卫与账号映射', () => {
  it('account/status/type 守卫与项目名映射', () => {
    expect(isScriptAccount('yizhanshi')).toBe(true);
    expect(isScriptAccount('laiqiao')).toBe(true);
    expect(isScriptAccount('other')).toBe(false);
    expect(isScriptStatus('写作中')).toBe(true);
    expect(isScriptStatus('已发布')).toBe(true);
    expect(isScriptStatus('归档')).toBe(false);
    expect(isScriptExtraType('caption')).toBe(true);
    expect(isScriptExtraType('x')).toBe(false);
    expect(ACCOUNT_PROJECT).toEqual({ yizhanshi: '账号运营-一站式', laiqiao: '账号运营-徕乔' });
  });
});

describe('createScript + 看板同步', () => {
  it('项目不存在时自动建项目，并建父任务+初稿/定稿子任务，回写任务 id', () => {
    const s = createScript({
      account: 'yizhanshi',
      title: '  万分之一天平选购  ',
      direction: '  选型干货  ',
      draft_date: '2026-10-05',
      final_date: '2026-10-08',
    });
    expect(s.title).toBe('万分之一天平选购');
    expect(s.direction).toBe('选型干货');
    expect(s.status).toBe('写作中');
    expect(s.is_sample).toBe(0);

    const project = db.prepare('SELECT * FROM projects WHERE name = ?').get('账号运营-一站式') as { id: number; color: string };
    expect(project).toBeTruthy();

    const parent = taskRow(s.linked_task_id!);
    expect(parent).toMatchObject({
      name: '脚本：万分之一天平选购',
      status: '待启动',
      deadline: null,
      planned_date: null,
      parent_task_id: null,
      project_id: project.id,
    });
    const draft = taskRow(s.draft_task_id!);
    const final = taskRow(s.final_task_id!);
    expect(draft).toMatchObject({ name: '初稿', planned_date: '2026-10-05', parent_task_id: parent.id });
    expect(final).toMatchObject({ name: '定稿', planned_date: '2026-10-08', parent_task_id: parent.id });
    expect(draft.deadline).toBeNull();
    expect(final.deadline).toBeNull();
  });

  it('项目已存在时复用，不重复建项目；日期可空', () => {
    db.prepare("INSERT INTO projects (name, color) VALUES ('账号运营-徕乔', '#007CFF')").run();
    const s = createScript({ account: 'laiqiao', title: '移液器挑战', direction: '沉浸式操作' });
    expect(s.draft_date).toBeNull();
    expect(s.final_date).toBeNull();
    expect((db.prepare("SELECT COUNT(*) AS c FROM projects WHERE name = '账号运营-徕乔'").get() as { c: number }).c).toBe(1);
    expect(taskRow(s.draft_task_id!).planned_date).toBeNull();
  });
});

describe('updateScript', () => {
  it('日期变化同步到对应子任务 planned_date，清空传 null', () => {
    const s = createScript({
      account: 'yizhanshi',
      title: 'T',
      direction: 'D',
      draft_date: '2026-10-05',
      final_date: '2026-10-08',
    });
    updateScript(s.id, { draft_date: '2026-10-06', final_date: null });
    expect(taskRow(s.draft_task_id!).planned_date).toBe('2026-10-06');
    expect(taskRow(s.final_task_id!).planned_date).toBeNull();
    expect(getScript(s.id)!.draft_date).toBe('2026-10-06');
  });

  it('改标题同步看板父任务名', () => {
    const s = createScript({ account: 'yizhanshi', title: '旧名', direction: 'D' });
    updateScript(s.id, { title: '新名' });
    expect(taskRow(s.linked_task_id!).name).toBe('脚本：新名');
  });

  it('转已发布：看板父任务级联完成，子任务记 prev_status，published_at 落库', () => {
    const s = createScript({ account: 'laiqiao', title: 'T', direction: 'D' });
    const updated = updateScript(s.id, { status: '已发布' });
    expect(updated.status).toBe('已发布');
    expect(updated.published_at).toBeTruthy();

    expect(taskRow(s.linked_task_id!)).toMatchObject({ status: '已完成' });
    expect(taskRow(s.linked_task_id!).completed_at).not.toBeNull();
    expect(taskRow(s.draft_task_id!)).toMatchObject({ status: '已完成', prev_status: '待启动' });
    expect(taskRow(s.final_task_id!)).toMatchObject({ status: '已完成', prev_status: '待启动' });
    expect(taskRow(s.draft_task_id!).completed_at).not.toBeNull();
  });

  it('中间状态不动看板任务', () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    updateScript(s.id, { status: '初稿' });
    expect(taskRow(s.linked_task_id!).status).toBe('待启动');
    expect(taskRow(s.draft_task_id!).status).toBe('待启动');
  });

  it('样稿开关 is_sample 可开可关', () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    expect(updateScript(s.id, { is_sample: true }).is_sample).toBe(1);
    expect(updateScript(s.id, { is_sample: false }).is_sample).toBe(0);
  });

  it('更新不存在的脚本抛错', () => {
    expect(() => updateScript(999, { title: 'x' })).toThrow('脚本不存在');
  });
});

describe('版本管理', () => {
  it('version_no 递增，getVersions 按 version_no 倒序', () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    const v1 = saveVersion(s.id, '{"v":1}');
    const v2 = saveVersion(s.id, '{"v":2}', 'ai_draft');
    const v3 = saveVersion(s.id, '{"v":3}');
    expect([v1.version_no, v2.version_no, v3.version_no]).toEqual([1, 2, 3]);
    expect(v2.kind).toBe('ai_draft');
    expect(v3.kind).toBe('manual');
    const versions = getVersions(s.id);
    expect(versions.map((v) => v.version_no)).toEqual([3, 2, 1]);
    // getScript 带最新版本正文
    expect(getScript(s.id)!.content).toBe('{"v":3}');
  });
});

describe('配套产出 extras', () => {
  it('addExtra/listExtras；getScript 每个 type 只留最新一条', () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    addExtra(s.id, 'caption', '文案 v1');
    addExtra(s.id, 'caption', '文案 v2');
    addExtra(s.id, 'tags', '#仪器 #干货');
    expect(listExtras(s.id)).toHaveLength(3);
    const extras = getScript(s.id)!.extras;
    expect(extras).toHaveLength(2);
    expect(extras.find((e) => e.type === 'caption')!.content).toBe('文案 v2');
    expect(extras.find((e) => e.type === 'tags')!.content).toBe('#仪器 #干货');
  });
});

describe('参考链接 refs + 抓取', () => {
  function stubFetch(impl: (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>) {
    vi.stubGlobal('fetch', vi.fn(impl));
  }

  it('addRefs 登记 pending 行', () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    const refs = addRefs(s.id, ['https://a.com/1', 'https://b.com/2']);
    expect(refs).toHaveLength(2);
    expect(refs[0].fetch_status).toBe('pending');
    expect(getScript(s.id)!.refs).toHaveLength(2);
  });

  it('fetchRef 成功：去标签提正文、压缩空白、写 ok 与 fetched_content', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    const [ref] = addRefs(s.id, ['https://a.com/post']);
    stubFetch(async () => ({
      ok: true,
      text: async () =>
        '<html><head><style>.x{}</style><script>var a=1;</script></head><body><nav>菜单</nav><article><p>第一段&nbsp;&amp;正文</p><p>第二段</p></article></body></html>',
    }));
    const updated = await fetchRef(ref.id);
    expect(updated.fetch_status).toBe('ok');
    expect(updated.fetched_content).toContain('第一段 &正文');
    expect(updated.fetched_content).toContain('第二段');
    expect(updated.fetched_content).not.toContain('菜单');
    expect(updated.fetched_content).not.toContain('var a=1');
  });

  it('fetchRef 失败：HTTP 错误与网络异常都写 failed，不抛错', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    const [r1, r2] = addRefs(s.id, ['https://a.com/404', 'https://b.com/hang']);
    stubFetch(async (url: string) => {
      if (url.includes('404')) return { ok: false, text: async () => 'not found' };
      throw new Error('network down');
    });
    expect((await fetchRef(r1.id)).fetch_status).toBe('failed');
    expect((await fetchRef(r2.id)).fetch_status).toBe('failed');
  });

  it('extractText 截断到 6000 字', () => {
    const html = `<p>${'字'.repeat(10000)}</p>`;
    expect(extractText(html).length).toBe(6000);
  });
});

describe('列表筛选 listScripts', () => {
  it('account/status/q 组合筛选，updated_at 倒序', () => {
    const a = createScript({ account: 'yizhanshi', title: '天平选购', direction: '干货' });
    const b = createScript({ account: 'yizhanshi', title: '烘箱维护', direction: '技巧', notes: '含天平对比' });
    const c = createScript({ account: 'laiqiao', title: '天平挑战', direction: '种草' });
    updateScript(a.id, { status: '已发布' });

    expect(listScripts()).toHaveLength(3);
    expect(listScripts({ account: 'yizhanshi' }).map((s: Script) => s.id)).toEqual([b.id, a.id]);
    expect(listScripts({ account: 'yizhanshi', status: '已发布' }).map((s: Script) => s.id)).toEqual([a.id]);
    expect(listScripts({ q: '天平' }).map((s: Script) => s.id)).toEqual([c.id, b.id, a.id]); // b 的 notes 也命中
    expect(listScripts({ q: '对比' })[0].id).toBe(b.id); // q 命中 notes
  });
});

describe('deleteScript', () => {
  it('删除脚本级联清版本/产出/链接；看板任务保留；不存在返回 false', () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    saveVersion(s.id, '{}');
    addExtra(s.id, 'caption', 'x');
    addRefs(s.id, ['https://a.com']);
    const parentId = s.linked_task_id!;

    expect(deleteScript(s.id)).toBe(true);
    expect(deleteScript(s.id)).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS c FROM script_versions').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM script_extras').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM script_refs').get()).toEqual({ c: 0 });
    expect(taskRow(parentId)).toBeTruthy(); // 看板任务不动
  });
});

describe('prompt_profiles 读写', () => {
  it('首次读取建空档；写入后读回；写 auto_rules 记录提炼时间', () => {
    const p = getPromptProfile('yizhanshi');
    expect(p).toMatchObject({ account: 'yizhanshi', base_prompt: '', auto_rules: '', manual_notes: '' });

    const updated = upsertPromptProfile('yizhanshi', {
      base_prompt: '基础角色',
      manual_notes: '口播要短句',
      auto_rules: '1. 钩子开头',
    });
    expect(updated.base_prompt).toBe('基础角色');
    expect(updated.manual_notes).toBe('口播要短句');
    expect(updated.auto_rules).toBe('1. 钩子开头');
    expect(updated.auto_rules_updated_at).toBeTruthy();
    expect(updated.updated_at).toBeTruthy();

    // 只改一个字段不影响其他
    const partial = upsertPromptProfile('yizhanshi', { manual_notes: '改手动区' });
    expect(partial.base_prompt).toBe('基础角色');
    expect(partial.manual_notes).toBe('改手动区');

    // 两账号互不影响
    expect(getPromptProfile('laiqiao').base_prompt).toBe('');
  });
});

// —— 阶段 C2 扩展：列表版本数 / 产出历史 / 手动粘贴参考正文 —— //
import { listScripts as listScriptsExt } from '../scripts';

describe('阶段C2 后端扩展', () => {
  it('listScripts 附带 version_count', () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    saveVersion(s.id, 'v1');
    saveVersion(s.id, 'v2');
    const row = listScriptsExt({}).find((r) => r.id === s.id)!;
    expect(row.version_count).toBe(2);
  });

  it('getScript 附带 extras_all（全量历史）', () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    addExtra(s.id, 'caption', '文案 v1');
    addExtra(s.id, 'caption', '文案 v2');
    const detail = getScript(s.id)!;
    expect(detail.extras).toHaveLength(1); // 每 type 最新
    expect(detail.extras_all).toHaveLength(2); // 全量历史
    expect(detail.extras_all[0].content).toBe('文案 v1');
  });

  it('addRefs 支持 {url, manual_content} 直存为 ok', () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    const refs = addRefs(s.id, [
      { url: 'https://a.com/x', manual_content: '手动粘贴的正文' },
      'https://b.com/y',
    ]);
    expect(refs[0].fetch_status).toBe('ok');
    expect(refs[0].fetched_content).toBe('手动粘贴的正文');
    expect(refs[1].fetch_status).toBe('pending');
  });
});

// —— 阶段 D：skip_kanban —— //
describe('skip_kanban（历史样稿导入）', () => {
  it('skip_kanban=true 不建看板任务、不回写 task id', () => {
    const before = (db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number }).c;
    const s = createScript({ account: 'yizhanshi', title: '历史稿', direction: 'D', skip_kanban: true });
    expect(s.linked_task_id).toBeNull();
    expect(s.draft_task_id).toBeNull();
    expect(s.final_task_id).toBeNull();
    expect((db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number }).c).toBe(before);
    // 项目也不自动创建
    expect(db.prepare("SELECT id FROM projects WHERE name = '账号运营-一站式'").get()).toBeUndefined();
  });

  it('默认（不传）仍同步看板', () => {
    const s = createScript({ account: 'laiqiao', title: '普通稿', direction: 'D' });
    expect(s.linked_task_id).toBeTruthy();
  });
});
