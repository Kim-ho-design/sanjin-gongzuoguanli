// 看板聚合数据：一次拉齐前端所需
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { todayStr, isOverdue, weekCompletion } from '@/lib/utils';
import type { OverdueItem, Project, Task, Unclaimed } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const projects = db.prepare('SELECT * FROM projects ORDER BY id').all() as Project[];
  // 看板列只放父任务；子任务聚合成 sub_total/sub_done 计数挂在父任务上
  const tasks = db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color,
              (SELECT COUNT(*) FROM logs l WHERE l.task_id = t.id) AS log_count,
              (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id) AS sub_total,
              (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.status = '已完成') AS sub_done
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.parent_task_id IS NULL
       ORDER BY t.id DESC`,
    )
    .all() as Task[];
  // 子任务单独返回（今日计划/周视图按 planned_date 使用），带父任务名
  const subtasks = db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color, pt.name AS parent_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN tasks pt ON pt.id = t.parent_task_id
       WHERE t.parent_task_id IS NOT NULL
       ORDER BY t.id DESC`,
    )
    .all() as Task[];
  const unclaimed = db.prepare('SELECT * FROM unclaimed ORDER BY id DESC').all() as Unclaimed[];

  const today = todayStr();

  // 本周完成率（口径见 weekCompletion：父看 deadline、子看 planned_date，分子只认「已完成」）
  const { done: weekDone, total: weekPlan } = weekCompletion([...tasks, ...subtasks], today);

  // 顶部聚合条 3：漂流瓶 = 超期未动 + 待认领
  // 超期 = 父任务 deadline 过期 ∪ 子任务 planned_date 过期（子任务的计划日期即其截止语义）
  const overdueItems: OverdueItem[] = [
    ...tasks
      .filter((t) => isOverdue(t.deadline, t.status))
      .map((t) => ({
        kind: 'task' as const,
        id: t.id,
        name: t.name,
        date: t.deadline as string,
        project_color: t.project_color ?? null,
      })),
    ...subtasks
      .filter((t) => isOverdue(t.planned_date, t.status))
      .map((t) => ({
        kind: 'subtask' as const,
        id: t.id,
        parent_id: t.parent_task_id as number,
        name: t.name,
        parent_name: t.parent_name ?? '',
        date: t.planned_date as string,
        project_color: t.project_color ?? null,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date)); // 最久的超期排前面

  return NextResponse.json({
    projects,
    tasks,
    subtasks,
    unclaimed,
    overdue_items: overdueItems,
    stats: {
      week_plan: weekPlan,
      week_done: weekDone,
      overdue_count: overdueItems.length,
      unclaimed_count: unclaimed.length,
    },
  });
}
