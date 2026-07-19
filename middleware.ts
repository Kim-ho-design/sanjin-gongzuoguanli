// 密码门：未设置 ACCESS_PASSWORD 时完全放行
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, authToken } from '@/lib/auth';

export function middleware(req: NextRequest) {
  const expected = authToken();
  if (!expected) return NextResponse.next();

  const { pathname } = req.nextUrl;
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
