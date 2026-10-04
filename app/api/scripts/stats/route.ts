// 脚本统计：GET /api/scripts/stats（静态段优先于 [id]）
import { NextResponse } from 'next/server';
import { collectScriptStats } from '@/lib/scripts';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ stats: collectScriptStats() });
}
