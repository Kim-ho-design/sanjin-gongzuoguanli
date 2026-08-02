# AGENTS.md — AI 协作记忆文件

> 每轮开发对话结束前更新本文件，确保下轮对话能准确恢复上下文。**禁止凭记忆臆测，以本文件和代码为准。**
> **分工**：本文件管代码/技术/部署；产品背景、需求文档、视觉风格、业务规则见上级 `../AGENTS.md`。

## 项目概述

work-os：个人工作进度管理看板。自然语言录入（DeepSeek 解析）→ 确认卡片 → SQLite 落库；首页 = 数据统计条 + 周视图主视图，另有月视图与 AI 周报。

- 仓库：`https://github.com/Kim-ho-design/sanjin-gongzuoguanli`（私有）
- 本地路径：`D:/Desktop/coding项目/个人工作进度管理看板/work-os`
- UI 参考：`D:/Desktop/coding项目/个人工作进度管理看板/视觉风格参考图/`（bento 大圆角、像素元素、蓝白黑）

## 技术栈与结构

- Next.js 14 App Router + TypeScript + Tailwind（拼豆配色 v10 起：主色 C07 `#305FB9`，`kimi` 色阶 500 锚点；辅助色 `bean.*`：C06 天蓝/C26 钢青/B05 亮绿=完成/P17 橙=超期·卡点·反问/M01 灰/D16 浅薰衣草/B22 墨青；文字 H16 棕黑 `#191110`；错误/删除保留红色）
- better-sqlite3（WAL），库文件 `data/work-os.db`（gitignored）；`lib/db.ts` 单例 `getDb()`，建表 SQL 导出为 `SCHEMA_SQL`
- 迁移 v4~v10 幂等 SQL（未用 user_version）：v7 父任务 planned_date→同名子任务；**v8 状态简化：待确认审核→已完成（回填 completed_at）、待办事项→待启动**；**v9 tasks 加 prev_status 列**（级联完成时记子任务原状态）；v10 品牌蓝 #3375F6→C07 #305FB9，项目预置色板换拼豆 8 色
- DeepSeek：`lib/llm.ts`（`callDeepSeek` 共享；`callParse` JSON 模式；`callReport` 文本模式）；模型默认 **deepseek-v4-flash**（deepseek-chat 已被平台下线返回 400，`DEEPSEEK_MODEL` 环境变量可覆盖，如 deepseek-v4-pro 带推理更慢更贵），密钥只在服务端环境变量
- 测试：Vitest（`npm test`），`lib/__tests__/`
- **Agent 接入（v15）**：middleware 对 /api/* 放行 `Authorization: Bearer $WORK_OS_API_TOKEN`（未设不启用，cookie 密码门不变）；`GET /api/report?format=data` 原始聚合 JSON、`GET /api/tasks` 过滤列表；CLI `scripts/workos.sh` + 用户级 skill `~/.agents/skills/workos/`；token 只存服务器 .env 与本机 `~/.config/workos/config`，绝不入仓库
  - ⚠️ `scripts/workos.sh` 的**规范副本在公开仓库 github.com/Kim-ho-design/workos-skill**（含 SKILL.md + README 安装说明，供新 agent 克隆安装）；改脚本必须两边同步

```
app/page.tsx     首页：TopBar 数据条 → InputBox → 项目筛选 → WeekView（主视图）→ 待认领
app/week/        重定向到 /（已并入首页）
app/calendar/    月视图（品牌蓝色阶热力，深色格白字）  app/report/  AI 周报  app/login/
app/api/         board / tasks(+[id]，GET 过滤列表 v15) / parse(+confirm) / projects / logs / deliverables
                 calendar(+day) / report(format=data 原始聚合 v15) / unclaimed([id]+claim+restore) / auth
components/      TopBar(五格数据条+浮层；移动端两行) WeekView(周视图+拖拽+拖欠条+未排期；移动端单列纵排+触屏禁拖拽)
                 TaskDetail(详情抽屉；移动端底部弹出 bottom sheet) InputBox(移动端吸底) ConfirmCard UnclaimedPanel Pixel
lib/             types db(SCHEMA_SQL+迁移) utils(纯函数) prompt llm apply report auth
```

## 核心业务口径（改代码前必读）

- **状态集**（v8）：待启动 / 进行中 / 已完成，仅三个。待启动/进行中由日期自动体现，不手动切换；详情页只有「标记完成 / 重新打开」
- **级联完成**（v9，PATCH /api/tasks/[id]）：父任务标记完成 → 未完成子任务一并完成（原状态存 prev_status，completed_at 同步）；父任务重新打开 → 仅 prev_status 非空的子任务恢复原状态并清空完成时间，手动完成的不动；子任务单独改状态会清掉自己的 prev_status 防误恢复
- **自动分列**（`splitByProgress`）：待启动 = 未完结且(日期>今天或无日期)；进行中 = 未完结且日期≤今天（含超期置顶）；已完成。父看 deadline、子看 planned_date
- **超期**：`isOverdue` 父看 deadline、子看 planned_date，过期未完成即算；TopBar 漂流瓶与周报"漂流瓶"同口径（`collectReportData.drifting`）
- **本周进度**（`weekCompletion`）：分母 = deadline∈本周(周一~周日)父任务 + planned_date∈本周子任务；分子 = 其中已完成；TopBar 主显示百分比
- **子任务**：复用 `tasks.parent_task_id`；仅子任务用 planned_date；子任务 deadline 恒 NULL、project_id 继承；API 校验：父禁写 planned_date、子禁写 deadline（400）
- **周视图**：父按 deadline、子按 planned_date 落列；同列父子合并为一卡；拖父改 deadline、拖子改 planned_date；子超父截止显示「超出父截止⚠」；拖欠条 = 未完结且日期<显示周周一（所有周都显示，用户已确认）；未排期栏仅本周显示
- **补记闭环**：匹配不到也必须新建任务（"做完了"→已完成）；`log.date` 承载过去日期，日志/完成时间落到该日 18:00；ConfirmCard 有日志无任务时 `prefillTaskFromLog()` 预填
- **时间词必落日期**（prompt 规则 9）：一次性事项填 deadline，拆分语义进 subtasks.planned_date
- **周报**：`collectReportData`（聚合）→ DeepSeek（brief/full）→ 失败回退模板；下周计划 = 未完成平移；无"风险/卡点"区块；prompt 禁"子任务/父任务"术语
- **已废弃**：父任务 planned_date（列保留，v7 已清空）、is_plan_item、is_today（死字段，API 兼容接收但不读取）、耗时/交付物/卡点录入（DB 列保留只读）、五列拖拽看板、今日计划侧栏

## 移动端适配（v14）

- 一套代码响应式，`md`（768px）断点分界；触屏判定用 `pointer: coarse`（WeekView 的 `useCoarsePointer`）
- 周视图移动端单列纵排；触屏禁拖拽（不挂 listeners），✓ 按钮常驻放大；输入框移动端 fixed 吸底（首页 pb-24 防遮挡）
- TaskDetail / UnclaimedPanel 移动端 bottom sheet（`inset-x-0 bottom-0 h-[92dvh] rounded-t-3xl`，md 以上还原右侧抽屉）
- 验收标准（本项目"绿"的定义）：`npm test` + `npm run build` 零错误 + 390px 手机宽度与 1280px 桌面截图冒烟（截图存 `反馈截图/`）

## 已知遗留

- SSR 时区：`todayStr()` 按服务器时区，服务器与用户同时区（国内）无影响
- dev 与 build 共用 `.next`：**严禁 dev 运行中跑 build**（会坏缓存）；流程 = 先 build 验证 → 停 → 启 dev

## Vibe Coding 工作流（用户强制规则）

1. **规划先行**：先输出 Plan（目标/选型/结构/风险），用户回复"确认"后才编码
2. **分支隔离**：禁止直接改 main；`feature/xxx` / `fix/xxx`，完成后合并
3. **洁癖收尾**：每轮结束前整理 README/CHANGELOG/AGENTS.md，清冗余，汇报修改清单
4. **本地验收**：`npm run dev` 预览（生产数据复刻），用户确认后才部署/合并
5. **测试**：核心功能补 Vitest，提交前 `npm test` + `npm run lint` + `npm run build` 全绿；大改动需独立对抗性审查
6. **名词解释**：Git/PR/CI 等概念用一句话通俗解释

## 部署（生产服务器）

- 服务器：`root@106.53.21.62`，密钥 `~/.ssh/id_workos_server`（Windows: `C:/Users/84879/.ssh/id_workos_server`）
- 应用目录 `/root/sanjin-gongzuoguanli`：`next start` 跑 :3000；**用户访问入口 `https://work.sanjin.art`**（v14 起：nginx 反代 `work.sanjin.art` → 127.0.0.1:3000，Certbot HTTPS，配置 `/etc/nginx/conf.d/work.sanjin.art.conf`；`http://IP:3000` 直连仍可用）
- GitHub push：本机 git 配了 127.0.0.1:7890 代理，代理没开时用 `git -c http.proxy= -c https.proxy= push` 直连
- **绝不覆盖**：服务器上的 `data/`（生产 SQLite）和 `.env`

发布步骤（本地执行）：

```bash
# 0. 部署前从服务器拉最新库核对（本地复刻可能已过期）
# 1. 打包源码（排除依赖/产物/数据/密钥）
tar czf /tmp/work-os-deploy.tar.gz --exclude=node_modules --exclude=.next \
  --exclude=data --exclude=.env --exclude=.git .

# 2. 上传
scp -i ~/.ssh/id_workos_server /tmp/work-os-deploy.tar.gz root@106.53.21.62:/root/

# 3. 服务器：备份库 → 解压 → 装依赖 → 构建 → 重启（pkill 模式用 "next s[t]art" 防自匹配）
ssh -i ~/.ssh/id_workos_server root@106.53.21.62 '
  export PATH=/root/.nvm/versions/node/v22.22.2/bin:$PATH
  cd /root/sanjin-gongzuoguanli &&
  cp data/work-os.db data/work-os.db.bak-$(date +%Y%m%d-%H%M%S) &&
  tar xzf /root/work-os-deploy.tar.gz &&
  npm ci && npm run build &&
  kill $(pgrep -f "next-server") 2>/dev/null; sleep 2
  nohup npm start > app.log 2>&1 &'

# 4. 验证
curl -s -o /dev/null -w "%{http_code}" http://106.53.21.62:3000/
```

- 迁移自动执行（幂等）；回滚 = 恢复 `.bak` 数据库文件
- Dockerfile 存在但生产未用（源码 tar 直部署）

## 常用命令

```bash
npm run dev / npm test / npm run lint / npm run build
git checkout -b feature/xxx   # 新功能必须先开分支
```
