// 随手记月度复盘：GET /api/notes/summary?month=YYYY-MM（默认当月）
import { NextRequest, NextResponse } from 'next/server';
import { generateNotesSummary, isValidMonth } from '@/lib/notes';
import { todayStr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') || todayStr().slice(0, 7);
  if (!isValidMonth(month)) {
    return NextResponse.json({ error: 'month 格式应为 YYYY-MM' }, { status: 400 });
  }
  const { markdown, fallback } = await generateNotesSummary(month);
  return NextResponse.json({ month, markdown, fallback });
}
