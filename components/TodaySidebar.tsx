'use client';

import type { Task } from '@/lib/types';
import { PixelStar } from './Pixel';

/** 今日计划侧栏：常开/可关，不跳页面 */
export default function TodaySidebar({
  tasks,
  onOpen,
  onComplete,
  onClose,
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  onComplete: (t: Task) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const todayTasks = tasks
    .filter(
      (t) =>
        t.status !== '已完成' &&
        (t.is_today === 1 || t.planned_date === todayStr || t.deadline === todayStr),
    )
    .sort((a, b) => (b.is_today ?? 0) - (a.is_today ?? 0));

  function badge(t: Task) {
    if (t.is_today === 1) return <PixelStar size={11} />;
    if (t.deadline === todayStr)
      return <span className="text-[9px] font-mono text-red-500 border border-red-300 rounded px-1 leading-3">今天截止</span>;
    if (t.planned_date === todayStr)
      return <span className="text-[9px] font-mono text-kimi-600 border border-kimi-200 rounded px-1 leading-3">计划今天</span>;
    return null;
  }

  return (
    <aside className="w-72 shrink-0 panel self-start sticky top-4 max-h-[calc(100vh-180px)] flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
        <PixelStar size={15} />
        <span className="text-xs font-bold tracking-wide">今日计划</span>
        <span className="text-[10px] font-mono text-ink-faint">{todayTasks.length}</span>
        <button
          onClick={onClose}
          className="ml-auto text-ink-faint hover:text-ink text-sm leading-none px-1"
          title="收起"
        >
          ×
        </button>
      </div>
      <div className="overflow-y-auto p-2 flex-1">
        {todayTasks.length === 0 && (
          <p className="text-[11px] text-ink-faint text-center py-8 font-mono">
            今天没有安排
            <br />
            点卡片上的 ☆ 可加入今日
          </p>
        )}
        {todayTasks.map((t) => (
          <div
            key={t.id}
            onClick={() => onOpen(t)}
            className="line-card p-2.5 mb-1.5 cursor-pointer group"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-[2px] shrink-0" style={{ backgroundColor: t.project_color }} />
              <span className="text-[9px] text-ink-faint truncate">{t.project_name}</span>
              <span className="ml-auto flex items-center gap-1">
                {badge(t)}
                <button
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-emerald-500"
                  title="完成"
                  onClick={(e) => {
                    e.stopPropagation();
                    onComplete(t);
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M4.5 7l1.8 1.8L9.8 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </span>
            </div>
            <p className="text-[12px] leading-snug">{t.name}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
