// 密码门：未设置 ACCESS_PASSWORD 时完全放行
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, authToken } from '@/lib/auth';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Agent/CLI 通道：/api/* 带有效 Bearer token 直接放行
  // WORK_OS_API_TOKEN 支持逗号分隔多个 token（每个工具一把，可单独吊销）；未设置则不启用
  const apiTokens = (process.env.WORK_OS_API_TOKEN || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (apiTokens.length && pathname.startsWith('/api/')) {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ') && apiTokens.includes(auth.slice(7).trim())) {
      return NextResponse.next();
    }
  }

  const expected = authToken();
  if (!expected) return NextResponse.next();

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  if (req.cookies.get(AUTH_COOKIE)?.value === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|avatar.png).*)'],
};
