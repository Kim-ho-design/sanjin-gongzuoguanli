// 历史样稿导入器：把 scripts/import/samples-data.json 逐条导入脚本工作台
// （status=已发布、is_sample=0 待认可；skip_kanban=true 不污染看板）
//
// 用法：
//   node scripts/import/import-samples.mjs --base http://127.0.0.1:5199 --token <WORK_OS_API_TOKEN> [--dry-run]
//   （本地未设 ACCESS_PASSWORD/WORK_OS_API_TOKEN 时可省略 --token）
//
// samples-data.json 的再生成流程（详见 dump-to-json.pl 头注释）：
//   1. 源 Excel/Docx（企划部工作管理系统/）→ 解压（xlsx 是 zip）取 XML
//   2. XML 文本节点按 `列1 | 列2 | ...` dump 成纯文本（.tmp_extract/ 下三个 dump）
//   3. perl scripts/import/dump-to-json.pl  → 生成 samples-data.json
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(HERE, 'samples-data.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { base: 'http://127.0.0.1:5199', token: '', dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base') opts.base = args[++i];
    else if (args[i] === '--token') opts.token = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
  }
  opts.base = opts.base.replace(/\/+$/, '');
  return opts;
}

const opts = parseArgs();
const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const samples = data.samples ?? [];

const headers = { 'Content-Type': 'application/json' };
if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

async function api(pathname, init = {}) {
  const res = await fetch(`${opts.base}${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let ok = 0, skipped = 0, failed = 0;

console.log(`导入目标：${opts.base}　共 ${samples.length} 条　${opts.dryRun ? 'DRY-RUN（只打印计划）' : '正式导入'}`);

for (const s of samples) {
  const label = `[${s.account}] ${s.title}`;
  try {
    // 幂等查重：同账号同标题已存在则跳过
    const q = encodeURIComponent(s.title.slice(0, 30));
    const found = await api(`/api/scripts?account=${s.account}&q=${q}`);
    const dup = (found.body.scripts ?? []).find((x) => x.title === s.title);
    if (dup) {
      skipped++;
      console.log(`跳过（已存在 id=${dup.id}）：${label}`);
      continue;
    }
    if (opts.dryRun) {
      console.log(`计划导入：${label}（${s.source}）`);
      ok++;
      continue;
    }
    // 1. 建脚本（skip_kanban：历史稿不进看板）
    const created = await api(`/api/scripts`, {
      method: 'POST',
      body: JSON.stringify({
        account: s.account,
        title: s.title,
        direction: s.direction || s.title,
        notes: s.notes || '',
        skip_kanban: true,
      }),
    });
    if (created.status !== 200) {
      failed++;
      console.error(`失败（创建）：${label} → ${JSON.stringify(created.body)}`);
      continue;
    }
    const id = created.body.script.id;
    // 2. 存版本（手动来源）
    const ver = await api(`/api/scripts/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify({ content: JSON.stringify(s.content), kind: 'manual' }),
    });
    if (ver.status !== 200) {
      failed++;
      console.error(`失败（存版本）：${label} → ${JSON.stringify(ver.body)}`);
      continue;
    }
    // 3. 标记已发布（保持 is_sample=0 待认可，由用户在样稿库逐篇确认）
    const pub = await api(`/api/scripts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: '已发布' }),
    });
    if (pub.status !== 200) {
      failed++;
      console.error(`失败（标记已发布）：${label} → ${JSON.stringify(pub.body)}`);
      continue;
    }
    ok++;
    console.log(`已导入 id=${id}：${label}`);
  } catch (e) {
    failed++;
    console.error(`失败（异常）：${label} → ${e.message}`);
  }
}

console.log(`\n完成：成功 ${ok} / 跳过 ${skipped} / 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
