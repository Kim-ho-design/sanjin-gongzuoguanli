'use client';

import { useState } from 'react';
import type { OverdueItem, Task } from '@/lib/types';

export interface BoardStats {
  week_plan: number;
  week_done: number;
  overdue_count: number;
  unclaimed_count: number;
}

/** 三列进度计数与列表（splitByProgress 口径，由 page 计算传入） */
export interface ProgressGroups {
  todo: Task[];
  doing: Task[];
  done: Task[];
}

type PopKind = 'overdue' | 'todo' | 'doing' | 'done' | null;

/** 统一浮层条目 */
interface PopItem {
  key: string;
  openId: number; // 子任务打开父任务详情
  label: string;
  color: string;
  right?: string;
  rightRed?: boolean;
}

export default function TopBar({
  stats,
  overdueItems = [],
  progress,
  onOpenDrift,
  onOpenTask,
}: {
  stats: BoardStats;
  overdueItems?: OverdueItem[];
  progress: ProgressGroups;
  onOpenDrift: () => void;
  onOpenTask: (id: number) => void;
}) {
  const [pop, setPop] = useState<PopKind>(null);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // 超期天数（date 一定早于 today）
  const overdueDays = (date: string) =>
    Math.max(1, Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86400000));
  const rate = stats.week_plan > 0 ? Math.round((stats.week_done / stats.week_plan) * 100) : null;

  function taskToItem(t: Task, showDate: boolean): PopItem {
    const isSub = t.parent_task_id !== null;
    const date = isSub ? t.planned_date : t.deadline;
    return {
      key: `${isSub ? 's' : 't'}-${t.id}`,
      openId: isSub ? (t.parent_task_id as number) : t.id,
      label: isSub && t.parent_name ? `${t.parent_name} › ${t.name}` : t.name,
      color: t.project_color || '#007CFF',
      right: showDate && date ? `${isSub ? '计划' : '截止'} ${date.slice(5)}` : undefined,
    };
  }

  const pops: Record<Exclude<PopKind, null>, { title: string; items: PopItem[] }> = {
    overdue: {
      title: `超期未完成（${overdueItems.length}）`,
      items: overdueItems.map((it) => ({
        key: `${it.kind}-${it.id}`,
        openId: it.kind === 'subtask' ? (it.parent_id as number) : it.id,
        label: it.kind === 'subtask' && it.parent_name ? `${it.parent_name} › ${it.name}` : it.name,
        color: it.project_color || '#007CFF',
        right: `${it.kind === 'subtask' ? '计划' : '截止'} ${it.date.slice(5)} · 超期${overdueDays(it.date)}天`,
        rightRed: true,
      })),
    },
    todo: { title: `待启动（${progress.todo.length}）`, items: progress.todo.map((t) => taskToItem(t, true)) },
    doing: { title: `进行中（${progress.doing.length}）`, items: progress.doing.map((t) => taskToItem(t, true)) },
    done: { title: `已完成（${progress.done.length}）`, items: progress.done.map((t) => taskToItem(t, false)) },
  };
  const active = pop ? pops[pop] : null;

  const toggle = (k: PopKind) => setPop((v) => (v === k ? null : k));

  const cellCls = 'flex items-center gap-2 min-w-0 px-3 py-3 md:px-5';

  return (
    <div className="relative">
      <div className="stats-strip grid grid-cols-3 md:grid-cols-5 bg-white rounded-xl">
        <div className={`${cellCls} col-span-2 md:col-span-1 flex-wrap`}>
          <span className="text-xs text-ink-soft">本周进度</span>
          <strong className="text-2xl font-mono font-medium tracking-tight text-kimi-500">{rate === null ? '—' : `${rate}%`}</strong>
          <span className="text-[11px] font-mono text-ink-faint">{stats.week_done}/{stats.week_plan}</span>
          <div className="w-full h-1 bg-kimi-50 rounded-full overflow-hidden" aria-hidden="true">
            <div className="h-full bg-kimi-500 rounded-full" style={{ width: `${rate ?? 0}%` }} />
          </div>
        </div>
        <div className={`${cellCls} flex-col justify-center !gap-1`}>
          <span className="text-xs text-ink-soft">漂流瓶</span>
          <div className="flex items-center gap-2">
            <button onClick={() => toggle('overdue')} title="查看超期明细" className="text-xl font-mono hover:text-kimi-500 rounded" style={{ color: stats.overdue_count > 0 ? '#A56320' : undefined }}>{stats.overdue_count}</button>
            <span className="text-ink-faint text-xs">+</span>
            <button onClick={onOpenDrift} title="打开待认领区" className="text-xl font-mono hover:text-kimi-500 rounded">{stats.unclaimed_count}</button>
          </div>
          <span className="text-[10px] text-ink-faint">超期 + 待认领</span>
        </div>
        {([
          ['todo', '待启动', progress.todo.length],
          ['doing', '进行中', progress.doing.length],
          ['done', '已完成', progress.done.length],
        ] as const).map(([key, label, count]) => (
          <button key={key} onClick={() => toggle(key)} title={`查看${label}列表`} className={`${cellCls} justify-center md:justify-between hover:bg-kimi-50/60 transition-colors rounded-lg`}>
            <span className="text-xs text-ink-soft">{label}</span>
            <strong className={`text-2xl font-mono font-medium tracking-tight ${key === 'doing' ? 'text-kimi-500' : 'text-ink'}`}>{count}</strong>
          </button>
        ))}
      </div>

      {/* 统一明细浮层（点击外部关闭，弹出带轻微缩放；z-50 永远压过其他区块） */}
      {active && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div className="absolute right-2 top-full mt-2 z-50 w-80 max-md:left-2 max-md:w-auto panel shadow-pop pop-enter p-2 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-ink-faint font-mono tracking-wider px-1.5 pb-1.5 border-b border-line">
              {active.title}
            </p>
            {active.items.length === 0 ? (
              <p className="text-[11px] text-ink-faint text-center py-4 font-mono">空空如也</p>
            ) : (
              active.items.map((it) => (
                <button
                  key={it.key}
                  onClick={() => {
                    setPop(null);
                    onOpenTask(it.openId);
                  }}
                  className="w-full text-left px-2 py-2.5 rounded hover:bg-kimi-50 cursor-pointer flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-[2px] shrink-0" style={{ backgroundColor: it.color }} />
                  <span className="text-sm text-ink truncate">{it.label}</span>
                  {it.right && (
                    <span className={`ml-auto text-[9px] font-mono shrink-0 ${it.rightRed ? 'text-bean-orange font-bold' : 'text-ink-faint'}`}>
                      {it.right}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export type { Task };
