'use client';
// 编辑器右侧边栏：状态与排期 / 版本历史 / 配套产出 / 参考资料
import { useState } from 'react';
import {
  EXTRA_TYPE_META,
  STATUS_OPTIONS,
  type ExtraRow,
  type ScriptDetailClient,
  type VersionRow,
} from './shared';

interface Props {
  detail: ScriptDetailClient;
  versions: VersionRow[];
  viewing: VersionRow | null;
  onViewVersion: (v: VersionRow) => void;
  onRestoreVersion: (v: VersionRow) => void;
  onBackToLatest: () => void;
  patchScript: (payload: Record<string, unknown>, successMsg: string) => Promise<boolean>;
  onRefresh: () => Promise<unknown>;
  toast: (msg: string) => void;
}

function timeOf(s: string) {
  return s.slice(5, 16).replace(' ', ' ');
}

export default function EditorSidebar(props: Props) {
  const { detail, versions, viewing, patchScript, onRefresh, toast } = props;
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [extraLoading, setExtraLoading] = useState<Partial<Record<ExtraRow['type'], boolean>>>({});
  const [expandedExtra, setExpandedExtra] = useState<Partial<Record<ExtraRow['type'], boolean>>>({});
  const [newUrl, setNewUrl] = useState('');
  const [addingRef, setAddingRef] = useState(false);
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');

  // 状态切换：定稿/已发布且未收样稿 → 先弹确认
  function handleStatusChange(status: string) {
    if ((status === '定稿' || status === '已发布') && detail.is_sample === 0) {
      setPendingStatus(status);
      return;
    }
    void applyStatus(status, false);
  }

  async function applyStatus(status: string, asSample: boolean) {
    setPendingStatus(null);
    const msg =
      status === '已发布'
        ? asSample
          ? '已发布，看板任务已级联完成，并收为样稿'
          : '已发布，看板任务已级联完成'
        : `状态已更新为「${status}」`;
    await patchScript(asSample ? { status, is_sample: true } : { status }, msg);
  }

  async function generateExtra(type: ExtraRow['type']) {
    setExtraLoading((m) => ({ ...m, [type]: true }));
    try {
      const res = await fetch(`/api/scripts/${detail.id}/extras/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || 'AI 服务开小差了，请重试');
      toast(`${EXTRA_TYPE_META[type].label}已生成`);
      await onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'AI 服务开小差了，请重试');
    } finally {
      setExtraLoading((m) => ({ ...m, [type]: false }));
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制');
    } catch {
      toast('复制失败，请手动选择复制');
    }
  }

  async function addRef() {
    const url = newUrl.trim();
    if (!url) return;
    setAddingRef(true);
    try {
      const res = await fetch(`/api/scripts/${detail.id}/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url] }),
      });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { refs: { fetch_status: string }[] };
      if (d.refs?.some((r) => r.fetch_status === 'failed')) toast('该链接抓取失败，可手动粘贴正文');
      setNewUrl('');
      await onRefresh();
    } catch {
      toast('添加链接失败，请重试');
    } finally {
      setAddingRef(false);
    }
  }

  async function saveManualContent(url: string) {
    if (!pasteText.trim()) return;
    try {
      const res = await fetch(`/api/scripts/${detail.id}/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [{ url, manual_content: pasteText.trim() }] }),
      });
      if (!res.ok) throw new Error();
      setPasteFor(null);
      setPasteText('');
      toast('已保存参考正文');
      await onRefresh();
    } catch {
      toast('保存失败，请重试');
    }
  }

  // 参考链接按 url 去重，保留最新一条（手动直存后旧 failed 行不再显示）
  const refMap = new Map<string, ScriptDetailClient['refs'][number]>();
  for (const r of detail.refs) refMap.set(r.url, r);
  const refs = Array.from(refMap.values()).reverse();

  return (
    <aside className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
      {/* 状态与排期 */}
      <section className="panel p-4 flex flex-col gap-3">
        <h2 className="text-sm font-bold">状态与排期</h2>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-soft">状态</span>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`text-xs rounded-lg px-3 py-1.5 border transition-colors ${
                  detail.status === s
                    ? 'bg-kimi-500 text-white border-kimi-500'
                    : 'border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() =>
            void patchScript(
              { is_sample: detail.is_sample !== 1 },
              detail.is_sample ? '已取消样稿，风格规则将重新提炼' : '已收为样稿，后台正在提炼风格规则',
            )
          }
          className={`text-xs rounded-lg px-3 py-2 border transition-colors w-fit ${
            detail.is_sample
              ? 'border-[#F2DFB8] bg-[#FFF6E5] text-[#B07815]'
              : 'border-line text-ink-soft hover:border-[#F2DFB8] hover:text-[#B07815]'
          }`}
        >
          {detail.is_sample ? '★ 已收为样稿（点击取消）' : '☆ 收为样稿'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft">初稿日期</span>
            <input
              type="date"
              value={detail.draft_date ? detail.draft_date.slice(0, 10) : ''}
              onChange={(e) =>
                void patchScript({ draft_date: e.target.value || null }, '初稿日期已更新并同步看板')
              }
              className="input-dark text-xs px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft">定稿日期</span>
            <input
              type="date"
              value={detail.final_date ? detail.final_date.slice(0, 10) : ''}
              onChange={(e) =>
                void patchScript({ final_date: e.target.value || null }, '定稿日期已更新并同步看板')
              }
              className="input-dark text-xs px-2 py-1.5"
            />
          </label>
        </div>
        <p className="text-[11px] text-ink-faint">
          {detail.linked_task_id ? '✓ 已同步看板（脚本任务 + 初稿/定稿子任务）' : '未同步看板'}
        </p>
      </section>

      {/* 版本历史 */}
      <section className="panel p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">版本历史</h2>
          {viewing && (
            <button
              onClick={props.onBackToLatest}
              className="text-xs text-kimi-600 hover:underline"
            >
              返回最新
            </button>
          )}
        </div>
        {viewing && (
          <button
            onClick={() => props.onRestoreVersion(viewing)}
            className="text-xs rounded-lg px-3 py-2 bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn"
          >
            恢复为 v{viewing.version_no}（另存为新版本）
          </button>
        )}
        <div className="flex flex-col gap-1 max-h-56 overflow-auto">
          {versions.map((v) => (
            <div
              key={v.id}
              className={`flex items-center gap-2 text-xs rounded-card px-2.5 py-2 ${
                viewing?.id === v.id ? 'bg-kimi-50 border border-kimi-200' : 'border border-transparent'
              }`}
            >
              <span className="font-mono font-medium">v{v.version_no}</span>
              <span
                className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                  v.kind === 'ai_draft' ? 'bg-kimi-50 text-kimi-600' : 'bg-[#F0F1F3] text-ink-soft'
                }`}
              >
                {v.kind === 'ai_draft' ? 'AI' : '手动'}
              </span>
              <span className="text-[10px] text-ink-faint font-mono ml-auto">{timeOf(v.created_at)}</span>
              <button
                onClick={() => props.onViewVersion(v)}
                className="text-[11px] text-kimi-600 hover:underline"
              >
                查看
              </button>
            </div>
          ))}
          {versions.length === 0 && <p className="text-[11px] text-ink-faint">还没有版本，点「保存」存第一版。</p>}
        </div>
      </section>

      {/* 配套产出 */}
      <section className="panel p-4 flex flex-col gap-3">
        <h2 className="text-sm font-bold">配套产出</h2>
        {(Object.keys(EXTRA_TYPE_META) as ExtraRow['type'][]).map((type) => {
          const meta = EXTRA_TYPE_META[type];
          const latest = detail.extras.find((e) => e.type === type);
          const history = detail.extras_all.filter((e) => e.type === type).slice().reverse();
          return (
            <div key={type} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void generateExtra(type)}
                  disabled={extraLoading[type]}
                  className="text-xs rounded-lg px-3 py-1.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors disabled:opacity-50"
                >
                  {extraLoading[type] ? '生成中…' : `✦ ${meta.genLabel}`}
                </button>
                {latest && (
                  <>
                    <button
                      onClick={() => void copyText(latest.content)}
                      className="text-[11px] text-kimi-600 hover:underline"
                    >
                      复制
                    </button>
                    {history.length > 1 && (
                      <button
                        onClick={() => setExpandedExtra((m) => ({ ...m, [type]: !m[type] }))}
                        className="text-[11px] text-ink-faint hover:text-kimi-600"
                      >
                        {expandedExtra[type] ? '收起' : `历史(${history.length})`}
                      </button>
                    )}
                  </>
                )}
              </div>
              {latest && type === 'tags' && (
                <div className="flex flex-wrap gap-1 bg-[#FCFCFB] border border-line rounded-card px-2.5 py-2 max-h-28 overflow-auto">
                  {latest.content.split(/\s+/).filter(Boolean).map((t) => (
                    <span key={t} className="text-[11px] bg-kimi-50 text-kimi-700 border border-kimi-200 rounded-full px-2 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {latest && type === 'comments' && (
                <ol className="bg-[#FCFCFB] border border-line rounded-card px-2.5 py-2 max-h-40 overflow-auto flex flex-col gap-1">
                  {latest.content.split('\n').map((l) => l.trim()).filter(Boolean).map((line, i) => (
                    <li key={i} className="text-[11px] text-ink-soft flex items-start gap-1.5">
                      <span className="font-mono text-ink-faint shrink-0 w-4 text-right">{i + 1}.</span>
                      <span className="whitespace-pre-wrap">{line}</span>
                    </li>
                  ))}
                </ol>
              )}
              {latest && type === 'caption' && (
                <p className="text-[11px] text-ink-soft bg-[#FCFCFB] border border-line rounded-card px-2.5 py-2 whitespace-pre-wrap max-h-28 overflow-auto">
                  {latest.content}
                </p>
              )}
              {expandedExtra[type] && (
                <div className="flex flex-col gap-1">
                  {history.slice(1).map((h) => (
                    <div key={h.id} className="flex items-start gap-2 text-[11px] text-ink-faint">
                      <span className="font-mono shrink-0">{timeOf(h.created_at)}</span>
                      <span className="whitespace-pre-wrap line-clamp-2">{h.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 参考资料 */}
      <section className="panel p-4 flex flex-col gap-2">
        <h2 className="text-sm font-bold">参考资料</h2>
        {refs.map((r) => (
          <div key={r.id} className="flex flex-col gap-1 border border-line rounded-card px-2.5 py-2">
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 ${
                  r.fetch_status === 'ok'
                    ? 'bg-[#EAF7E8] text-[#3E7F36]'
                    : r.fetch_status === 'failed'
                      ? 'bg-[#FCEEED] text-[#A43630]'
                      : 'bg-[#F0F1F3] text-ink-soft'
                }`}
              >
                {r.fetch_status === 'ok' ? '已抓取' : r.fetch_status === 'failed' ? '抓取失败' : '抓取中'}
              </span>
              <span className="truncate text-ink-soft" title={r.url}>
                {r.title || r.url}
              </span>
            </div>
            {r.fetch_status === 'failed' && (
              <button
                onClick={() => {
                  setPasteFor(pasteFor === r.url ? null : r.url);
                  setPasteText('');
                }}
                className="text-[11px] text-kimi-600 hover:underline w-fit"
              >
                {pasteFor === r.url ? '收起' : '手动粘贴正文'}
              </button>
            )}
            {pasteFor === r.url && (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  placeholder="把文章正文粘贴到这里，保存后 AI 生成会参考它"
                  className="input-dark text-xs px-2 py-1.5 resize-y"
                />
                <button
                  onClick={() => void saveManualContent(r.url)}
                  disabled={!pasteText.trim()}
                  className="text-xs rounded-md px-2.5 py-1.5 bg-kimi-500 text-white hover:bg-kimi-600 transition-colors disabled:opacity-50 w-fit"
                >
                  保存正文
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addRef();
            }}
            placeholder="粘贴参考链接，回车添加"
            className="input-dark text-xs px-2.5 py-1.5 flex-1"
          />
          <button
            onClick={() => void addRef()}
            disabled={addingRef || !newUrl.trim()}
            className="text-xs rounded-md px-3 py-1.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors disabled:opacity-50"
          >
            {addingRef ? '…' : '添加'}
          </button>
        </div>
      </section>

      {/* 收为样稿确认弹窗 */}
      {pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="panel shadow-pop p-5 flex flex-col gap-3 w-full max-w-sm">
            <p className="text-sm font-bold">这篇收为样稿吗？</p>
            <p className="text-xs text-ink-soft leading-relaxed">
              收为样稿后，它会参与该账号的 AI 风格自动迭代（结构套路、语气、钩子写法），以后生成的初稿更像你的好稿。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => void applyStatus(pendingStatus, false)}
                className="text-xs px-3 py-2 rounded-lg border border-line text-ink-soft hover:bg-[#F0F1F3] transition-colors"
              >
                不收，直接更新
              </button>
              <button
                onClick={() => void applyStatus(pendingStatus, true)}
                className="text-xs px-3 py-2 rounded-lg bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn"
              >
                收为样稿
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
