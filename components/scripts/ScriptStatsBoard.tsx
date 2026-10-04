'use client';
// 首页「内容生产」数据区：脚本统计行 + 最近脚本表格（GET /api/scripts/stats）；无脚本时不渲染
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccountBadge, StatusBadge } from './shared';

interface RecentItem {
  id: number;
  title: string;
  account: 'yizhanshi' | 'laiqiao';
  status: '写作中' | '初稿' | '定稿' | '已发布';
  draft_date: string | null;
  final_date: string | null;
  updated_at: string;
  words: number;
}

interface Stats {
  total: number;
  by_account: { yizhanshi: number; laiqiao: number };
  by_status: Record<string, number>;
  samples: number;
  month_new: number;
  total_words: number;
  recent: RecentItem[];
}

export default function ScriptStatsBoard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/scripts/stats', { cache: 'no-store' });
        if (res.status === 401) return; // 首页主数据会统一跳登录
        if (!res.ok) return;
        const d = (await res.json()) as { stats: Stats };
        if (d.stats.total > 0) setStats(d.stats);
      } catch {
        // 静默失败：不阻塞看板主流程
      }
    })();
  }, []);

  if (!stats) return null;

  const doing = stats.by_status['进行中'] ?? 0;
  const statCell = (label: string, value: string | number, accent = false) => (
    <div className="flex flex-col gap-0.5 px-4 py-3 border-r border-line/60 last:border-r-0">
      <span className="text-[10px] text-ink-faint">{label}</span>
      <strong className={`text-lg font-mono font-medium tracking-tight ${accent ? 'text-kimi-500' : 'text-ink'}`}>{value}</strong>
    </div>
  );

  return (
    <section className="fade-up" style={{ animationDelay: '40ms' }}>
      <div className="bpanel overflow-hidden">
        {/* 统计行 */}
        <div className="flex items-stretch flex-wrap border-b border-line">
          {statCell('脚本总数', stats.total)}
          {statCell('本月新增', stats.month_new)}
          {statCell('累计口播', `${stats.total_words.toLocaleString()} 字`)}
          {statCell('进行中', doing, true)}
          {statCell('样稿', stats.samples)}
          <Link
            href="/scripts"
            className="ml-auto self-center text-xs font-medium text-kimi-600 hover:text-kimi-700 px-5 transition-colors shrink-0"
          >
            全部脚本 →
          </Link>
        </div>
        {/* 最近脚本（桌面表格 / 移动行） */}
        <div className="max-md:hidden overflow-x-auto">
          <table className="btable">
            <thead>
              <tr>
                <th>标题</th>
                <th className="w-20">账号</th>
                <th className="w-20">状态</th>
                <th className="w-24">初稿日期</th>
                <th className="w-24">定稿日期</th>
                <th className="w-20">字数</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/scripts/${r.id}`} className="font-medium hover:text-kimi-600 transition-colors">
                      {r.title}
                    </Link>
                  </td>
                  <td><AccountBadge account={r.account} /></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="font-mono text-xs text-ink-soft pt-3">{r.draft_date ? r.draft_date.slice(0, 10) : '—'}</td>
                  <td className="font-mono text-xs text-ink-soft pt-3">{r.final_date ? r.final_date.slice(0, 10) : '—'}</td>
                  <td className="font-mono text-xs text-ink-faint pt-3">{r.words > 0 ? `${r.words} 字` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-line/60">
          {stats.recent.map((r) => (
            <Link key={r.id} href={`/scripts/${r.id}`} className="flex items-center gap-2 px-4 py-3">
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{r.title}</span>
              <AccountBadge account={r.account} />
              <StatusBadge status={r.status} />
              <span className="font-mono text-[10px] text-ink-faint shrink-0">{r.words > 0 ? `${r.words}字` : ''}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
