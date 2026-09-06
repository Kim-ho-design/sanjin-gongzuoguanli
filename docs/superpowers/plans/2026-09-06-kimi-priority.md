# C 视觉与优先级实施计划

已获用户确认执行。目标：C 视觉、独立四档优先级、头像图标，其余行为与业务口径不变。

1. 数据层：tasks 增加可空 priority（1..4）；幂等迁移；旧任务 null；步骤 null 动态继承主任务；API 校验；解析确认/项目恢复保留值。测试非法值、迁移、继承、未传值不重置。
2. 界面：新增共用 PrioritySelect；接入 QuickAdd/ConfirmCard/TaskDetail/WeekView；筛选仅作用周看板，默认关闭排序，保持已完成沉底。默认不改变任何原有过滤和操作。
3. 视觉：TopBar/page/InputBox/globals/WeekView 使用 C 暖白、品牌蓝与清楚文字层级；保留所有统计点击、自然语言、手动新增、拖拽、月视图、周报。
4. 图标：复用原头像为 icon/apple-icon/manifest；移除原 favicon；静态图标通过密码门白名单公开。
5. 验证：测试、lint、build；隔离临时数据库浏览器测试创建/优先级/继承/完成恢复/日期/筛选，1280/390 截图；本地预览，不部署或合并。
