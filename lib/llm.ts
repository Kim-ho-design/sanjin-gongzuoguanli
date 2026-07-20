// DeepSeek 调用 + 输出 schema 校验（需求文档 4.1，锁死）
import type { ParseResult, ParseIntent } from './types';
import { TASK_STATUSES } from './types';

const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

const INTENTS: ParseIntent[] = [
  'create_task',
  'update_task',
  'log_progress',
  'set_plan',
  'weekly_review',
  'unclear',
];

export class LlmError extends Error {}

/** 共享的 DeepSeek 调用：json=true 时强制 JSON 输出 */
async function callDeepSeek(
  messages: { role: 'system' | 'user'; content: string }[],
  json: boolean,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new LlmError('未配置 DEEPSEEK_API_KEY，请在 .env 中填入后重启服务。');
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new LlmError(`DeepSeek API 错误（${res.status}）：${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

export async function callParse(systemPrompt: string, userInput: string): Promise<ParseResult> {
  const content = await callDeepSeek(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput },
    ],
    true,
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
        name: typeof t?.name === 'string' ? t.name : '',
        matched_existing: t?.matched_existing === true,
        status: TASK_STATUSES.includes(t?.status as never) ? (t.status as string) : '',
        deadline: typeof t?.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline) ? t.deadline : null,
        parent_task_name: typeof t?.parent_task_name === 'string' ? t.parent_task_name : null,
        subtasks: Array.isArray(t?.subtasks)
          ? (t.subtasks as Record<string, unknown>[])
              .map((s) => ({
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
