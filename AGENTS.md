# AGENTS.md — AI 协作记忆文件

## 当前迭代（2026-09-12，v19 待本地验收）

- 分支 `feature/notes-llm-status`，三件套：随手记 + DeepSeek 余额状态灯 + 全量对抗性审查修复。
- **随手记**：顶栏「✎ 随手记」→ 浮窗（桌面居中/移动端贴底），记「日期+一句话」、按月翻看、`✦ AI 总结本月`（DeepSeek 主题聚类复盘，失败回退按周模板）。新表 `notes`；`lib/notes.ts`（仿 report.ts 两层）；API `GET/POST /api/notes`、`DELETE /api/notes/[id]`、`GET /api/notes/summary?month=`。
- **余额状态灯**：顶栏 8px 圆点（正常淡蓝/低额橙/失败红），点击弹金额+检查时间+重新检查。`lib/balance.ts`（服务端代理 api.deepseek.com/user/balance，key 不出服务端，缓存 5min，`?force=1` 跳过；低额阈值 `LLM_BALANCE_LOW_CNY` 默认 ¥5）+ `GET /api/llm-status`。
- **对抗性审查修复**：13 项确认 bug 已修（M1 apply/PATCH 状态语义对齐、M2 多步写全事务化、M3 乐观更新失败改重取、L1/L2 apply 不丢任务/子任务、L5/L6/L9/L11 输入校验、L7/L8/L13 前端容错、L10 迁移竞态、L12 失败反馈、O8 移除死字段开关、M4 缓解恢复快照 planned_date 归位）。完整清单见 `docs/superpowers/specs/2026-09-12-daily-notes-llm-status-design.md`。
- 已知遗留：M4 完整层级重建（快照未存父子关系）、L3 登录/parse 无限速（建议 nginx limit_req）、L4 时序安全比较（Edge Runtime 取舍）。
- 验收：95 测试全绿 + lint/build 零错误 + Playwright 冒烟（`scripts/smoke-v19.cjs`，截图在 `../../反馈截图/v19-smoke/`）；本地预览 http://127.0.0.1:5190（WORK_OS_DATA_DIR 数据副本，含 2 条种子随手记）。
- 种子数据（2026-09-11，用户口述）：进度把握不佳道具没提前购买到位 / 一站式一条咨询超时。本地已写入预览库；**部署后需写一次线上库**（Bearer token POST /api/notes）。
- ⚠️ dev 与 build 共用 .next：**严禁 dev 运行中跑 build**（本轮踩过，重启 dev 才恢复）。

## 当前视觉迭代（2026-09-05）

- 用户已确认先制作 A/B/C 视觉对比稿，重点提升视觉质感；另纳入四象限任务优先级和头像收藏/桌面图标。
- 分支：`feature/visual-comparison-v18`；产物与限制见 `docs/visual-v18/README.md`，可切换原型 `docs/visual-v18/index.html`，六张桌面/手机截图同目录。
- 状态（2026-09-06）：用户选定 C 并授权实施；正式页面、四档优先级和头像图标已完成本地实现。62 项测试、lint、build 通过；隔离数据库浏览器回归通过。待本地验收，未部署/合并。
- 优先级：tasks.priority 可空 1..4，旧任务 null；步骤 null 动态继承主任务，非空为单独覆盖。卡片、详情、手动新增和解析确认可编辑；周看板支持筛选与可选排序，默认不改变原排序。优先级不改变状态/日期/统计口径。
- 图标：app/icon.png 与 apple-icon.png 复用 256px 头像；manifest 用同一头像。已移除旧 favicon.ico，图标资源不受密码门拦截。真实设备收藏/主屏幕效果待验收。
- 本地预览 http://127.0.0.1:5190 使用 WORK_OS_DATA_DIR 指向临时目录中的本地数据副本；未刷新线上数据，正式 data/ 未被修改。截图见 docs/visual-v18/implementation/。

> 每轮开发对话结束前更新本文件，确保下轮对话能准确恢复上下文。**禁止凭记忆臆测，以本文件和代码为准。**
> **分工**：本文件管代码/技术/部署；产品背景、需求文档、视觉风格、业务规则见上级 `../AGENTS.md`。

