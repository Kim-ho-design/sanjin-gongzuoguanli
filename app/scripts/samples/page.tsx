'use client';
// 样稿库（B 端表格化）：账号 Tab（一站式 | 徕乔）+ 表格；样稿变化自动触发风格规则重新提炼
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import {
  StatusBadge,
  type PromptProfileClient,
  type ScriptRow,
} from '@/components/scripts/shared';

type AccountTab = 'yizhanshi' | 'laiqiao';

export default function SamplesPage() {
  const [scripts, setScripts] = useState<ScriptRow[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, PromptProfileClient>>({});
  const [tab, setTab] = useState<AccountTab>('yizhanshi');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/scripts', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { scripts: ScriptRow[] };
      setScripts(d.scripts);
      const profs: Record<string, PromptProfileClient> = {};
      for (const account of ['yizhanshi', 'laiqiao'] as const) {
        const pRes = await fetch(`/api/scripts/prompts?account=${account}`, { cache: 'no-store' });
        if (pRes.ok) {
          profs[account] = ((await pRes.json()) as { profile: PromptProfileClient }).profile;
        }
      }
      setProfiles(profs);
    } catch {
      setError('样稿库加载失败，请刷新重试');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function toggleSample(s: ScriptRow) {
    const next = s.is_sample ? 0 : 1;
    setScripts((list) => (list ? list.map((x) => (x.id === s.id ? { ...x, is_sample: next } : x)) : list));
    try {
      const res = await fetch(`/api/scripts/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_sample: next === 1 }),
      });
      if (!res.ok) throw new Error();
      showToast(next ? '已收为样稿，后台正在重新提炼风格规则' : '已取消样稿，风格规则将重新提炼');
    } catch {
      await load();
      showToast('样稿开关更新失败，请重试');
    }
  }

  const rows = (scripts ?? [])
    .filter((s) => s.account === tab)
    .sort((a, b) => b.is_sample - a.is_sample || b.updated_at.localeCompare(a.updated_at));
  const prof = profiles[tab];
  const sampleCount = rows.filter((r) => r.is_sample).length;

  const starBtn = (s: ScriptRow) => (
    <button
      onClick={() => void toggleSample(s)}
      title={s.is_sample ? '取消样稿' : '收为样稿'}
      className={`text-base leading-none transition-colors ${s.is_sample ? 'text-[#E5A83B]' : 'text-ink-faint/40 hover:text-[#E5A83B]'}`}
    >
      ★
    </button>
  );

  return (
    <AppShell>
      <main className="min-h-screen pb-24 md:pb-10 bg-[#F3F4F6]">
        <div className="px-6 max-md:px-4 py-6 max-w-[1000px] mx-auto flex flex-col gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">样稿库</h1>
            <p className="text-xs text-ink-faint mt-1">
              样稿变化会自动触发该账号 AI 风格规则的重新提炼，生成的初稿越来越像你的好稿。
            </p>
          </div>

          {/* 账号 Tab */}
          <div className="flex gap-1.5">
            {(['yizhanshi', 'laiqiao'] as const).map((acc) => (
              <button
                key={acc}
                onClick={() => setTab(acc)}
                className={`text-xs border rounded-lg px-4 py-2 transition-colors ${
                  tab === acc
                    ? 'bg-white border-line shadow-card font-medium'
                    : 'border-transparent text-ink-soft hover:bg-white/70'
                }`}
              >
                {acc === 'yizhanshi' ? '一站式' : '徕乔'}
              </button>
            ))}
            <span className="text-[11px] text-ink-faint self-center ml-2">
              已认可 {sampleCount} / 共 {rows.length} 篇 ·{' '}
              {prof?.auto_rules_updated_at
                ? `最近提炼 ${prof.auto_rules_updated_at.slice(0, 16)}`
                : '风格规则尚未提炼'}
            </span>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {scripts === null && !error && (
            <p className="text-sm text-ink-faint py-16 text-center font-mono">LOADING…</p>
          )}

          {scripts && rows.length === 0 && !error && (
            <div className="bpanel py-14 flex flex-col items-center gap-3 text-center">
              <p className="text-sm font-medium">该账号还没有脚本</p>
              <Link
                href="/scripts/new"
                className="text-xs rounded-lg px-4 py-2 bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn font-medium"
              >
                ＋ 去新建
              </Link>
            </div>
          )}

          {scripts && rows.length > 0 && (
            <>
              {/* 桌面端：表格 */}
              <div className="bpanel overflow-hidden max-md:hidden">
                <table className="btable">
                  <thead>
                    <tr>
                      <th>标题</th>
                      <th className="w-20">状态</th>
                      <th className="w-20">版本数</th>
                      <th className="w-28">更新时间</th>
                      <th className="w-14">样稿</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <Link href={`/scripts/${s.id}`} className="font-medium hover:text-kimi-600 transition-colors">
                            {s.title}
                          </Link>
                        </td>
                        <td><StatusBadge status={s.status} /></td>
                        <td className="font-mono text-xs text-ink-soft pt-3">{s.version_count ?? 0}</td>
                        <td className="font-mono text-xs text-ink-faint pt-3">{s.updated_at.slice(0, 10)}</td>
                        <td>{starBtn(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 移动端：行卡片（已认可在前） */}
              <div className="md:hidden flex flex-col gap-2">
                {rows.map((s) => (
                  <div key={s.id} className="bpanel px-4 py-3 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Link href={`/scripts/${s.id}`} className="text-sm font-medium hover:text-kimi-600 transition-colors block truncate">
                        {s.is_sample ? '★ ' : ''}{s.title}
                      </Link>
                      <span className="text-[10px] text-ink-faint font-mono">
                        {s.version_count ?? 0} 版本 · {s.updated_at.slice(0, 10)}
                      </span>
                    </div>
                    <StatusBadge status={s.status} />
                    {starBtn(s)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {toast && (
          <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-kimi-50 border border-kimi-200 text-ink text-xs rounded-lg px-4 py-2.5 shadow-lg shadow-kimi-500/20 z-50 max-w-lg max-md:max-w-[calc(100vw-2rem)]">
            {toast}
          </div>
        )}
      </main>
    </AppShell>
  );
}
