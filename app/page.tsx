'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { OverdueItem, ParseResult, Project, Task, Unclaimed } from '@/lib/types';
import type { ApplySummary } from '@/lib/apply';
import TopBar, { BoardStats } from '@/components/TopBar';
import WeekView from '@/components/WeekView';
import InputBox from '@/components/InputBox';
import QuickAdd from '@/components/QuickAdd';
import ConfirmCard from '@/components/ConfirmCard';
import TaskDetail from '@/components/TaskDetail';
import UnclaimedPanel from '@/components/UnclaimedPanel';
import { AvatarLogo } from '@/components/Pixel';
import { todayStr, splitByProgress } from '@/lib/utils';

interface BoardData {
  projects: Project[];
  tasks: Task[];
  subtasks: Task[];
  unclaimed: Unclaimed[];
  overdue_items: OverdueItem[];
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

  // 周视图拖拽：父任务改 deadline，子任务改 planned_date（乐观更新，失败回滚+提示）
  async function moveTaskDate(task: Task, date: string | null) {
    const isSub = task.parent_task_id !== null;
    const prev = data; // 失败回滚用
    setData((d) =>
      d
        ? {
            ...d,
            tasks: isSub ? d.tasks : d.tasks.map((t) => (t.id === task.id ? { ...t, deadline: date } : t)),
            subtasks: isSub ? d.subtasks.map((t) => (t.id === task.id ? { ...t, planned_date: date } : t)) : d.subtasks,
          }
        : d,
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isSub ? { planned_date: date } : { deadline: date }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || '保存失败');
      }
    } catch (e) {
      setData(prev); // 回滚乐观更新
      showToast(`日期更新失败：${e instanceof Error ? e.message : '网络错误'}，已回滚`);
      return;
    }
    load();
  }

  // 卡片 ✓ 快速完成：已完成 ↔ 待启动（乐观更新，失败回滚+提示）
  async function toggleComplete(task: Task) {
    const next = task.status === '已完成' ? '待启动' : '已完成';
    const isSub = task.parent_task_id !== null;
    const prev = data; // 失败回滚用
    setData((d) =>
      d
        ? {
            ...d,
            tasks: isSub ? d.tasks : d.tasks.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
            subtasks: isSub ? d.subtasks.map((t) => (t.id === task.id ? { ...t, status: next } : t)) : d.subtasks,
          }
        : d,
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || '保存失败');
      }
    } catch (e) {
      setData(prev); // 回滚乐观更新
      showToast(`状态更新失败：${e instanceof Error ? e.message : '网络错误'}，已回滚`);
      return;
    }
    load(); // 拉取最新统计（完成率/进行中数即时重算）
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

  const filteredTasks = data?.tasks.filter((t) => filterProject === 0 || t.project_id === filterProject) ?? [];
  const filteredSubtasks = data?.subtasks.filter((t) => filterProject === 0 || t.project_id === filterProject) ?? [];
  // 待启动/进行中/已完成三列计数与浮层数据（splitByProgress 口径）
  const progress = splitByProgress([...filteredTasks, ...filteredSubtasks], todayStr());

  return (
    <main className="min-h-screen ascii-bg pixel-dots flex flex-col">
      {/* 顶栏 */}
      <header className="flex items-center gap-3 max-md:gap-2 px-5 max-md:px-3 py-3 border-b border-line bg-panel/80 backdrop-blur">
        <AvatarLogo size={32} />
        <h1 className="text-lg max-md:text-base font-bold tracking-wide">三金打工清单</h1>
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

      <div className="px-5 max-md:px-3 py-4 pb-24 md:pb-4 flex flex-col gap-4 flex-1 max-w-[1600px] w-full mx-auto">
        {error && <p className="text-sm text-red-400">{error}</p>}

        {data && (
          <div className="fade-up" style={{ animationDelay: '0ms' }}>
            <TopBar
              stats={data.stats}
              overdueItems={data.overdue_items ?? []}
              progress={progress}
              onOpenDrift={() => setShowDrift(true)}
              onOpenTask={(id) => setOpenTaskId(id)}
            />
          </div>
        )}

        {/* 唯一输入口（AI）+ 手动快速新增（兜底，不走 AI）；移动端输入框移至底部吸底栏 */}
        <div className="fade-up" style={{ animationDelay: '80ms' }}>
          <div className="max-md:hidden">
            <InputBox onParsed={handleParsed} />
          </div>
          <QuickAdd
            projects={data?.projects ?? []}
            onAdded={(n) => {
              showToast(`任务「${n}」已创建`);
              load();
            }}
          />
        </div>

        {/* 项目筛选 */}
        {data && (
          <div className="fade-up flex gap-1.5 flex-wrap items-center" style={{ animationDelay: '140ms' }}>
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

        {data ? (
          /* 周视图主视图：拖拽改日期 */
          <div className="fade-up" style={{ animationDelay: '200ms' }}>
            <WeekView
              tasks={filteredTasks}
              subtasks={filteredSubtasks}
              onOpen={(id) => setOpenTaskId(id)}
              onMoveDate={moveTaskDate}
              onToggle={toggleComplete}
            />
          </div>
        ) : (
          !error && <p className="text-sm text-ink-faint py-10 text-center font-mono">LOADING…</p>
        )}
      </div>

      {/* 移动端吸底输入栏（最高频操作，拇指可及；背景渐变托底避免内容透出） */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 px-3 pb-3 pt-6 bg-gradient-to-t from-[#F5F8FF] via-[#F5F8FF]/95 to-transparent">
        <InputBox onParsed={handleParsed} />
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
        <div className="fixed bottom-6 max-md:bottom-24 left-1/2 -translate-x-1/2 bg-kimi-50 border border-kimi-200 text-ink text-xs rounded-lg px-4 py-2.5 shadow-lg shadow-kimi-500/20 z-50 max-w-lg max-md:max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </main>
  );
}
