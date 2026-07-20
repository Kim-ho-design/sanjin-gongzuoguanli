// 共享类型定义（前后端通用）

export const TASK_STATUSES = ['待办事项', '待启动', '进行中', '待确认审核', '已完成'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PROJECT_STATUSES = ['进行中', '暂停', '完结'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: number;
  name: string;
  status: ProjectStatus;
  color: string;
  created_at: string;
}

export interface Task {
  id: number;
  name: string;
  project_id: number;
  status: TaskStatus;
  deadline: string | null;
  /** @deprecated 父任务不再有计划日期，计划时间由子任务承接（DB 列保留，仅子任务使用） */
  planned_date: string | null;
  is_plan_item: number;
  parent_task_id: number | null;
  is_today: number;
  created_at: string;
  completed_at: string | null;
  // 关联查询补充字段
  project_name?: string;
  project_color?: string;
  log_count?: number;
  sub_total?: number;
  sub_done?: number;
  parent_name?: string;
}

export interface Log {
  id: number;
  task_id: number;
  raw_text: string;
  parsed: string | null;
  duration_hours: number | null;
  blocker: string | null;
  created_at: string;
}

export interface Deliverable {
  id: number;
  task_id: number;
  name: string;
  link: string | null;
  created_at: string;
}

export interface Unclaimed {
  id: number;
  raw_text: string;
  parsed: string | null;
  created_at: string;
}

// ---- LLM 解析层 schema（需求文档 4.1，锁死） ----

export type ParseIntent =
  | 'create_task'
  | 'update_task'
  | 'log_progress'
  | 'set_plan'
  | 'weekly_review'
  | 'unclear';

export interface ParsedProject {
  name: string;
  is_new: boolean;
  confidence: number;
}

export interface ParsedSubtask {
  name: string;
  planned_date: string | null;
}

export interface ParsedTask {
  name: string;
  matched_existing: boolean;
  status: string;
  deadline: string | null;
  parent_task_name: string | null;
  /** 子任务：LLM 不输出，确认卡片里手动增删，validate 时兜底为空数组 */
  subtasks: ParsedSubtask[];
}

export interface ParsedLog {
  content: string;
  /** 补记日期（YYYY-MM-DD）：用户提到"昨天/上周X"等过去时间时由 LLM 推断，没提则为 null（默认今天） */
  date: string | null;
}

export interface ParseResult {
  intent: ParseIntent;
  project: ParsedProject;
  tasks: ParsedTask[];
  log: ParsedLog;
  needs_confirmation: boolean;
  clarify_question: string;
}
