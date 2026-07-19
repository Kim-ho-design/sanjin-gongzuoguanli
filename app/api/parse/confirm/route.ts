// 解析确认：用户确认/纠正后落库
import { NextRequest, NextResponse } from 'next/server';
import { applyParseResult } from '@/lib/apply';
import { validateParseResult } from '@/lib/llm';
import type { ParseResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      raw_text?: string;
      parsed?: unknown;
      project_choice?: { mode: 'existing'; project_id: number } | { mode: 'new'; name: string } | null;
      task_projects?: ({ mode: 'existing'; project_id: number } | null)[];
    };
    if (!body.raw_text || !body.parsed) {
      return NextResponse.json({ error: '缺少 raw_text 或 parsed' }, { status: 400 });
    }
    const parsed = validateParseResult(body.parsed) as ParseResult;
    // 逐任务项目覆盖：只认 existing 模式 + 数字 id，其余按 null（跟随整体项目）
    const taskProjects = Array.isArray(body.task_projects)
      ? body.task_projects.map((tp) =>
          tp && tp.mode === 'existing' && Number.isFinite(tp.project_id)
            ? { mode: 'existing' as const, project_id: Number(tp.project_id) }
            : null,
        )
      : undefined;
    const summary = applyParseResult(body.raw_text, parsed, body.project_choice ?? null, taskProjects);
    return NextResponse.json({ summary });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '写入失败，请重试' }, { status: 500 });
  }
}
