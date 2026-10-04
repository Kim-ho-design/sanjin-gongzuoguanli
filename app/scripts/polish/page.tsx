'use client';
// 润色脚本：粘贴脚本文案 → AI 润色成短视频大白话 → 复制 / 存为新脚本进编辑器
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { PixelLoader } from '@/components/Pixel';
import { ACCOUNT_META } from '@/components/scripts/shared';

type Account = 'yizhanshi' | 'laiqiao';

export default function PolishPage() {
  const [account, setAccount] = useState<Account>('yizhanshi');
  const [text, setText] = useState('');
  const [polished, setPolished] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  async function doPolish() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError('');
    setPolished('');
    try {
      const res = await fetch('/api/scripts/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, text: text.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || 'AI 服务开小差了，请重试');
      setPolished((d as { polished: string }).polished);
    } catch (e) {
      setError(e instanceof Error ? e.message : '润色失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(polished);
      showToast('已复制');
    } catch {
      showToast('复制失败，请手动选择复制');
    }
  }

  /** 存为新脚本：建脚本（占位标题 = 首行前 20 字）+ 存版本（按账号结构）→ 跳编辑器 */
  async function saveAsScript() {
    if (!polished.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const firstLine = polished.trim().split('\n')[0].slice(0, 20);
      const title = `= ${firstLine}`;
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, title, direction: `润色稿：${firstLine}` }),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || '创建失败');
      const id = (d as { script: { id: number } }).script.id;
      const content =
        account === 'yizhanshi'
          ? {
              cover_title: '',
              positioning: '',
              framework: '',
              audience: '',
              keywords: [],
              body: polished,
              progress_nodes: [],
              end_card: '',
            }
          : {
              cover_title: '',
              post_title: '',
              rows: [{ node_label: '', voiceover: polished, subtitle: '', note: '' }],
            };
      const vRes = await fetch(`/api/scripts/${id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.stringify(content), kind: 'manual' }),
      });
      if (!vRes.ok) throw new Error('保存版本失败');
      window.location.href = `/scripts/${id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试');
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <main className="min-h-screen pb-24 md:pb-10 bg-[#F3F4F6]">
        <div className="px-6 max-md:px-4 py-6 max-w-[900px] mx-auto flex flex-col gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">润色脚本</h1>
            <p className="text-xs text-ink-faint mt-1">
              把现有脚本文案交给 AI 润色成短视频大白话：去书面腔播音腔、长句拆短句，信息点一个不少。
            </p>
          </div>

          {/* 账号选择 */}
          <div className="flex gap-1.5">
            {(Object.keys(ACCOUNT_META) as Account[]).map((key) => (
              <button
                key={key}
                onClick={() => setAccount(key)}
                className={`text-xs border rounded-lg px-4 py-2 transition-colors ${
                  account === key
                    ? 'bg-white border-line shadow-card font-medium'
                    : 'border-transparent text-ink-soft hover:bg-white/70'
                }`}
              >
                {ACCOUNT_META[key].label}
              </button>
            ))}
          </div>

          {/* 原文 */}
          <section className="bpanel p-5 flex flex-col gap-3">
            <h2 className="text-sm font-bold">原文</h2>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              maxLength={8000}
              placeholder={'把脚本文案粘贴到这里（≤8000 字）。\n一站式：口播正文；徕乔：同期声台词。'}
              className="input-dark text-sm px-3 py-2.5 resize-y leading-relaxed"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => void doPolish()}
                disabled={loading || !text.trim()}
                className="text-sm rounded-lg px-5 py-2.5 bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <PixelLoader />}
                {loading ? '润色中…' : '✦ 润色'}
              </button>
              <span className="text-[11px] text-ink-faint font-mono">{text.length}/8000</span>
            </div>
          </section>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* 结果 */}
          {polished && (
            <section className="bpanel p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold">润色结果</h2>
                <span className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => void copyResult()}
                    className="text-xs rounded-lg px-3 py-1.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors"
                  >
                    ⧉ 复制
                  </button>
                  <button
                    onClick={() => void saveAsScript()}
                    disabled={saving}
                    className="text-xs rounded-lg px-3 py-1.5 bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn font-medium disabled:opacity-50"
                  >
                    {saving ? '保存中…' : '存为新脚本'}
                  </button>
                </span>
              </div>
              <pre className="text-sm leading-relaxed bg-[#FCFCFB] border border-line rounded-card px-4 py-3 whitespace-pre-wrap font-sans">
                {polished}
              </pre>
              <p className="text-[11px] text-ink-faint">
                「存为新脚本」会按{ACCOUNT_META[account].label}格式建脚本并存为第一版，可进编辑器继续加工。
              </p>
            </section>
          )}

          <p className="text-[11px] text-ink-faint">
            也可以直接打开 <Link href="/scripts/new" className="text-kimi-600 hover:underline">新建脚本</Link> 让 AI 从零生成初稿。
          </p>
        </div>

        {toast && (
          <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-kimi-50 border border-kimi-200 text-ink text-xs rounded-lg px-4 py-2.5 shadow-lg z-50">
            {toast}
          </div>
        )}
      </main>
    </AppShell>
  );
}
