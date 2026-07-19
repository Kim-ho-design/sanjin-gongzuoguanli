'use client';

import type { Task } from '@/lib/types';
import { PixelStar, PixelBottle, PixelNumber } from './Pixel';

export interface BoardStats {
  today_count: number;
  week_plan: number;
  week_done: number;
  overdue_count: number;
  unclaimed_count: number;
}

export default function TopBar({
  stats,
  onOpenDrift,
  onOpenToday,
}: {
  stats: BoardStats;
  onOpenDrift: () => void;
  onOpenToday: () => void;
}) {
  const rate = stats.week_plan > 0 ? Math.round((stats.week_done / stats.week_plan) * 100) : null;

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* 今日计划（点击展开左侧栏） */}
      <button
        onClick={onOpenToday}
        className="panel px-4 py-3 flex items-center gap-3 text-left hover:border-kimi-300 cursor-pointer transition-colors"
      >
        <PixelStar size={18} />
        <div className="min-w-0">
          <p className="text-[10px] text-ink-faint font-mono tracking-[0.18em]">今日计划 TODAY</p>
          <div className="flex items-center gap-1.5 mt-1">
            <PixelNumber value={String(stats.today_count)} size={3.5} />
          </div>
        </div>
        <span className="ml-auto text-[10px] text-ink-faint font-mono">展开 ›</span>
      </button>

      {/* 本周完成率 */}
      <div className="panel px-4 py-3">
        <p className="text-[10px] text-ink-faint font-mono tracking-[0.18em]">本周完成率 WEEK</p>
        <div className="flex items-end gap-2 mt-1">
          <PixelNumber value={rate === null ? '--' : `${rate}%`} size={3.5} />
          <p className="text-[10px] font-mono text-ink-faint mb-1">
            {stats.week_done}/{stats.week_plan}
          </p>
        </div>
        {/* 点阵进度条 */}
        <div className="flex gap-[3px] mt-2">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-[2px] ${
                rate !== null && i < Math.round((rate / 100) * 24) ? 'bg-kimi-500' : 'bg-kimi-50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 漂流瓶 */}
      <button
        onClick={onOpenDrift}
        className="panel px-4 py-3 flex items-center gap-3 text-left hover:border-kimi-300 cursor-pointer transition-colors"
      >
        <PixelBottle size={16} />
        <div className="min-w-0">
          <p className="text-[10px] text-ink-faint font-mono tracking-[0.18em]">漂流瓶 DRIFT</p>
          <div className="flex items-center gap-1.5 mt-1">
            <PixelNumber
              value={String(stats.overdue_count)}
              size={3.5}
              color={stats.overdue_count > 0 ? '#FF5C5C' : '#4D7CFE'}
            />
            <span className="text-ink-faint font-mono text-sm">+</span>
            <PixelNumber
              value={String(stats.unclaimed_count)}
              size={3.5}
              color={stats.unclaimed_count > 0 ? '#F5A623' : '#4D7CFE'}
            />
          </div>
          <p className="text-[10px] text-ink-faint font-mono mt-0.5">超期 + 待认领</p>
        </div>
      </button>
    </div>
  );
}

export type { Task };
