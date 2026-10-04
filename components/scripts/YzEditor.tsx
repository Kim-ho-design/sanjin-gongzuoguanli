'use client';
// 一站式（口播型）编辑器 · 一体文档形态：元信息区 + 大段连贯口播正文（括号注释跟句后）+ 进度条节点数组 + 片尾落版
import { useState } from 'react';
import RewriteTextarea from './RewriteTextarea';
import { MetaRow, speakableCount, type YzDraft } from './shared';

interface Props {
  scriptId: number;
  draft: YzDraft;
  onChange: (d: YzDraft) => void;
}

export default function YzEditor({ scriptId, draft, onChange }: Props) {
  const [kwInput, setKwInput] = useState('');
  const [toast, setToast] = useState('');

  const set = (patch: Partial<YzDraft>) => onChange({ ...draft, ...patch });
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  function addKeyword() {
    const kw = kwInput.trim();
    if (!kw || draft.keywords.includes(kw)) return;
    set({ keywords: [...draft.keywords, kw] });
    setKwInput('');
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(draft.body);
      showToast('已复制全文');
    } catch {
      showToast('复制失败，请手动选择复制');
    }
  }

  const moveNode = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.progress_nodes.length) return;
    const progress_nodes = [...draft.progress_nodes];
    [progress_nodes[i], progress_nodes[j]] = [progress_nodes[j], progress_nodes[i]];
    set({ progress_nodes });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 元信息区：通栏面板，行式排布 */}
      <section className="bpanel p-5 flex flex-col gap-3.5">
        <h2 className="text-sm font-bold">视频信息</h2>
        <MetaRow label="封面标题">
          <input
            value={draft.cover_title}
            onChange={(e) => set({ cover_title: e.target.value })}
            placeholder="点明利益或制造悬念"
            className="input-dark text-sm px-3 py-2 w-full"
          />
        </MetaRow>
        <MetaRow label="视频定位">
          <input
            value={draft.positioning}
            onChange={(e) => set({ positioning: e.target.value })}
            placeholder="帮谁解决什么问题"
            className="input-dark text-sm px-3 py-2 w-full"
          />
        </MetaRow>
        <MetaRow label="目标人群">
          <input
            value={draft.audience}
            onChange={(e) => set({ audience: e.target.value })}
            placeholder="具体身份，如「印染企业品控、合规负责人」"
            className="input-dark text-sm px-3 py-2 w-full"
          />
        </MetaRow>
        <MetaRow label="框架思路">
          <input
            value={draft.framework}
            onChange={(e) => set({ framework: e.target.value })}
            placeholder="钩子秒数 → 主体分段 → 收尾引流"
            className="input-dark text-sm px-3 py-2 w-full"
          />
        </MetaRow>
        <MetaRow label="关键词">
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.keywords.map((kw) => (
              <span key={kw} className="text-[11px] bg-kimi-50 text-kimi-700 border border-kimi-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                {kw}
                <button
                  onClick={() => set({ keywords: draft.keywords.filter((k) => k !== kw) })}
                  className="text-kimi-300 hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="回车添加（痛点/行业/需求/长尾）"
              className="input-dark text-xs px-2.5 py-1 w-40"
            />
          </div>
        </MetaRow>
      </section>

      {/* 正文：一体文档 */}
      <section className="bpanel overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line flex-wrap">
          <h2 className="text-sm font-bold">脚本正文</h2>
          <span className="text-[11px] font-mono text-ink-faint">
            正文 {speakableCount(draft.body)} 字{draft.progress_nodes.length > 0 ? ` · ${draft.progress_nodes.length} 个节点` : ''}
          </span>
          <button
            onClick={() => void copyBody()}
            disabled={!draft.body.trim()}
            className="ml-auto text-xs rounded-lg px-3 py-1.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors disabled:opacity-50"
          >
            ⧉ 复制全文
          </button>
        </div>
        <div className="p-4">
          <RewriteTextarea
            scriptId={scriptId}
            value={draft.body}
            onChange={(v) => set({ body: v })}
            rows={16}
            placeholder={
              '一大段连贯口播文案，一口气读得下来。\n画面/字幕提示用括号跟在对应句子后：（字幕：…）（画面：…）\n段落之间空行分隔。选中任意文字可 AI 改写。'
            }
            className="!min-h-[400px] leading-relaxed"
          />
          <p className="text-[11px] text-ink-faint mt-2">
            对齐经理范本形态：钩子开头 → 主体递进 → 收尾引流；括号注释不进口播字数。
          </p>
        </div>
      </section>

      {/* 进度条节点：与正文顺序对应 */}
      <section className="bpanel p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold">进度条节点</h2>
          <span className="text-[11px] text-ink-faint">与正文段落顺序对应，2~5 字，让观众一眼知道讲到哪</span>
          <NodeAdder onAdd={(n) => set({ progress_nodes: [...draft.progress_nodes, n] })} existing={draft.progress_nodes} />
        </div>
        {draft.progress_nodes.length > 0 && (
          <ol className="flex flex-wrap items-center gap-1.5">
            {draft.progress_nodes.map((node, i) => (
              <li
                key={`${node}-${i}`}
                className="flex items-center gap-1 text-xs bg-kimi-50 text-kimi-700 border border-kimi-200 rounded-full pl-2.5 pr-1 py-0.5"
              >
                <span className="font-mono text-[10px] text-kimi-400">{i + 1}</span>
                <span className="font-medium">{node}</span>
                <span className="flex items-center">
                  <button onClick={() => moveNode(i, -1)} disabled={i === 0} title="前移"
                    className="px-0.5 text-kimi-300 hover:text-kimi-600 disabled:opacity-30">↑</button>
                  <button onClick={() => moveNode(i, 1)} disabled={i === draft.progress_nodes.length - 1} title="后移"
                    className="px-0.5 text-kimi-300 hover:text-kimi-600 disabled:opacity-30">↓</button>
                  <button onClick={() => set({ progress_nodes: draft.progress_nodes.filter((_, j) => j !== i) })} title="删除"
                    className="px-0.5 text-kimi-300 hover:text-red-500">×</button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 片尾落版 */}
      <section className="bpanel p-5">
        <MetaRow label="片尾落版">
          <input
            value={draft.end_card}
            onChange={(e) => set({ end_card: e.target.value })}
            placeholder="8~12 字，对仗或口号式"
            className="input-dark text-sm px-3 py-2 w-full"
          />
        </MetaRow>
      </section>

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-kimi-50 border border-kimi-200 text-ink text-xs rounded-lg px-4 py-2.5 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function NodeAdder({ onAdd, existing }: { onAdd: (n: string) => void; existing: string[] }) {
  const [v, setV] = useState('');
  return (
    <span className="flex items-center gap-1.5 ml-auto">
      <input
        value={v}
        maxLength={5}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const n = v.trim();
            if (n && !existing.includes(n)) onAdd(n);
            setV('');
          }
        }}
        placeholder="添加节点，回车确认"
        className="input-dark text-xs px-2.5 py-1 w-36"
      />
    </span>
  );
}
