// 余额状态测试：mock fetch，vi.resetModules 清掉模块级缓存（每例重新 import）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const realFetch = globalThis.fetch;
const realKey = process.env.DEEPSEEK_API_KEY;
const realThreshold = process.env.LLM_BALANCE_LOW_CNY;

beforeEach(() => {
  vi.resetModules();
  process.env.DEEPSEEK_API_KEY = 'test-key';
  delete process.env.LLM_BALANCE_LOW_CNY;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = realKey;
  if (realThreshold === undefined) delete process.env.LLM_BALANCE_LOW_CNY;
  else process.env.LLM_BALANCE_LOW_CNY = realThreshold;
});

function mockFetchOnce(impl: () => Promise<Response>) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

const OK_BODY = { balance_infos: [{ currency: 'CNY', total_balance: '12.34', granted_balance: '0.00', topped_up_balance: '12.34' }] };

describe('checkLlmStatus', () => {
  it('成功：解析余额与币种，low=false', async () => {
    const { checkLlmStatus } = await import('../balance');
    mockFetchOnce(async () => new Response(JSON.stringify(OK_BODY), { status: 200 }));
    const s = await checkLlmStatus(true);
    expect(s.ok).toBe(true);
    expect(s.balance).toBeCloseTo(12.34);
    expect(s.currency).toBe('CNY');
    expect(s.low).toBe(false);
    expect(s.checked_at).toMatch(/^\d{2}:\d{2}$/);
  });

  it('低于阈值：low=true（默认 ¥5）', async () => {
    const { checkLlmStatus } = await import('../balance');
    const body = { balance_infos: [{ currency: 'CNY', total_balance: '3.00' }] };
    mockFetchOnce(async () => new Response(JSON.stringify(body), { status: 200 }));
    expect((await checkLlmStatus(true)).low).toBe(true);
  });

  it('阈值可用环境变量覆盖', async () => {
    process.env.LLM_BALANCE_LOW_CNY = '20';
    const { checkLlmStatus } = await import('../balance');
    mockFetchOnce(async () => new Response(JSON.stringify(OK_BODY), { status: 200 }));
    expect((await checkLlmStatus(true)).low).toBe(true);
  });

  it('缓存：TTL 内第二次调用不再发请求；force 跳过缓存', async () => {
    const { checkLlmStatus } = await import('../balance');
    const fn = vi.fn(async () => new Response(JSON.stringify(OK_BODY), { status: 200 }));
    globalThis.fetch = fn as unknown as typeof fetch;
    await checkLlmStatus(true); // 首次：force 建缓存
    await checkLlmStatus(false); // 命中缓存
    expect(fn).toHaveBeenCalledTimes(1);
    await checkLlmStatus(true); // force 重查
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('接口 4xx / 网络错误 / 字段异常 → ok=false 且带错误文案', async () => {
    const { checkLlmStatus } = await import('../balance');
    mockFetchOnce(async () => new Response('unauthorized', { status: 401 }));
    let s = await checkLlmStatus(true);
    expect(s.ok).toBe(false);
    expect(s.error).toContain('401');

    mockFetchOnce(async () => Promise.reject(new TypeError('network down')));
    s = await checkLlmStatus(true);
    expect(s.ok).toBe(false);
    expect(s.error).toBeTruthy();

    mockFetchOnce(async () => new Response(JSON.stringify({ balance_infos: [] }), { status: 200 }));
    s = await checkLlmStatus(true);
    expect(s.ok).toBe(false);
  });

  it('未配置 key：ok=false，提示未配置', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const { checkLlmStatus } = await import('../balance');
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const s = await checkLlmStatus(true);
    expect(s.ok).toBe(false);
    expect(s.error).toContain('未配置');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
