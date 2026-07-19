// 周报生成：GET /api/report?start=YYYY-MM-DD&end=YYYY-MM-DD&type=brief|full
import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/lib/report';
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
  const markdown = generateReport(start, end, type);
  return NextResponse.json({ markdown, type, start, end });
}
