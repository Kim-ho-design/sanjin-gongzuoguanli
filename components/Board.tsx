'use client';

import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useState } from 'react';
import { TASK_STATUSES } from '@/lib/types';
import type { Task, TaskStatus } from '@/lib/types';
import TaskCard from './TaskCard';
import { PixelEmpty } from './Pixel';

// 五列 LED 状态灯配色
const COLUMN_THEME: Record<TaskStatus, { dot: string; glow: boolean; hint: string }> = {
  待办事项: { dot: '#22B8CF', glow: false, hint: '一次性小事' },
  待启动: { dot: '#64748B', glow: false, hint: '排队中' },
  进行中: { dot: '#3375F6', glow: true, hint: '正在推进' },
  待确认审核: { dot: '#F5A623', glow: true, hint: '交付待验收' },
  已完成: { dot: '#34D399', glow: false, hint: '验收通过' },
};

function Column({
  status,
  tasks,
  onOpen,
  onToggleToday,
  onComplete,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (t: Task) => void;
  onToggleToday: (t: Task) => void;
  onComplete: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  const theme = COLUMN_THEME[status];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col flex-1 min-w-[220px] panel ${
        isOver ? '!border-kimi-400 ring-1 ring-kimi-400/50' : ''
      } transition-all`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
        <span
          className={`w-2 h-2 rounded-full ${theme.glow ? 'led-glow' : ''}`}
          style={{ backgroundColor: theme.dot, color: theme.dot }}
        />
        <span className="text-xs font-bold tracking-wide">{status}</span>
        <span
          className="text-[9px] font-mono text-ink-faint hidden xl:inline cursor-help"
          title={
            status === '待办事项'
              ? '待办事项 = 一次性的小动作/提醒（约会议、发消息、过一遍东西），做完点卡片上的 ✓ 直接进已完成，不走流程。卡片需要有明确的计划时间。'
              : status === '待确认审核'
                ? '活干完交付了，等对方验收确认；验收通过 → 已完成'
                : status === '已完成'
                  ? '验收通过、尘埃落定'
                  : undefined
          }
        >
          {theme.hint}
        </span>
        <span className="ml-auto text-[10px] font-mono text-ink-faint">{tasks.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 min-h-[120px]">
        {tasks.length === 0 ? (
          <PixelEmpty text="EMPTY" />
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} onOpen={onOpen} onToggleToday={onToggleToday} onComplete={onComplete} />
          ))
        )}
      </div>
    </div>
  );
}

export default function Board({
  tasks,
  onOpen,
  onMove,
  onToggleToday,
  onComplete,
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  onToggleToday: (t: Task) => void;
  onComplete: (t: Task) => void;
}) {
  const [dragging, setDragging] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // 今日星标卡片置顶
  const sorted = [...tasks].sort((a, b) => (b.is_today ?? 0) - (a.is_today ?? 0));

  function handleDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current as { task: Task })?.task ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const task = (e.active.data.current as { task: Task })?.task;
    const overId = e.over?.id?.toString() ?? '';
    if (task && overId.startsWith('col-')) {
      const status = overId.slice(4) as TaskStatus;
      if (TASK_STATUSES.includes(status) && status !== task.status) {
        onMove(task, status);
      }
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 items-stretch flex-1">
        {TASK_STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={sorted.filter((t) => t.status === s)}
            onOpen={onOpen}
            onToggleToday={onToggleToday}
            onComplete={onComplete}
          />
        ))}
      </div>
      <DragOverlay>
        {dragging ? (
          <div className="w-56 line-card p-3 !border-kimi-400 shadow-lg shadow-kimi-500/20">
            <p className="text-[13px] font-medium">{dragging.name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
