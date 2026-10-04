// 提示词体系测试：种子幂等 / 三区组装 / regenAutoRules / is_sample 触发自动提炼
// LLM 打桩（vi.mock '../llm'），独立 :memory: 库
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../llm', () => ({
  callScript: vi.fn(),
  LlmError: class LlmError extends Error {},
}));
import { callScript } from '../llm';
import { SCHEMA_SQL } from '../db';
import {
  SEED_BASE_PROMPTS,
  buildSystemPrompt,
  ensurePromptProfiles,
  regenAutoRules,
} from '../prompts';
import {
  createScript,
  getPromptProfile,
  saveVersion,
  updateScript,
  upsertPromptProfile,
} from '../scripts';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
  vi.mocked(callScript).mockReset();
  vi.mocked(callScript).mockResolvedValue('1. 钩子开头\n2. 短句口语');
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

describe('ensurePromptProfiles 种子', () => {
  it('写入两账号 base_prompt；重复执行幂等；不覆盖用户修改', () => {
    ensurePromptProfiles(db);
    expect((db.prepare('SELECT COUNT(*) AS c FROM prompt_profiles').get() as { c: number }).c).toBe(2);
    for (const account of ['yizhanshi', 'laiqiao'] as const) {
      const p = getPromptProfile(account);
      expect(p.base_prompt).toBe(SEED_BASE_PROMPTS[account]);
      expect(p.base_prompt.length).toBeGreaterThan(500); // 种子是完整提示词，不是占位
    }

    ensurePromptProfiles(db); // 再跑一次：行数不变
    expect((db.prepare('SELECT COUNT(*) AS c FROM prompt_profiles').get() as { c: number }).c).toBe(2);

    // 用户改过后种子不覆盖
    upsertPromptProfile('yizhanshi', { base_prompt: '用户自己的版本' });
    ensurePromptProfiles(db);
    expect(getPromptProfile('yizhanshi').base_prompt).toBe('用户自己的版本');
    expect(getPromptProfile('laiqiao').base_prompt).toBe(SEED_BASE_PROMPTS.laiqiao);
  });

  it('未跑种子的空库 getPromptProfile 建空档（兼容旧测试路径）', () => {
    expect(getPromptProfile('yizhanshi').base_prompt).toBe('');
  });
});

describe('buildSystemPrompt 三区组装', () => {
  beforeEach(() => ensurePromptProfiles(db));

  it('顺序 = base + 自动提炼区 + 手动补充区，各区带标题', () => {
    upsertPromptProfile('yizhanshi', { auto_rules: '钩子要痛点直击', manual_notes: '口播再短一点' });
    const prompt = buildSystemPrompt('yizhanshi');
    const iBase = prompt.indexOf(SEED_BASE_PROMPTS.yizhanshi);
    const iAuto = prompt.indexOf('## 风格规则（从样稿自动提炼）');
    const iManual = prompt.indexOf('## 用户手动补充（优先级最高）');
    expect(iBase).toBe(0);
    expect(iAuto).toBeGreaterThan(iBase);
    expect(iManual).toBeGreaterThan(iAuto);
    expect(prompt).toContain('钩子要痛点直击');
    expect(prompt).toContain('口播再短一点');
  });

  it('auto_rules/manual_notes 为空时省略对应区块', () => {
    const prompt = buildSystemPrompt('laiqiao');
    expect(prompt).toBe(SEED_BASE_PROMPTS.laiqiao);
    expect(prompt).not.toContain('## 风格规则');
    expect(prompt).not.toContain('## 用户手动补充');
  });
});

describe('regenAutoRules 自动提炼', () => {
  beforeEach(() => ensurePromptProfiles(db));

  it('有样稿：调 LLM 文本模式并写入 auto_rules（≤800 字）+ 提炼时间', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    saveVersion(s.id, JSON.stringify({ cover_title: '样稿内容', sections: [{ node_label: '钩子', narration: '痛点开场' }] }));
    db.prepare('UPDATE scripts SET is_sample = 1 WHERE id = ?').run(s.id); // 直接改，避开 fire-and-forget
    await regenAutoRules('yizhanshi');

    expect(vi.mocked(callScript)).toHaveBeenCalledTimes(1);
    const [, payload, opts] = vi.mocked(callScript).mock.calls[0];
    expect(opts).toEqual({ json: false });
    expect(String(payload)).toContain('痛点开场'); // 样稿正文进了载荷

    const p = getPromptProfile('yizhanshi');
    expect(p.auto_rules).toBe('1. 钩子开头\n2. 短句口语');
    expect(p.auto_rules_updated_at).toBeTruthy();
  });

  it('样稿为空：清空 auto_rules', async () => {
    upsertPromptProfile('yizhanshi', { auto_rules: '旧规则' });
    await regenAutoRules('yizhanshi');
    expect(getPromptProfile('yizhanshi').auto_rules).toBe('');
    expect(vi.mocked(callScript)).not.toHaveBeenCalled();
  });

  it('800 字截断', async () => {
    const s = createScript({ account: 'laiqiao', title: 'T', direction: 'D' });
    updateScript(s.id, { is_sample: true });
    vi.mocked(callScript).mockResolvedValue('字'.repeat(1000));
    await regenAutoRules('laiqiao');
    expect(getPromptProfile('laiqiao').auto_rules.length).toBe(800);
  });
});

describe('样稿开关触发自动提炼（lib/scripts.ts fire-and-forget）', () => {
  beforeEach(() => ensurePromptProfiles(db));

  it('is_sample 0→1 触发提炼；1→0 触发清空（无样稿不调 LLM）；未切换不触发', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    updateScript(s.id, { title: '改名' }); // 未动样稿开关
    expect(vi.mocked(callScript)).not.toHaveBeenCalled();

    updateScript(s.id, { is_sample: true });
    await vi.waitFor(() => expect(vi.mocked(callScript)).toHaveBeenCalledTimes(1));
    expect(getPromptProfile('yizhanshi').auto_rules).toBe('1. 钩子开头\n2. 短句口语');

    // 取消样稿 → 无样稿 → regen 直接清空规则，不走 LLM
    upsertPromptProfile('yizhanshi', { auto_rules: '应被清掉的规则' });
    updateScript(s.id, { is_sample: false });
    await vi.waitFor(() =>
      expect(getPromptProfile('yizhanshi').auto_rules).toBe(''),
    );
    expect(vi.mocked(callScript)).toHaveBeenCalledTimes(1); // 全程只调了一次 LLM
  });
});
