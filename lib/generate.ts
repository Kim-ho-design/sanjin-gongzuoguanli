// 脚本工作台 AI 生成链路（需求文档 3.4）：初稿 / 配套产出 / 局部改写
// 全部走 llm.callScript（JSON mode 默认，110s 超时）；LLM 失败抛 LlmError → 路由 502
import { getDb } from './db';
import { callScript, LlmError } from './llm';
import { buildSystemPrompt } from './prompts';
import {
  addExtra,
  getScript,
  saveVersion,
  updateScript,
  type ScriptDetail,
  type ScriptExtraType,
  type ScriptVersion,
} from './scripts';

const REF_PER_MAX = 1500;
const REF_TOTAL_MAX = 6000;
const PAYLOAD_MAX = 6000;

function mustScript(scriptId: number): ScriptDetail {
  const script = getScript(scriptId);
  if (!script) throw new Error('脚本不存在');
  return script;
}

/** 一站式 content v2：一体文档（body 连贯口播 + 括号注释）+ 进度条节点数组 */
export type { YzContentV2 } from './script-content';
/** 兼容旧 sections 格式：合并为 body + progress_nodes（lib/script-content.ts，re-export 保持导入路径不变） */
export { normalizeYzContent } from './script-content';
import { normalizeYzContent, normalizeLqRows } from './script-content';

/** 服务端解析 + 按账号校验 AI 返回的 JSON 结构；缺关键字段抛 LlmError（路由转 502）。
 *  一站式统一归一为 v2（一体文档 + 进度条节点数组）；徕乔行补 note_images。 */
export function validateDraft(account: ScriptDetail['account'], raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LlmError('AI 返回的 JSON 结构不完整，请重试。');
  }
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string';
  if (account === 'yizhanshi') {
    const v2 = normalizeYzContent(o);
    if (!v2.cover_title.trim()) {
      throw new LlmError('AI 返回缺少封面标题 cover_title，请重试。');
    }
    if (!v2.body.trim()) {
      throw new LlmError('AI 返回缺少口播正文 body，请重试。');
    }
    return { ...v2 };
  }
  if (!str(o.cover_title) || !o.cover_title.trim()) {
    throw new LlmError('AI 返回缺少封面标题 cover_title，请重试。');
  }
  if (!str(o.post_title) || !o.post_title.trim()) {
    throw new LlmError('AI 返回缺少发文标题 post_title，请重试。');
  }
  const rows = normalizeLqRows(o.rows);
  if (rows.length === 0) {
    throw new LlmError('AI 返回的 rows 结构不完整，请重试。');
  }
  return { ...o, rows };
}

