'use client';

import type { Task } from '@/lib/types';
import { groupTodayItems } from '@/lib/utils';
import { PixelStar } from './Pixel';

/** 今日计划侧栏：常开/可关，不跳页面。子任务并入父任务卡片展示 */
export default function TodaySidebar({
  tasks,
  subtasks = [],
  onOpen,
  onComplete,
  onClose,
}: {
  tasks: Task[];
  subtasks?: Task[];
  onOpen: (t: Task) => void;
  onComplete: (t: Task) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const groups = groupTodayItems(tasks, subtasks, today);
  const totalCount = groups.reduce((n, g) => n + 1 + g.subs.length, 0);

  function badge(t: Task) {
    if (t.is_today === 1) return <PixelStar size={11} />;
    if (t.deadline === today)
      return <span className="text-[9px] font-mono text-red-500 border border-red-300 rounded px-1 leading-3">今天截止</span>;
    return null;
  }

  return (
    <aside className="w-72 shrink-0 panel self-start sticky top-4 max-h-[calc(100vh-180px)] flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
        <PixelStar size={15} />
        <span className="text-xs font-bold tracking-wide">今日计划</span>
        <span className="text-[10px] font-mono text-ink-faint">{totalCount}</span>
        <button
          onClick={onClose}
          className="ml-auto text-ink-faint hover:text-ink text-sm leading-none px-1"
          title="收起"
        >
          ×
        </button>
      </div>
      <div className="overflow-y-auto p-2 flex-1">
        {groups.length === 0 && (
          <p className="text-[11px] text-ink-faint text-center py-8 font-mono">
            今天没有安排
            <br />
            点卡片上的 ☆ 可加入今日
          </p>
        )}
        {groups.map(({ task: t, subs }) => (
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
                {t.status !== '已完成' && (
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
                )}
              </span>
            </div>
            <p className="text-[12px] leading-snug">{t.name}</p>
            {/* 今日到期的子任务，缩进小字并入父卡片 */}
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-1 mt-1 ml-2 group/sub">
                <span className="text-[9px] font-mono text-kimi-600 border border-kimi-200 rounded px-1 leading-3 shrink-0">计划今天</span>
                <span className="text-[11px] text-ink-soft truncate">{s.name}</span>
                <button
                  className="ml-auto opacity-0 group-hover/sub:opacity-60 hover:!opacity-100 transition-opacity text-emerald-500 shrink-0"
                  title="完成"
                  onClick={(e) => {
                    e.stopPropagation();
                    onComplete(s);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M4.5 7l1.8 1.8L9.8 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
