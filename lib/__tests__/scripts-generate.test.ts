// AI 生成链路测试：generateDraft / generateExtra / rewrite + 对应路由；LLM 全打桩
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';

vi.mock('../llm', () => ({
  callScript: vi.fn(),
  LlmError: class LlmError extends Error {},
}));
import { callScript, LlmError } from '../llm';
import { SCHEMA_SQL } from '../db';
import { ensurePromptProfiles } from '../prompts';
import { generateDraft, generateExtra, rewrite, validateDraft } from '../generate';
import {
  addRefs,
  createScript,
  getScript,
  getVersions,
  isScriptExtraType,
  saveVersion,
} from '../scripts';
import { POST as draftPOST } from '../../app/api/scripts/[id]/generate-draft/route';
import { POST as extrasPOST } from '../../app/api/scripts/[id]/extras/generate/route';
import { POST as rewritePOST } from '../../app/api/scripts/[id]/rewrite/route';
import { POST as regenPOST } from '../../app/api/scripts/prompts/regen/route';

const globalForDb = globalThis as unknown as { __workOsDb?: Database.Database };

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  globalForDb.__workOsDb = db;
  ensurePromptProfiles(db); // 种子 base_prompt（生产由 createDb 幂等写入）
  vi.mocked(callScript).mockReset();
  vi.mocked(callScript).mockResolvedValue('{}');
});

afterEach(() => {
  db.close();
  delete globalForDb.__workOsDb;
});

