'use client';

import { useState } from 'react';
import type { ParseResult, Project } from '@/lib/types';
import type { ApplySummary } from '@/lib/apply';
import { PixelLoader } from './Pixel';

const INTENT_LABEL: Record<string, string> = {
  create_task: '新建任务',
  update_task: '更新状态',
  log_progress: '记录进展',
  set_plan: '排计划',
  weekly_review: '周报',
  unclear: '未识别',
};

export default function ConfirmCard({
  rawText,
  parsed,
  projects,
  onDone,
  onCancel,
}: {
  rawText: string;
  parsed: ParseResult;
  projects: Project[];
  onDone: (summary: ApplySummary) => void;
  onCancel: () => void;
}) {
  // 反问环节用户的选择：已有项目 id / 新建项目名
  const [choice, setChoice] = useState<
    { mode: 'existing'; project_id: number } | { mode: 'new'; name: string } | null
  >(null);
  const [newName, setNewName] = useState(parsed.project.name || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const needChoice = parsed.needs_confirmation;

  async function confirm() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/parse/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText, parsed, project_choice: choice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '写入失败');
      onDone(data.summary as ApplySummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : '写入失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-[2px] p-4">
      <div className="line-card w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-xl shadow-kimi-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-mono bg-kimi-500 text-white rounded px-1.5 py-0.5 tracking-wider">
            {INTENT_LABEL[parsed.intent] ?? parsed.intent}
          </span>
          <p className="text-xs text-ink-faint truncate">「{rawText}」</p>
        </div>

        {/* 项目归属 */}
        <div className="mb-3">
          <p className="text-[11px] text-ink-faint font-mono mb-1">项目归属</p>
          {parsed.project.name ? (
            <p className="text-sm">
              <span className="font-medium">{parsed.project.name}</span>
              {parsed.project.is_new && (
                <span className="text-[10px] text-amber-600 border border-amber-300 rounded px-1 ml-1.5">新项目</span>
              )}
              <span className="text-[10px] font-mono text-ink-faint ml-1.5">
                置信度 {Math.round(parsed.project.confidence * 100)}%
              </span>
            </p>
          ) : (
            <p className="text-sm text-ink-faint">未识别</p>
          )}
        </div>

        {/* 任务列表 */}
        {parsed.tasks.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] text-ink-faint font-mono mb-1">任务（{parsed.tasks.length}）</p>
            <div className="space-y-1.5">
              {parsed.tasks.map((t, i) => (
                <div key={i} className="border border-line rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">{t.name || '（未命名）'}</span>
                    {t.matched_existing ? (
                      <span className="text-[10px] text-emerald-600 border border-emerald-300 rounded px-1">已有任务</span>
                    ) : (
                      <span className="text-[10px] text-kimi-600 border border-kimi-200 rounded px-1">新任务</span>
                    )}
                    {t.is_plan_item && (
                      <span className="text-[10px] font-mono text-kimi-500 border border-kimi-200 rounded px-1">计划任务</span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1 text-[11px] font-mono text-ink-soft">
                    {t.status && <span>状态→{t.status}</span>}
                    {t.deadline && <span>截止 {t.deadline}</span>}
                    {t.planned_date && <span>计划 {t.planned_date}</span>}
                    {t.parent_task_name && <span>属于「{t.parent_task_name}」</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 日志信息 */}
        {(parsed.log.content || parsed.log.blocker || parsed.log.deliverable) && (
          <div className="mb-3 text-sm">
            <p className="text-[11px] text-ink-faint font-mono mb-1">进展记录</p>
            {parsed.log.content && <p className="text-ink-soft">{parsed.log.content}</p>}
            <div className="flex gap-3 mt-0.5 text-[11px] font-mono text-ink-soft">
              {parsed.log.duration_hours !== null && <span>耗时 {parsed.log.duration_hours}h</span>}
              {parsed.log.deliverable && <span>交付物：{parsed.log.deliverable}</span>}
              {parsed.log.blocker && <span className="text-red-500">卡点：{parsed.log.blocker}</span>}
            </div>
          </div>
        )}

        {/* 反问环节（需求文档 4.4：弹 clarify_question 供点选） */}
        {needChoice && (
          <div className="mb-3 border border-amber-300 bg-amber-50/60 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-800 mb-2">❓ {parsed.clarify_question || '这句话归属哪个项目？'}</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setChoice({ mode: 'existing', project_id: p.id })}
                  className={`text-xs border rounded-full px-2.5 py-1 transition-colors ${
                    choice?.mode === 'existing' && choice.project_id === p.id
                      ? 'bg-kimi-500 text-white border-kimi-500'
                      : 'border-line bg-white hover:border-kimi-400'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setChoice({ mode: 'new', name: e.target.value });
                }}
                placeholder="或者：新建项目名称"
                className="flex-1 text-xs border border-line rounded-lg px-2.5 py-1.5 outline-none focus:border-kimi-500 bg-white"
              />
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-sm border border-line rounded-lg px-4 py-2 hover:border-kimi-400 transition-colors"
          >
            取消
          </button>
          <button
            onClick={confirm}
            disabled={submitting || (needChoice && !choice)}
            className="text-sm bg-kimi-500 hover:bg-kimi-600 text-white rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {submitting && <PixelLoader />}
            确认入库
          </button>
        </div>
        {needChoice && !choice && (
          <p className="text-[10px] text-ink-faint text-right mt-1">先回答上面的问题，再确认</p>
        )}
      </div>
    </div>
  );
}
