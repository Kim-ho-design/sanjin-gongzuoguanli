# work-os · 个人工作进度管理看板

自然语言录入的个人工作管理工具：对着输入框"说话"，DeepSeek 解析成任务/日志，确认后入库；看板、周视图、月历、AI 周报一应俱全。

## 功能

- **看板**：五列状态（待办事项/待启动/进行中/待确认审核/已完成），拖拽流转
- **自然语言录入**：输入框口语描述 → DeepSeek 解析 → 确认卡片（可改项目/截止/子任务）→ 入库
- **子任务**：任务下可挂子任务（名称+计划日期），计入今日计划与周视图；DeepSeek 会自动识别"先…再…"式拆分
- **补记**：下班补一句"今天/昨天/上周五完成了 XX"，自动生成任务并把日志、完成时间记到对应日期，供周报归集
- **今日计划**：星标 + 今日截止 + 今日到期的子任务（并入父卡片显示）
- **周视图**：周一~周日七列，截止日与子任务计划日落列
- **AI 周报**：DeepSeek 基于本周完成+日志+未完成任务生成简版/详版周报，LLM 故障自动回退模板
- **待认领区**：挂不上任务的解析结果暂存，可认领/恢复

## 关键口径

- **超期**：只认 `deadline`（截止日期），已完成/待确认审核不算超期；子任务计划日期过期不算超期
- **本周完成率**：分母 = deadline 落在本周（周一~周日）的父任务；分子 = 其中「已完成」（待确认审核不计入）
- **下周计划（周报）**：未完成任务平移，不按日期筛选

## 技术栈

Next.js 14（App Router）· TypeScript · Tailwind · better-sqlite3（WAL）· DeepSeek API · dnd-kit · Vitest

## 本地开发

```bash
cp .env.example .env   # 填入 DEEPSEEK_API_KEY
npm ci
npm run dev            # http://localhost:3000
```

```bash
npm test               # Vitest（lib 纯函数 + 落库 + 周报聚合）
npm run lint
npm run build
```

数据存于 `data/work-os.db`（SQLite，首次启动自动建表+迁移+播种预置项目）。

## 环境变量

见 `.env.example`：`DEEPSEEK_API_KEY`（必填）、`ACCESS_PASSWORD`（公网访问口令，留空关闭密码门）、`SEED_PROJECTS`（首次启动预置项目）。

## 部署

服务器直跑 `next start`（无 Docker），nginx :80 反代 :3000。详细发布步骤见 `AGENTS.md` 的部署章节。

## 分支与协作

`main` 为保护分支，功能开发走 `feature/xxx` / `fix/xxx` 分支，本地验收（localhost 预览 + `npm test` 全绿）通过后合并。变更历史见 `CHANGELOG.md`。
