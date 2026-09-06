import { isPriority } from './priority';
// DeepSeek 调用 + 输出 schema 校验（需求文档 4.1，锁死）
import type { ParseResult, ParseIntent } from './types';
import { TASK_STATUSES } from './types';

const API_URL = 'https://api.deepseek.com/chat/completions';
// v11：deepseek-chat 已被平台下线（400 报错提示可用型号），默认换 deepseek-v4-flash；
// 可用 DEEPSEEK_MODEL 环境变量覆盖（如 deepseek-v4-pro，带推理、更慢更贵）
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

const INTENTS: ParseIntent[] = [
  'create_task',
  'update_task',
  'log_progress',
  'set_plan',
  'weekly_review',
  'unclear',
];

export class LlmError extends Error {}

// v16：LLM 调用 45s 超时兜底——超时返回干净的 JSON 错误，不再裸奔到 nginx 60s 504 HTML 页
const LLM_TIMEOUT_MS = 45_000;

/** 共享的 DeepSeek 调用：json=true 时强制 JSON 输出；extra 合并进请求体（如 thinking 配置） */
async function callDeepSeek(
  messages: { role: 'system' | 'user'; content: string }[],
  json: boolean,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new LlmError('未配置 DEEPSEEK_API_KEY，请在 .env 中填入后重启服务。');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        ...extra,
        messages,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new LlmError('AI 响应超时，请重试（如持续出现请稍后再试）。');
    }
    throw new LlmError('AI 服务连接失败，请稍后重试。');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new LlmError(`DeepSeek API 错误（${res.status}）：${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/**
 * v16 双通道解析：默认关思考（2~3s）；thinking=true 走思考兜底（慢但准，默认 effort=high）。
 * 调用方用 needsThinkingRetry 判断快通道结果是否可信，不可信再用本参数重试。
 */
export async function callParse(
  systemPrompt: string,
  userInput: string,
  opts: { thinking?: boolean } = {},
): Promise<ParseResult> {
  const content = await callDeepSeek(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput },
    ],
    true,
    // v16：默认关思考。v4-flash 默认开思考且 effort=high，复杂句实测 14~88s 撞 nginx 60s 超时；
    // 快通道 + prompt 加固（总分枚举/date_check/名称保真/近日常用日锚点）实测主业类句子 2~3s，
    // 失败时由 needsThinkingRetry 触发思考重试兜底（用户已拍板，2026-08-03）
    opts.thinking ? {} : { thinking: { type: 'disabled' } },
  );
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new LlmError('LLM 返回的不是合法 JSON，请重试。');
  }
  return validateParseResult(raw);
}

/** 周报生成：返回 markdown 文本（非 JSON 模式） */
export async function callReport(systemPrompt: string, userPayload: string): Promise<string> {
  const content = await callDeepSeek(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPayload },
    ],
    false,
  );
  if (!content.trim()) throw new LlmError('LLM 返回了空周报，请重试。');
  return content;
}

// v16：原话里的时间词（与规则 9/规则 7 对齐）。出现时间词但输出里一个日期都没落 = 快通道不可信
const TIME_WORD_RE = /今天|明天|后天|昨天|前天|今晚|下班前|周[一二三四五六日天]|下周|上周|本周|\d{1,2}\s*月\s*\d{1,2}|\d{1,2}\s*[号日]/;

/** 快通道（关思考）结果是否需要思考重试：意图不清，或原话有时间词但所有日期字段全空 */
export function needsThinkingRetry(rawText: string, parsed: ParseResult): boolean {
  if (parsed.intent === 'unclear') return true;
  if (!TIME_WORD_RE.test(rawText)) return false;
  const hasDate =
    !!parsed.log.date ||
    parsed.tasks.some((t) => t.deadline || t.subtasks.some((s) => s.planned_date));
  return !hasDate;
}

/** 宽松校验 + 字段归一：非法字段回退到安全默认值，宁空勿编 */
export function validateParseResult(raw: unknown): ParseResult {
  const o = (raw ?? {}) as Record<string, unknown>;
  const proj = (o.project ?? {}) as Record<string, unknown>;
  const log = (o.log ?? {}) as Record<string, unknown>;

  const intent = INTENTS.includes(o.intent as ParseIntent)
    ? (o.intent as ParseIntent)
    : 'unclear';

  const tasks = Array.isArray(o.tasks)
    ? (o.tasks as Record<string, unknown>[]).map((t) => ({
        ...(t?.priority !== undefined && isPriority(t.priority) ? { priority: t.priority } : {}),
        name: typeof t?.name === 'string' ? t.name : '',
        matched_existing: t?.matched_existing === true,
        status: TASK_STATUSES.includes(t?.status as never) ? (t.status as string) : '',
        deadline: typeof t?.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline) ? t.deadline : null,
        parent_task_name: typeof t?.parent_task_name === 'string' ? t.parent_task_name : null,
        subtasks: Array.isArray(t?.subtasks)
          ? (t.subtasks as Record<string, unknown>[])
              .map((s) => ({
                ...(s?.priority !== undefined && isPriority(s.priority) ? { priority: s.priority } : {}),
                name: typeof s?.name === 'string' ? s.name : '',
                planned_date:
                  typeof s?.planned_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.planned_date)
                    ? s.planned_date
                    : null,
              }))
              .filter((s) => s.name)
          : [],
      }))
    : [];

  const confidence =
    typeof proj.confidence === 'number' && proj.confidence >= 0 && proj.confidence <= 1
      ? proj.confidence
      : 0;

  const result: ParseResult = {
    intent,
    project: {
      name: typeof proj.name === 'string' ? proj.name : '',
      is_new: proj.is_new === true,
      confidence,
    },
    tasks,
    log: {
      content: typeof log.content === 'string' ? log.content : '',
      date: typeof log.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(log.date) ? log.date : null,
    },
    needs_confirmation: o.needs_confirmation === true,
    clarify_question: typeof o.clarify_question === 'string' ? o.clarify_question : '',
  };

  // 硬性规则：项目匹配置信度 < 0.7 必须反问（需求文档 4.2.3）
  if (
    result.project.name &&
    result.project.confidence < 0.7 &&
    !result.project.is_new &&
    !result.needs_confirmation
  ) {
    result.needs_confirmation = true;
    if (!result.clarify_question) {
      result.clarify_question = `「${result.project.name}」是新项目，还是属于某个已有项目？`;
    }
  }
  // 没有识别出任何任务且不是周报/不明意图 → 反问（有日志内容除外：确认卡片会兜底生成预填任务）
  if (
    result.tasks.length === 0 &&
    !result.log.content &&
    result.intent !== 'weekly_review' &&
    result.intent !== 'unclear' &&
    !result.needs_confirmation
  ) {
    result.needs_confirmation = true;
    if (!result.clarify_question) result.clarify_question = '这句话是关于哪个任务的？';
  }

  return result;
}
