'use client';

import { useState } from 'react';
import type { Unclaimed, Task } from '@/lib/types';
import { PixelBottle } from './Pixel';

export default function UnclaimedPanel({
  unclaimed,
  tasks,
  onClose,
  onChanged,
}: {
  unclaimed: Unclaimed[];
  tasks: Task[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [claimTarget, setClaimTarget] = useState<Record<number, number | ''>>({});
  const activeTasks = tasks;

  async function claim(id: number) {
    const taskId = claimTarget[id];
    if (!taskId) return;
    await fetch(`/api/unclaimed/${id}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    });
    onChanged();
  }

  async function discard(id: number) {
    await fetch(`/api/unclaimed/${id}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md bg-panel border-l border-line overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <PixelBottle size={20} />
          <h2 className="text-base font-bold">待认领区</h2>
          <span className="text-xs font-mono text-ink-faint">{unclaimed.length}</span>
          <button onClick={onClose} className="ml-auto text-ink-faint hover:text-ink text-lg leading-none px-1">×</button>
        </div>
        <p className="text-xs text-ink-soft mb-4">
          这些话说了但没挂上任何任务。指定归属后会记为该任务的进展记录。
        </p>

        {unclaimed.length === 0 && (
          <p className="text-xs text-ink-faint text-center py-10 font-mono tracking-widest">EMPTY · 空空如也 🎉</p>
        )}

        <div className="space-y-3">
          {unclaimed.map((u) => (
            <div key={u.id} className="line-card p-3">
              <p className="text-[10px] font-mono text-ink-faint mb-1">{u.created_at.slice(0, 16)}</p>
              <p className="text-[13px] leading-snug mb-2">「{u.raw_text}」</p>
              <div className="flex gap-1.5">
                <select
                  value={claimTarget[u.id] ?? ''}
                  onChange={(e) =>
                    setClaimTarget((s) => ({ ...s, [u.id]: e.target.value ? Number(e.target.value) : '' }))
                  }
                  className="input-dark flex-1 text-xs px-2 py-1.5 min-w-0"
                >
                  <option value="">选择归属任务…</option>
                  {activeTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.project_name}] {t.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => claim(u.id)}
                  disabled={!claimTarget[u.id]}
                  className="text-xs bg-kimi-500 text-white rounded-lg px-3 hover:bg-kimi-400 disabled:opacity-40"
                >
                  认领
                </button>
                <button
                  onClick={() => discard(u.id)}
                  className="text-xs text-ink-faint hover:text-red-400 px-1.5"
                  title="丢弃"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
