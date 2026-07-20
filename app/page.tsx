'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ParseResult, Project, Task, TaskStatus, Unclaimed } from '@/lib/types';
import type { ApplySummary } from '@/lib/apply';
import Board from '@/components/Board';
import TopBar, { BoardStats } from '@/components/TopBar';
import InputBox from '@/components/InputBox';
import ConfirmCard from '@/components/ConfirmCard';
import TaskDetail from '@/components/TaskDetail';
import UnclaimedPanel from '@/components/UnclaimedPanel';
import TodaySidebar from '@/components/TodaySidebar';
import { AvatarLogo } from '@/components/Pixel';

interface BoardData {
  projects: Project[];
  tasks: Task[];
  subtasks: Task[];
  unclaimed: Unclaimed[];
  stats: BoardStats;
}

export default function HomePage() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState('');
  const [filterProject, setFilterProject] = useState<number | 0>(0); // 0 = 全部
  const [pendingParse, setPendingParse] = useState<{ rawText: string; parsed: ParseResult } | null>(null);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [showDrift, setShowDrift] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [toast, setToast] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/board', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('加载失败');
      setData(await res.json());
    } catch {
      setError('数据加载失败，请刷新重试');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function moveTask(task: Task, status: TaskStatus) {
    // 乐观更新
    setData((d) =>
      d ? { ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) } : d,
    );
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function toggleToday(task: Task) {
    setData((d) =>
      d
        ? { ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, is_today: t.is_today ? 0 : 1 } : t)) }
        : d,
    );
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_today: !task.is_today }),
    });
    load();
  }

  function handleParsed(rawText: string, parsed: ParseResult) {
    if (parsed.intent === 'weekly_review') {
      window.location.href = '/report';
      return;
    }
    setPendingParse({ rawText, parsed });
  }

  function handleConfirmed(summary: ApplySummary) {
    setPendingParse(null);
    showToast(summary.actions.join('；') || '已入库');
    load();
  }

  async function addProject() {
    const name = newProjName.trim();
    if (!name) return;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const d = await res.json();
    if (!res.ok) {
      showToast(d.error || '新建项目失败');
      return;
    }
    setNewProjName('');
    setAddingProject(false);
    showToast(`项目「${name}」已创建`);
    load();
  }

  async function removeProject(p: Project) {
    const count = data?.tasks.filter((t) => t.project_id === p.id).length ?? 0;
    if (
      !confirm(
        `删除项目「${p.name}」？\n项目下的 ${count} 个任务不会丢失，会移到待认领区，之后可恢复到其他项目。`,
      )
    )
      return;
    await fetch(`/api/projects/${p.id}`, { method: 'DELETE' });
    if (filterProject === p.id) setFilterProject(0);
    showToast(`项目「${p.name}」已删除，${count} 个任务已进入待认领区`);
    load();
  }

  const filteredTasks =
    data?.tasks.filter((t) => filterProject === 0 || t.project_id === filterProject) ?? [];

  return (
    <main className="min-h-screen ascii-bg flex flex-col">
      {/* 顶栏 */}
      <header className="flex items-center gap-3 px-5 py-3 border-b border-line bg-panel/80 backdrop-blur">
        <AvatarLogo size={32} />
        <h1 className="font-bold tracking-wide">三金打工清单</h1>
        <span className="text-[10px] font-mono text-ink-faint tracking-[0.25em] hidden sm:inline">
          PLAN · DO · LOG · REVIEW
        </span>
        <Link
          href="/week"
          className="ml-auto text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors"
        >
          🗓 周视图
        </Link>
        <Link
          href="/calendar"
          className="text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors"
        >
          📅 月视图
        </Link>
        <Link
          href="/report"
          className="text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors"
        >
          📊 周报
        </Link>
      </header>

      <div className="px-5 py-4 flex flex-col gap-4 flex-1">
        {error && <p className="text-sm text-red-400">{error}</p>}

        {data && <TopBar stats={data.stats} onOpenDrift={() => setShowDrift(true)} onOpenToday={() => setShowToday((v) => !v)} />}

        {/* 唯一输入口 */}
        <InputBox onParsed={handleParsed} />

        {/* 项目筛选 */}
        {data && (
          <div className="flex gap-1.5 flex-wrap items-center">
            <button
              onClick={() => setFilterProject(0)}
              className={`text-xs border rounded-full px-3 py-1 transition-colors ${
                filterProject === 0
                  ? 'bg-kimi-500 text-white border-kimi-500'
                  : 'border-line hover:border-kimi-400'
              }`}
            >
              全部
            </button>
            {data.projects.map((p) => (
              <span key={p.id} className="relative group">
                <button
                  onClick={() => setFilterProject(p.id)}
                  className={`text-xs border rounded-full px-3 py-1 transition-colors flex items-center gap-1.5 ${
                    filterProject === p.id
                      ? 'bg-kimi-500 text-white border-kimi-500'
                      : 'border-line hover:border-kimi-400'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-[2px]" style={{ backgroundColor: p.color }} />
                  {p.name}
                </button>
                <button
                  onClick={() => removeProject(p)}
                  title="删除项目（任务移入待认领区）"
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-line text-[10px] leading-none text-ink-faint hover:text-red-500 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </span>
            ))}
            {/* 新增项目 */}
            {addingProject ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addProject();
                    if (e.key === 'Escape') {
                      setAddingProject(false);
                      setNewProjName('');
                    }
                  }}
                  placeholder="新项目名称，回车创建"
                  className="input-dark text-xs px-2.5 py-1 w-40"
                />
                <button
                  onClick={addProject}
                  className="text-xs bg-kimi-500 text-white rounded-full px-2.5 py-1 hover:bg-kimi-400"
                >
                  建
                </button>
              </span>
            ) : (
              <button
                onClick={() => setAddingProject(true)}
                title="新增项目"
                className="text-xs border border-dashed border-line rounded-full px-3 py-1 text-ink-faint hover:border-kimi-400 hover:text-kimi-600 transition-colors"
              >
                ＋ 项目
              </button>
            )}
          </div>
        )}

        {/* 看板 + 今日侧栏 */}
        {data ? (
          <div className="flex gap-3 items-start flex-1">
            {showToday && (
              <TodaySidebar
                tasks={data.tasks}
                subtasks={data.subtasks ?? []}
                onOpen={(t) => setOpenTaskId(t.id)}
                onComplete={(t) => moveTask(t, '已完成')}
                onClose={() => setShowToday(false)}
              />
            )}
            <div className="flex-1 min-w-0">
              <Board
                tasks={filteredTasks}
                onOpen={(t) => setOpenTaskId(t.id)}
                onMove={moveTask}
                onToggleToday={toggleToday}
                onComplete={(t) => moveTask(t, '已完成')}
              />
            </div>
          </div>
        ) : (
          !error && <p className="text-sm text-ink-faint py-10 text-center font-mono">LOADING…</p>
        )}
      </div>

      {/* 弹层 */}
      {pendingParse && data && (
        <ConfirmCard
          rawText={pendingParse.rawText}
          parsed={pendingParse.parsed}
          projects={data.projects}
          onDone={handleConfirmed}
          onCancel={() => setPendingParse(null)}
        />
      )}
      {openTaskId !== null && (
        <TaskDetail taskId={openTaskId} onClose={() => setOpenTaskId(null)} onChanged={load} />
      )}
      {showDrift && data && (
        <UnclaimedPanel
          unclaimed={data.unclaimed}
          tasks={data.tasks}
          projects={data.projects}
          onClose={() => setShowDrift(false)}
          onChanged={load}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-kimi-50 border border-kimi-200 text-ink text-xs rounded-lg px-4 py-2.5 shadow-lg shadow-kimi-500/20 z-50 max-w-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
