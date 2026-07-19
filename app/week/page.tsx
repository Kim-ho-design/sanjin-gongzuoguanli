'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Task } from '@/lib/types';
import { weekRange, addDays, todayStr, weekdayCn } from '@/lib/utils';
import { AvatarLogo } from '@/components/Pixel';
import TaskDetail from '@/components/TaskDetail';

/** 某天的一个条目：同一任务同一天的 计划/截止 合并成一张卡片，用标签区分 */
interface WeekItem {
  task: Task;
  isPlan: boolean; // planned_date 落在这天
  isDue: boolean; // deadline 落在这天
}

export default function WeekPage() {
  const [anchor, setAnchor] = useState(todayStr()); //  displayed week 内的任意一天
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/board', { cache: 'no-store' });
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (res.ok) setTasks((await res.json()).tasks ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = todayStr();
  const { start, end } = weekRange(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  // 按天归组：计划/截止各自落到对应日期，同一天两者都有则合并
  const byDay: Record<string, WeekItem[]> = {};
  for (const d of days) byDay[d] = [];
  for (const t of tasks ?? []) {
    if (t.planned_date && byDay[t.planned_date]) {
      byDay[t.planned_date].push({ task: t, isPlan: true, isDue: t.deadline === t.planned_date });
    }
    if (t.deadline && t.deadline !== t.planned_date && byDay[t.deadline]) {
      byDay[t.deadline].push({ task: t, isPlan: false, isDue: true });
    }
  }
  // 截止事项排前面
  for (const d of days) byDay[d].sort((a, b) => Number(b.isDue) - Number(a.isDue));

  function shiftWeek(delta: number) {
    setAnchor(addDays(anchor, delta * 7));
  }

  return (
    <main className="min-h-screen ascii-bg flex flex-col">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-line bg-panel/80 backdrop-blur">
        <AvatarLogo size={30} />
        <h1 className="font-bold tracking-wide">周视图</h1>
        <span className="text-[10px] font-mono text-ink-faint tracking-[0.25em] hidden sm:inline">WEEKLY</span>
        <Link href="/" className="ml-auto text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors">
          ← 看板
        </Link>
        <Link href="/calendar" className="text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors">
          📅 月视图
        </Link>
        <Link href="/report" className="text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors">
          📊 周报
        </Link>
      </header>

      <div className="px-5 py-4 flex flex-col gap-3 flex-1">
        {/* 周切换 */}
        <div className="flex items-center gap-3">
          <button onClick={() => shiftWeek(-1)} className="text-ink-faint hover:text-kimi-600 px-2 text-lg">‹</button>
          <p className="font-mono text-sm font-bold tracking-wider">
            {start.slice(5)} {weekdayCn(start)} ~ {end.slice(5)} {weekdayCn(end)}
          </p>
          <button onClick={() => shiftWeek(1)} className="text-ink-faint hover:text-kimi-600 px-2 text-lg">›</button>
          {anchor !== today && (
            <button
              onClick={() => setAnchor(today)}
              className="text-[11px] border border-line rounded-full px-2.5 py-0.5 text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors"
            >
              回到本周
            </button>
          )}
          <span className="ml-auto text-[10px] font-mono text-ink-faint">
            <span className="text-kimi-600">计划</span> = 我打算哪天做 · <span className="text-amber-600">截止</span> = 对外承诺交付
          </span>
        </div>

        {/* 七天列 */}
        {!tasks ? (
          <p className="text-sm text-ink-faint py-10 text-center font-mono">LOADING…</p>
        ) : (
          <div className="grid grid-cols-7 gap-2 flex-1 items-start overflow-x-auto">
            {days.map((d) => {
              const isToday = d === today;
              const isPast = d < today;
              const items = byDay[d];
              return (
                <div
                  key={d}
                  className={`panel flex flex-col min-w-[150px] ${isToday ? '!border-kimi-400 ring-1 ring-kimi-400/50' : ''}`}
                >
                  <div className={`px-2.5 py-2 border-b border-line flex items-baseline gap-1.5 ${isPast && !isToday ? 'opacity-60' : ''}`}>
                    <span className={`text-xs font-bold ${isToday ? 'text-kimi-600' : ''}`}>{weekdayCn(d)}</span>
                    <span className="text-[10px] font-mono text-ink-faint">{d.slice(5)}</span>
                    {isToday && <span className="text-[9px] font-mono text-white bg-kimi-500 rounded px-1 leading-3 ml-auto">今天</span>}
                  </div>
                  <div className="p-1.5 space-y-1.5 min-h-[100px]">
                    {items.length === 0 && (
                      <p className="text-[10px] font-mono text-ink-faint/50 text-center pt-6">—</p>
                    )}
                    {items.map(({ task, isPlan, isDue }) => {
                      const done = task.status === '已完成';
                      const dueOverdue = isDue && d < today && !done && task.status !== '待确认审核';
                      return (
                        <button
                          key={`${task.id}-${isPlan ? 'p' : ''}${isDue ? 'd' : ''}`}
                          onClick={() => setOpenTaskId(task.id)}
                          className={`line-card w-full text-left p-2 cursor-pointer ${done ? 'opacity-45' : ''}`}
                        >
                          <div className="flex items-center gap-1 mb-1">
                            <span
                              className="w-1.5 h-1.5 rounded-[2px] shrink-0"
                              style={{ backgroundColor: task.project_color || '#3375F6' }}
                            />
                            <span className="text-[9px] text-ink-faint truncate">{task.project_name}</span>
                          </div>
                          <p className={`text-[11px] leading-snug ${done ? 'line-through' : ''}`}>{task.name}</p>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {isPlan && (
                              <span className="text-[9px] font-mono text-kimi-600 border border-kimi-200 rounded px-1 leading-3">
                                计划
                              </span>
                            )}
                            {isDue && (
                              <span
                                className={`text-[9px] font-mono rounded px-1 leading-3 border ${
                                  dueOverdue
                                    ? 'text-red-500 border-red-300 bg-red-50'
                                    : 'text-amber-600 border-amber-300 bg-amber-50'
                                }`}
                              >
                                截止{dueOverdue ? '⚠' : ''}
                              </span>
                            )}
                            <span className="text-[9px] font-mono text-ink-faint ml-auto">{done ? '✓' : task.status}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {openTaskId !== null && (
        <TaskDetail taskId={openTaskId} onClose={() => setOpenTaskId(null)} onChanged={load} />
      )}
    </main>
  );
}
