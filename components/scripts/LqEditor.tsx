'use client';
// 徕乔（分镜型）编辑器 · Excel 式分镜表（三列）：同期声（台词）| 字幕 | 拍摄后期注意点
// 支持「复制整表」TSV 与「从 Excel 粘贴」回填；移动端降级纵向卡片
import { useState } from 'react';
import RewriteTextarea from './RewriteTextarea';
import { MetaRow, autoRows, type LqDraft, type LqRow } from './shared';

interface Props {
  scriptId: number;
  draft: LqDraft;
  onChange: (d: LqDraft) => void;
}

const EMPTY_ROW: LqRow = { node_label: '', voiceover: '', visual: '', subtitle: '', note: '' };

export default function LqEditor({ scriptId, draft, onChange }: Props) {
  const [toast, setToast] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const set = (patch: Partial<LqDraft>) => onChange({ ...draft, ...patch });
  const setRow = (i: number, patch: Partial<LqRow>) =>
    set({ rows: draft.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  function moveRow(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.rows.length) return;
    const rows = [...draft.rows];
    [rows[i], rows[j]] = [rows[j], rows[i]];
    set({ rows });
  }

  async function copyTable() {
    const header = ['镜号', '节点', '同期声', '呈现', '字幕', '拍摄后期注意点'].join('\t');
    const lines = draft.rows.map((r, i) =>
      [i + 1, r.node_label, r.voiceover, r.visual, r.subtitle, r.note].join('\t'),
    );
    try {
      await navigator.clipboard.writeText([header, ...lines].join('\n'));
      showToast('已复制，可直接粘贴到 Excel');
    } catch {
      showToast('复制失败，请手动选择复制');
    }
  }

  /** 解析 TSV：首列为纯数字序号时忽略；其后取 同期声/呈现/字幕/拍摄后期注意点，多余列并入最后一列 */
  function parseTsv(text: string): LqRow[] {
    const out: LqRow[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let cells = line.split('\t').map((c) => c.trim());
      if (cells.length >= 5 && /^\d+$/.test(cells[0])) cells = cells.slice(1);
      if (cells.length < 4) continue;
      const [voiceover, visual, subtitle, ...rest] = cells;
      out.push({
        ...EMPTY_ROW,
        voiceover: voiceover ?? '',
        visual: visual ?? '',
        subtitle: subtitle ?? '',
        note: rest.join(' '),
      });
    }
    return out;
  }

  function applyPaste() {
    const rows = parseTsv(pasteText);
    if (rows.length === 0) {
      showToast('没有解析到有效行（需要 4 列以上：同期声/呈现/字幕/拍摄后期注意点）');
      return;
    }
    set({ rows });
    setPasteOpen(false);
    setPasteText('');
    showToast(`已从 Excel 回填 ${rows.length} 行`);
  }

  const rowOps = (i: number) => (
    <span className="flex items-center gap-0.5 justify-end">
      <button onClick={() => moveRow(i, -1)} disabled={i === 0} title="上移"
        className="text-xs px-1.5 py-1 rounded text-ink-faint hover:text-kimi-600 hover:bg-kimi-50 transition-colors disabled:opacity-30">↑</button>
      <button onClick={() => moveRow(i, 1)} disabled={i === draft.rows.length - 1} title="下移"
        className="text-xs px-1.5 py-1 rounded text-ink-faint hover:text-kimi-600 hover:bg-kimi-50 transition-colors disabled:opacity-30">↓</button>
      <button onClick={() => set({ rows: draft.rows.filter((_, j) => j !== i) })} disabled={draft.rows.length <= 1} title="删除本行"
        className="text-xs px-1.5 py-1 rounded text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30">删</button>
    </span>
  );

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
            rows={autoRows(draft.post_title, 2, 4)}
            placeholder="带 hashtags，必须含 #LACHOI徕乔，贴近实验人的搜索与浏览语境"
          />
        </MetaRow>
      </section>

      {/* 分镜表 */}
      <section className="bpanel overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line flex-wrap">
          <h2 className="text-sm font-bold">分镜表（{draft.rows.length} 行）</h2>
          <span className="ml-auto flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => set({ rows: [...draft.rows, { ...EMPTY_ROW }] })}
              className="text-xs border border-dashed border-line rounded-lg px-3 py-1.5 text-ink-faint hover:border-kimi-400 hover:text-kimi-600 transition-colors"
            >
              ＋ 添加一行
            </button>
            <button
              onClick={() => void copyTable()}
              className="text-xs rounded-lg px-3 py-1.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors"
            >
              ⧉ 复制整表
            </button>
            <button
              onClick={() => setPasteOpen(true)}
              className="text-xs rounded-lg px-3 py-1.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors"
            >
              ⇪ 从 Excel 粘贴
            </button>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="xtable">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th className="w-80">同期声（台词）</th>
                <th className="w-48">呈现</th>
                <th className="w-44">字幕</th>
                <th className="w-52">拍摄后期注意点</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((row, i) => (
                <tr key={i}>
                  <td data-label="#" className="font-mono text-xs text-ink-faint text-center pt-4">{i + 1}</td>
                  <td data-label="同期声（台词）">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-ink-faint flex items-center gap-2">
                        台词 / 文案
                        <input
                          value={row.node_label}
                          maxLength={5}
                          onChange={(e) => setRow(i, { node_label: e.target.value })}
                          placeholder="节点"
                          className="input-dark text-[11px] px-1.5 py-0.5 w-16"
                        />
                      </span>
                      <RewriteTextarea
                        scriptId={scriptId}
                        value={row.voiceover}
                        onChange={(v) => setRow(i, { voiceover: v })}
                        rows={Math.max(5, autoRows(row.voiceover, 5, 14))}
                        placeholder="这一镜说什么；视觉片可空"
                      />
                    </label>
                  </td>
                  <td data-label="呈现">
                    <textarea
                      value={row.visual}
                      onChange={(e) => setRow(i, { visual: e.target.value })}
                      rows={Math.max(5, autoRows(row.visual, 5, 10))}
                      placeholder="这一镜的画面内容描述：拍什么、怎么拍（景别/运镜/素材）"
                      className="input-dark text-xs px-2 py-1.5 resize-y w-full"
                    />
                  </td>
                  <td data-label="字幕">
                    <textarea
                      value={row.subtitle}
                      onChange={(e) => setRow(i, { subtitle: e.target.value })}
                      rows={Math.max(5, autoRows(row.subtitle, 5, 10))}
                      placeholder="屏幕字幕"
                      className="input-dark text-xs px-2 py-1.5 resize-y w-full"
                    />
                  </td>
                  <td data-label="拍摄后期注意点">
                    <textarea
                      value={row.note}
                      onChange={(e) => setRow(i, { note: e.target.value })}
                      rows={Math.max(5, autoRows(row.note, 5, 10))}
                      placeholder="这一镜拍什么、怎么拍（景别/运镜/素材），以及拍摄与后期注意点"
                      className="input-dark text-xs px-2 py-1.5 resize-y w-full"
                    />
                  </td>
                  <td data-label="操作">{rowOps(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 从 Excel 粘贴弹层 */}
      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="panel shadow-pop p-5 flex flex-col gap-3 w-full max-w-lg">
            <p className="text-sm font-bold">从 Excel 粘贴</p>
            <p className="text-xs text-ink-soft leading-relaxed">
              在 Excel 里复制分镜区域后粘贴到这里。每行 4 列以上（同期声 / 呈现 / 字幕 / 拍摄后期注意点），第一列是纯数字序号时自动忽略，多余列并入最后一列。解析后将<b>覆盖</b>当前全部 {draft.rows.length} 行。
            </p>
            <textarea
              autoFocus
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              placeholder={'同期声\t呈现\t字幕\t拍摄后期注意点\n为什么样品没溶解\t溶质展示\t\t轻剧情开篇 5秒吸睛'}
              className="input-dark text-xs px-3 py-2 resize-y font-mono"
            />
            <div className="flex items-center gap-2 justify-end">
              <span className="text-[11px] text-ink-faint mr-auto">
                {pasteText.trim() ? `将解析为 ${parseTsv(pasteText).length} 行` : ''}
              </span>
              <button
                onClick={() => {
                  setPasteOpen(false);
                  setPasteText('');
                }}
                className="text-xs px-3 py-2 rounded-lg border border-line text-ink-soft hover:bg-[#F0F1F3] transition-colors"
              >
                取消
              </button>
              <button
                onClick={applyPaste}
                disabled={!pasteText.trim() || parseTsv(pasteText).length === 0}
                className="text-xs px-3 py-2 rounded-lg bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn disabled:opacity-50"
              >
                覆盖回填
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-kimi-50 border border-kimi-200 text-ink text-xs rounded-lg px-4 py-2.5 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
