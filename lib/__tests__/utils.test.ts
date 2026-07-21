import { describe, it, expect } from 'vitest';
import { weekRange, isOverdue, weekCompletion, splitByProgress, prefillTaskFromLog } from '../utils';

// 2026-07-20 是周一，所在自然周为 07-20 ~ 07-26
const WED = '2026-07-22';

describe('weekRange', () => {
  it('以周一为起点、周日为终点', () => {
    expect(weekRange('2026-07-20')).toEqual({ start: '2026-07-20', end: '2026-07-26' }); // 周一
    expect(weekRange(WED)).toEqual({ start: '2026-07-20', end: '2026-07-26' }); // 周三
    expect(weekRange('2026-07-26')).toEqual({ start: '2026-07-20', end: '2026-07-26' }); // 周日归本周
  });

  it('跨月时正确推移', () => {
    expect(weekRange('2026-08-01')).toEqual({ start: '2026-07-27', end: '2026-08-02' }); // 周六
  });
});

describe('isOverdue', () => {
  it('无日期不逾期', () => {
    expect(isOverdue(null, '进行中')).toBe(false);
  });

  it('已完成不逾期；其余状态过期即逾期', () => {
    expect(isOverdue('2000-01-01', '已完成')).toBe(false);
    expect(isOverdue('2000-01-01', '进行中')).toBe(true);
    expect(isOverdue('2000-01-01', '待启动')).toBe(true);
  });

  it('日期在未来 → 不逾期', () => {
    expect(isOverdue('2999-01-01', '进行中')).toBe(false);
  });
});

describe('weekCompletion', () => {
  // 父任务看 deadline，子任务看 planned_date；两者都传给函数，内部区分
  const parent = (deadline: string | null, status: string) => ({
    deadline,
    planned_date: null,
    status,
    parent_task_id: null,
  });
  const sub = (plannedDate: string | null, status: string) => ({
    deadline: null,
    planned_date: plannedDate,
    status,
    parent_task_id: 1,
  });

  it('精确复现（生产数据 2026-07-21 口径，v8 迁移后）：父 10 + 子 7，已完成 5 → 5/17', () => {
    // 匿名化真实数据：父任务 10 条 deadline 在本周（2 条已完成），子任务 7 条 planned_date 在本周（3 条已完成）
    const parents = [
      parent('2026-07-20', '已完成'), // 原「待确认审核」，v8 迁移后=已完成
      parent('2026-07-21', '进行中'),
      parent('2026-07-22', '进行中'),
      parent('2026-07-23', '待启动'),
      parent('2026-07-23', '待启动'),
      parent('2026-07-24', '待启动'),
      parent('2026-07-24', '进行中'),
      parent('2026-07-25', '已完成'),
      parent('2026-07-26', '待启动'),
      parent('2026-07-26', '待启动'),
    ];
    const subs = [
      sub('2026-07-20', '待启动'),
      sub('2026-07-21', '待启动'),
      sub('2026-07-22', '待启动'),
      sub('2026-07-23', '已完成'),
      sub('2026-07-24', '已完成'),
      sub('2026-07-25', '待启动'),
      sub('2026-07-26', '已完成'),
    ];
    expect(weekCompletion([...parents, ...subs], '2026-07-21')).toEqual({ done: 5, total: 17 });
  });

  it('只认「已完成」为分子', () => {
    const tasks = [parent('2026-07-21', '已完成'), parent('2026-07-22', '进行中'), sub('2026-07-22', '进行中')];
    expect(weekCompletion(tasks, WED)).toEqual({ done: 1, total: 3 });
  });

  it('子任务按 planned_date 计入，与父任务日期互不干扰', () => {
    const tasks = [
      parent('2026-07-21', '已完成'),
      parent(null, '进行中'), // 无 deadline 的父任务不计
      sub('2026-07-21', '已完成'),
      sub(null, '待启动'), // 无 planned_date 的子任务不计
    ];
    expect(weekCompletion(tasks, WED)).toEqual({ done: 2, total: 2 });
  });

  it('日期在本周之外或为空的任务不计入', () => {
    const tasks = [
      parent('2026-07-19', '进行中'), // 上周日
      parent('2026-07-27', '进行中'), // 下周一
      parent(null, '进行中'),
      sub('2026-07-19', '待启动'), // 子任务同理
      sub('2026-07-27', '待启动'),
    ];
    expect(weekCompletion(tasks, WED)).toEqual({ done: 0, total: 0 });
  });
});

describe('splitByProgress（自动统计看板分列）', () => {
  const TODAY = '2026-07-21';
  const parent = (deadline: string | null, status = '进行中') => ({
    deadline,
    planned_date: null,
    status,
    parent_task_id: null,
  });
  const sub = (plannedDate: string | null, status = '待启动') => ({
    deadline: null,
    planned_date: plannedDate,
    status,
    parent_task_id: 1,
  });

  it('待启动 = 未完结 且（日期>今天 或 无日期）', () => {
    const { todo } = splitByProgress([parent('2026-07-25'), parent(null), sub('2026-07-24'), sub(null)], TODAY);
    expect(todo).toHaveLength(4);
  });

  it('进行中 = 未完结 且 日期≤今天（含超期），超期按日期升序置顶', () => {
    const { doing } = splitByProgress(
      [parent('2026-07-21'), parent('2026-07-19'), sub('2026-07-20'), parent(null)],
      TODAY,
    );
    expect(doing.map((t) => t.deadline ?? t.planned_date)).toEqual(['2026-07-19', '2026-07-20', '2026-07-21']);
  });

  it('已完成 = 状态「已完成」（不论日期）', () => {
    const { done, todo, doing } = splitByProgress(
      [parent(null, '已完成'), parent('2026-07-19', '已完成'), sub('2026-07-25', '已完成')],
      TODAY,
    );
    expect(done).toHaveLength(3);
    expect(todo).toHaveLength(0);
    expect(doing).toHaveLength(0);
  });

  it('子任务按 planned_date 归列，父任务按 deadline 归列', () => {
    const { todo, doing } = splitByProgress(
      [parent('2026-07-25'), sub('2026-07-20')], // 父未来→待启动；子过期→进行中
      TODAY,
    );
    expect(todo).toHaveLength(1);
    expect(doing).toHaveLength(1);
    expect(doing[0].parent_task_id).toBe(1);
  });
});

describe('prefillTaskFromLog', () => {
  it('名称取日志内容摘要（去空白，截 20 字），状态默认已完成', () => {
    const t = prefillTaskFromLog('  今天写了 三期脚本初稿，还改了海报   ');
    expect(t.name).toBe('今天写了三期脚本初稿，还改了海报');
    expect(t.status).toBe('已完成');
    expect(t.matched_existing).toBe(false);
    expect(t.subtasks).toEqual([]);
  });

  it('超长截断到 20 字；空内容兜底名称', () => {
    expect(prefillTaskFromLog('一'.repeat(30)).name).toHaveLength(20);
    expect(prefillTaskFromLog('   ').name).toBe('补记的工作');
  });
});
