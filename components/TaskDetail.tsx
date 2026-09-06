'use client';

import PrioritySelect, { PriorityValue } from './PrioritySelect';
import { useEffect, useState } from 'react';
import type { Log, Deliverable, Task, Project } from '@/lib/types';

interface Detail {
  task: Task;
  logs: Log[];
  deliverables: Deliverable[];
  sub_tasks: { priority?: PriorityValue; id: number; name: string; status: string; planned_date: string | null; deadline: string | null }[];
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
  const [priorityError, setPriorityError] = useState('');
  const [priorityBusy, setPriorityBusy] = useState(false);
  async function savePriority(id: number, priority: PriorityValue) {
    setPriorityBusy(true); setPriorityError('');
    try { const res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority }) });
      if (!res.ok) throw new Error('优先级保存失败，请重试');
      await load(); onChanged();
    } catch { setPriorityError('优先级保存失败，请重试'); } finally { setPriorityBusy(false); }
  }
  const [logText, setLogText] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubDate, setNewSubDate] = useState('');
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

  async function remove() {
    if (!confirm('确定删除这个任务？相关记录会一并删除。')) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    onChanged();
    onClose();
  }

  // ---- 子任务操作（复用 tasks/[id] 的 PATCH/DELETE，新建走 POST /api/tasks） ----
  async function patchSub(id: number, body: Record<string, unknown>) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await load();
    onChanged();
  }

  async function toggleSub(st: Detail['sub_tasks'][number]) {
    await patchSub(st.id, { status: st.status === '已完成' ? '待启动' : '已完成' });
  }

  async function removeSub(id: number) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    await load();
    onChanged();
  }

  async function addSub() {
    if (!newSubName.trim() || !detail) return;
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newSubName.trim(),
        project_id: detail.task.project_id,
        status: '待启动',
        planned_date: newSubDate || null,
        parent_task_id: taskId,
      }),
    });
    setNewSubName('');
    setNewSubDate('');
    await load();
    onChanged();
  }

  if (!detail) {
    return (
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
        <div className="absolute bg-panel border-line p-5 inset-x-0 bottom-0 h-[92dvh] rounded-t-3xl border-t md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:w-full md:max-w-md md:rounded-none md:border-t-0 md:border-l">
          <p className="text-sm text-ink-faint">加载中…</p>
        </div>
      </div>
    );
  }

  const { task, logs, deliverables, sub_tasks } = detail;

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="absolute bg-panel border-line overflow-y-auto p-5 inset-x-0 bottom-0 h-[92dvh] rounded-t-3xl border-t md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:w-full md:max-w-md md:rounded-none md:border-t-0 md:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 移动端顶部抓手 */}
        <div className="md:hidden w-10 h-1 rounded-full bg-line mx-auto mb-3" />
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

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-soft">优先级 <PrioritySelect value={task.priority} disabled={priorityBusy} onChange={(p) => savePriority(task.id, p)} />{priorityError && <p role="alert" className="text-red-500">{priorityError}</p>}</div>
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
        </div>

        {/* 状态操作：只有完成/重开两个动作，待启动与进行中由日期自动决定 */}
        <div className="mb-5">
          {task.status === '已完成' ? (
            <button
              onClick={() => patch({ status: '待启动' })}
              className="text-xs border border-line rounded-full px-3 py-1.5 hover:border-bean-orange hover:text-bean-orange transition-colors"
            >
              ↩ 重新打开
            </button>
          ) : (
            <button
              onClick={() => patch({ status: '已完成' })}
              className="text-xs bg-bean-green text-white rounded-full px-3 py-1.5 hover:bg-bean-green/90 transition-colors"
            >
              ✓ 标记完成
            </button>
          )}
        </div>

        {/* 子任务（可编辑：勾选完成 / 改计划日期 / 增删） */}
        <div className="mb-5">
          <p className="text-[10px] text-ink-faint font-mono tracking-wider mb-1.5">
            子任务 SUBTASKS（{sub_tasks.filter((s) => s.status === '已完成').length}/{sub_tasks.length}）
          </p>
          <div className="space-y-1 mb-2">
            {sub_tasks.length === 0 && <p className="text-xs text-ink-faint">还没有子任务</p>}
            {sub_tasks.map((st) => {
              const done = st.status === '已完成';
              return (
                <div key={st.id} className="flex items-center gap-1.5 group flex-wrap">
                  <button
                    onClick={() => toggleSub(st)}
                    title={done ? '取消完成' : '完成'}
                    className={`w-3.5 h-3.5 rounded-[3px] border shrink-0 flex items-center justify-center transition-colors ${
                      done ? 'bg-bean-green border-bean-green text-white' : 'border-line hover:border-bean-green'
                    }`}
                  >
                    {done && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5.2l2 2L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <input
                    key={`sub-name-${st.id}-${st.name}`}
                    defaultValue={st.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== st.name) patchSub(st.id, { name: v });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    title="子任务名称（可改，失焦保存）"
                    className={`text-xs flex-1 min-w-0 bg-transparent outline-none border-b border-transparent focus:border-kimi-400 transition-colors ${
                      done ? 'line-through text-ink-faint' : 'text-ink-soft'
                    }`}
                  />
                  <input
                    type="date"
                    value={st.planned_date ?? ''}
                    onChange={(e) => patchSub(st.id, { planned_date: e.target.value || null })}
                    title="计划哪天做"
                    className="input-dark px-1 py-0.5 text-[10px] font-mono w-[105px] shrink-0"
                  />
                  <button
                    onClick={() => removeSub(st.id)}
                    title="删除子任务"
                    className="text-ink-faint hover:text-red-400 text-sm px-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                  <PrioritySelect value={st.priority} inherit={task.priority ?? null} disabled={priorityBusy} label={`${st.name}优先级`} onChange={(p) => savePriority(st.id, p)} />
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSub()}
              placeholder="添加子任务…"
              className="input-dark flex-1 min-w-0 text-xs px-2 py-1"
            />
            <input
              type="date"
              value={newSubDate}
              onChange={(e) => setNewSubDate(e.target.value)}
              title="计划日期（可空）"
              className="input-dark px-1 py-1 text-[10px] font-mono w-[105px] shrink-0"
            />
            <button onClick={addSub} className="text-xs border border-line rounded-lg px-2.5 py-1 hover:border-kimi-400 shrink-0">
              +
            </button>
          </div>
        </div>

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
                  {l.blocker ? <span className="text-bean-orange">卡点：{l.blocker}</span> : null}
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

        {/* 交付物（历史数据只读展示，不再新增录入） */}
        {deliverables.length > 0 && (
          <>
            <p className="text-[10px] text-ink-faint font-mono tracking-wider mb-1.5">交付物（{deliverables.length}）</p>
            <div className="mb-6 space-y-1">
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
          </>
        )}

        <button onClick={remove} className="text-xs text-red-400/70 hover:text-red-400">
          删除任务
        </button>
      </div>
    </div>
  );
}
