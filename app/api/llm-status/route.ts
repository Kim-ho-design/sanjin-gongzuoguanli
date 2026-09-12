// DeepSeek 余额状态：服务端代理查询（key 不出服务端），内存缓存 5 分钟
// GET /api/llm-status          → 走缓存
// GET /api/llm-status?force=1  → 跳过缓存重新查
import { NextRequest, NextResponse } from 'next/server';
import { checkLlmStatus } from '@/lib/balance';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';
  return NextResponse.json(await checkLlmStatus(force));
}
