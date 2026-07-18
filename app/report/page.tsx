'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PixelLogo, PixelLoader } from '@/components/Pixel';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReportPage() {
  const [date, setDate] = useState(todayStr());
  const [type, setType] = useState<'brief' | 'full'>('brief');
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      const res = await fetch(`/api/report?date=${date}&type=${type}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');
      setMarkdown(data.markdown);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `周报-${type === 'brief' ? '简版' : '详版'}-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-line bg-white/70 backdrop-blur">
        <PixelLogo size={26} />
        <h1 className="font-bold tracking-wide">周报生成</h1>
        <Link
          href="/"
          className="ml-auto text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors"
        >
          ← 看板
        </Link>
      </header>

      <div className="px-5 py-4 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <div className="line-card p-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-ink-soft flex items-center gap-1.5">
            周（任选一天）
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs border border-line rounded-lg px-2 py-1.5 outline-none focus:border-kimi-500 font-mono"
            />
          </label>
          <div className="flex gap-1.5">
            {(
              [
                ['brief', '简版 · 向上汇报'],
                ['full', '详版 · 自留复盘'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setType(v)}
                className={`text-xs border rounded-full px-3 py-1.5 transition-colors ${
                  type === v ? 'bg-kimi-500 text-white border-kimi-500' : 'border-line hover:border-kimi-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="ml-auto text-sm bg-kimi-500 hover:bg-kimi-600 text-white rounded-lg px-5 py-2 font-medium transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {loading && <PixelLoader />}
            生成
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {markdown && (
          <div className="line-card p-5">
            <div className="flex gap-2 mb-3 justify-end">
              <button
                onClick={copy}
                className="text-xs border border-line rounded-lg px-3 py-1.5 hover:border-kimi-400 transition-colors"
              >
                {copied ? '✓ 已复制' : '复制'}
              </button>
              <button
                onClick={download}
                className="text-xs border border-line rounded-lg px-3 py-1.5 hover:border-kimi-400 transition-colors"
              >
                下载 .md
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed font-mono text-ink">
              {markdown}
            </pre>
          </div>
        )}

        {!markdown && !loading && (
          <p className="text-xs text-ink-faint text-center py-16">
            选好周和口径，点「生成」。简版 ≤10 条要点，适合直接发群里汇报；详版含全部流水，自留复盘。
          </p>
        )}
      </div>
    </main>
  );
}
