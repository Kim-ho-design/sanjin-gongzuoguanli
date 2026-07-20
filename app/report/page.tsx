'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AvatarLogo, PixelLoader } from '@/components/Pixel';

function toStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toStr(d);
}

const PRESETS = [
  { label: '近 7 天', days: 6 },
  { label: '近 14 天', days: 13 },
  { label: '近 1 个月', days: 29 },
] as const;

export default function ReportPage() {
  const [start, setStart] = useState(daysAgo(6));
  const [end, setEnd] = useState(toStr(new Date()));
  const [preset, setPreset] = useState<number | 'custom'>(6);
  const [type, setType] = useState<'brief' | 'full'>('brief');
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  function applyPreset(days: number) {
    setPreset(days);
    setStart(daysAgo(days));
    setEnd(toStr(new Date()));
  }

  async function generate() {
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      const res = await fetch(`/api/report?start=${start}&end=${end}&type=${type}`);
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
    a.download = `周报-${type === 'brief' ? '简版' : '详版'}-${start}_${end}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen ascii-bg flex flex-col">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-line bg-panel/80 backdrop-blur">
        <AvatarLogo size={30} />
        <h1 className="font-bold tracking-wide">周报生成</h1>
        <span className="text-[10px] font-mono text-ink-faint tracking-[0.25em] hidden sm:inline">REPORT</span>
        <Link
          href="/"
          className="ml-auto text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors"
        >
          ← 看板
        </Link>
      </header>

      <div className="px-5 py-4 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <div className="panel p-4 flex flex-col gap-3">
          {/* 时间区间 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-soft mr-1">区间</span>
            {PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => applyPreset(p.days)}
                className={`text-xs border rounded-full px-3 py-1.5 transition-colors ${
                  preset === p.days ? 'bg-kimi-500 text-white border-kimi-500' : 'border-line hover:border-kimi-400'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setPreset('custom')}
              className={`text-xs border rounded-full px-3 py-1.5 transition-colors ${
                preset === 'custom' ? 'bg-kimi-500 text-white border-kimi-500' : 'border-line hover:border-kimi-400'
              }`}
            >
              自定义
            </button>
          </div>

          {/* 自定义区间 / 当前区间显示 */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <input
              type="date"
              value={start}
              onChange={(e) => { setStart(e.target.value); setPreset('custom'); }}
              className="input-dark px-2 py-1.5 font-mono"
            />
            <span className="text-ink-faint">→</span>
            <input
              type="date"
              value={end}
              onChange={(e) => { setEnd(e.target.value); setPreset('custom'); }}
              className="input-dark px-2 py-1.5 font-mono"
            />
            <div className="flex gap-1.5 ml-auto">
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
              disabled={loading || start > end}
              className="text-sm bg-kimi-500 hover:bg-kimi-600 text-white rounded-lg px-5 py-2 font-medium transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {loading && <PixelLoader />}
              {loading ? 'AI 生成中…' : '生成'}
            </button>
          </div>
          {loading && (
            <p className="text-[11px] text-ink-faint font-mono">正在汇总数据并调用 AI 撰写周报，通常需要几秒钟…</p>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {markdown && (
          <div className="panel p-5">
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
          <p className="text-xs text-ink-faint text-center py-16 font-mono">
            选好区间和口径，点「生成」。简版 ≤10 条要点，适合直接发群里汇报；详版含全部流水，自留复盘。
          </p>
        )}
      </div>
    </main>
  );
}
