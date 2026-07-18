// 共享类型定义（前后端通用）

export const TASK_STATUSES = ['待启动', '进行中', '待确认审核', '已完成', '归档'] as const;
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

export interface ParsedTask {
  name: string;
  matched_existing: boolean;
  status: string;
  deadline: string | null;
  planned_date: string | null;
  is_plan_item: boolean;
  parent_task_name: string | null;
}

export interface ParsedLog {
  content: string;
  duration_hours: number | null;
  deliverable: string;
  blocker: string;
}

export interface ParseResult {
  intent: ParseIntent;
  project: ParsedProject;
  tasks: ParsedTask[];
  log: ParsedLog;
  needs_confirmation: boolean;
  clarify_question: string;
}