function jsonReq(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

const ctx = (id: number) => ({ params: { id: String(id) } });

const YZ_DRAFT = {
  cover_title: '万分之一天平怎么选',
  positioning: '帮实验室选天平',
  framework: '钩子→方案→引流',
  audience: '实验室负责人',
  keywords: ['天平选购'],
  body: '你的天平真的准吗（画面：特写）\n看精度和量程（字幕：精度优先）',
  progress_nodes: ['钩子', '方案'],
  end_card: '选型不踩坑',
};

const YZ_LEGACY = {
  cover_title: '旧格式稿',
  sections: [
    { node_label: '钩子', narration: '你的天平真的准吗', subtitle: '选型避坑', visual: '特写' },
    { node_label: '方案', narration: '看精度和量程', subtitle: '', visual: '' },
  ],
};

describe('validateDraft', () => {
  it('一站式缺 body / 徕乔缺 post_title / 缺 cover_title 均抛 LlmError', () => {
    expect(() => validateDraft('yizhanshi', YZ_DRAFT)).not.toThrow();
    expect(() => validateDraft('yizhanshi', { cover_title: 'x' })).toThrow(/body/);
    expect(() => validateDraft('yizhanshi', { body: '有正文无标题' })).toThrow(/cover_title/);
    expect(() =>
      validateDraft('laiqiao', { cover_title: 'x', rows: [{ voiceover: 'a' }] }),
    ).toThrow(/post_title/);
    expect(() => validateDraft('laiqiao', { cover_title: ' ', post_title: 't', rows: [] })).toThrow(LlmError);
    expect(() => validateDraft('yizhanshi', null)).toThrow(LlmError);
  });

  it('旧 sections 格式自动归一为 body + progress_nodes', () => {
    const out = validateDraft('yizhanshi', YZ_LEGACY) as { body: string; progress_nodes: string[] };
    expect(out.body).toContain('你的天平真的准吗（字幕：选型避坑）');
    expect(out.body).toContain('（画面：特写）');
    expect(out.body).toContain('看精度和量程');
    expect(out.body).not.toContain('sections');
    expect(out.progress_nodes).toEqual(['钩子', '方案']);
  });

  it('徕乔行四字段宽容归一，note_images 忽略', () => {
    const out = validateDraft('laiqiao', {
      cover_title: 'c',
      post_title: 'p',
      rows: [
        { voiceover: 'a', visual: '产品特写', note: '近景' },
        { voiceover: 'b', note_images: ['/api/script-assets/x.png'], note: '只有备注' },
      ],
    }) as { rows: { voiceover: string; visual: string; subtitle: string; note: string; note_images?: string[] }[] };
    expect(out.rows[0].visual).toBe('产品特写'); // visual 独立保留，不再并入 note
    expect(out.rows[0].note).toBe('近景');
    expect(out.rows[1].note).toBe('只有备注');
    expect(out.rows[0].subtitle).toBe('');
    expect(out.rows[0].note_images).toBeUndefined(); // 不再保留
  });
});

describe('generateDraft', () => {
  it('一站式：JSON 校验 → 存 ai_draft 版本 → 占位标题（=direction）被 cover_title 接管', async () => {
    const s = createScript({ account: 'yizhanshi', title: '天平选型干货', direction: '天平选型干货', notes: '侧重精度对比' });
    const [ref] = addRefs(s.id, ['https://a.com/ref']);
    db.prepare("UPDATE script_refs SET fetch_status = 'ok', fetched_content = ? WHERE id = ?").run('参考正文：精度对比要点', ref.id);
    vi.mocked(callScript).mockResolvedValue(JSON.stringify(YZ_DRAFT));

    const { version, draft } = await generateDraft(s.id);
    expect(draft.cover_title).toBe('万分之一天平怎么选');
    expect((draft as { body: string }).body).toContain('你的天平真的准吗');
    expect(version.kind).toBe('ai_draft');
    const saved = JSON.parse(version.content) as { body: string; progress_nodes: string[] };
    expect(saved.body).toContain('看精度和量程');
    expect(saved.progress_nodes).toEqual(['钩子', '方案']);
    expect(getVersions(s.id)).toHaveLength(1);

    // 载荷 = 方向 + 备注 + 参考正文
    const [system, payload] = vi.mocked(callScript).mock.calls[0];
    expect(String(system)).toContain('一站式');
    expect(String(payload)).toContain('天平选型干货');
    expect(String(payload)).toContain('侧重精度对比');
    expect(String(payload)).toContain('参考正文：精度对比要点');

    // 标题原为占位（= direction）→ 被 cover_title 接管，看板父任务名同步
    expect(getScript(s.id)!.title).toBe('万分之一天平怎么选');
    const parent = db.prepare('SELECT name FROM tasks WHERE id = ?').get(s.linked_task_id!) as { name: string };
    expect(parent.name).toBe('脚本：万分之一天平怎么选');
  });

  it('用户自改过标题（≠ direction）则不覆盖', async () => {
    const s = createScript({ account: 'yizhanshi', title: '我自己起的名', direction: '天平选型干货' });
    vi.mocked(callScript).mockResolvedValue(JSON.stringify(YZ_DRAFT));
    await generateDraft(s.id);
    expect(getScript(s.id)!.title).toBe('我自己起的名');
  });

  it('占位标题带「= 」前缀（新建页实际格式）也被 cover_title 接管', async () => {
    const s = createScript({ account: 'yizhanshi', title: '= 天平选型干货', direction: '天平选型干货' });
    vi.mocked(callScript).mockResolvedValue(JSON.stringify(YZ_DRAFT));
    await generateDraft(s.id);
    expect(getScript(s.id)!.title).toBe('万分之一天平怎么选');
  });

  it('徕乔：post_title + rows 结构落库', async () => {
    const s = createScript({ account: 'laiqiao', title: 'D', direction: 'D' });
    vi.mocked(callScript).mockResolvedValue(
      JSON.stringify({
        cover_title: '搅拌/混匀 新品亮相',
        post_title: '新品上市 #LACHOI徕乔',
        rows: [{ node_label: '开篇', voiceover: '', visual: '产品特写', subtitle: '新品', note: '近景' }],
      }),
    );
    const { draft } = await generateDraft(s.id);
    expect(draft.post_title).toContain('#LACHOI徕乔');
    const rows = (draft as { rows: { visual: string; note: string; subtitle: string }[] }).rows;
    expect(rows[0].visual).toBe('产品特写');
    expect(rows[0].note).toBe('近景');
    expect(rows[0].subtitle).toBe('新品');
    expect(getScript(s.id)!.title).toBe('搅拌/混匀 新品亮相');
  });

  it('非法 JSON / 结构缺失抛 LlmError；脚本不存在抛错', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    vi.mocked(callScript).mockResolvedValue('not json');
    await expect(generateDraft(s.id)).rejects.toThrow(LlmError);
    vi.mocked(callScript).mockResolvedValue(JSON.stringify({ cover_title: 'x' }));
    await expect(generateDraft(s.id)).rejects.toThrow(/body/);
    await expect(generateDraft(999)).rejects.toThrow('脚本不存在');
  });
});

