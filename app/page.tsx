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
import { AvatarLogo } from '@/components/Pixel';

interface BoardData {
  projects: Project[];
  tasks: Task[];
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
  const [toast, setToast] = useState('');

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
          href="/calendar"
          className="ml-auto text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors"
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

        {data && <TopBar stats={data.stats} onOpenDrift={() => setShowDrift(true)} />}

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
              <button
                key={p.id}
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
            ))}
          </div>
        )}

        {/* 看板 */}
        {data ? (
          <Board
            tasks={filteredTasks}
            onOpen={(t) => setOpenTaskId(t.id)}
            onMove={moveTask}
            onToggleToday={toggleToday}
          />
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
