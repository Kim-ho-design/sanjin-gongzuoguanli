// 周报生成：GET /api/report?start=YYYY-MM-DD&end=YYYY-MM-DD&type=brief|full
// format=data 时只返回原始聚合 JSON（不经 LLM），供 agent 自行组织周报/统计
import { NextRequest, NextResponse } from 'next/server';
import { collectReportData, generateReport } from '@/lib/report';
import { todayStr, addDays } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const end = req.nextUrl.searchParams.get('end') || todayStr();
  const start = req.nextUrl.searchParams.get('start') || addDays(end, -6); // 默认近7天
  const type = req.nextUrl.searchParams.get('type') === 'full' ? 'full' : 'brief';
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ error: '日期格式应为 YYYY-MM-DD' }, { status: 400 });
  }
  if (start > end) {
    return NextResponse.json({ error: '开始日期不能晚于结束日期' }, { status: 400 });
  }
  if (req.nextUrl.searchParams.get('format') === 'data') {
    return NextResponse.json({ data: collectReportData(start, end), start, end });
  }
  const { markdown, fallback } = await generateReport(start, end, type);
  return NextResponse.json({ markdown, fallback, type, start, end });
}