describe('generateExtra', () => {
  it('基于最新版本正文生成并存 script_extras（重复生成保留历史）', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    saveVersion(s.id, JSON.stringify(YZ_DRAFT));
    vi.mocked(callScript).mockResolvedValue('发布文案正文');

    const r = await generateExtra(s.id, 'caption');
    expect(r).toEqual({ type: 'caption', content: '发布文案正文' });
    expect(getScript(s.id)!.extras.find((e) => e.type === 'caption')!.content).toBe('发布文案正文');

    vi.mocked(callScript).mockResolvedValue('评论1\n评论2');
    await generateExtra(s.id, 'comments');
    const detail = getScript(s.id)!;
    expect(detail.extras.find((e) => e.type === 'comments')!.content).toBe('评论1\n评论2');

    // system prompt 分账号/分类型（caption 带平台语境）
    const [system, payload] = vi.mocked(callScript).mock.calls[0];
    expect(String(system)).toContain('平台语境');
    expect(String(payload)).toContain('万分之一天平怎么选'); // 最新版本正文进了载荷
  });

  it('tags 提示词带平台流量视角与品牌词', async () => {
    const s = createScript({ account: 'laiqiao', title: 'T', direction: 'D' });
    saveVersion(s.id, JSON.stringify({ cover_title: 'c', post_title: 'p', rows: [] }));
    vi.mocked(callScript).mockResolvedValue('#LACHOI徕乔 #实验室');
    await generateExtra(s.id, 'tags');
    const [system] = vi.mocked(callScript).mock.calls[0];
    expect(String(system)).toContain('搜索流量大');
    expect(String(system)).toContain('微信搜一搜');
    expect(String(system)).toContain('#LACHOI徕乔');
  });

  it('没有正文时抛 LlmError（先存草稿再生成）', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    await expect(generateExtra(s.id, 'tags')).rejects.toThrow(LlmError);
  });
});

describe('rewrite', () => {
  it('按账号口吻改写并返回纯文本', async () => {
    vi.mocked(callScript).mockResolvedValue('  改写后的句子  ');
    const r = await rewrite('原句', '更口语一点', 'laiqiao');
    expect(r.rewritten).toBe('改写后的句子');
    const [system, payload] = vi.mocked(callScript).mock.calls[0];
    expect(String(system)).toContain('只输出改写后的文本本身');
    expect(String(system)).toContain('真实实验室口吻');
    expect(String(payload)).toContain('更口语一点');
    expect(String(payload)).toContain('原句');
  });
});

