/** Eisenhower quadrants: null means unset, or inherit for a child. */
export type Priority = 1 | 2 | 3 | 4;
export const PRIORITY_LABELS: Record<Priority, string> = {
  1: '重要且紧急', 2: '重要不紧急', 3: '紧急不重要', 4: '不紧急不重要',
};
export function isPriority(value: unknown): value is Priority | null {
  return value === null || value === 1 || value === 2 || value === 3 || value === 4;
}
export function effectivePriority(task: { priority?: Priority | null; parent_task_id?: number | null }, parent?: { priority?: Priority | null } | null): Priority | null {
  return task.priority ?? (task.parent_task_id != null ? parent?.priority ?? null : null);
}
