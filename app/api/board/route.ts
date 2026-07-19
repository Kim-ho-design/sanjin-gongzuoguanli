// 看板聚合数据：一次拉齐前端所需
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { todayStr, weekRange } from '@/lib/utils';
import type { Project, Task, Unclaimed } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const projects = db.prepare('SELECT * FROM projects ORDER BY id').all() as Project[];
  const tasks = db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color,
              (SELECT COUNT(*) FROM logs l WHERE l.task_id = t.id) AS log_count
       FROM tasks t JOIN projects p ON p.id = t.project_id
       ORDER BY t.id DESC`,
    )
    .all() as Task[];
  const unclaimed = db.prepare('SELECT * FROM unclaimed ORDER BY id DESC').all() as Unclaimed[];

  const today = todayStr();
  const { start, end } = weekRange(today);

  // 顶部聚合条 1：今日计划
  const todayTasks = tasks.filter(
    (t) =>
      t.status !== '已完成' &&
      (t.is_today === 1 || t.planned_date === today || t.deadline === today),
  );

  // 顶部聚合条 2：本周完成率
  // 口径（v6.1 收紧）：分母 = 对外截止 deadline 落在本周的任务（本周必须交付的事）
  // 分子 = 其中已出结果的（已完成/待确认审核）；只有个人计划、无对外承诺的任务不计入
  const weekPlanItems = tasks.filter(
    (t) => t.deadline && t.deadline >= start && t.deadline <= end,
  );
  const weekDone = weekPlanItems.filter(
    (t) => t.status === '已完成' || t.status === '待确认审核',
  );

  // 顶部聚合条 3：漂流瓶 = 超期未动 + 待认领
  const overdue = tasks.filter(
    (t) =>
      t.status !== '已完成' &&
      ((t.deadline && t.deadline < today) || (t.planned_date && t.planned_date < today)),
  );

  return NextResponse.json({
    projects,
    tasks,
    unclaimed,
    stats: {
      today_count: todayTasks.length,
      week_plan: weekPlanItems.length,
      week_done: weekDone.length,
      overdue_count: overdue.length,
      unclaimed_count: unclaimed.length,
    },
  });
}