describe('生成路由', () => {
  it('generate-draft：成功 200 + 版本；非法 id 400；不存在 404；LLM 失败 502', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    vi.mocked(callScript).mockResolvedValue(JSON.stringify(YZ_DRAFT));
    const ok = await draftPOST(jsonReq(`/api/scripts/${s.id}/generate-draft`, {}), ctx(s.id));
    expect(ok.status).toBe(200);
    const json = (await ok.json()) as { version: { kind: string }; draft: { cover_title: string } };
    expect(json.version.kind).toBe('ai_draft');
    expect(json.draft.cover_title).toBe('万分之一天平怎么选');

    expect(
      (await draftPOST(jsonReq('/api/scripts/abc/generate-draft', {}), { params: { id: 'abc' } })).status,
    ).toBe(400);
    expect((await draftPOST(jsonReq('/api/scripts/999/generate-draft', {}), ctx(999))).status).toBe(404);

    vi.mocked(callScript).mockRejectedValue(new LlmError('AI 超时'));
    expect((await draftPOST(jsonReq(`/api/scripts/${s.id}/generate-draft`, {}), ctx(s.id))).status).toBe(502);
  });

  it('extras/generate：type 校验 400；成功落库；不存在 404', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    saveVersion(s.id, '{}');
    expect(
      (await extrasPOST(jsonReq(`/api/scripts/${s.id}/extras/generate`, { type: 'bad' }), ctx(s.id))).status,
    ).toBe(400);
    vi.mocked(callScript).mockResolvedValue('一组 #标签 #LACHOI徕乔');
    const ok = await extrasPOST(jsonReq(`/api/scripts/${s.id}/extras/generate`, { type: 'tags' }), ctx(s.id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).content).toContain('#LACHOI徕乔');
    expect(getScript(s.id)!.extras.find((e) => e.type === 'tags')).toBeTruthy();
    expect((await extrasPOST(jsonReq('/api/scripts/999/extras/generate', { type: 'tags' }), ctx(999))).status).toBe(404);
    expect(isScriptExtraType('comments')).toBe(true);
  });

  it('rewrite：空 text/instruction 400；成功返回 rewritten；不存在 404', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    expect((await rewritePOST(jsonReq(`/api/scripts/${s.id}/rewrite`, { text: '', instruction: 'x' }), ctx(s.id))).status).toBe(400);
    expect((await rewritePOST(jsonReq(`/api/scripts/${s.id}/rewrite`, { text: '原文', instruction: '' }), ctx(s.id))).status).toBe(400);
    expect((await rewritePOST(jsonReq('/api/scripts/999/rewrite', { text: 'a', instruction: 'b' }), ctx(999))).status).toBe(404);

    vi.mocked(callScript).mockResolvedValue('改好了');
    const ok = await rewritePOST(jsonReq(`/api/scripts/${s.id}/rewrite`, { text: '原文', instruction: '压短' }), ctx(s.id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).rewritten).toBe('改好了');
  });

  it('prompts/regen：account 校验 400；成功返回最新档案', async () => {
    expect((await regenPOST(jsonReq('/api/scripts/prompts/regen', { account: 'x' }))).status).toBe(400);
    const s = createScript({ account: 'laiqiao', title: 'T', direction: 'D' });
    updateScriptLaiqiaoSample(s.id);
    vi.mocked(callScript).mockResolvedValue('提炼出的规则');
    const ok = await regenPOST(jsonReq('/api/scripts/prompts/regen', { account: 'laiqiao' }));
    expect(ok.status).toBe(200);
    const { profile } = (await ok.json()) as { profile: { auto_rules: string; auto_rules_updated_at: string | null } };
    expect(profile.auto_rules).toBe('提炼出的规则');
    expect(profile.auto_rules_updated_at).toBeTruthy();
  });
});

function updateScriptLaiqiaoSample(id: number) {
  db.prepare('UPDATE scripts SET is_sample = 1 WHERE id = ?').run(id);
}

// —— 阶段 H：润色脚本 API —— //
describe('POST /api/scripts/polish', () => {
  it('account/text 校验 400；成功返回 polished；LLM 失败 502', async () => {
    const { POST: polishPOST } = await import('../../app/api/scripts/polish/route');

    expect((await polishPOST(jsonReq('/api/scripts/polish', { account: 'x', text: 't' }))).status).toBe(400);
    expect((await polishPOST(jsonReq('/api/scripts/polish', { account: 'yizhanshi', text: '' }))).status).toBe(400);
    expect(
      (await polishPOST(jsonReq('/api/scripts/polish', { account: 'yizhanshi', text: '字'.repeat(8001) }))).status,
    ).toBe(400);

    vi.mocked(callScript).mockResolvedValue('  润色后的文案  ');
    const ok = await polishPOST(jsonReq('/api/scripts/polish', { account: 'laiqiao', text: '原文案' }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).polished).toBe('润色后的文案');
    const [system, payload] = vi.mocked(callScript).mock.calls[0];
    expect(String(system)).toContain('大白话');
    expect(String(system)).toContain('分镜同期声');
    expect(String(system)).toContain('保留全部信息点');
    expect(String(payload)).toBe('原文案');

    vi.mocked(callScript).mockRejectedValue(new LlmError('AI 超时'));
    expect(
      (await polishPOST(jsonReq('/api/scripts/polish', { account: 'yizhanshi', text: 'x' }))).status,
    ).toBe(502);
  });
});
