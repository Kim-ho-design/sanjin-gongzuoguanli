'use client';

import { useEffect, useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Task } from '@/lib/types';
import { weekRange, addDays, todayStr, weekdayCn, isOverdue } from '@/lib/utils';

/** 周视图主视图：父任务按 deadline 落列、子任务按 planned_date 落列，可拖拽改日期
 *  移动端（v14 起）：七列改为单列长列表（按天纵向排列），触摸拖拽关闭，改走详情卡片操作 */
const DAY_EN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** 触屏判定（pointer: coarse）：决定是否禁用拖拽 */
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setCoarse(mq.matches);
    const fn = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return coarse;
}

export default function WeekView({
  tasks,
  subtasks = [],
  onOpen,
  onMoveDate,
  onToggle,
}: {
  tasks: Task[];
  subtasks?: Task[];
  onOpen: (id: number) => void;
  onMoveDate: (task: Task, date: string | null) => void;
  onToggle: (task: Task) => void;
}) {
  const [anchor, setAnchor] = useState(todayStr()); // displayed week 内的任意一天
  const [dragging, setDragging] = useState<Task | null>(null);
  const [laneOpen, setLaneOpen] = useState(false);
  const coarse = useCoarsePointer();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const today = todayStr();
  const { start, end } = weekRange(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const parentById = new Map(tasks.map((t) => [t.id, t]));

  // 按天归组：父任务按 deadline、子任务按 planned_date（排序在渲染合并单元时做）
  const byDay = new Map<string, Task[]>(days.map((d) => [d, []]));
  for (const t of tasks) {
    if (t.deadline && byDay.has(t.deadline)) byDay.get(t.deadline)!.push(t);
  }
  for (const s of subtasks) {
    if (s.planned_date && byDay.has(s.planned_date)) byDay.get(s.planned_date)!.push(s);
  }

  // 未排期：真正没有日期的未完结任务（父无 deadline / 子无 planned_date），与显示哪一周无关
  const unscheduled = [
    ...tasks.filter((t) => !t.deadline && t.status !== '已完成'),
    ...subtasks.filter((s) => !s.planned_date && s.status !== '已完成'),
  ];
  // 未排期栏是"现在"的排期工具：翻看非本周时隐藏（避免与历史/未来周的任务混淆）
  const isCurrentWeek = start <= today && today <= end;

  // 拖欠：日期早于当前显示周周一的未完结任务（超期超过一周也能捞回，可拖入本周排期）
  const backlog = [
    ...tasks.filter((t) => t.deadline && t.deadline < start && t.status !== '已完成'),
    ...subtasks.filter((s) => s.planned_date && s.planned_date < start && s.status !== '已完成'),
  ];

  function shiftWeek(delta: number) {
    setAnchor(addDays(anchor, delta * 7));
  }

  function handleDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current as { task: Task })?.task ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const task = (e.active.data.current as { task: Task })?.task;
    const overId = e.over?.id?.toString() ?? '';
    if (!task) return;
    if (overId.startsWith('day-')) onMoveDate(task, overId.slice(4));
    else if (overId === 'unscheduled') onMoveDate(task, null);
  }

  /** ✓ 快速完成切换（桌面 hover 显现 / 触屏常驻放大，已完成时始终常驻）；阻止冒泡避免触发拖拽/打开详情 */
  function ToggleBtn({ t, small }: { t: Task; small?: boolean }) {
    const done = t.status === '已完成';
    const sizeCls = small ? 'w-3 h-3' : coarse ? 'w-5 h-5' : 'w-3.5 h-3.5';
    return (
      <button
        title={done ? '重新打开' : '标记完成'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(t);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`rounded-[3px] border flex items-center justify-center shrink-0 transition-opacity ${sizeCls} ${
          done
            ? 'bg-bean-green border-bean-green text-white'
            : `border-line text-transparent hover:!border-bean-green hover:!text-bean-green ${
                coarse ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`
        }`}
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path d="M2 5.2l2 2L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  /** 卡片：subs 非空时为父子合并卡（父为主标题，子任务缩进小字行，整卡随父拖拽） */
  function Card({ t, subs = [] }: { t: Task; subs?: Task[] }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: `card-${t.id}`,
      data: { task: t },
    });
    const isSub = t.parent_task_id !== null;
    const done = t.status === '已完成';
    const date = isSub ? t.planned_date : t.deadline;
    const overdue = isOverdue(date, t.status);
    // 子任务计划日期超出父任务 deadline → 警示徽标
    const parent = isSub ? parentById.get(t.parent_task_id as number) : undefined;
    const beyondParent = !!parent?.deadline && !!t.planned_date && t.planned_date > parent.deadline && !done;
    return (
      <div
        ref={setNodeRef}
        {...(coarse ? {} : listeners)}
        {...attributes}
        style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, opacity: isDragging ? 0.35 : 1 }}
        onClick={() => onOpen(isSub ? (t.parent_task_id as number) : t.id)}
        className={`line-card card-lift group w-full text-left p-2 mb-1.5 select-none ${
          coarse ? 'cursor-pointer max-md:p-3' : 'cursor-grab active:cursor-grabbing'
        } ${done ? 'opacity-45' : ''} ${overdue || beyondParent ? '!border-bean-orange/60 !bg-bean-orange/10' : ''}`}
      >
        <div className="flex items-center gap-1 mb-0.5">
          <span className="w-1.5 h-1.5 rounded-[2px] shrink-0" style={{ backgroundColor: t.project_color || '#007CFF' }} />
          <span className="text-[9px] max-md:text-[10px] text-ink-faint truncate">{t.project_name}</span>
          <span className="ml-auto shrink-0">
            <ToggleBtn t={t} />
          </span>
        </div>
        <p className={`text-[11px] max-md:text-[13px] text-ink leading-snug ${done ? 'line-through' : ''}`}>
          {isSub && t.parent_name && t.parent_name !== t.name ? `${t.parent_name} › ` : ''}
          {t.name}
        </p>
        {(overdue || beyondParent) && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {overdue && (
              <span className="text-[9px] font-mono text-bean-orange border border-bean-orange/60 bg-bean-orange/10 rounded px-1 leading-3 overdue-pulse">
                超期⚠
              </span>
            )}
            {beyondParent && (
              <span className="text-[9px] font-mono text-bean-orange border border-bean-orange/60 bg-bean-orange/10 rounded px-1 leading-3">
                超出父截止⚠
              </span>
            )}
          </div>
        )}

        {/* 合并卡的子任务行（同一天，不重复显示日期；只显示子任务名，不重复父名） */}
        {subs.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-line space-y-1">
            {subs.map((s) => {
              const sDone = s.status === '已完成';
              const sOverdue = isOverdue(s.planned_date, s.status);
              const sBeyond = !!t.deadline && !!s.planned_date && s.planned_date > t.deadline && !sDone;
              return (
                <div key={s.id} className="flex items-center gap-1.5 group/sub">
                  <ToggleBtn t={s} small />
                  <span className={`text-[10px] leading-snug truncate ${sDone ? 'line-through text-ink-faint' : 'text-ink-soft'}`}>
                    {s.name}
                  </span>
                  {(sOverdue || sBeyond) && (
                    <span className="ml-auto text-[9px] font-mono text-bean-orange font-bold shrink-0">⚠</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function DayColumn({ d, dayEn }: { d: string; dayEn: string }) {
    const { setNodeRef, isOver } = useDroppable({ id: `day-${d}` });
    const isToday = d === today;
    const isPast = d < today;
    const items = byDay.get(d) ?? [];
    // 父子同日合并：父任务与其落在同一天的子任务合并为一个渲染单元；其余子任务独立成卡
    const parents = items.filter((t) => t.parent_task_id === null);
    const subsHere = items.filter((t) => t.parent_task_id !== null);
    const parentIds = new Set(parents.map((p) => p.id));
    const units = [
      ...parents.map((p) => ({ task: p, subs: subsHere.filter((s) => s.parent_task_id === p.id) })),
      ...subsHere.filter((s) => !parentIds.has(s.parent_task_id as number)).map((s) => ({ task: s, subs: [] as Task[] })),
    ].sort((a, b) => Number(a.task.status === '已完成') - Number(b.task.status === '已完成')); // 已完成沉底
    return (
      <div
        ref={setNodeRef}
        className={`panel rounded-3xl flex flex-col min-w-[150px] max-md:min-w-0 transition-all ${
          isToday ? 'today-col breathe-glow' : isOver ? '!border-kimi-400 ring-1 ring-kimi-400/50' : ''
        }`}
      >
        <div className={`px-2.5 py-2 max-md:px-3.5 max-md:py-2.5 border-b border-line flex items-baseline gap-1.5 ${isPast && !isToday ? 'opacity-60' : ''}`}>
          <span className={`text-xs max-md:text-sm font-bold ${isToday ? 'text-kimi-600' : ''}`}>{weekdayCn(d)}</span>
          <span className="text-[8px] font-mono tracking-[0.18em] text-ink-faint/70">{dayEn}</span>
          <span className="text-[10px] max-md:text-xs font-mono text-ink-faint">{d.slice(5)}</span>
          {isToday && (
            <span className="text-[9px] font-mono text-white bg-kimi-500 rounded px-1 leading-3 ml-auto">今天</span>
          )}
        </div>
        <div className="p-1.5 max-md:p-2 min-h-[100px] max-md:min-h-0 flex-1">
          {units.length === 0 && (
            <p className="text-[10px] font-mono text-center pt-6 max-md:pt-0 max-md:pb-2 text-ink-faint/50">—</p>
          )}
          {units.map((u) => (
            <Card key={`${u.task.parent_task_id ? 's' : 't'}-${u.task.id}`} t={u.task} subs={u.subs} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="panel rounded-3xl p-4 max-md:p-3">
      {/* 周导航 */}
      <div className="flex items-center flex-wrap gap-3 max-md:gap-2 mb-3">
        <button onClick={() => shiftWeek(-1)} className="text-ink-faint hover:text-kimi-600 px-2 text-lg">‹</button>
        <div>
          <p className="font-mono text-sm font-bold tracking-wider">
            {start.slice(5)} {weekdayCn(start)} ~ {end.slice(5)} {weekdayCn(end)}
          </p>
          <p className="text-[9px] font-mono tracking-[0.28em] text-ink-faint/70 mt-0.5">
            WEEK · {start.slice(5).replace('-', '.')}—{end.slice(5).replace('-', '.')}
          </p>
        </div>
        <button onClick={() => shiftWeek(1)} className="text-ink-faint hover:text-kimi-600 px-2 text-lg">›</button>
        {anchor !== today && (
          <button
            onClick={() => setAnchor(today)}
            className="text-[11px] border border-line rounded-full px-2.5 py-0.5 text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors"
          >
            回到本周
          </button>
        )}
        {isCurrentWeek && (
          <button
            onClick={() => setLaneOpen((v) => !v)}
            className={`ml-auto text-[11px] border rounded-full px-2.5 py-0.5 font-mono transition-colors ${
              laneOpen || unscheduled.length > 0
                ? 'border-bean-orange/60 text-bean-orange'
                : 'border-line text-ink-faint hover:border-kimi-400'
            }`}
            title="无日期的任务，可拖入日期列排期"
          >
            未排期 {unscheduled.length} {laneOpen ? '▾' : '▸'}
          </button>
        )}
      </div>

      {/* 未排期栏 + 七天列（同一 DndContext；翻周淡入过渡；移动端单列纵排） */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* 拖欠横条：日期早于本周一的任务，可拖入本周某天 */}
        {backlog.length > 0 && (
          <div className="mb-2 rounded-2xl border border-bean-orange/40 bg-bean-orange/10 px-3 py-2">
            <p className="text-[10px] font-mono text-bean-orange tracking-wider mb-1.5">
              拖欠（{backlog.length}）{coarse ? '· 点开卡片可改日期' : '· 拖到某天完成排期'}
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 max-md:flex-col max-md:overflow-visible">
              {backlog.map((t) => (
                <div key={`b-${t.parent_task_id ? 's' : 't'}-${t.id}`} className="w-44 shrink-0 max-md:w-full">
                  <Card t={t} />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 items-start max-md:flex-col">
          {laneOpen && isCurrentWeek && <UnscheduledLane items={unscheduled} Card={Card} />}
          <div key={start} className="week-enter grid grid-cols-7 max-md:grid-cols-1 gap-2 flex-1 max-md:w-full items-start overflow-x-auto max-md:overflow-visible">
            {days.map((d, i) => (
              <DayColumn key={d} d={d} dayEn={DAY_EN[i]} />
            ))}
          </div>
        </div>
        <DragOverlay>
          {dragging ? (
            <div className="w-44 line-card p-2 !border-kimi-400 shadow-lg shadow-kimi-500/20 dragging-tilt">
              <p className="text-[11px] font-medium">
                {dragging.parent_task_id && dragging.parent_name ? `${dragging.parent_name} › ` : ''}
                {dragging.name}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/** 未排期栏：无日期任务集合，可拖入日期列；拖回此栏=取消排期 */
function UnscheduledLane({ items, Card }: { items: Task[]; Card: (props: { t: Task }) => JSX.Element }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' });
  return (
    <div
      ref={setNodeRef}
      className={`panel rounded-3xl w-44 max-md:w-full shrink-0 p-2 max-h-[420px] overflow-y-auto ${isOver ? '!border-kimi-400 ring-1 ring-kimi-400/50' : ''}`}
    >
      <p className="text-[10px] font-mono text-ink-faint tracking-wider px-1 pb-1.5 border-b border-line mb-1.5">
        未排期（{items.length}）
      </p>
      {items.length === 0 && <p className="text-[10px] font-mono text-ink-faint/50 text-center py-4">—</p>}
      {items.map((t) => (
        <Card key={`u-${t.parent_task_id ? 's' : 't'}-${t.id}`} t={t} />
      ))}
    </div>
  );
}
