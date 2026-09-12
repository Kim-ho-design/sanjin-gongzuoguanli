# v19 设计：随手记 + DeepSeek 余额状态灯 + 全量对抗性审查修复

> 2026-09-12 · 分支 `feature/notes-llm-status` · 状态：本地验收中（未部署）
> 关联计划：会话计划 nova-prime-orphan-shatterstar.md

## 需求（用户拍板）

1. **随手记**：工作过程中产生的问题/现象，月末复盘常忘。要「日期 + 一句话」快速记录 + list 翻看 + 月末 AI 总结。不占据看板主区域；顶栏显眼按钮 + 精美浮窗（非抽屉）。
   - 种子数据（2026-09-11，用户口述 2 条）：进度把握不佳拍摄道具没提前购买到位 / 一站式一条咨询超时。
2. **DeepSeek 余额**：顶栏小圆点状态灯，平时无感，悬停/点击见金额，低额/失败变色提醒。
3. **对抗性审查**：全代码审查明显 bug 并修复。

## 设计

### 随手记

- 表：`notes(id, note_date YYYY-MM-DD, content ≤500字, created_at)`，幂等并入 SCHEMA_SQL + `idx_notes_date`。
- API（cookie 门 + Bearer 门之后，agent 可用）：`GET/POST /api/notes`、`DELETE /api/notes/[id]`、`GET /api/notes/summary?month=`。
- 浮窗 `components/NotesPanel.tsx`：桌面居中 / 移动端贴底（`max-h-[86dvh]`），标题行 + 月份切换；输入区（date + 单行 + 记下，回车提交，记到别的月自动切月）；列表（日期 chip 带 weekdayCn、悬停删除）；底部「✦ AI 总结本月」→ 浮窗内嵌 markdown（`report-md`）+ 复制 + 返回列表。
- 总结 `lib/notes.ts` 仿 `lib/report.ts` 两层：`collectNotes` → `callReport`（主题聚类 + 模式点明 + 2~3 条可执行建议 + 禁编造）→ 失败回退 `renderNotesTemplate`（按周分组平铺 + 顶部兜底提示）；空月短路不打 LLM。
- 种子数据不做代码 seed：本地经 API 写入预览库；部署后写一次线上库。

### 余额状态灯

- `lib/balance.ts`：服务端代理 `GET https://api.deepseek.com/user/balance`（key 不出服务端，10s 超时，防御式解析）；内存缓存 5 分钟，`force=1` 跳过；低额阈值默认 ¥5，`LLM_BALANCE_LOW_CNY` 可覆盖。
- `app/api/llm-status/route.ts` 返回 `{ok, balance, currency, low, checked_at, error?}`。
- `components/LlmStatusDot.tsx`：8px 圆点三态（正常 `bg-kimi-300` / 低额橙 / 失败红），title 悬停提示，点击弹迷你浮层（金额 + 检查时间 + 重新检查）。

### 对抗性审查修复（详见 `docs/审查报告-v19.md` 摘要，below）

已修：M1（apply 与 PATCH 状态语义对齐 + update_task 可匹配已完成任务重新打开）、M2（apply/PATCH 级联/DELETE 项目/任务/认领/恢复 全部事务化）、M3（乐观更新失败改重取不回滚快照）、L1（apply 挂不上项目不提前返回）、L2（matched_existing 子任务并入）、L5（GET /api/tasks 数值参数 400）、L6（LLM 日期真实日期校验）、L7（周报页 HTML 错误页容错）、L8（月视图切日竞态序号丢弃）、L9（PATCH name/completed_date/project_id 校验 + 级联时间统一）、L10（迁移 ALTER 吞 duplicate column）、L11（拒绝子任务的子任务）、L12（UnclaimedPanel/removeProject 失败反馈）、L13（InputBox 条件清空）、O8（移除无效「☆ 今日」开关）、M4 缓解（恢复快照 planned_date 归位同名子任务）。

记录未修（取舍/另开任务）：M4 完整层级重建（快照带 parent 关系）、L3 登录/parse 限速（建议 nginx limit_req）、L4 时序安全比较（Edge Runtime 无 node:crypto，既有取舍）。

## 验收

- 95 项 Vitest 全绿（新增 notes 23 项 + review-fixes 10 项）；lint/build 零错误。
- Playwright 冒烟（`scripts/smoke-v19.cjs`）：1280/390 双宽截图，浮窗记/删/AI 总结、余额灯浮层全链路通过；截图在 `../../反馈截图/v19-smoke/`。
- 本地预览：http://127.0.0.1:5190（WORK_OS_DATA_DIR=/tmp/workos-v19-preview，线上 09-06 快照副本 + 2 条种子记录）。
