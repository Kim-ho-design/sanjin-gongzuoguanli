'use client';

import { useDraggable } from '@dnd-kit/core';
import type { Task } from '@/lib/types';
import { isOverdue, weekdayCn } from '@/lib/utils';
import { PixelStar } from './Pixel';

export default function TaskCard({
  task,
  onOpen,
  onToggleToday,
  onComplete,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  onToggleToday: (task: Task) => void;
  onComplete: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
  });

  const overdue = isOverdue(task.deadline, task.status) || isOverdue(task.planned_date, task.status);
  // 既有对外截止又有提前的个人计划 → 需前置完成
  const needAhead =
    !!task.deadline && !!task.planned_date && task.planned_date < task.deadline && task.status !== '已完成';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: isDragging ? 0.35 : 1,
      }}
      className={`line-card p-3 mb-2 cursor-grab active:cursor-grabbing select-none group ${
        overdue ? '!border-red-300 !bg-red-50' : ''
      } ${task.is_today ? 'ring-1 ring-amber-400/60' : ''}`}
      onClick={() => onOpen(task)}
    >
      {/* 项目色标 + 今日星标 */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="w-2 h-2 rounded-[2px] shrink-0"
          style={{ backgroundColor: task.project_color || '#3375F6' }}
        />
        <span className="text-[10px] text-ink-faint truncate">{task.project_name}</span>
        {task.is_plan_item === 1 && (
          <span className="text-[9px] font-mono text-kimi-600 border border-kimi-200 rounded px-1 leading-3 shrink-0">
            计划
          </span>
        )}
        {needAhead && (
          <span className="text-[9px] font-mono text-white bg-kimi-500 rounded px-1 leading-3 shrink-0">
            需前置完成
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {task.status !== '已完成' && (
            <button
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-emerald-500 hover:text-emerald-600"
              title="完成（一键进已完成）"
              onClick={(e) => {
                e.stopPropagation();
                onComplete(task);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4.5 7l1.8 1.8L9.8 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            className={`transition-opacity ${
              task.is_today ? 'opacity-100' : 'opacity-0 group-hover:opacity-40 hover:!opacity-100'
            }`}
            title={task.is_today ? '移出今日' : '加入今日'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleToday(task);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <PixelStar size={13} color={task.is_today ? '#F5A623' : '#C4CBE0'} />
          </button>
        </span>
      </div>

      <p className="text-[13px] font-medium leading-snug text-ink">{task.name}</p>

      {/* 日期行 */}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
        {task.deadline && (
          <span className={`text-[10px] font-mono ${overdue ? 'text-red-500 font-bold' : 'text-ink-soft'}`}>
            截止 {task.deadline.slice(5)} {weekdayCn(task.deadline)}
            {overdue && ' ⚠'}
          </span>
        )}
        {task.planned_date && (
          <span className="text-[10px] font-mono text-kimi-600">
            计划 {task.planned_date.slice(5)} {weekdayCn(task.planned_date)}
          </span>
        )}
        {(task.log_count ?? 0) > 0 && (
          <span className="text-[10px] font-mono text-ink-faint ml-auto">✎{task.log_count}</span>
        )}
      </div>
    </div>
  );
}
