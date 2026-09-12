'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelLoader } from './Pixel';

interface Status {
  ok: boolean;
  balance: number | null;
  currency: string;
  low: boolean;
  checked_at: string;
  error?: string;
}

type DotState = 'loading' | 'ok' | 'low' | 'error';

/**
 * DeepSeek 余额状态灯：平时只是一个淡淡的小圆点（悬停可见金额），
 * 余额低/查询失败时变橙/红提醒。点击弹迷你浮层看精确金额并手动刷新。
 */
export default function LlmStatusDot() {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (force = false) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/llm-status${force ? '?force=1' : ''}`, { cache: 'no-store' });
      if (res.ok) setStatus((await res.json()) as Status);
      else setStatus({ ok: false, balance: null, currency: 'CNY', low: false, checked_at: '', error: '查询失败' });
    } catch {
      setStatus({ ok: false, balance: null, currency: 'CNY', low: false, checked_at: '', error: '网络错误' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 点击外部关闭浮层
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const dot: DotState = !status ? 'loading' : !status.ok ? 'error' : status.low ? 'low' : 'ok';
  const dotCls =
    dot === 'ok'
      ? 'bg-kimi-300'
      : dot === 'low'
        ? 'bg-bean-orange'
        : dot === 'error'
          ? 'bg-red-400'
          : 'bg-ink-faint/40';
  const title = !status
    ? 'AI 余额检查中…'
    : status.ok
      ? `DeepSeek 余额 ¥${status.balance?.toFixed(2)} · 检查于 ${status.checked_at}`
      : `DeepSeek 余额查询失败：${status.error ?? '未知错误'}`;

  return (
    <div ref={wrapRef} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label="DeepSeek 余额状态"
        className="p-1.5 -m-1 rounded-full hover:bg-kimi-50 transition-colors"
      >
        <span className={`block w-2 h-2 rounded-full ${dotCls} ${refreshing ? 'animate-pulse' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-60 panel shadow-pop pop-enter p-3">
          <p className="text-[10px] font-mono text-ink-faint tracking-wider pb-2 border-b border-line">
            DEEPSEEK · AI 余额
          </p>
          <div className="pt-2 flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink-soft">余额</span>
              {refreshing ? (
                <PixelLoader />
              ) : status?.ok ? (
                <strong className={`font-mono ${status.low ? 'text-bean-orange' : 'text-ink'}`}>
                  ¥{status.balance?.toFixed(2)}
                </strong>
              ) : (
                <span className="text-red-400">查询失败</span>
              )}
            </div>
            {status && !status.ok && (
              <p className="text-[11px] text-red-400 leading-snug">{status.error ?? '未知错误'}</p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-ink-soft">检查时间</span>
              <span className="font-mono text-ink-faint">{status?.checked_at || '—'}</span>
            </div>
            {status?.ok && status.low && (
              <p className="text-[11px] text-bean-orange leading-snug">余额偏低，AI 功能可能随时不可用，请及时充值。</p>
            )}
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="mt-1 text-xs border border-line rounded-lg py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors disabled:opacity-40"
            >
              {refreshing ? '检查中…' : '重新检查'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
