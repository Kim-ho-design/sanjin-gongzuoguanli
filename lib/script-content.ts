// 分账号脚本 content 结构归一与字数统计（lib/generate.ts 与 lib/scripts.ts 共用，避免循环依赖）

/** 一站式 content v2：一体文档（body 连贯口播 + 括号注释）+ 进度条节点数组 */
export interface YzContentV2 {
  cover_title: string;
  positioning: string;
  framework: string;
  audience: string;
  keywords: string[];
  body: string;
  progress_nodes: string[];
  end_card: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 兼容旧 sections 格式：合并为 body（字幕/画面以括号注释跟在对应内容后）+ 节点数组取各节 node_label */
export function normalizeYzContent(raw: Record<string, unknown>): YzContentV2 {
  const base: YzContentV2 = {
    cover_title: str(raw.cover_title),
    positioning: str(raw.positioning),
    framework: str(raw.framework),
    audience: str(raw.audience),
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(str).filter(Boolean) : [],
    body: str(raw.body),
    progress_nodes: Array.isArray(raw.progress_nodes)
      ? raw.progress_nodes.map(str).filter(Boolean)
      : [],
    end_card: str(raw.end_card),
  };
  if (base.body || !Array.isArray(raw.sections)) return base;
  // 旧格式：sections[{node_label, narration, subtitle, visual}] → 一体 body
  const parts: string[] = [];
  for (const s of raw.sections as Record<string, unknown>[]) {
    const narration = str(s?.narration).trim();
    if (!narration) continue;
    const subtitle = str(s?.subtitle).trim();
    const visual = str(s?.visual).trim();
    parts.push(
      subtitle ? `${narration}（字幕：${subtitle}）` : narration,
      ...(visual ? [`（画面：${visual}）`] : []),
    );
    const label = str(s?.node_label).trim();
    if (label && !base.progress_nodes.includes(label)) base.progress_nodes.push(label);
  }
  base.body = parts.join('\n');
  return base;
}

/** 徕乔 content v3（三板块）：同期声竖排口播 + 画面呈现建议 + 字幕建议 */
export interface LqContentV3 {
  cover_title: string;
  post_title: string;
  voiceover_body: string;
  visual_advice: string;
  subtitle_advice: string;
}

/** 兼容旧 rows[] 格式：voiceover 非空项 join('\n')；visual/subtitle 非空项去重以「；」join 并截断 */
export function normalizeLqContent(raw: Record<string, unknown>): LqContentV3 {
  const base: LqContentV3 = {
    cover_title: str(raw.cover_title),
    post_title: str(raw.post_title),
    voiceover_body: str(raw.voiceover_body),
    visual_advice: str(raw.visual_advice),
    subtitle_advice: str(raw.subtitle_advice),
  };
  if (base.voiceover_body || !Array.isArray(raw.rows)) return base;
  const rows = raw.rows as Record<string, unknown>[];
  const uniqJoin = (key: string, max: number) => {
    const seen = new Set<string>();
    for (const r of rows) {
      const v = str(r?.[key]).trim();
      if (v) seen.add(v);
    }
    return Array.from(seen).join('；').slice(0, max);
  };
  base.voiceover_body = rows.map((r) => str(r?.voiceover).trim()).filter(Boolean).join('\n');
  base.visual_advice = uniqJoin('visual', 500);
  base.subtitle_advice = uniqJoin('subtitle', 300);
  return base;
}

/** 口播字数：去掉（）与【】注释、空白后的字符数 */
export function countSpeakable(text: string): number {
  return text
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[【\[][^】\]]*[】\]]/g, '')
    .replace(/\s/g, '').length;
}
