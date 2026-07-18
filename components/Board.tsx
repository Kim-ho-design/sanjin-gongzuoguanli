'use client';

import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useState } from 'react';
import { TASK_STATUSES } from '@/lib/types';
import type { Task, TaskStatus } from '@/lib/types';
import TaskCard from './TaskCard';
import { PixelEmpty } from './Pixel';

// 五列低饱和配色（Kimi 蓝系延展）
const COLUMN_THEME: Record<TaskStatus, { bg: string; dot: string }> = {
  待启动: { bg: 'bg-slate-50/70', dot: '#94A3B8' },
  进行中: { bg: 'bg-kimi-50/70', dot: '#4D6BFE' },
  待确认审核: { bg: 'bg-amber-50/70', dot: '#F59E0B' },
  已完成: { bg: 'bg-emerald-50/70', dot: '#10B981' },
  归档: { bg: 'bg-gray-50/50', dot: '#C4CBE0' },
};

function Column({
  status,
  tasks,
  onOpen,
  onToggleToday,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (t: Task) => void;
  onToggleToday: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  const theme = COLUMN_THEME[status];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col flex-1 min-w-[220px] rounded-xl border border-line ${theme.bg} ${
        isOver ? 'ring-2 ring-kimi-400 border-kimi-300' : ''
      } transition-shadow`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line/70">
        <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: theme.dot }} />
        <span className="text-xs font-bold tracking-wide">{status}</span>
        <span className="ml-auto text-[10px] font-mono text-ink-faint">{tasks.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 min-h-[120px]">
        {tasks.length === 0 ? (
          <PixelEmpty text="EMPTY" />
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} onOpen={onOpen} onToggleToday={onToggleToday} />
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
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  onToggleToday: (t: Task) => void;
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
          />
        ))}
      </div>
      <DragOverlay>
        {dragging ? (
          <div className="w-56 line-card p-3 border-kimi-400 shadow-lg shadow-kimi-100">
            <p className="text-[13px] font-medium">{dragging.name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
