// 状态变更的级联语义（v9）：父任务完成 ↔ 未完成子任务一并完成/恢复
// PATCH 路由与语言解析入库（apply）共用，保证两条完成路径数据形态一致（审查修复 M1）
import { getDb } from './db';

/** 父任务标记完成：未完成的子任务一并完成，原状态存入 prev_status 供重新打开时恢复 */
export function cascadeCompleteChildren(parentId: number, at: string): void {
  getDb()
    .prepare(
      `UPDATE tasks SET prev_status = status, status = '已完成', completed_at = ?
       WHERE parent_task_id = ? AND status != '已完成'`,
    )
    .run(at, parentId);
}

/** 父任务重新打开：把上次被级联完成的子任务恢复到各自原状态（手动完成的不动） */
export function restoreCascadeChildren(parentId: number): void {
  getDb()
    .prepare(
      `UPDATE tasks SET status = prev_status, completed_at = NULL, prev_status = NULL
       WHERE parent_task_id = ? AND prev_status IS NOT NULL AND status = '已完成'`,
    )
    .run(parentId);
}
