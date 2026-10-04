'use client';
// 脚本列表（B 端表格化）：筛选 + 表格（移动端降级为行卡片）
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { AccountBadge, StatusBadge, STATUS_OPTIONS, type ScriptRow } from '@/components/scripts/shared';

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<ScriptRow[] | null>(null);
  const [error, setError] = useState('');
  const [account, setAccount] = useState(''); // '' = 全部
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (params: { account: string; status: string; q: string }) => {
    try {
      const sp = new URLSearchParams();
      if (params.account) sp.set('account', params.account);
      if (params.status) sp.set('status', params.status);
      if (params.q) sp.set('q', params.q);
      const res = await fetch(`/api/scripts?${sp.toString()}`, { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('加载失败');
      const d = (await res.json()) as { scripts: ScriptRow[] };
      setScripts(d.scripts);
    } catch {
      setError('脚本列表加载失败，请刷新重试');
    }
  }, []);

  // 筛选变化立即拉取；搜索输入防抖 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load({ account, status, q: q.trim() }), q ? 300 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [account, status, q, load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // 样稿星标开关（乐观更新，失败重取）
  async function toggleSample(s: ScriptRow, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = s.is_sample ? 0 : 1;
    setScripts((list) => (list ? list.map((x) => (x.id === s.id ? { ...x, is_sample: next } : x)) : list));
    try {
      const res = await fetch(`/api/scripts/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_sample: next === 1 }),
      });
      if (!res.ok) throw new Error();
      showToast(next ? '已收为样稿，后台正在提炼风格规则' : '已取消样稿，风格规则将重新提炼');
    } catch {
      load({ account, status, q: q.trim() });
      showToast('样稿开关更新失败，请重试');
    }
  }

  const starBtn = (s: ScriptRow) => (
    <button
      onClick={(e) => toggleSample(s, e)}
      title={s.is_sample ? '取消样稿' : '收为样稿'}
      className={`text-base leading-none transition-colors ${s.is_sample ? 'text-[#E5A83B]' : 'text-ink-faint/40 hover:text-[#E5A83B]'}`}
    >
      ★
    </button>
  );

  return (
    <AppShell>
      <main className="min-h-screen pb-24 md:pb-10 bg-[#F3F4F6]">
        <div className="px-6 max-md:px-4 py-6 max-w-[1200px] mx-auto flex flex-col gap-4">
          {/* 标题行 */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">脚本工作台</h1>
              <p className="text-xs text-ink-faint mt-1">从选题到定稿，AI 帮你写，好稿沉淀为样稿。</p>
            </div>
            <Link
              href="/scripts/new"
              className="text-sm rounded-lg px-4 py-2.5 bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn font-medium shrink-0"
            >
              ＋ 新建脚本
            </Link>
          </div>

          {/* 筛选行 */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { v: '', label: '全部' },
              { v: 'yizhanshi', label: '一站式' },
              { v: 'laiqiao', label: '徕乔' },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setAccount(opt.v)}
                className={`text-xs border rounded-lg px-3 py-2 transition-colors ${
                  account === opt.v
                    ? 'bg-white border-line shadow-card font-medium'
                    : 'border-transparent text-ink-soft hover:bg-white/70'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input-dark text-xs px-2.5 py-2 cursor-pointer"
              aria-label="按状态筛选"
            >
              <option value="">全部状态</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索标题 / 方向 / 备注"
              className="input-dark text-xs px-3 py-2 w-48 max-md:w-40 ml-auto"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {scripts === null && !error && (
            <p className="text-sm text-ink-faint py-16 text-center font-mono">LOADING…</p>
          )}

          {scripts && scripts.length === 0 && (
            <div className="bpanel py-16 flex flex-col items-center gap-3 text-center">
              <p className="text-sm font-medium">还没有脚本</p>
              <p className="text-xs text-ink-faint">选题方向交给 AI，一分钟出初稿。</p>
              <Link
                href="/scripts/new"
                className="text-xs rounded-lg px-4 py-2 bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn font-medium"
              >
                ＋ 新建第一个脚本
              </Link>
            </div>
          )}

          {scripts && scripts.length > 0 && (
            <>
              {/* 桌面端：表格 */}
              <div className="bpanel overflow-hidden max-md:hidden">
                <div className="overflow-x-auto">
                  <table className="btable">
                    <thead>
                      <tr>
                        <th>标题</th>
                        <th className="w-20">账号</th>
                        <th className="w-20">状态</th>
                        <th className="w-24">初稿日期</th>
                        <th className="w-24">定稿日期</th>
                        <th className="w-28">更新时间</th>
                        <th className="w-14">样稿</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scripts.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <Link href={`/scripts/${s.id}`} className="font-medium hover:text-kimi-600 transition-colors">
                              {s.title}
                            </Link>
                          </td>
                          <td><AccountBadge account={s.account} /></td>
                          <td><StatusBadge status={s.status} /></td>
                          <td className="font-mono text-xs text-ink-soft pt-3">{s.draft_date ? s.draft_date.slice(0, 10) : '—'}</td>
                          <td className="font-mono text-xs text-ink-soft pt-3">{s.final_date ? s.final_date.slice(0, 10) : '—'}</td>
                          <td className="font-mono text-xs text-ink-faint pt-3">{s.updated_at.slice(0, 10)}</td>
                          <td>{starBtn(s)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 移动端：行卡片 */}
              <div className="md:hidden flex flex-col gap-2">
                {scripts.map((s) => (
                  <Link key={s.id} href={`/scripts/${s.id}`} className="bpanel px-4 py-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium leading-snug">{s.title}</span>
                      {starBtn(s)}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <AccountBadge account={s.account} />
                      <StatusBadge status={s.status} />
                      <span className="text-[10px] text-ink-faint font-mono ml-auto">
                        {s.draft_date ? `初稿 ${s.draft_date.slice(5, 10)}` : ''}
                        {s.final_date ? ` 定稿 ${s.final_date.slice(5, 10)}` : ''}
                        {` 更新 ${s.updated_at.slice(5, 10)}`}
                      </span>
                    </div>
                  </Link>
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
