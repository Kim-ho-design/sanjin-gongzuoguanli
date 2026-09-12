'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { PixelLoader } from './Pixel';
import { weekdayCn } from '@/lib/utils';
import type { Note } from '@/lib/notes';

function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayStr(): string {
  return `${monthStr(new Date())}-${String(new Date().getDate()).padStart(2, '0')}`;
}

/** 月份加减：'2026-01' - 1 → '2025-12' */
export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5));
  const d = new Date(y, m - 1 + delta, 1);
  return monthStr(d);
}

/** 随手记浮窗：记（日期+一句话）、看列表、AI 总结本月 */
export default function NotesPanel({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [month, setMonth] = useState(monthStr(new Date()));
  const [notes, setNotes] = useState<Note[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayStr());
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'list' | 'summary'>('list');
  const [summary, setSummary] = useState('');
  const [summaryFallback, setSummaryFallback] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (m: string) => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/notes?month=${m}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { notes: Note[] };
      setNotes(d.notes);
    } catch {
      onToast('随手记加载失败，请重试');
    } finally {
      setListLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    load(month);
  }, [month, load]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function add() {
    const content = text.trim();
    if (!content || adding) return;
    setAdding(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, note_date: date }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; note?: Note };
      if (!res.ok || !d.note) throw new Error(d.error || '保存失败');
      setText('');
      // 记到别的月份时切过去，保证用户立刻看到自己刚记的内容
      const noteMonth = d.note.note_date.slice(0, 7);
      if (noteMonth !== month) setMonth(noteMonth);
      else setNotes((ns) => [d.note as Note, ...ns]);
      onToast('已记下');
    } catch (e) {
      onToast(e instanceof Error ? `记下失败：${e.message}` : '记下失败，请重试');
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: number) {
    const prev = notes;
    setNotes((ns) => ns.filter((n) => n.id !== id));
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setNotes(prev);
      onToast('删除失败，请重试');
    }
  }

  async function summarize() {
    setSummaryLoading(true);
    setSummary('');
    setView('summary');
    try {
      const res = await fetch(`/api/notes/summary?month=${month}`, { cache: 'no-store' });
      const d = (await res.json()) as { error?: string; markdown?: string; fallback?: boolean };
      if (!res.ok || !d.markdown) throw new Error(d.error || '生成失败');
      setSummary(d.markdown);
      setSummaryFallback(d.fallback === true);
    } catch (e) {
      setView('list');
      onToast(e instanceof Error ? `AI 总结失败：${e.message}` : 'AI 总结失败，请重试');
    } finally {
      setSummaryLoading(false);
    }
  }

  async function copy() {
    try {
      if (window.isSecureContext && navigator.clipboard) {
        await navigator.clipboard.writeText(summary);
      } else {
        const ta = document.createElement('textarea');
        ta.value = summary;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('复制失败，请手动全选文本复制');
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" onClick={onClose}>
      {/* 浮窗：移动端贴底、桌面居中 */}
      <div className="absolute inset-0 flex items-end md:items-center justify-center p-3 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-[#FAF9F6] border border-line rounded-t-3xl md:rounded-3xl shadow-pop pop-enter flex flex-col max-h-[86dvh] md:max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 移动端抓手 */}
          <div className="md:hidden w-10 h-1 rounded-full bg-line mx-auto mt-2.5 mb-1" />

          {/* 标题行 */}
          <div className="flex items-center gap-2 px-4 md:px-5 pt-3 md:pt-4 pb-3">
            <h2 className="text-base font-bold tracking-tight">随手记</h2>
            <span className="text-[10px] font-mono text-ink-faint tracking-wider">WORK NOTES</span>
            {view === 'list' && (
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                  className="w-6 h-6 rounded-md text-ink-faint hover:text-kimi-600 hover:bg-kimi-50 text-sm leading-none"
                  title="上个月"
                >
                  ‹
                </button>
                <span className="text-xs font-mono text-ink-soft w-[4.5em] text-center">{month}</span>
                <button
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                  className="w-6 h-6 rounded-md text-ink-faint hover:text-kimi-600 hover:bg-kimi-50 text-sm leading-none"
                  title="下个月"
                >
                  ›
                </button>
              </div>
            )}
            {view === 'summary' && (
              <button
                onClick={() => setView('list')}
                className="ml-auto text-xs text-ink-soft hover:text-kimi-600 border border-line rounded-full px-3 py-1 transition-colors"
              >
                ← 返回列表
              </button>
            )}
            <button onClick={onClose} className="text-ink-faint hover:text-ink text-lg leading-none px-1" title="关闭">
              ×
            </button>
          </div>

          {view === 'list' ? (
            <>
              {/* 列表区 */}
              <div className="flex-1 overflow-y-auto px-4 md:px-5 pb-3 min-h-[30vh]">
                {listLoading ? (
                  <p className="text-xs text-ink-faint text-center py-10 font-mono tracking-widest">LOADING…</p>
                ) : notes.length === 0 ? (
                  <p className="text-xs text-ink-faint text-center py-10 font-mono tracking-widest">
                    EMPTY · 这个月还什么都没记
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        className="group flex items-center gap-2.5 bg-white border border-line rounded-xl px-3 py-2.5 hover:border-kimi-300 transition-colors"
                      >
                        <span className="shrink-0 text-[10px] font-mono text-kimi-600 bg-kimi-50 border border-kimi-100 rounded-md px-1.5 py-0.5">
                          {n.note_date.slice(5)} {weekdayCn(n.note_date)}
                        </span>
                        <span className="text-[13px] leading-snug text-ink min-w-0">{n.content}</span>
                        <button
                          onClick={() => remove(n.id)}
                          title="删除"
                          className="ml-auto shrink-0 w-5 h-5 rounded text-ink-faint hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 底部操作区：输入 + AI 总结 */}
              <div className="border-t border-line bg-white/70 px-4 md:px-5 py-3 flex flex-col gap-2.5">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={date}
                    max="9999-12-31"
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    className="input-dark text-xs px-2 py-2 font-mono w-[8.5em] shrink-0"
                    title="记录日期"
                  />
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') add();
                      if (e.key === 'Escape') onClose();
                    }}
                    placeholder="今天遇到什么问题了？一句话记下"
                    maxLength={500}
                    className="input-dark flex-1 text-[13px] px-3 py-2 min-w-0"
                  />
                  <button
                    onClick={add}
                    disabled={!text.trim() || adding}
                    className="shrink-0 text-[13px] bg-kimi-500 hover:bg-kimi-600 text-white rounded-lg px-4 font-medium transition-colors disabled:opacity-40 shadow-btn"
                  >
                    {adding ? '…' : '记下'}
                  </button>
                </div>
                <button
                  onClick={summarize}
                  disabled={summaryLoading}
                  className="w-full text-xs border border-kimi-200 text-kimi-600 hover:bg-kimi-50 rounded-lg py-2 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {summaryLoading && <PixelLoader />}
                  {summaryLoading ? 'AI 总结中，通常几秒钟…' : `✦ AI 总结 ${month} 月`}
                </button>
              </div>
            </>
          ) : (
            /* AI 总结视图 */
            <div className="flex-1 overflow-y-auto px-4 md:px-5 pb-4 min-h-[30vh]">
              {summaryLoading ? (
                <div className="flex flex-col items-center gap-3 py-14">
                  <PixelLoader />
                  <p className="text-xs text-ink-faint font-mono tracking-widest">AI 正在归纳本月记录…</p>
                </div>
              ) : (
                <>
                  {summaryFallback && (
                    <p className="text-xs text-bean-orange border border-bean-orange/40 rounded-lg px-3 py-2 mb-3">
                      ⚠ AI 总结失败，以下为模板兜底版（仅按周平铺，未归纳）。请检查 DeepSeek 配置后重新生成。
                    </p>
                  )}
                  <div className="flex gap-2 mb-3 justify-end">
                    <button
                      onClick={copy}
                      className="text-xs border border-line rounded-lg px-3 py-1.5 hover:border-kimi-400 transition-colors"
                    >
                      {copied ? '✓ 已复制' : '复制'}
                    </button>
                  </div>
                  <div className="text-[14px] leading-relaxed text-ink report-md">
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
