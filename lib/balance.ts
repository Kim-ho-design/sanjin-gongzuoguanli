// DeepSeek 余额查询：服务端代理（key 不出服务端），内存缓存 5 分钟，防每次进首页都打 DeepSeek
const BALANCE_URL = 'https://api.deepseek.com/user/balance';
const BALANCE_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface LlmStatus {
  ok: boolean;
  /** 余额（CNY）；失败为 null */
  balance: number | null;
  currency: string;
  /** 是否低于低余额阈值（由服务端用环境变量判定） */
  low: boolean;
  /** 检查时间 HH:MM（本地） */
  checked_at: string;
  error?: string;
}

let cache: { at: number; status: LlmStatus } | null = null;

function hhmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 低余额阈值（CNY），默认 ¥5 */
function lowThreshold(): number {
  const v = parseFloat(process.env.LLM_BALANCE_LOW_CNY || '');
  return Number.isFinite(v) && v > 0 ? v : 5;
}

/** 裸查询：防御式解析，任何字段异常都抛错（由调用方转失败态） */
export async function fetchBalance(apiKey: string): Promise<{ balance: number; currency: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BALANCE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(BALANCE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
  } catch {
    throw new Error('余额接口连接失败');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`余额接口错误（${res.status}）`);
  const data = await res.json().catch(() => null);
  const info = data?.balance_infos?.[0];
  const balance = parseFloat(info?.total_balance);
  if (!Number.isFinite(balance)) throw new Error('余额接口返回异常');
  return { balance, currency: typeof info?.currency === 'string' ? info.currency : 'CNY' };
}

/** 查余额（带缓存）；force=true 跳过缓存手动刷新 */
export async function checkLlmStatus(force = false): Promise<LlmStatus> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.status;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const status: LlmStatus = apiKey
    ? await fetchBalance(apiKey)
        .then(({ balance, currency }) => ({
          ok: true,
          balance,
          currency,
          low: balance < lowThreshold(),
          checked_at: hhmm(),
        }))
        .catch((e: unknown) => ({
          ok: false,
          balance: null,
          currency: 'CNY',
          low: false,
          checked_at: hhmm(),
          error: e instanceof Error ? e.message : '查询失败',
        }))
    : { ok: false, balance: null, currency: 'CNY', low: false, checked_at: hhmm(), error: '未配置 DEEPSEEK_API_KEY' };
  cache = { at: Date.now(), status };
  return status;
}
