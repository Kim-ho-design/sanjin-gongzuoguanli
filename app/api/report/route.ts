// 周报生成：GET /api/report?date=YYYY-MM-DD&type=brief|full
import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/lib/report';
import { todayStr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || todayStr();
  const type = req.nextUrl.searchParams.get('type') === 'full' ? 'full' : 'brief';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date 格式应为 YYYY-MM-DD' }, { status: 400 });
  }
  const markdown = generateReport(date, type);
  return NextResponse.json({ markdown, type, date });
}
