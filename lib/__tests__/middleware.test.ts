// middleware 鉴权测试：Bearer token 通道（agent/CLI）+ 既有 cookie 密码门
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env.ACCESS_PASSWORD = 'test-pw';
  process.env.WORK_OS_API_TOKEN = 'test-token';
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe('middleware Bearer token 通道', () => {
  it('带正确 token 的 /api 请求放行', () => {
    const res = middleware(req('/api/board', { authorization: 'Bearer test-token' }));
    expect(res.status).toBe(200); // NextResponse.next()
  });

  it('无 token 的 /api 请求返回 401', () => {
    const res = middleware(req('/api/board'));
    expect(res.status).toBe(401);
  });

  it('错误 token 的 /api 请求返回 401', () => {
    const res = middleware(req('/api/board', { authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('WORK_OS_API_TOKEN 未设置时不启用 token 通道', () => {
    delete process.env.WORK_OS_API_TOKEN;
    const res = middleware(req('/api/board', { authorization: 'Bearer test-token' }));
    expect(res.status).toBe(401);
  });

  it('网页路径无 token 无 cookie 时跳转 /login', () => {
    const res = middleware(req('/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });
});
