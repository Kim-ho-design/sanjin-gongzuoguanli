'use client';

import { useState } from 'react';
import type { ParseResult, Project } from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import type { ApplySummary } from '@/lib/apply';
import { weekdayCn, prefillTaskFromLog } from '@/lib/utils';
import PrioritySelect from './PrioritySelect';
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
  // 可编辑副本：入库前所有细节都能改（任务名/日期/状态/项目/日志）
  // 兜底：有日志内容但任务列表为空（如补记时 LLM 没给出任务）→ 自动生成一条预填任务
  const [edited, setEdited] = useState<ParseResult>(() => {
    const e = JSON.parse(JSON.stringify(parsed)) as ParseResult;
    if (e.tasks.length === 0 && e.log.content.trim()) e.tasks.push(prefillTaskFromLog(e.log.content));
    return e;
  });
  // 项目选择：existing:id | new | null（未选择）
  const matchedProject = projects.find(
    (p) => p.name === parsed.project.name || p.name.includes(parsed.project.name) || parsed.project.name.includes(p.name),
  );
  const [projSel, setProjSel] = useState<string>(
    parsed.project.is_new ? 'new' : matchedProject ? `existing:${matchedProject.id}` : '',
  );
  const [newName, setNewName] = useState(parsed.project.is_new ? parsed.project.name : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // 逐任务项目覆盖：'' = 跟随上方整体项目，'existing:id' = 单独指定
  const [taskProj, setTaskProj] = useState<Record<number, string>>({});

  const needChoice = parsed.needs_confirmation;
  const hasTasks = edited.tasks.length > 0;
  // 需要项目：有任务要建/改。日志挂不上任务时会进待认领区，不强制项目
  const needProject = hasTasks;
  // 每条任务要么跟随整体项目、要么自己单独指定了项目
  const projMissing = needProject && !projSel && edited.tasks.some((_, i) => !taskProj[i]);

  function updateTask(i: number, patch: Partial<ParseResult['tasks'][number]>) {
    setEdited((e) => ({
      ...e,
      tasks: e.tasks.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    }));
  }

  function updateSubtask(ti: number, si: number, patch: Partial<ParseResult['tasks'][number]['subtasks'][number]>) {
    setEdited((e) => ({
      ...e,
      tasks: e.tasks.map((t, idx) =>
        idx === ti ? { ...t, subtasks: t.subtasks.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : t,
      ),
    }));
  }

  async function confirm() {
    setSubmitting(true);
    setError('');
    try {
      const project_choice = projSel.startsWith('existing:')
        ? { mode: 'existing' as const, project_id: Number(projSel.split(':')[1]) }
        : projSel === 'new' && newName.trim()
          ? { mode: 'new' as const, name: newName.trim() }
          : null;
      const task_projects = edited.tasks.map((_, i) => {
        const sel = taskProj[i] ?? '';
        return sel.startsWith('existing:')
          ? { mode: 'existing' as const, project_id: Number(sel.split(':')[1]) }
          : null;
      });
      const res = await fetch('/api/parse/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText, parsed: edited, project_choice, task_projects }),
      });
      // 容错：网关超时等情况返回的是 HTML 错误页，res.json() 会抛 "Unexpected token '<'" 天书
      const data = await res.json().catch(() => null);
      if (!data) throw new Error('服务开小差了，请稍后重试');
      if (!res.ok) throw new Error(data.error || '写入失败');
      onDone(data.summary as ApplySummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : '写入失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
      <div className="panel w-full max-w-xl max-h-[88vh] overflow-y-auto p-5 shadow-2xl shadow-kimi-500/10 !border-kimi-200">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono bg-kimi-500 text-white rounded px-1.5 py-0.5 tracking-wider">
            {INTENT_LABEL[edited.intent] ?? edited.intent}
          </span>
          <span className="text-[10px] font-mono text-ink-faint">确认前可直接修改任何字段</span>
        </div>
        <p className="text-xs text-ink-soft mb-4">「{rawText}」</p>

        {/* 反问提示 */}
        {needChoice && (
          <div className="mb-4 border border-bean-orange/50 bg-bean-orange/10 rounded-lg px-3 py-2">
            <p className="text-xs text-bean-orange">❓ {edited.clarify_question || '请确认归属'}</p>
          </div>
        )}

        {/* 项目归属（可改） */}
        <div className="mb-4">
          <p className="text-[10px] text-ink-faint font-mono tracking-wider mb-1.5">
            项目归属{parsed.project.name && `（识别：${parsed.project.name}${parsed.project.is_new ? '·新' : ''} ${Math.round(parsed.project.confidence * 100)}%）`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setProjSel(`existing:${p.id}`)}
                className={`text-xs border rounded-full px-2.5 py-1 transition-colors ${
                  projSel === `existing:${p.id}`
                    ? 'bg-kimi-500 text-white border-kimi-500'
                    : 'border-line hover:border-kimi-400'
                }`}
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={() => setProjSel('new')}
              className={`text-xs border rounded-full px-2.5 py-1 transition-colors ${
                projSel === 'new' ? 'bg-kimi-500 text-white border-kimi-500' : 'border-dashed border-line hover:border-kimi-400'
              }`}
            >
              ＋新项目
            </button>
          </div>
          {projSel === 'new' && (
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新项目名称"
              className="input-dark mt-2 w-full text-xs px-2.5 py-1.5"
            />
          )}
          {projMissing && <p className="text-[10px] text-bean-orange mt-1">↑ 建任务需要选定一个项目</p>}
        </div>

        {/* 任务列表（可编辑） */}
        {hasTasks && (
          <div className="mb-4 space-y-2">
            <p className="text-[10px] text-ink-faint font-mono tracking-wider">任务（{edited.tasks.length}）</p>
            <p className="text-[10px] text-ink-faint leading-snug">
              对外截止 = 承诺交给别人的那天；子任务 = 任务的执行排期（自己打算哪天做哪一步）
            </p>
            {edited.tasks.map((t, i) => (
              <div key={i} className="border border-line rounded-lg p-2.5 bg-card">
                <div className="flex items-center gap-1.5">
                  <input
                    value={t.name}
                    onChange={(e) => updateTask(i, { name: e.target.value })}
                    className="input-dark flex-1 text-[13px] px-2 py-1 min-w-0"
                    placeholder="任务名"
                  />
                  <button
                    onClick={() => setEdited((e) => ({ ...e, tasks: e.tasks.filter((_, idx) => idx !== i) }))}
                    className="text-ink-faint hover:text-red-400 text-sm px-1 shrink-0"
                    title="移除这条"
                  >
                    ×
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-mono">
                  <select
                    value={t.status || '待启动'}
                    onChange={(e) => updateTask(i, { status: e.target.value })}
                    className="input-dark px-1.5 py-1 text-[11px]"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <select
                    value={taskProj[i] ?? ''}
                    onChange={(e) => setTaskProj((s) => ({ ...s, [i]: e.target.value }))}
                    title="这条任务的项目归属（默认跟随上方整体项目）"
                    className="input-dark px-1.5 py-1 text-[11px] max-w-[140px]"
                  >
                    <option value="">跟随上方项目</option>
                    {projects.map((p) => (
                      <option key={p.id} value={`existing:${p.id}`}>{p.name}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-ink-soft" title="对外承诺交付的那一天（要交给别人/对客户）">
                    对外截止
                    <input
                      type="date"
                      value={t.deadline ?? ''}
                      onChange={(e) => updateTask(i, { deadline: e.target.value || null })}
                      className="input-dark px-1.5 py-1 text-[11px]"
                    />
                    {t.deadline && <span className="text-kimi-600">{weekdayCn(t.deadline)}</span>}
                  </label>
                  <PrioritySelect value={t.priority} onChange={(priority) => updateTask(i, { priority })} />
                </div>
                {/* 子任务（可增删）：任务执行的排期 */}
                <div className="mt-2 space-y-1">
                  {t.subtasks.map((s, si) => (
                    <div key={si} className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                      <span className="text-ink-faint shrink-0">›</span>
                      <input
                        value={s.name}
                        onChange={(e) => updateSubtask(i, si, { name: e.target.value })}
                        placeholder="子任务名称"
                        className="input-dark flex-1 min-w-0 px-1.5 py-1 text-[11px]"
                      />
                      <input
                        type="date"
                        value={s.planned_date ?? ''}
                        onChange={(e) => updateSubtask(i, si, { planned_date: e.target.value || null })}
                        title="计划哪天做"
                        className="input-dark px-1.5 py-1 text-[11px]"
                      />
                      <PrioritySelect value={s.priority} inherit={t.priority ?? null} onChange={(priority) => updateSubtask(i, si, { priority })} />
                      <button
                        onClick={() =>
                          setEdited((e) => ({
                            ...e,
                            tasks: e.tasks.map((tt, idx) =>
                              idx === i ? { ...tt, subtasks: tt.subtasks.filter((_, j) => j !== si) } : tt,
                            ),
                          }))
                        }
                        className="text-ink-faint hover:text-red-400 text-sm px-1 shrink-0"
                        title="删除子任务"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      updateTask(i, { subtasks: [...t.subtasks, { name: '', planned_date: null }] })
                    }
                    className="text-[10px] font-mono text-ink-faint hover:text-kimi-600 border border-dashed border-line rounded px-2 py-0.5"
                  >
                    ＋ 添加子任务
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 日志（可编辑） */}
        <div className="mb-4">
          <p className="text-[10px] text-ink-faint font-mono tracking-wider mb-1.5">进展记录（无内容则只建/改任务）</p>
          <textarea
            value={edited.log.content}
            onChange={(e) => setEdited((p) => ({ ...p, log: { ...p.log, content: e.target.value } }))}
            placeholder="记录内容…"
            rows={2}
            className="input-dark w-full text-xs px-2.5 py-1.5 resize-none"
          />
          <label className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-ink-soft" title="补记的是哪天的工作（日志和完成时间都会记到这一天）">
            补记日期
            <input
              type="date"
              value={edited.log.date ?? ''}
              onChange={(e) => setEdited((p) => ({ ...p, log: { ...p.log, date: e.target.value || null } }))}
              className="input-dark px-1.5 py-1 text-[11px]"
            />
            {!edited.log.date && <span className="text-ink-faint">默认今天</span>}
          </label>
        </div>

        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-sm border border-line rounded-lg px-4 py-2 hover:border-kimi-400 transition-colors"
          >
            取消
          </button>
          <button
            onClick={confirm}
            disabled={submitting || projMissing || (projSel === 'new' && !newName.trim())}
            className="text-sm bg-kimi-500 hover:bg-kimi-400 text-white rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {submitting && <PixelLoader />}
            确认入库
          </button>
        </div>
      </div>
    </div>
  );
}
