// 随手记：列表（GET ?month=YYYY-MM，默认当月）+ 新增（POST）
import { NextRequest, NextResponse } from 'next/server';
import { addNote, isValidMonth, listNotes } from '@/lib/notes';
import { isValidDateStr, todayStr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const MAX_LEN = 500;

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') || todayStr().slice(0, 7);
  if (!isValidMonth(month)) {
    return NextResponse.json({ error: 'month 格式应为 YYYY-MM' }, { status: 400 });
  }
  return NextResponse.json({ month, notes: listNotes(month) });
}

export async function POST(req: NextRequest) {
  let body: { content?: unknown; note_date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体应为 JSON' }, { status: 400 });
  }
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json({ error: '内容不能为空' }, { status: 400 });
  }
  if (content.length > MAX_LEN) {
    return NextResponse.json({ error: `内容最长 ${MAX_LEN} 字` }, { status: 400 });
  }
  const noteDate = body.note_date ?? todayStr();
  if (typeof noteDate !== 'string' || !isValidDateStr(noteDate)) {
    return NextResponse.json({ error: 'note_date 格式应为 YYYY-MM-DD' }, { status: 400 });
  }
  return NextResponse.json({ note: addNote(content, noteDate) });
}
