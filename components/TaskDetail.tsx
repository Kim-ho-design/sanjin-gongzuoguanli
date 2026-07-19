'use client';

import { useEffect, useState } from 'react';
import { TASK_STATUSES } from '@/lib/types';
import type { Log, Deliverable, Task, TaskStatus } from '@/lib/types';

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

  async function load() {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (res.ok) setDetail(await res.json());
  }

  useEffect(() => {
    load();
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
        {/* 头部 */}
        <div className="flex items-start gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-[2px] mt-1.5 shrink-0" style={{ backgroundColor: task.project_color }} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-faint">{task.project_name}</p>
            <h2 className="text-base font-bold leading-snug">{task.name}</h2>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink text-lg leading-none px-1">×</button>
        </div>

        {/* 日期信息 */}
        <div className="flex gap-4 text-xs font-mono text-ink-soft mb-4 border border-line rounded-lg p-2.5">
          <span title="承诺交给别人的那天">对外截止：{task.deadline ?? '—'}</span>
          <span title="自己打算哪天做">我的计划：{task.planned_date ?? '—'}</span>
          {task.is_plan_item === 1 && <span className="text-kimi-600">计划任务</span>}
        </div>

        {/* 状态按钮（拖拽之外的第二通道） */}
        <p className="text-[10px] text-ink-faint font-mono tracking-wider mb-1.5">状态 STATUS</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {TASK_STATUSES.map((s: TaskStatus) => (
            <button
              key={s}
              onClick={() => patch({ status: s })}
              title={s === '归档' ? '归档 = 彻底闭环（验收通过）或不做了，从日常视野收起，数据保留' : undefined}
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
          已完成=验收通过；归档=彻底闭环或不做了，从看板收起只留档
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
