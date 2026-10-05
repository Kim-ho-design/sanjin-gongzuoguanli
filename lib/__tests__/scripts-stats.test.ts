// 脚本统计 API 测试：口径（括号注释不计入字数 / 旧 sections 兼容 / 徕乔 voiceover 合计）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { SCHEMA_SQL } from '../db';
import { collectScriptStats, createScript, saveVersion, updateScript } from '../scripts';
import { GET as statsGET } from '../../app/api/scripts/stats/route';

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
});

describe('collectScriptStats', () => {
  it('总量/账号/状态/样稿/本月新增 + 字数口径（括号注释不计入，旧 sections 兼容）', () => {
    // 一站式 v2：body 含括号注释
    const a = createScript({ account: 'yizhanshi', title: 'A', direction: 'D', skip_kanban: true });
    saveVersion(a.id, JSON.stringify({
      cover_title: 'A', body: '你的天平准吗（字幕：选型避坑）（画面：特写）', progress_nodes: ['钩子'],
    }));
    // 一站式旧格式：sections 归一
    const b = createScript({ account: 'yizhanshi', title: 'B', direction: 'D', skip_kanban: true });
    saveVersion(b.id, JSON.stringify({
      cover_title: 'B',
      sections: [{ node_label: '全文', narration: '一二三四五', subtitle: '注释', visual: '' }],
    }));
    // 徕乔：voiceover_body 去括注字数
    const c = createScript({ account: 'laiqiao', title: 'C', direction: 'D', skip_kanban: true });
    saveVersion(c.id, JSON.stringify({
      cover_title: 'C', post_title: 'p',
      voiceover_body: '第一句台词\n第二句（字幕：注）',
    }));
    // 无版本脚本：0 字
    createScript({ account: 'laiqiao', title: 'D', direction: 'D', skip_kanban: true });

    updateScript(a.id, { status: '定稿', is_sample: true });

    const st = collectScriptStats();
    expect(st.total).toBe(4);
    expect(st.by_account).toEqual({ yizhanshi: 2, laiqiao: 2 });
    expect(st.by_status['定稿']).toBe(1);
    expect(st.by_status['写作中']).toBe(3);
    expect(st.samples).toBe(1);
    expect(st.month_new).toBe(4); // 全部本月建（本地时间）
    // 字数：A = "你的天平准吗"6 字（括注与空白不计）；B = 一二三四五 5 字；C = 5+3=8 字；D = 0
    expect(st.total_words).toBe(6 + 5 + 8);
    expect(st.recent).toHaveLength(4);
    const recentA = st.recent.find((r) => r.id === a.id)!;
    expect(recentA.words).toBe(6);
    expect(recentA.status).toBe('定稿');
  });

  it('字数按最新版本算（旧版本不计）', () => {
    const a = createScript({ account: 'yizhanshi', title: 'A', direction: 'D', skip_kanban: true });
    saveVersion(a.id, JSON.stringify({ cover_title: 'A', body: '短文案' }));
    saveVersion(a.id, JSON.stringify({ cover_title: 'A', body: '更长的第二版本正文' }));
    const st = collectScriptStats();
    expect(st.total_words).toBe(9); // 只算 v2
  });
});

describe('GET /api/scripts/stats', () => {
  it('返回 stats 对象（静态段优先于 /api/scripts/[id]）', async () => {
    createScript({ account: 'yizhanshi', title: 'S', direction: 'D', skip_kanban: true });
    const res = await statsGET(new NextRequest('http://localhost/api/scripts/stats'));
    expect(res.status).toBe(200);
    const { stats } = (await res.json()) as { stats: { total: number; recent: unknown[] } };
    expect(stats.total).toBe(1);
    expect(stats.recent).toHaveLength(1);
  });
});
