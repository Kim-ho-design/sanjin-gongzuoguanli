// 脚本工作台 API 路由测试：/api/scripts 系列，独立 :memory: 库，fetch 打桩不打外网
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { SCHEMA_SQL } from '../db';
import {
  createScript,
  getScript,
  updateScript,
  type ScriptDetail,
} from '../scripts';
import { GET as listGET, POST as listPOST } from '../../app/api/scripts/route';
import {
  GET as detailGET,
  PATCH as detailPATCH,
  DELETE as detailDELETE,
} from '../../app/api/scripts/[id]/route';
import {
  GET as versionsGET,
  POST as versionsPOST,
} from '../../app/api/scripts/[id]/versions/route';
import { POST as refsPOST } from '../../app/api/scripts/[id]/refs/route';
import {
  GET as promptsGET,
  POST as promptsPOST,
  PATCH as promptsPATCH,
} from '../../app/api/scripts/prompts/route';

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

function jsonReq(path: string, body: unknown, method = 'POST'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
}

const ctx = (id: number) => ({ params: { id: String(id) } });

describe('GET/POST /api/scripts', () => {
  it('POST 缺 direction / account 非法 / 日期非法 均 400', async () => {
    expect((await listPOST(jsonReq('/api/scripts', { account: 'yizhanshi', title: 'T' }))).status).toBe(400);
    expect(
      (await listPOST(jsonReq('/api/scripts', { account: 'bad', title: 'T', direction: 'D' }))).status,
    ).toBe(400);
    expect(
      (
        await listPOST(
          jsonReq('/api/scripts', { account: 'yizhanshi', title: 'T', direction: 'D', draft_date: '10月5日' }),
        )
      ).status,
    ).toBe(400);
  });

  it('POST 成功后连带看板任务创建，返回完整脚本', async () => {
    const res = await listPOST(
      jsonReq('/api/scripts', { account: 'laiqiao', title: 'T', direction: 'D', draft_date: '2026-10-05' }),
    );
    expect(res.status).toBe(200);
    const { script } = (await res.json()) as { script: ScriptDetail };
    expect(script.account).toBe('laiqiao');
    expect(script.status).toBe('写作中');
    expect(script.linked_task_id).toBeTruthy();
    expect(getScript(script.id)!.refs).toEqual([]);
  });

  it('GET 支持 account/status/q 筛选，非法参数 400', async () => {
    const a = createScript({ account: 'yizhanshi', title: '天平', direction: '干货' });
    createScript({ account: 'laiqiao', title: '别的', direction: '种草' });
    updateScript(a.id, { status: '定稿' });

    const all = await listGET(new NextRequest('http://localhost/api/scripts'));
    expect((await all.json()).scripts).toHaveLength(2);

    const filtered = await listGET(
      new NextRequest('http://localhost/api/scripts?account=yizhanshi&status=定稿&q=天平'),
    );
    const { scripts } = (await filtered.json()) as { scripts: ScriptDetail[] };
    expect(scripts).toHaveLength(1);
    expect(scripts[0].id).toBe(a.id);

    expect((await listGET(new NextRequest('http://localhost/api/scripts?account=nope'))).status).toBe(400);
    expect((await listGET(new NextRequest('http://localhost/api/scripts?status=归档'))).status).toBe(400);
  });
});

