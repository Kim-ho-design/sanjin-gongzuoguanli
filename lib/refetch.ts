// 参考链接抓取（需求文档 3.2）：Node 全局 fetch + 轻量 HTML 正文提取，无新增重依赖
// 超时 10s；抓 HTML 后去标签提取正文（去 script/style/nav 等），压缩空白，截断 ~6000 字
import { getDb } from './db';
import type { ScriptRef } from './scripts';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_LEN = 6000;

/** 去标签提正文：剥掉 script/style 等噪声标签与页头页尾，实体最小解码，压缩空白 */
export function extractText(html: string): string {
  let text = html
    .replace(/<(script|style|noscript|iframe|svg|header|footer|nav|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  if (text.length > MAX_CONTENT_LEN) text = text.slice(0, MAX_CONTENT_LEN);
  return text;
}

/** 抓取单条参考链接：写回 fetch_status=ok/failed 与 fetched_content；返回更新后的行 */
export async function fetchRef(refId: number): Promise<ScriptRef> {
  const db = getDb();
  const ref = db.prepare('SELECT * FROM script_refs WHERE id = ?').get(refId) as ScriptRef | undefined;
  if (!ref) throw new Error('参考链接不存在');

  let status: 'ok' | 'failed';
  let content: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ref.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (work-os script workbench ref fetcher)' },
    });
    if (!res.ok) {
      status = 'failed';
    } else {
      const text = extractText(await res.text());
      if (text) {
        status = 'ok';
        content = text;
      } else {
        status = 'failed';
      }
    }
  } catch {
    status = 'failed';
  } finally {
    clearTimeout(timer);
  }

  db.prepare('UPDATE script_refs SET fetch_status = ?, fetched_content = ? WHERE id = ?').run(
    status,
    content,
    refId,
  );
  return db.prepare('SELECT * FROM script_refs WHERE id = ?').get(refId) as ScriptRef;
}
