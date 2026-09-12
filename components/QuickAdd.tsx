'use client';

// 手动快速新增：不走 AI 的兜底入口（v13 起）
// 定位：AI 挂掉 / 只想快速记一条时使用；批量录入、补记流水仍走上方 AI 输入框
import { useState } from 'react';
import type { Project } from '@/lib/types';
import PrioritySelect, { PriorityValue } from './PrioritySelect';
import { PixelLoader } from './Pixel';

export default function QuickAdd({
  projects,
  onAdded,
}: {
  projects: Project[];
  onAdded: (taskName: string) => void;
}) {
  const [priority, setPriority] = useState<PriorityValue>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState<number>(0);
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setName('');
    setPriority(null);
    setProjectId(0);
    setDeadline('');
    setError('');
  }

  async function submit() {
    const n = name.trim();
    if (!n || loading) return;
    if (!projectId) {
      setError('选一个项目（所有事项必须挂项目）');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: n,
          priority,
          project_id: projectId,
          deadline: deadline || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');
      reset();
      setOpen(false);
      onAdded(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-ink-faint hover:text-kimi-600 transition-colors px-2 py-1 font-mono"
      >
        ✎ 手动新增（不走 AI）
      </button>
    );
  }

  return (
    <div className="panel rounded-2xl px-4 py-3 flex flex-col gap-2.5 border-kimi-300">
      <div className="flex gap-2 items-center flex-wrap">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') {
              reset();
              setOpen(false);
            }
          }}
          placeholder="任务名（必填）"
          className="input-dark flex-1 px-2.5 py-1.5 text-sm"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(Number(e.target.value))}
          className="input-dark px-2 py-1.5 text-sm"
        >
          <option value={0}>选项目 *</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          title="对外截止（可空）"
          className="input-dark px-2 py-1.5 text-sm font-mono"
        />
        <PrioritySelect value={priority} onChange={setPriority} />
        <button
          onClick={submit}
          disabled={loading || !name.trim()}
          className="shrink-0 bg-kimi-500 hover:bg-kimi-400 text-white text-sm rounded-xl px-4 py-1.5 font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5"
        >
          {loading ? <PixelLoader /> : '添加'}
        </button>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="shrink-0 text-xs text-ink-faint hover:text-ink px-1.5"
        >
          收起
        </button>
      </div>
      <p className="text-[11px] text-ink-faint font-mono px-0.5">
        手动新增 = 直接建一条任务，不经过 AI；批量录入、补记今天/昨天做了什么，仍用上方输入框
      </p>
      {error && <p className="text-xs text-red-500 px-0.5">{error}</p>}
    </div>
  );
}
