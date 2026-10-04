'use client';
// 脚本编辑器：左中右布局（编辑器主区 + 右侧边栏），分账号渲染；保存/版本/改写/生成全链路
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { PixelLoader } from '@/components/Pixel';
import YzEditor from '@/components/scripts/YzEditor';
import LqEditor from '@/components/scripts/LqEditor';
import EditorSidebar from '@/components/scripts/EditorSidebar';
import {
  AccountBadge,
  StatusBadge,
  parseLqDraft,
  parseYzDraft,
  type LqDraft,
  type ScriptDetailClient,
  type VersionRow,
  type YzDraft,
} from '@/components/scripts/shared';

type Draft = YzDraft | LqDraft;

export default function ScriptEditorPage({ params }: { params: { id: string } }) {
  const scriptId = Number(params.id);
  const [detail, setDetail] = useState<ScriptDetailClient | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [viewing, setViewing] = useState<VersionRow | null>(null);
  const [toast, setToast] = useState('');
  const [loaded, setLoaded] = useState(false);
  const searchParams = useSearchParams();
  const initToast = useRef(searchParams.get('toast') || '');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [dRes, vRes] = await Promise.all([
        fetch(`/api/scripts/${scriptId}`, { cache: 'no-store' }),
        fetch(`/api/scripts/${scriptId}/versions`, { cache: 'no-store' }),
      ]);
      if (dRes.status === 401) {
        window.location.href = '/login';
        return false;
      }
      if (dRes.status === 404) {
        setError('脚本不存在，可能已被删除');
        return false;
      }
      if (!dRes.ok || !vRes.ok) throw new Error('加载失败');
      const d = (await dRes.json()) as { script: ScriptDetailClient };
      const v = (await vRes.json()) as { versions: VersionRow[] };
      setDetail(d.script);
      setVersions(v.versions);
      return true;
    } catch {
      setError('脚本加载失败，请刷新重试');
      return false;
    }
  }, [scriptId]);

  // 初始加载：装入最新内容
  useEffect(() => {
    (async () => {
      const ok = await loadAll();
      setLoaded(ok);
    })();
  }, [loadAll]);

  useEffect(() => {
    if (loaded && detail && draft === null) {
      setDraft(detail.account === 'yizhanshi' ? parseYzDraft(detail.content) : parseLqDraft(detail.content));
      if (initToast.current) {
        showToast(initToast.current);
        initToast.current = '';
      }
    }
  }, [loaded, detail, draft, showToast]);

  // 未保存改动：离开提示
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const modify = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
    setViewing(null);
  }, []);

  async function save(): Promise<boolean> {
    if (!draft || saving) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/scripts/${scriptId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.stringify(draft), kind: 'manual' }),
      });
      if (!res.ok) throw new Error();
      await loadAll();
      setDirty(false);
      setViewing(null);
      showToast('已保存为新版本');
      return true;
    } catch {
      showToast('保存失败，请重试');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (genLoading) return;
    if (dirty && !confirm('有未保存的改动，重新生成会以最新保存版本为基础生成新版本。继续？')) return;
    setGenLoading(true);
    try {
      const res = await fetch(`/api/scripts/${scriptId}/generate-draft`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || 'AI 服务开小差了，请重试');
      await loadAll();
      const script = (d as { draft: Record<string, unknown> }).draft;
      setDetail((cur) => (cur ? { ...cur, content: JSON.stringify(script) } : cur));
      setDraft(
        detail?.account === 'yizhanshi' ? parseYzDraft(JSON.stringify(script)) : parseLqDraft(JSON.stringify(script)),
      );
      setDirty(false);
      setViewing(null);
      showToast('初稿已生成，为新版本');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'AI 服务开小差了，请重试');
    } finally {
      setGenLoading(false);
    }
  }

  function viewVersion(v: VersionRow) {
    if (detail?.account === 'yizhanshi') setDraft(parseYzDraft(v.content));
    else setDraft(parseLqDraft(v.content));
    setViewing(v);
    setDirty(false);
    window.scrollTo({ top: 0 });
  }

  async function restoreVersion(v: VersionRow) {
    const res = await fetch(`/api/scripts/${scriptId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: v.content, kind: 'manual' }),
    });
    if (!res.ok) {
      showToast('恢复失败，请重试');
      return;
    }
    await loadAll();
    setViewing(null);
    setDirty(false);
    showToast(`已恢复 v${v.version_no} 的内容（另存为新版本）`);
  }

  async function backToLatest() {
    if (!detail) return;
    setDraft(detail.account === 'yizhanshi' ? parseYzDraft(detail.content) : parseLqDraft(detail.content));
    setViewing(null);
    setDirty(false);
  }

  /** 边栏统一 PATCH 入口：乐观失败重取 */
  async function patchScript(payload: Record<string, unknown>, successMsg: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/scripts/${scriptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || '更新失败');
      await loadAll();
      showToast(successMsg);
      return true;
    } catch (e) {
      showToast(e instanceof Error ? e.message : '更新失败，请重试');
      return false;
    }
  }

  /** 标题编辑：失焦/回车提交 */
  async function commitTitle(next: string) {
    if (!detail || next.trim() === detail.title || !next.trim()) return;
    await patchScript({ title: next.trim() }, '标题已更新');
  }

  return (
    <AppShell>
      <main className="min-h-screen pb-24 md:pb-10 bg-[#F3F4F6]">
        <div className="px-6 max-md:px-4 py-6 max-w-[1280px] mx-auto flex flex-col gap-4">
          {/* 顶栏 */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/scripts" className="text-xs text-ink-faint hover:text-kimi-600 transition-colors shrink-0">
              ← 返回
            </Link>
            {detail ? (
              <>
                <input
                  key={detail.title}
                  defaultValue={detail.title}
                  onBlur={(e) => void commitTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="text-lg md:text-xl font-bold tracking-tight bg-transparent border border-transparent rounded-lg px-2 py-1 hover:border-line focus:border-kimi-500 focus:bg-white outline-none flex-1 min-w-40"
                />
                <AccountBadge account={detail.account} />
                <StatusBadge status={detail.status} />
                {detail.is_sample === 1 && (
                  <span className="text-[10px] rounded-full px-2 py-0.5 font-medium bg-[#FFF6E5] text-[#B07815]">★ 样稿</span>
                )}
              </>
            ) : (
              <h1 className="text-lg font-bold text-ink-faint">加载中…</h1>
            )}
          </div>

          {/* 历史查看提示条 */}
          {viewing && (
            <div className="flex items-center gap-3 text-xs rounded-lg border border-kimi-200 bg-kimi-50 px-3 py-2">
              <span>
                正在查看历史版本 <b className="font-mono">v{viewing.version_no}</b>（{viewing.kind === 'ai_draft' ? 'AI 生成' : '手动保存'} ·{' '}
                {viewing.created_at.slice(0, 16)}）
              </span>
              <button onClick={backToLatest} className="ml-auto text-kimi-600 hover:underline shrink-0">
                返回最新
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {!detail && !error && (
            <p className="text-sm text-ink-faint py-16 text-center font-mono">LOADING…</p>
          )}

          {detail && draft && (
            <div className="flex flex-col lg:flex-row gap-5 items-start">
              {/* 主编辑区 */}
              <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
                {detail.account === 'yizhanshi' ? (
                  <YzEditor scriptId={scriptId} draft={draft as YzDraft} onChange={(d) => modify(() => d)} />
                ) : (
                  <LqEditor scriptId={scriptId} draft={draft as LqDraft} onChange={(d) => modify(() => d)} />
                )}

                {/* 底部操作条 */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => void save()}
                    disabled={saving || !dirty}
                    className={`text-sm rounded-lg px-5 py-2.5 font-medium transition-colors ${
                      dirty
                        ? 'bg-kimi-500 text-white hover:bg-kimi-600 shadow-btn'
                        : 'bg-[#F0F1F3] text-ink-faint cursor-default'
                    }`}
                  >
                    {saving ? '保存中…' : dirty ? '保存' : '已保存'}
                  </button>
                  <button
                    onClick={() => void generate()}
                    disabled={genLoading}
                    className="text-sm rounded-lg px-4 py-2.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {genLoading && <PixelLoader />}
                    {genLoading ? 'AI 生成中（最长约 1~2 分钟）…' : '✦ 重新生成初稿'}
                  </button>
                  {dirty && <span className="text-xs text-[#B07815]">有未保存的改动</span>}
                </div>
              </div>

              {/* 右侧边栏 */}
              <EditorSidebar
                detail={detail}
                versions={versions}
                viewing={viewing}
                onViewVersion={viewVersion}
                onRestoreVersion={(v) => void restoreVersion(v)}
                onBackToLatest={backToLatest}
                patchScript={patchScript}
                onRefresh={loadAll}
                toast={showToast}
              />
            </div>
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