## 项目概述

work-os：个人工作进度管理看板。自然语言录入（DeepSeek 解析）→ 确认卡片 → SQLite 落库；首页 = 数据统计条 + 周视图主视图，另有月视图与 AI 周报。

- 仓库：`https://github.com/Kim-ho-design/sanjin-gongzuoguanli`（私有）
- 本地路径：`D:/Desktop/coding项目/个人工作进度管理看板/work-os`
- UI 参考：`D:/Desktop/coding项目/个人工作进度管理看板/视觉风格参考图/`（bento 大圆角、像素元素、蓝白黑）

## 技术栈与结构

- Next.js 14 App Router + TypeScript + Tailwind（Kimi 官方品牌体系 v17 起：主色品牌蓝 `#007CFF`，`kimi` 色阶 500 锚点、900=深锚 `#002F5B`；辅助色 `bean.*`：亮蓝/深蓝/B05 亮绿=完成/橙=超期·卡点·反问/中性灰/薰衣草/墨青；文字 `#121212`；底色暖白 `#FAF9F6`；等宽位 Geist Mono；错误/删除保留红色；v10~v16 曾为拼豆配色）
- better-sqlite3（WAL），库文件 `data/work-os.db`（gitignored）；`lib/db.ts` 单例 `getDb()`，建表 SQL 导出为 `SCHEMA_SQL`
- 迁移 v4~v11 幂等 SQL（未用 user_version）：v7 父任务 planned_date→同名子任务；**v8 状态简化：待确认审核→已完成（回填 completed_at）、待办事项→待启动**；**v9 tasks 加 prev_status 列**（级联完成时记子任务原状态）；v10 品牌蓝 #3375F6→C07 #305FB9，项目预置色板换拼豆 8 色；**v11 拼豆色→Kimi 品牌色板（#305FB9→#007CFF 等 4 色 remap，默认值同步）**
- DeepSeek：`lib/llm.ts`（`callDeepSeek` 共享；`callParse` JSON 模式；`callReport` 文本模式）；模型默认 **deepseek-v4-flash**（deepseek-chat 已被平台下线返回 400，`DEEPSEEK_MODEL` 环境变量可覆盖，如 deepseek-v4-pro 带推理更慢更贵），密钥只在服务端环境变量
- **v16 解析双通道**（`callParse` + `needsThinkingRetry`）：v4-flash 默认开思考（effort=high），复杂句实测 14~88s 撞 nginx 60s 504 → 默认**关思考**快解析（2~3s）；快通道结果不可信（意图 unclear，或原话含时间词但所有日期字段全空）→ 自动带思考重试一次。LLM 调用统一 45s 超时兜底（AbortController），LlmError 走 502 JSON，前端（InputBox/ConfirmCard）对非 JSON 响应显示"服务开小差了"。prompt v16 加固：总分枚举拆子任务（"X定稿，其中A…；B…"→ 1父N子，会议也算子任务）、date_check 先出对照再出结果、名称保真、今天/明天/后天/昨天/前天日期锚点、"要交"类示例（规则 2.1/2.2/8/10 + 示例 6/7/8）
- 测试：Vitest（`npm test`），`lib/__tests__/`（含 parse-retry.test.ts 双通道判定用例，v16）
- **Agent 接入（v15）**：middleware 对 /api/* 放行 `Authorization: Bearer $WORK_OS_API_TOKEN`（未设不启用，cookie 密码门不变）；**v15.1 起支持逗号分隔多 token**（每工具一把，可单独吊销）；`GET /api/report?format=data` 原始聚合 JSON、`GET /api/tasks` 过滤列表；CLI `scripts/workos.sh` + 用户级 skill `~/.agents/skills/workos/`；token 由个人网站后台「🔑 密钥」页统一管理（同步写服务器 .env + 重启本应用），也存本机 `~/.config/workos/config`，绝不入仓库
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
- 应用目录 `/root/sanjin-gongzuoguanli`：`next start` 跑 :3000；**用户访问入口 `https://work.sanjin.art`**（v14 起：nginx 反代 `work.sanjin.art` → 127.0.0.1:3000，Certbot HTTPS，配置 `/etc/nginx/conf.d/work.sanjin.art.conf`；**v16 起 proxy_read_timeout 120s**，配合 LLM 45s 应用层超时，杜绝 504 HTML 错误页；`http://IP:3000` 直连仍可用）
- GitHub push：本机 git 配了 127.0.0.1:7890 代理，代理没开时用 `git -c http.proxy= -c https.proxy= push` 直连
- **绝不覆盖**：服务器上的 `data/`（生产 SQLite）和 `.env`
- **同机多应用警告（2026-08-09 起）**：服务器还有 diet-os(:3001) 等 next-server；重启一律按端口杀（`fuser -k <port>/tcp`），`pkill -f` 模式既会误杀邻居、也会匹配 ssh 自己命令行杀掉会话（exit 255）；内存常年接近打满（OOM 会静默杀进程），启动带 `NODE_OPTIONS=--max-old-space-size=512`

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
  # ⚠️ 同机还有 diet-os(:3001) 等 next 应用：绝不能 pgrep/pkill -f "next-server"（会全杀），按端口杀
  fuser -k 3000/tcp 2>/dev/null; sleep 2
  nohup env NODE_OPTIONS=--max-old-space-size=512 npm start > app.log 2>&1 &'

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

## 预览数据同步修正（2026-09-06 11:43）

用户明确授权下载线上完整最新快照用于验收。已通过 SQLite backup 读取一致性快照到独立本地临时目录（WORK_OS_DATA_DIR），预览端口仍为 5190。线上未修改，原本地预览副本保留。
线上与预览 163 条任务的 id/name/project_id/status/deadline/planned_date/parent_task_id/completed_at 摘要完全一致。浏览器逐日核对本周 15 条、上周 11 条日期记录，全部正确归位；截图 implementation/live-week-0.png、live-week-1.png。
这是 11:43 的线上快照，不持续自动同步。先前 22 条旧本地副本不再用于本次验收。

## 优先级滚动修复（2026-09-06）

WeekView 内嵌定义的 Card/DayColumn/ToggleBtn 在父组件更新时被重新创建，保存优先级会导致实际 DOM 重挂载。已移到模块级组件，通过 WeekContext 获取当前数据，保留组件身份与滚动锚点。未修改数据和业务规则。
验证：62 项测试、lint、build 通过；scripts/verify-priority-scroll.cjs 拦截 PATCH、无数据写入，1280px 成功滚动 440→440，390px 成功 2266→2266，原节点保留；失败时错误提示带来 28px 高度变化但无回顶。预览 5190 已重启，仍使用 11:43 线上快照及此后本地验收改动。

## v18 已上线（2026-09-06）

用户完成本地验收并明确授权部署。运行版本 9418423（feature/visual-comparison-v18），已部署 https://work.sanjin.art 。服务器独立构建成功，仅重启 3000 端口，未覆盖 data/ 或 .env，未将本地预览优先级写回线上。

验证：公开域名与服务器本地首页、/api/board 正常；163 条任务的 id/name/project_id/status/deadline/planned_date/parent_task_id/completed_at 摘要与切换前完全一致；priority 字段存在；头像与 manifest 访问正常。62 项测试、lint、build、滚动位置回归在上线前通过。

备份：/root/backups/workos-pre-v18-20260906/runtime.tar.gz 与 work-os.db，保留 rollback/ 代码。首次切换的校验脚本误用 Response.ok() 自动回滚，纠正为 Response.ok 后第二次部署及数据检查通过。发布包和独立构建目录已清理。

仓库：分支已推送，审核单 https://github.com/Kim-ho-design/sanjin-gongzuoguanli/pull/1 。审核单 mergeable=CONFLICTING，尚未合并。拉取 main 第一次连接重置，第二次自动审批因额度限制拒绝，未执行冲突处理；以后恢复时先 fetch 最新 main 再人工核对差异，勿覆盖历史改动。线上发布已完成，不受此影响。
