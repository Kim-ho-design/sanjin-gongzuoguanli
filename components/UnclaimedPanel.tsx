'use client';

import { useState } from 'react';
import type { Unclaimed, Task, Project } from '@/lib/types';
import { PixelBottle } from './Pixel';

/** 已删项目留下的任务快照（parsed.kind === 'project_deleted'） */
function deletedSnapshot(parsed: string | null): { project_name: string } | null {
  if (!parsed) return null;
  try {
    const p = JSON.parse(parsed) as { kind?: string; project_name?: string };
    return p.kind === 'project_deleted' ? { project_name: p.project_name ?? '' } : null;
  } catch {
    return null;
  }
}

export default function UnclaimedPanel({
  unclaimed,
  tasks,
  projects,
  onClose,
  onChanged,
}: {
  unclaimed: Unclaimed[];
  tasks: Task[];
  projects: Project[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [claimTarget, setClaimTarget] = useState<Record<number, number | ''>>({});
  const [restoreTarget, setRestoreTarget] = useState<Record<number, string>>({});
  const [restoreNewName, setRestoreNewName] = useState<Record<number, string>>({});
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

  async function restore(id: number) {
    const sel = restoreTarget[id] ?? '';
    if (!sel) return;
    const body =
      sel === '__new'
        ? { new_project_name: (restoreNewName[id] ?? '').trim() }
        : { project_id: Number(sel) };
    if (sel === '__new' && !body.new_project_name) return;
    await fetch(`/api/unclaimed/${id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
        className="absolute bg-panel border-line overflow-y-auto p-5 inset-x-0 bottom-0 h-[92dvh] rounded-t-3xl border-t md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:w-full md:max-w-md md:rounded-none md:border-t-0 md:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 移动端顶部抓手 */}
        <div className="md:hidden w-10 h-1 rounded-full bg-line mx-auto mb-3" />
        <div className="flex items-center gap-2 mb-4">
          <PixelBottle size={20} />
          <h2 className="text-base font-bold">待认领区</h2>
          <span className="text-xs font-mono text-ink-faint">{unclaimed.length}</span>
          <button onClick={onClose} className="ml-auto text-ink-faint hover:text-ink text-lg leading-none px-1">×</button>
        </div>
        <p className="text-xs text-ink-soft mb-4">
          这些话说了但没挂上任何任务。指定归属后会记为该任务的进展记录；已删项目留下的任务可整体恢复到新项目。
        </p>

        {unclaimed.length === 0 && (
          <p className="text-xs text-ink-faint text-center py-10 font-mono tracking-widest">EMPTY · 空空如也 🎉</p>
        )}

        <div className="space-y-3">
          {unclaimed.map((u) => {
            const snap = deletedSnapshot(u.parsed);
            return (
              <div key={u.id} className="line-card p-3">
                <p className="text-[10px] font-mono text-ink-faint mb-1">{u.created_at.slice(0, 16)}</p>
                <p className="text-[13px] leading-snug mb-2">「{u.raw_text}」</p>

                {snap ? (
                  /* 已删项目的任务：整体恢复到某个项目 */
                  <div>
                    <p className="text-[10px] text-bean-steel mb-1.5">
                      来自已删项目「{snap.project_name}」，状态/日期/记录都已保留
                    </p>
                    <div className="flex gap-1.5">
                      <select
                        value={restoreTarget[u.id] ?? ''}
                        onChange={(e) => setRestoreTarget((s) => ({ ...s, [u.id]: e.target.value }))}
                        className="input-dark flex-1 text-xs px-2 py-1.5 min-w-0"
                      >
                        <option value="">恢复到项目…</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                        <option value="__new">＋ 新项目…</option>
                      </select>
                      <button
                        onClick={() => restore(u.id)}
                        disabled={!restoreTarget[u.id]}
                        className="text-xs bg-kimi-500 text-white rounded-lg px-3 hover:bg-kimi-400 disabled:opacity-40"
                      >
                        恢复
                      </button>
                      <button
                        onClick={() => discard(u.id)}
                        className="text-xs text-ink-faint hover:text-red-400 px-1.5"
                        title="丢弃"
                      >
                        ×
                      </button>
                    </div>
                    {restoreTarget[u.id] === '__new' && (
                      <input
                        value={restoreNewName[u.id] ?? ''}
                        onChange={(e) => setRestoreNewName((s) => ({ ...s, [u.id]: e.target.value }))}
                        placeholder="新项目名称"
                        className="input-dark mt-1.5 w-full text-xs px-2 py-1.5"
                      />
                    )}
                  </div>
                ) : (
                  /* 普通待认领：认领为某任务的进展记录 */
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
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