/** 生成初稿：system prompt（三区组装）+ 选题方向/思路/参考链接正文 → 存 ai_draft 版本 */
export async function generateDraft(
  scriptId: number,
): Promise<{ version: ScriptVersion; draft: Record<string, unknown> }> {
  const script = mustScript(scriptId);
  const db = getDb();
  const refs = db
    .prepare(
      `SELECT url, fetched_content FROM script_refs
       WHERE script_id = ? AND fetch_status = 'ok' AND fetched_content IS NOT NULL
       ORDER BY id ASC`,
    )
    .all(scriptId) as { url: string; fetched_content: string }[];

  const refChunks: string[] = [];
  let refTotal = 0;
  for (const ref of refs) {
    const chunk = `### 参考：${ref.url}\n${ref.fetched_content.slice(0, REF_PER_MAX)}`;
    if (refTotal + chunk.length > REF_TOTAL_MAX) break;
    refChunks.push(chunk);
    refTotal += chunk.length;
  }

  const payload = [
    `选题方向：${script.direction}`,
    script.notes ? `思路备注：${script.notes}` : '',
    refChunks.length ? `参考链接正文：\n${refChunks.join('\n\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const raw = await callScript(buildSystemPrompt(script.account), payload, { json: true });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LlmError('AI 返回的不是合法 JSON，请重试。');
  }
  const draft = validateDraft(script.account, parsed);
  const version = saveVersion(scriptId, JSON.stringify(draft), 'ai_draft');

  // 标题还是初始占位（= 选题方向，带或不带「= 」前缀）时，用 AI 封面标题接管；用户自改过则不覆盖
  const t = script.title.trim();
  const d = script.direction.trim();
  if (t === d || t === `= ${d}`) {
    updateScript(scriptId, { title: draft.cover_title as string });
  }
  return { version, draft };
}

const EXTRA_SYSTEM: Record<ScriptExtraType, (script: ScriptDetail) => string> = {
  caption: (script) =>
    `你是短视频发布文案写手。基于脚本内容写一段发布文案（caption）：简洁有钩子，前两句点出目标人群的利益或痛点；关键词策略覆盖痛点词、行业词、需求词、长尾词四个维度，自然融入文案；符合${script.account === 'yizhanshi' ? '抖音（一站式：实验室负责人/检测行业从业者，偏抖音搜索语境）' : '视频号（徕乔：实验人群体，偏微信搜一搜/视频号浏览语境）'}的平台语境与搜索习惯。只输出文案本身。`,
  tags: (script) =>
    `你是短视频标签策略专家。基于脚本内容输出一组 hashtags：站在平台视角选搜索流量大的词——${script.account === 'yizhanshi' ? '抖音号侧重抖音搜索高频词与下拉联想词' : '视频号侧重微信搜一搜/视频号搜索语境'}；四维覆盖痛点词、行业词、需求词、长尾词；必须含品牌词（${script.account === 'yizhanshi' ? '#一站式' : '#LACHOI徕乔'}）；8~15 个不堆砌，空格分隔。只输出标签串本身。`,
  comments: () =>
    '你是评论区运营。基于脚本内容写 10 条水军评论参考，真实用户口吻、每条一行，混合以下类型：提问求细节、求资料/清单、分享自己经历、@同行同事、附和补充；口语化，不像广告，不重复。只输出 10 条评论本身。',
};

/** 配套产出：基于最新版本正文生成 caption/tags/comments，存 script_extras 并返回 */
export async function generateExtra(
  scriptId: number,
  type: ScriptExtraType,
): Promise<{ type: ScriptExtraType; content: string }> {
  const script = mustScript(scriptId);
  if (!script.content) {
    throw new LlmError('脚本还没有内容，请先生成或手动保存一版草稿。');
  }
  const raw = await callScript(
    EXTRA_SYSTEM[type](script),
    `脚本内容：\n${script.content.slice(0, PAYLOAD_MAX)}\n\n请按角色要求生成。`,
    { json: false },
  );
  const content = raw.trim();
  if (!content) throw new LlmError('AI 返回了空内容，请重试。');
  const extra = addExtra(scriptId, type, content);
  return { type, content: extra.content };
}

/** 润色脚本：把脚本文案润色成更符合短视频表达的大白话（保留全部信息点/品牌名/数字/标准号） */
export async function polishScript(
  account: ScriptDetail['account'],
  text: string,
): Promise<{ polished: string }> {
  const styleHint =
    account === 'yizhanshi'
      ? '口播干货口吻（抖音，像跟同行聊天，短句有节奏）'
      : '分镜同期声口吻（视频号，真人在实验室说话，自然不演）';
  const raw = await callScript(
    `你是短视频文案润色编辑。把用户给的脚本文案润色成更符合短视频表达的大白话：去掉书面腔和播音腔，长句拆短句，按说话节奏分行；必须完整保留全部信息点、品牌名、数字、标准号，不得新增或删除事实；口吻对齐${styleHint}。只输出润色后的文案本身，不要解释、不要引号。`,
    text,
    { json: false },
  );
  const polished = raw.trim();
  if (!polished) throw new LlmError('AI 返回了空内容，请重试。');
  return { polished };
}

/** 局部改写：选中文本 + 一句改法 → 只输出改写后文本 */export async function rewrite(
  text: string,
  instruction: string,
  account: ScriptDetail['account'],
): Promise<{ rewritten: string }> {
  const styleHint =
    account === 'yizhanshi'
      ? '保持口播干货的口语化风格（短句、像跟同行聊天）。'
      : '保持分镜脚本的真实实验室口吻（短句、可带语气词）。';
  const raw = await callScript(
    `你是短视频脚本文案改写助手。${styleHint}只输出改写后的文本本身，不要解释、不要引号、不要任何前后缀；保持原有语言（中文）与段落结构。`,
    `改写要求：${instruction}\n\n原文：\n${text}`,
    { json: false },
  );
  const rewritten = raw.trim();
  if (!rewritten) throw new LlmError('AI 返回了空内容，请重试。');
  return { rewritten };
}