describe('GET/PATCH/DELETE /api/scripts/[id]', () => {
  it('GET 存在返回详情，不存在 404，非法 id 400', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    expect((await detailGET(new NextRequest('http://localhost/api/scripts/1'), ctx(s.id))).status).toBe(200);
    expect((await detailGET(new NextRequest('http://localhost/api/scripts/1'), ctx(999))).status).toBe(404);
    expect(
      (await detailGET(new NextRequest('http://localhost/api/scripts/abc'), { params: { id: 'abc' } })).status,
    ).toBe(400);
  });

  it('PATCH 改标题同步看板任务名；非法状态 400；不存在 404', async () => {
    const s = createScript({ account: 'yizhanshi', title: '旧', direction: 'D' });
    const res = await detailPATCH(jsonReq(`/api/scripts/${s.id}`, { title: '新' }, 'PATCH'), ctx(s.id));
    expect(res.status).toBe(200);
    expect((await res.json()).script.title).toBe('新');
    const parent = db.prepare('SELECT name FROM tasks WHERE id = ?').get(s.linked_task_id!) as { name: string };
    expect(parent.name).toBe('脚本：新');

    expect(
      (await detailPATCH(jsonReq(`/api/scripts/${s.id}`, { status: '归档' }, 'PATCH'), ctx(s.id))).status,
    ).toBe(400);
    expect(
      (await detailPATCH(jsonReq('/api/scripts/999', { title: 'x' }, 'PATCH'), ctx(999))).status,
    ).toBe(404);
  });

  it('PATCH 转已发布级联完成看板任务', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    await detailPATCH(jsonReq(`/api/scripts/${s.id}`, { status: '已发布' }, 'PATCH'), ctx(s.id));
    const parent = db
      .prepare('SELECT status, completed_at FROM tasks WHERE id = ?')
      .get(s.linked_task_id!) as { status: string; completed_at: string | null };
    expect(parent.status).toBe('已完成');
    expect(parent.completed_at).not.toBeNull();
  });

  it('DELETE 删除后 404，重复删除 404，非法 id 400', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    expect((await detailDELETE(new NextRequest('http://localhost/api/scripts/1', { method: 'DELETE' }), ctx(s.id))).status).toBe(200);
    expect((await detailDELETE(new NextRequest('http://localhost/api/scripts/1', { method: 'DELETE' }), ctx(s.id))).status).toBe(404);
    expect(
      (
        await detailDELETE(new NextRequest('http://localhost/api/scripts/abc', { method: 'DELETE' }), {
          params: { id: 'abc' },
        })
      ).status,
    ).toBe(400);
  });
});

describe('versions 路由', () => {
  it('POST 存版本 + GET 倒序列表；空 content 400；脚本不存在 404', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    expect((await versionsPOST(jsonReq(`/api/scripts/${s.id}/versions`, { content: '  ' }), ctx(s.id))).status).toBe(400);
    expect((await versionsPOST(jsonReq('/api/scripts/999/versions', { content: '{}' }), ctx(999))).status).toBe(404);

    await versionsPOST(jsonReq(`/api/scripts/${s.id}/versions`, { content: 'v1' }), ctx(s.id));
    await versionsPOST(jsonReq(`/api/scripts/${s.id}/versions`, { content: 'v2', kind: 'ai_draft' }), ctx(s.id));
    const res = await versionsGET(new NextRequest('http://localhost/api/scripts/1/versions'), ctx(s.id));
    const { versions } = (await res.json()) as { versions: { version_no: number; kind: string }[] };
    expect(versions.map((v) => v.version_no)).toEqual([2, 1]);
    expect(versions[0].kind).toBe('ai_draft');
  });
});

describe('refs 路由', () => {
  it('POST 登记并触发抓取，返回每条结果；空数组 400；脚本不存在 404', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('ok.com')) {
          return { ok: true, text: async () => '<article><p>正文内容</p></article>' };
        }
        return { ok: false, text: async () => 'err' };
      }),
    );
    const res = await refsPOST(
      jsonReq(`/api/scripts/${s.id}/refs`, { urls: ['https://ok.com/a', 'https://bad.com/b'] }),
      ctx(s.id),
    );
    expect(res.status).toBe(200);
    const { refs } = (await res.json()) as { refs: { url: string; fetch_status: string; fetched_content: string | null }[] };
    expect(refs).toHaveLength(2);
    const okRef = refs.find((r) => r.url.includes('ok.com'))!;
    const badRef = refs.find((r) => r.url.includes('bad.com'))!;
    expect(okRef.fetch_status).toBe('ok');
    expect(okRef.fetched_content).toContain('正文内容');
    expect(badRef.fetch_status).toBe('failed');

    expect((await refsPOST(jsonReq(`/api/scripts/${s.id}/refs`, { urls: [] }), ctx(s.id))).status).toBe(400);
    expect((await refsPOST(jsonReq('/api/scripts/999/refs', { urls: ['https://a.com'] }), ctx(999))).status).toBe(404);
  });
});

