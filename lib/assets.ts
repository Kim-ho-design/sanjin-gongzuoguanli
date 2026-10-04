// 脚本附件（徕乔备注列图片等）：存 DATA_DIR/script-assets/，文件名 <scriptId>-<时间戳>.<ext>
import fs from 'fs';
import path from 'path';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const BASE_DIR = process.env.WORK_OS_DATA_DIR || path.join(process.cwd(), 'data'); // 与 lib/db.ts 同款逻辑
const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** 附件目录（惰性创建；每次调用读 env，便于测试指向临时目录） */
export function assetsDir(): string {
  const dir = path.join(process.env.WORK_OS_DATA_DIR || BASE_DIR, 'script-assets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function isAllowedExt(ext: string): boolean {
  return ext in EXT_MIME;
}

export function mimeOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

/** 校验请求的文件名：只允许安全字符、不得越出附件目录（防路径穿越） */
export function resolveAsset(name: string): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') return null;
  const dir = path.resolve(assetsDir());
  const fp = path.resolve(dir, name);
  if (!fp.startsWith(dir + path.sep)) return null;
  return fp;
}

export { MAX_SIZE };
