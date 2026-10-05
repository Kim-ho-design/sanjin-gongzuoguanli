'use client';
// 徕乔（分镜型）编辑器 · 三板块形态（彻底去表格）：
// ① 同期声（口播文案）——大文本框竖排，最重要；② 画面呈现建议；③ 字幕建议
import { useState } from 'react';
import RewriteTextarea from './RewriteTextarea';
import { MetaRow, speakableCount, type LqDraft } from './shared';

interface Props {
  scriptId: number;
  draft: LqDraft;
  onChange: (d: LqDraft) => void;
}

export default function LqEditor({ scriptId, draft, onChange }: Props) {
  const [toast, setToast] = useState('');

  const set = (patch: Partial<LqDraft>) => onChange({ ...draft, ...patch });
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(draft.voiceover_body);
      showToast('已复制全文');
    } catch {
      showToast('复制失败，请手动选择复制');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 发布信息 */}
      <section className="bpanel p-5 flex flex-col gap-3.5">
        <h2 className="text-sm font-bold">发布信息</h2>
        <MetaRow label="封面标题">
          <input
            value={draft.cover_title}
            onChange={(e) => set({ cover_title: e.target.value })}
            placeholder="含分类前缀，如「搅拌/混匀/分散 新品亮相 超薄磁力搅拌器」"
            className="input-dark text-sm px-3 py-2 w-full"
          />
        </MetaRow>
        <MetaRow label="发文标题">
          <RewriteTextarea
            scriptId={scriptId}
            value={draft.post_title}
            onChange={(v) => set({ post_title: v })}
            rows={2}
            placeholder="带 hashtags，必须含 #LACHOI徕乔，贴近实验人的搜索与浏览语境"
          />
        </MetaRow>
      </section>

      {/* ① 同期声（口播文案）：最重要，竖排 */}
      <section className="bpanel overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line flex-wrap">
          <h2 className="text-sm font-bold">同期声（口播文案）</h2>
          <span className="text-[11px] font-mono text-ink-faint">口播 {speakableCount(draft.voiceover_body)} 字</span>
          <button
            onClick={() => void copyBody()}
            disabled={!draft.voiceover_body.trim()}
            className="ml-auto text-xs rounded-lg px-3 py-1.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors disabled:opacity-50"
          >
            ⧉ 复制全文
          </button>
        </div>
        <div className="p-4">
          <RewriteTextarea
            scriptId={scriptId}
            value={draft.voiceover_body}
            onChange={(v) => set({ voiceover_body: v })}
            rows={16}
            placeholder={
              '完整同期声口播文案，短句竖排一句一行。\n开头 3 秒吸睛 → 主体展开 → 结尾互动引导，能看出框架逻辑。\n选中任意文字可 AI 改写。'
            }
            className="!min-h-[360px] leading-relaxed"
          />
        </div>
      </section>

      {/* ② 画面呈现建议 */}
      <section className="bpanel p-5 flex flex-col gap-2.5">
        <h2 className="text-sm font-bold">画面呈现建议</h2>
        <textarea
          value={draft.visual_advice}
          onChange={(e) => set({ visual_advice: e.target.value })}
          rows={5}
          placeholder="整体风格 + 关键节点画面建议，不逐句对应，简单描述。如：产品特写+快切为主；开篇成品前置；参数处给屏幕特写……"
          className="input-dark text-sm px-3 py-2 resize-y leading-relaxed"
        />
      </section>

      {/* ③ 字幕建议 */}
      <section className="bpanel p-5 flex flex-col gap-2.5">
        <h2 className="text-sm font-bold">字幕建议</h2>
        <textarea
          value={draft.subtitle_advice}
          onChange={(e) => set({ subtitle_advice: e.target.value })}
          rows={3}
          placeholder="字幕呈现建议，简述。如：卖点用字幕条；关键参数打屏；错误示范用红字标注……"
          className="input-dark text-sm px-3 py-2 resize-y leading-relaxed"
        />
      </section>

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-kimi-50 border border-kimi-200 text-ink text-xs rounded-lg px-4 py-2.5 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