describe('prompts 路由', () => {
  it('GET 缺 account 400；POST 写入 PATCH 局部更新', async () => {
    expect((await promptsGET(new NextRequest('http://localhost/api/scripts/prompts'))).status).toBe(400);
    const empty = await promptsGET(new NextRequest('http://localhost/api/scripts/prompts?account=laiqiao'));
    expect((await empty.json()).profile).toMatchObject({ account: 'laiqiao', base_prompt: '' });

    const post = await promptsPOST(
      jsonReq('/api/scripts/prompts', { account: 'laiqiao', base_prompt: '角色', manual_notes: '备注' }),
    );
    expect((await post.json()).profile).toMatchObject({ base_prompt: '角色', manual_notes: '备注' });

    const patch = await promptsPATCH(
      jsonReq('/api/scripts/prompts', { account: 'laiqiao', auto_rules: '规则一' }, 'PATCH'),
    );
    const { profile } = (await patch.json()) as { profile: { base_prompt: string; auto_rules: string; auto_rules_updated_at: string | null } };
    expect(profile.base_prompt).toBe('角色');
    expect(profile.auto_rules).toBe('规则一');
    expect(profile.auto_rules_updated_at).toBeTruthy();

    expect(
      (await promptsPOST(jsonReq('/api/scripts/prompts', { account: 'x' }))).status,
    ).toBe(400);
  });
});

// —— 阶段 C2 扩展：refs 手动粘贴正文 —— //
describe('refs 手动粘贴正文', () => {
  it('POST {url, manual_content} 直存 ok，不触发抓取', async () => {
    const s = createScript({ account: 'yizhanshi', title: 'T', direction: 'D' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await refsPOST(
      jsonReq(`/api/scripts/${s.id}/refs`, {
        urls: [{ url: 'https://a.com/manual', manual_content: '粘贴的正文内容' }],
      }),
      ctx(s.id),
    );
    expect(res.status).toBe(200);
    const { refs } = (await res.json()) as { refs: { fetch_status: string; fetched_content: string }[] };
    expect(refs[0].fetch_status).toBe('ok');
    expect(refs[0].fetched_content).toBe('粘贴的正文内容');
    expect(fetchMock).not.toHaveBeenCalled(); // 手动条目不发起网络抓取

    // 混合：字符串条目仍自动抓取
    vi.mocked(fetch).mockImplementation(
      vi.fn(async () => ({ ok: true, text: async () => '<p>自动抓的</p>' })) as unknown as typeof fetch,
    );
    const res2 = await refsPOST(
      jsonReq(`/api/scripts/${s.id}/refs`, { urls: ['https://b.com/auto'] }),
      ctx(s.id),
    );
    const d2 = (await res2.json()) as { refs: { fetch_status: string }[] };
    expect(d2.refs[0].fetch_status).toBe('ok');
  });
});

// —— 阶段 D：skip_kanban 路由 —— //
describe('POST /api/scripts skip_kanban', () => {
  it('skip_kanban=true 返回的脚本无看板任务；非布尔 400', async () => {
    const ok = await listPOST(
      jsonReq('/api/scripts', { account: 'yizhanshi', title: '历史稿A', direction: 'D', skip_kanban: true }),
    );
    expect(ok.status).toBe(200);
    const { script } = (await ok.json()) as { script: { linked_task_id: number | null } };
    expect(script.linked_task_id).toBeNull();

    const bad = await listPOST(
      jsonReq('/api/scripts', { account: 'yizhanshi', title: 'B', direction: 'D', skip_kanban: 'yes' }),
    );
    expect(bad.status).toBe(400);
  });
});
