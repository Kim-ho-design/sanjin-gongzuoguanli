'use client';
// 脚本工作台前端共享件：行类型 + 账号/状态徽标 + 分账号 draft 结构与宽容解析（纯客户端，不 import 服务端 lib）
import type { ReactNode } from 'react';

/** 元信息行：label 固定宽左对齐，内容区通栏（B 端信息区） */
export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 shrink-0 text-xs font-medium text-ink-soft pt-2">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/** textarea 行数按内容自动估算（2~14 行） */
export function autoRows(v: string, min = 2, max = 14): number {
  const lines = v.split('\n').length;
  const est = Math.ceil(v.length / 56);
  return Math.max(min, Math.min(max, Math.max(lines, est)));
}
export interface ScriptRow {
  id: number;
  account: 'yizhanshi' | 'laiqiao';
  title: string;
  direction: string;
  notes: string | null;
  status: '写作中' | '初稿' | '定稿' | '已发布';
  is_sample: number;
  draft_date: string | null;
  final_date: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  version_count?: number;
}

export interface RefRow {
  id: number;
  url: string;
  title: string | null;
  fetched_content: string | null;
  fetch_status: 'pending' | 'ok' | 'failed';
  created_at: string;
}

export interface ExtraRow {
  id: number;
  type: 'caption' | 'tags' | 'comments';
  content: string;
  created_at: string;
}

export interface VersionRow {
  id: number;
  script_id: number;
  version_no: number;
  kind: 'ai_draft' | 'manual';
  content: string;
  created_at: string;
}

export interface ScriptDetailClient extends ScriptRow {
  linked_task_id: number | null;
  draft_task_id: number | null;
  final_task_id: number | null;
  content: string | null;
  refs: RefRow[];
  extras: ExtraRow[];
  extras_all: ExtraRow[];
}

export interface PromptProfileClient {
  account: 'yizhanshi' | 'laiqiao';
  base_prompt: string;
  auto_rules: string;
  auto_rules_updated_at: string | null;
  manual_notes: string;
  updated_at: string;
}

/* ---- 分账号 draft 结构（与生成 JSON 对齐；解析宽容缺字段，旧 sections 格式自动合并为一体文档） ---- */
export interface YzSectionLegacy {
  node_label: string;
  narration: string;
  subtitle: string;
  visual: string;
}

export interface YzDraft {
  cover_title: string;
  positioning: string;
  framework: string;
  audience: string;
  keywords: string[];
  body: string;
  progress_nodes: string[];
  end_card: string;
}

export interface LqRow {
  node_label: string;
  voiceover: string;
  visual: string;
  subtitle: string;
  note: string;
}

export interface LqDraft {
  cover_title: string;
  post_title: string;
  rows: LqRow[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 客户端口播字数：去掉（）与【】注释、空白（与 lib/script-content.ts countSpeakable 同款规则） */
export function speakableCount(text: string): number {
  return text
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[【\[][^】\]]*[】\]]/g, '')
    .replace(/\s/g, '').length;
}

export function parseYzDraft(text: string | null): YzDraft {
  let o: Record<string, unknown> = {};
  if (text) {
    try {
      o = JSON.parse(text) as Record<string, unknown>;
    } catch {
      o = {};
    }
  }
  let body = str(o.body);
  const progress_nodes = Array.isArray(o.progress_nodes) ? o.progress_nodes.map(str).filter(Boolean) : [];
  // 旧格式：sections[{node_label, narration, subtitle, visual}] → 一体 body（字幕/画面以括注跟在对应内容后）
  if (!body && Array.isArray(o.sections)) {
    const parts: string[] = [];
    for (const s of o.sections as Record<string, unknown>[]) {
      const narration = str(s?.narration).trim();
      if (!narration) continue;
      const subtitle = str(s?.subtitle).trim();
      const visual = str(s?.visual).trim();
      parts.push(
        subtitle ? `${narration}（字幕：${subtitle}）` : narration,
        ...(visual ? [`（画面：${visual}）`] : []),
      );
      const label = str(s?.node_label).trim();
      if (label && !progress_nodes.includes(label)) progress_nodes.push(label);
    }
    body = parts.join('\n');
  }
  return {
    cover_title: str(o.cover_title),
    positioning: str(o.positioning),
    framework: str(o.framework),
    audience: str(o.audience),
    keywords: Array.isArray(o.keywords) ? o.keywords.map(str).filter(Boolean) : [],
    body,
    progress_nodes,
    end_card: str(o.end_card),
  };
}

export function parseLqDraft(text: string | null): LqDraft {
  let o: Record<string, unknown> = {};
  if (text) {
    try {
      o = JSON.parse(text) as Record<string, unknown>;
    } catch {
      o = {};
    }
  }
  const rows = Array.isArray(o.rows)
    ? (o.rows as Record<string, unknown>[]).map((r) => ({
        // 旧版曾把 visual 并入 note 的数据不拆回（note_images 忽略）
        node_label: str(r?.node_label),
        voiceover: str(r?.voiceover),
        visual: str(r?.visual),
        subtitle: str(r?.subtitle),
        note: str(r?.note),
      }))
    : [];
  return {
    cover_title: str(o.cover_title),
    post_title: str(o.post_title),
    rows: rows.length
      ? rows
      : [{ node_label: '', voiceover: '', visual: '', subtitle: '', note: '' }],
  };
}

/* ---- 徽标 ---- */
export const ACCOUNT_META: Record<
  ScriptRow['account'],
  { label: string; shortDesc: string; badge: string }
> = {
  yizhanshi: {
    label: '一站式',
    shortDesc: '抖音 · 口播干货，约 1 分钟',
    badge: 'bg-kimi-50 text-kimi-700 border-kimi-200',
  },
  laiqiao: {
    label: '徕乔',
    shortDesc: '视频号 · 分镜种草，30~45 秒',
    badge: 'bg-[#F5EDFC] text-[#7A4FB3] border-[#E5D3F7]',
  },
};

export const STATUS_STYLE: Record<ScriptRow['status'], string> = {
  写作中: 'bg-[#F0F1F3] text-ink-soft',
  初稿: 'bg-kimi-50 text-kimi-600',
  定稿: 'bg-[#EAF7E8] text-[#3E7F36]',
  已发布: 'bg-[#DFF0DC] text-[#2F6B2A]',
};

export const STATUS_OPTIONS: ScriptRow['status'][] = ['写作中', '初稿', '定稿', '已发布'];

export const EXTRA_TYPE_META: Record<ExtraRow['type'], { label: string; genLabel: string }> = {
  caption: { label: '发布文案', genLabel: '生成发布文案' },
  tags: { label: 'Tags', genLabel: '生成 Tags' },
  comments: { label: '水军评论（10条）', genLabel: '生成水军评论' },
};

export function AccountBadge({ account }: { account: ScriptRow['account'] }) {
  const meta = ACCOUNT_META[account];
  return (
    <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: ScriptRow['status'] }) {
  return (
    <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}
