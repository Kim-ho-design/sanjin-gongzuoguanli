'use client';

import type { Task } from '@/lib/types';
import { PixelStar, PixelBottle } from './Pixel';

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
}: {
  stats: BoardStats;
  onOpenDrift: () => void;
}) {
  const rate = stats.week_plan > 0 ? Math.round((stats.week_done / stats.week_plan) * 100) : null;

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* 今日计划 */}
      <div className="line-card px-4 py-3 flex items-center gap-3">
        <PixelStar size={20} />
        <div className="min-w-0">
          <p className="text-[11px] text-ink-faint font-mono tracking-wider">今日计划</p>
          <p className="text-xl font-bold font-mono leading-tight text-kimi-600">
            {stats.today_count}
            <span className="text-xs font-normal text-ink-soft ml-1">件</span>
          </p>
        </div>
      </div>

      {/* 本周完成率 */}
      <div className="line-card px-4 py-3">
        <p className="text-[11px] text-ink-faint font-mono tracking-wider">本周完成率</p>
        <div className="flex items-end gap-2">
          <p className="text-xl font-bold font-mono leading-tight text-kimi-600">
            {rate === null ? '—' : `${rate}%`}
          </p>
          <p className="text-xs text-ink-soft mb-0.5">
            {stats.week_done}/{stats.week_plan}
          </p>
        </div>
        {/* 像素风格进度条 */}
        <div className="flex gap-[2px] mt-1.5">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 ${
                rate !== null && i < Math.round((rate / 100) * 20) ? 'bg-kimi-500' : 'bg-kimi-100'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 漂流瓶 */}
      <button
        onClick={onOpenDrift}
        className="line-card px-4 py-3 flex items-center gap-3 text-left hover:border-kimi-300 cursor-pointer"
      >
        <PixelBottle size={18} />
        <div className="min-w-0">
          <p className="text-[11px] text-ink-faint font-mono tracking-wider">漂流瓶</p>
          <p className="text-xl font-bold font-mono leading-tight">
            <span className={stats.overdue_count > 0 ? 'text-red-500' : 'text-kimi-600'}>
              {stats.overdue_count}
            </span>
            <span className="text-ink-faint mx-0.5">+</span>
            <span className={stats.unclaimed_count > 0 ? 'text-amber-500' : 'text-kimi-600'}>
              {stats.unclaimed_count}
            </span>
          </p>
          <p className="text-[10px] text-ink-faint">超期 + 待认领</p>
        </div>
      </button>
    </div>
  );
}

export type { Task };
