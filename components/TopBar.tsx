'use client';

import { useState } from 'react';
import type { OverdueItem, Task } from '@/lib/types';
import { PixelBottle, PixelNumber } from './Pixel';

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
      color: t.project_color || '#3E81F6',
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
        color: it.project_color || '#3E81F6',
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

  const labelCls = 'text-[10px] font-mono tracking-[0.2em] text-ink-faint';
  const cellCls = 'px-3 py-3 flex flex-col items-center min-w-0';

  return (
    <div className="relative">
      {/* 浅色统计条：五格均分撑满整行，格间细分割线 */}
      <div className="panel rounded-3xl grid grid-cols-5 divide-x divide-line overflow-x-auto">
        {/* 本周进度：大号像素百分比主显示，n/n 降为小字 */}
        <div className={cellCls}>
          <p className={labelCls}>
            本周进度 <span className="text-ink-faint/60">WEEK</span>
          </p>
          <div className="mt-1.5">
            <PixelNumber value={rate === null ? '--' : `${rate}%`} size={4} color="#1A1D2E" />
          </div>
          <p className="text-[10px] font-mono text-ink-faint mt-1">
            {stats.week_done}/{stats.week_plan}
          </p>
          {/* 点阵进度条：品牌蓝 */}
          <div className="flex gap-[3px] mt-1.5">
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-[2px] ${
                  rate !== null && i < Math.round((rate / 100) * 16) ? 'bg-kimi-500' : 'bg-kimi-50'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 漂流瓶：超期可点开明细，待认领开待认领区 */}
        <div className={cellCls}>
          <p className={labelCls}>
            漂流瓶 <span className="text-ink-faint/60">DRIFT</span>
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <PixelBottle size={14} />
            <button
              onClick={() => toggle('overdue')}
              title="查看超期明细"
              className="cursor-pointer rounded-sm hover:ring-1 hover:ring-red-300 transition-shadow"
            >
              <PixelNumber
                value={String(stats.overdue_count)}
                size={4}
                color={stats.overdue_count > 0 ? '#FF5C5C' : '#1A1D2E'}
              />
            </button>
            <button
              onClick={onOpenDrift}
              title="打开待认领区"
              className="flex items-center gap-1 cursor-pointer rounded-sm hover:ring-1 hover:ring-amber-300 transition-shadow"
            >
              <span className="text-ink-faint font-mono text-xs">+</span>
              <PixelNumber
                value={String(stats.unclaimed_count)}
                size={4}
                color={stats.unclaimed_count > 0 ? '#F5A623' : '#1A1D2E'}
              />
            </button>
          </div>
          <p className="text-[9px] text-ink-faint font-mono mt-1">超期 + 待认领</p>
        </div>

        {/* 待启动 / 进行中 / 已完成：数字居中，点击开列表 */}
        {(
          [
            ['todo', '待启动', 'TODO', progress.todo.length, '#64748B'],
            ['doing', '进行中', 'DOING', progress.doing.length, '#3E81F6'],
            ['done', '已完成', 'DONE', progress.done.length, '#34D399'],
          ] as const
        ).map(([key, label, en, count, accent]) => (
          <div key={key} className={cellCls}>
            <p className={labelCls}>
              {label} <span className="text-ink-faint/60">{en}</span>
            </p>
            <button
              onClick={() => toggle(key)}
              title={`查看${label}列表`}
              className="mt-1.5 cursor-pointer rounded-sm hover:ring-1 hover:ring-kimi-300 transition-shadow"
            >
              <PixelNumber value={String(count)} size={4} color={count > 0 ? accent : '#1A1D2E'} />
            </button>
            <p className="text-[9px] text-ink-faint font-mono mt-1">点击查看 ›</p>
          </div>
        ))}
      </div>

      {/* 统一明细浮层（点击外部关闭，弹出带轻微缩放；z-50 永远压过其他区块） */}
      {active && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div className="absolute right-2 top-full mt-2 z-50 w-80 panel shadow-pop pop-enter p-2 max-h-[60vh] overflow-y-auto">
            <p className="text-[10px] text-ink-faint font-mono tracking-wider px-1.5 pb-1.5 border-b border-line">
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
                  className="w-full text-left px-1.5 py-1.5 rounded hover:bg-kimi-50 cursor-pointer flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-[2px] shrink-0" style={{ backgroundColor: it.color }} />
                  <span className="text-[11px] text-ink truncate">{it.label}</span>
                  {it.right && (
                    <span className={`ml-auto text-[9px] font-mono shrink-0 ${it.rightRed ? 'text-red-500 font-bold' : 'text-ink-faint'}`}>
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
