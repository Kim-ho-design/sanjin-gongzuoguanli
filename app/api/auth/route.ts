// 访问口令登录 / 登出（cookie 会话）
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, authToken, tokenFor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const expected = authToken();
  if (!expected) return NextResponse.json({ ok: true }); // 未设口令，直接放行
  const { password } = (await req.json()) as { password?: string };
  if (tokenFor(password ?? '') !== expected) {
    return NextResponse.json({ error: '口令错误' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, expected, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 天
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
