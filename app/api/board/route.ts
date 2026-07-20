// 看板聚合数据：一次拉齐前端所需
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { todayStr, isOverdue, weekCompletion } from '@/lib/utils';
import type { Project, Task, Unclaimed } from '@/lib/types';

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

  // 顶部聚合条 1：今日计划 = 星标/今天截止的父任务 + 计划今天且未完成的子任务
  const todayCount =
    tasks.filter((t) => t.status !== '已完成' && (t.is_today === 1 || t.deadline === today)).length +
    subtasks.filter((t) => t.status !== '已完成' && t.planned_date === today).length;

  // 顶部聚合条 2：本周完成率（口径见 weekCompletion：只数父任务，分子只认「已完成」）
  const { done: weekDone, total: weekPlan } = weekCompletion(tasks, today);

  // 顶部聚合条 3：漂流瓶 = 超期未动（只认 deadline）+ 待认领
  const overdue = tasks.filter((t) => isOverdue(t.deadline, t.status));

  return NextResponse.json({
    projects,
    tasks,
    subtasks,
    unclaimed,
    stats: {
      today_count: todayCount,
      week_plan: weekPlan,
      week_done: weekDone,
      overdue_count: overdue.length,
      unclaimed_count: unclaimed.length,
    },
  });
}
