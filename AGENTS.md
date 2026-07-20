# AGENTS.md — AI 协作记忆文件

> 每轮开发对话结束前更新本文件，确保下轮对话能准确恢复上下文。**禁止凭记忆臆测，以本文件和代码为准。**

## 项目概述

work-os：个人工作进度管理看板。自然语言录入（DeepSeek 解析）→ 确认卡片 → SQLite 落库；看板/周视图/月历/AI 周报。

- 仓库：`https://github.com/Kim-ho-design/sanjin-gongzuoguanli`（私有）
- 本地路径：`D:/Desktop/coding项目/个人工作进度管理看板/work-os`

## 技术栈与结构

- Next.js 14 App Router + TypeScript + Tailwind（品牌色 `#3E81F6`，tailwind.config.ts 的 `kimi` 色阶 500 锚点）
- better-sqlite3（WAL），库文件 `data/work-os.db`（gitignored）；`lib/db.ts` 单例 `getDb()`，建表 SQL 导出为 `SCHEMA_SQL`
- 迁移：v4~v7 幂等 SQL，每次 `createDb()` 执行（未用 user_version）。**v7**：父任务 planned_date → 同名子任务 + 父任务 planned_date 置 NULL
- DeepSeek：`lib/llm.ts`（`callDeepSeek` 共享客户端；`callParse` JSON 模式；`callReport` 文本模式）
- 测试：Vitest（`npm test`），用例在 `lib/__tests__/`

```
app/            页面：page(看板) week(周视图) calendar(月历) report(周报) login
app/api/        board / tasks(+[id]) / parse(+confirm) / projects / logs / deliverables
                calendar(+day) / report / unclaimed([id]+claim+restore) / auth
components/     Board TaskCard TaskDetail InputBox ConfirmCard TodaySidebar
                UnclaimedPanel TopBar Pixel ConfirmCard
lib/            types(类型) db(连接+迁移+SCHEMA_SQL) utils(纯函数) prompt(解析prompt)
                llm(DeepSeek+校验) apply(落库) report(周报：聚合+prompt+模板兜底) auth
data/           work-os.db（不入库）
```

## 核心业务口径（改代码前必读）

- **超期**：唯一判据 `deadline < 今天` 且状态 ∉ {已完成， 待确认审核}（`lib/utils.ts isOverdue`）。子任务计划日期过期不算超期
- **本周完成率**：`weekCompletion()`——分母 deadline ∈ 本周（周一~周日，`weekRange`）的父任务；分子其中「已完成」；待确认审核**不计入**
- **子任务**：`tasks.parent_task_id` 复用主表。仅子任务使用 `planned_date`；子任务 deadline 恒 NULL、is_today 恒 0、project_id 继承父任务；看板/完成率/超期统计只数 `parent_task_id IS NULL`
- **补记闭环**：解析匹配不到现有任务也必须新建任务（"做完了"→待确认审核）；`log.date`（ParsedLog.date）承载过去日期，日志 created_at 与 completed_at 落到该日 18:00；ConfirmCard 有日志无任务时 `prefillTaskFromLog()` 自动预填任务行
- **今日计划**：`groupTodayItems()`——is_today 星标 / deadline=今天 / 子任务 planned_date=今天，子任务并入父卡片
- **周报**：`lib/report.ts` = `collectReportData`（聚合）→ DeepSeek 生成（brief/full）→ 失败回退 `renderTemplate`。下周计划 = 未完成平移；无"风险/卡点"区块；prompt 有语言硬性规则（禁用"子任务/父任务"等术语）
- **已废弃**：父任务 `planned_date`（列保留）、`is_plan_item`（恒 0）、耗时/交付物/卡点的录入（DB 列与历史数据保留，详情页只读）

## Vibe Coding 工作流（用户强制规则）

1. **规划先行**：先输出 Plan（目标/选型/结构/风险），用户回复"确认"后才编码
2. **分支隔离**：禁止直接改 main；`feature/xxx` / `fix/xxx`，完成后合并
3. **洁癖收尾**：每轮结束前整理 README/CHANGELOG/AGENTS.md，清冗余，汇报修改清单
4. **本地验收**：`npm run dev` 预览，用户确认后才部署/合并
5. **测试**：核心功能补 Vitest，提交前 `npm test` + `npm run lint` + `npm run build` 全绿
6. **名词解释**：Git/PR/CI 等概念用一句话通俗解释

## 部署（生产服务器）

- 服务器：`root@106.53.21.62`，密钥 `~/.ssh/id_workos_server`（Windows: `C:/Users/84879/.ssh/id_workos_server`）
- 应用目录 `/root/sanjin-gongzuoguanli`：`next start` 跑 :3000，nginx :80 反代（server_name sanjin.art，用户直接用 IP 访问，不配域名）
- **绝不覆盖**：服务器上的 `data/`（生产 SQLite）和 `.env`

发布步骤（本地执行）：

```bash
# 1. 打包源码（排除依赖/产物/数据/密钥）
tar czf /tmp/work-os-deploy.tar.gz --exclude=node_modules --exclude=.next \
  --exclude=data --exclude=.env --exclude=.git .

# 2. 上传
scp -i ~/.ssh/id_workos_server /tmp/work-os-deploy.tar.gz root@106.53.21.62:/root/

# 3. 服务器：备份库 → 解压 → 装依赖 → 构建 → 重启
ssh -i ~/.ssh/id_workos_server root@106.53.21.62 '
  cd /root/sanjin-gongzuoguanli &&
  cp data/work-os.db data/work-os.db.bak-$(date +%Y%m%d-%H%M%S) &&
  tar xzf /root/work-os-deploy.tar.gz &&
  npm ci && npm run build &&
  pkill -f "next start"; nohup npm start > app.log 2>&1 &'

# 4. 验证
curl -s -o /dev/null -w "%{http_code}" http://106.53.21.62/
```

- 迁移自动执行（幂等）；回滚 = 恢复 `.bak` 数据库文件
- Docker 也可构建（根目录有 Dockerfile），但当前生产未用

## 常用命令

```bash
npm run dev / npm test / npm run lint / npm run build
git checkout -b feature/xxx   # 新功能必须先开分支
```
