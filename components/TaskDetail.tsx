'use client';

import { useEffect, useState } from 'react';
import { TASK_STATUSES } from '@/lib/types';
import type { Log, Deliverable, Task, TaskStatus, Project } from '@/lib/types';

interface Detail {
  task: Task;
  logs: Log[];
  deliverables: Deliverable[];
  sub_tasks: { id: number; name: string; status: string; planned_date: string | null; deadline: string | null }[];
}

export default function TaskDetail({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [logText, setLogText] = useState('');
  const [deliverableName, setDeliverableName] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjMode, setNewProjMode] = useState(false);
  const [newProjName, setNewProjName] = useState('');

  async function load() {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (res.ok) setDetail(await res.json());
  }

  async function loadProjects() {
    const res = await fetch('/api/projects');
    if (res.ok) setProjects((await res.json()).projects ?? []);
  }

  useEffect(() => {
    load();
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await load();
    onChanged();
  }

  async function changeProject(v: string) {
    if (v === '__new') {
      setNewProjMode(true);
      return;
    }
    setNewProjMode(false);
    const pid = Number(v);
    if (pid && pid !== detail?.task.project_id) await patch({ project_id: pid });
  }

  async function createProjectAndAssign() {
    const name = newProjName.trim();
    if (!name) return;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const d = await res.json();
    if (!res.ok) return;
    await loadProjects();
    await patch({ project_id: d.id });
    setNewProjName('');
    setNewProjMode(false);
  }

  async function addLog() {
    if (!logText.trim()) return;
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, raw_text: logText.trim() }),
    });
    setLogText('');
    await load();
    onChanged();
  }

  async function addDeliverable() {
    if (!deliverableName.trim()) return;
    await fetch('/api/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, name: deliverableName.trim() }),
    });
    setDeliverableName('');
    await load();
  }

  async function remove() {
    if (!confirm('确定删除这个任务？相关记录会一并删除。')) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    onChanged();
    onClose();
  }

  if (!detail) {
    return (
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
        <div className="absolute right-0 top-0 h-full w-full max-w-md bg-panel border-l border-line p-5">
          <p className="text-sm text-ink-faint">加载中…</p>
        </div>
      </div>
    );
  }

  const { task, logs, deliverables, sub_tasks } = detail;

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md bg-panel border-l border-line overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部（任务名可编辑） */}
        <div className="flex items-start gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-[2px] mt-2 shrink-0" style={{ backgroundColor: task.project_color }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <select
                key={`proj-${task.id}-${task.project_id}`}
                value={newProjMode ? '__new' : String(task.project_id)}
                onChange={(e) => changeProject(e.target.value)}
                title="项目归属（可改）"
                className="text-[11px] text-ink-faint bg-transparent outline-none cursor-pointer hover:text-kimi-600 max-w-[180px]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="__new">＋ 新项目…</option>
              </select>
            </div>
            {newProjMode && (
              <div className="flex items-center gap-1 mb-1">
                <input
                  autoFocus
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createProjectAndAssign();
                    if (e.key === 'Escape') setNewProjMode(false);
                  }}
                  placeholder="新项目名称，回车创建并挂入"
                  className="input-dark text-[11px] px-2 py-1 flex-1 min-w-0"
                />
                <button
                  onClick={createProjectAndAssign}
                  className="text-[11px] bg-kimi-500 text-white rounded-lg px-2 py-1 hover:bg-kimi-400"
                >
                  建
                </button>
              </div>
            )}
            <input
              key={task.id}
              defaultValue={task.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== task.name) patch({ name: v });
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="text-base font-bold leading-snug w-full bg-transparent outline-none border-b border-transparent focus:border-kimi-400 transition-colors"
            />
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink text-lg leading-none px-1">×</button>
        </div>

        {/* 日期信息（均可编辑） */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-mono text-ink-soft mb-4 border border-line rounded-lg p-2.5">
          <label className="flex items-center gap-1" title="承诺交给别人的那天">
            对外截止
            <input
              type="date"
              defaultValue={task.deadline ?? ''}
              onChange={(e) => patch({ deadline: e.target.value || null })}
              className="input-dark px-1.5 py-0.5 text-[11px]"
            />
          </label>
          <label className="flex items-center gap-1" title="自己打算哪天做">
            我的计划
            <input
              type="date"
              defaultValue={task.planned_date ?? ''}
              onChange={(e) => patch({ planned_date: e.target.value || null })}
              className="input-dark px-1.5 py-0.5 text-[11px]"
            />
          </label>
          {task.completed_at && (
            <label className="flex items-center gap-1" title="实际完成时间，可按真实情况修正">
              完成于
              <input
                type="date"
                defaultValue={task.completed_at.slice(0, 10)}
                onChange={(e) => e.target.value && patch({ completed_date: e.target.value })}
                className="input-dark px-1.5 py-0.5 text-[11px]"
              />
            </label>
          )}
          {task.is_plan_item === 1 && <span className="text-kimi-600">计划任务</span>}
        </div>

        {/* 状态按钮（拖拽之外的第二通道） */}
        <p className="text-[10px] text-ink-faint font-mono tracking-wider mb-1.5">状态 STATUS</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {TASK_STATUSES.map((s: TaskStatus) => (
            <button
              key={s}
              onClick={() => patch({ status: s })}
              title={s === '待办事项' ? '一次性小动作/提醒，做完点✓直接完成，不走流程' : undefined}
              className={`text-xs border rounded-full px-2.5 py-1 transition-colors ${
                task.status === s
                  ? 'bg-kimi-500 text-white border-kimi-500'
                  : 'border-line hover:border-kimi-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-ink-faint mb-5">
          待办事项=一次性小事；待确认审核=交付待验收；已完成=验收通过
        </p>

        {/* 子任务（拆任务的计划项） */}
        {sub_tasks.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] text-ink-faint font-mono tracking-wider mb-1.5">关联计划任务</p>
            {sub_tasks.map((st) => (
              <p key={st.id} className="text-xs text-ink-soft py-0.5">
                · {st.name}（{st.status}{st.planned_date ? `，计划 ${st.planned_date}` : ''}）
              </p>
            ))}
          </div>
        )}

        {/* 时间线 */}
        <p className="text-[10px] text-ink-faint font-mono tracking-wider mb-1.5">时间线 TIMELINE（{logs.length}）</p>
        <div className="border-l-2 border-kimi-100 pl-3 mb-3 space-y-3">
          {logs.length === 0 && <p className="text-xs text-ink-faint">还没有记录</p>}
          {logs.map((l) => (
            <div key={l.id} className="relative">
              <span className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-[2px] bg-kimi-500" />
              <p className="text-[10px] font-mono text-ink-faint">{l.created_at.slice(0, 16)}</p>
              <p className="text-[13px] text-ink leading-snug">{l.raw_text}</p>
              {(l.duration_hours || l.blocker) && (
                <p className="text-[10px] font-mono mt-0.5">
                  {l.duration_hours ? <span className="text-ink-soft">{l.duration_hours}h </span> : null}
                  {l.blocker ? <span className="text-red-400">卡点：{l.blocker}</span> : null}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* 手动补记 */}
        <div className="flex gap-1.5 mb-5">
          <input
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLog()}
            placeholder="补一条记录…"
            className="input-dark flex-1 text-xs px-2.5 py-1.5"
          />
          <button onClick={addLog} className="text-xs bg-kimi-500 text-white rounded-lg px-3 hover:bg-kimi-400">记</button>
        </div>

        {/* 交付物 */}
        <p className="text-[10px] text-ink-faint font-mono tracking-wider mb-1.5">交付物（{deliverables.length}）</p>
        <div className="mb-2 space-y-1">
          {deliverables.map((d) => (
            <p key={d.id} className="text-xs">
              {d.link ? (
                <a href={d.link} target="_blank" rel="noreferrer" className="text-kimi-600 hover:underline">
                  📎 {d.name}
                </a>
              ) : (
                <span>📎 {d.name}</span>
              )}
            </p>
          ))}
        </div>
        <div className="flex gap-1.5 mb-6">
          <input
            value={deliverableName}
            onChange={(e) => setDeliverableName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDeliverable()}
            placeholder="登记交付物名称…"
            className="input-dark flex-1 text-xs px-2.5 py-1.5"
          />
          <button onClick={addDeliverable} className="text-xs border border-line rounded-lg px-3 hover:border-kimi-400">+</button>
        </div>

        <button onClick={remove} className="text-xs text-red-400/70 hover:text-red-400">
          删除任务
        </button>
      </div>
    </div>
  );
}
