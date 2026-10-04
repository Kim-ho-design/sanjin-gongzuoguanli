'use client';
// 新建脚本：选账号 → 选题方向/思路/参考链接 → 创建（+ 抓链接 + 生成初稿）→ 跳编辑器
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { PixelLoader } from '@/components/Pixel';
import { ACCOUNT_META } from '@/components/scripts/shared';

type Account = 'yizhanshi' | 'laiqiao';

type Step = '' | 'create' | 'refs' | 'draft';

const STEP_TEXT: Record<Exclude<Step, ''>, string> = {
  create: '创建脚本中…',
  refs: '抓取参考资料中…',
  draft: 'AI 生成初稿中（最长约 1~2 分钟，请勿关闭页面）…',
};

export default function NewScriptPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [direction, setDirection] = useState('');
  const [notes, setNotes] = useState('');
  const [urls, setUrls] = useState<string[]>(['']);
  const [step, setStep] = useState<Step>('');
  const [error, setError] = useState('');

  const validUrls = urls.map((u) => u.trim()).filter(Boolean);
  const busy = step !== '';
  const canSubmit = account !== null && direction.trim().length > 0 && !busy;

  async function createScript(): Promise<number | null> {
    setStep('create');
    setError('');
    const res = await fetch('/api/scripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account,
        title: direction.trim(), // 占位标题 = 选题方向；AI 出封面标题后自动接管
        direction: direction.trim(),
        notes: notes.trim() || undefined,
      }),
    });
    if (res.status === 401) {
      window.location.href = '/login';
      return null;
    }
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStep('');
      setError((d as { error?: string }).error || '创建失败，请重试');
      return null;
    }
    return (d as { script: { id: number } }).script.id;
  }

  /** 登记参考链接并抓取；返回跳转时要带的提示（抓取失败不阻断） */
  async function submitRefs(scriptId: number): Promise<string> {
    if (validUrls.length === 0) return '';
    setStep('refs');
    const res = await fetch(`/api/scripts/${scriptId}/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: validUrls }),
    });
    if (!res.ok) return '';
    const d = (await res.json().catch(() => ({}))) as { refs?: { fetch_status: string }[] };
    const failed = (d.refs ?? []).filter((r) => r.fetch_status === 'failed').length;
    return failed > 0 ? `部分链接（${failed} 条）抓取失败，已跳过，可在编辑器里手动粘贴资料` : '';
  }

  async function handleGenerate() {
    if (!canSubmit) return;
    const id = await createScript();
    if (id === null) return;
    const refNotice = await submitRefs(id);

    setStep('draft');
    const res = await fetch(`/api/scripts/${id}/generate-draft`, { method: 'POST' });
    if (res.status === 502) {
      const d = await res.json().catch(() => ({}));
      const msg = (d as { error?: string }).error || 'AI 生成失败';
      // 创建保留，跳到编辑器，编辑器里可重新点生成
      window.location.href = `/scripts/${id}?toast=${encodeURIComponent(`${msg}，脚本已保留，可在编辑器重新生成`)}`;
      return;
    }
    if (!res.ok) {
      setStep('');
      setError('AI 生成失败，请重试，或先「仅创建」稍后在编辑器生成');
      return;
    }
    const msgs = [refNotice].filter(Boolean).join('；');
    window.location.href = `/scripts/${id}${msgs ? `?toast=${encodeURIComponent(msgs)}` : ''}`;
  }

  async function handleCreateOnly() {
    if (!canSubmit) return;
    const id = await createScript();
    if (id === null) return;
    const refNotice = await submitRefs(id);
    window.location.href = `/scripts/${id}${refNotice ? `?toast=${encodeURIComponent(refNotice)}` : ''}`;
  }

  return (
    <AppShell>
      <main className="min-h-screen pb-24 md:pb-10 bg-[#F3F4F6]">
        <div className="px-6 max-md:px-4 py-6 max-w-[760px] mx-auto flex flex-col gap-5">
          <div>
            <Link href="/scripts" className="text-xs text-ink-faint hover:text-kimi-600 transition-colors">
              ← 返回脚本列表
            </Link>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight mt-2">新建脚本</h1>
          </div>

          {/* 账号选择 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">
              发布账号 <span className="text-red-500">*</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(ACCOUNT_META) as Account[]).map((key) => {
                const meta = ACCOUNT_META[key];
                const active = account === key;
                return (
                  <button
                    key={key}
                    onClick={() => setAccount(key)}
                    className={`line-card p-4 text-left flex flex-col gap-1 transition-colors ${
                      active ? '!border-kimi-500 bg-kimi-50/50' : ''
                    }`}
                  >
                    <span className={`text-sm font-bold ${active ? 'text-kimi-600' : ''}`}>
                      {meta.label}
                      {active && <span className="ml-1.5 text-xs">✓</span>}
                    </span>
                    <span className="text-xs text-ink-faint">{meta.shortDesc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 表单 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">
              选题方向 <span className="text-red-500">*</span>
            </h2>
            <textarea
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              rows={3}
              placeholder="这条视频讲什么？例如：印染材料有害物质检测，实验室怎么配才不漏检？"
              className="input-dark text-sm px-3 py-2.5 resize-y"
            />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">思路（选填）</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="补充切入点、参考资料要点、想要的结构或语气，AI 会参考"
              className="input-dark text-sm px-3 py-2.5 resize-y"
            />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">参考链接（选填，可多个）</h2>
            <p className="text-xs text-ink-faint">服务器自动抓取正文（百家号/公众号/仪器信息网等），失败可稍后在编辑器手动粘贴。</p>
            <div className="flex flex-col gap-2">
              {urls.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={u}
                    onChange={(e) => setUrls((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="https://…"
                    className="input-dark text-sm px-3 py-2 flex-1"
                  />
                  {urls.length > 1 && (
                    <button
                      onClick={() => setUrls((list) => list.filter((_, j) => j !== i))}
                      className="text-xs text-ink-faint hover:text-red-500 transition-colors px-1"
                      title="移除"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setUrls((list) => [...list, ''])}
                className="text-xs border border-dashed border-line rounded-lg px-3 py-2 text-ink-faint hover:border-kimi-400 hover:text-kimi-600 transition-colors w-fit"
              >
                ＋ 添加链接
              </button>
            </div>
          </section>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* 提交区 */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleGenerate}
              disabled={!canSubmit}
              className="text-sm rounded-lg px-5 py-2.5 bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {busy && step === 'draft' ? 'AI 生成中…' : '创建并生成初稿'}
            </button>
            <button
              onClick={handleCreateOnly}
              disabled={!canSubmit}
              className="text-sm rounded-lg px-4 py-2.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              仅创建，稍后生成
            </button>
          </div>

          {/* 分步进度 */}
          {busy && (
            <div className="panel px-4 py-3 flex items-center gap-3 text-sm text-ink-soft">
              <PixelLoader />
              <span>{STEP_TEXT[step as 'create' | 'refs' | 'draft']}</span>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
