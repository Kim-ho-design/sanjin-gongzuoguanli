import { describe, it, expect } from 'vitest';
import { weekRange, isOverdue, weekCompletion, groupTodayItems, prefillTaskFromLog } from '../utils';

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
  it('无 deadline 不逾期', () => {
    expect(isOverdue(null, '进行中')).toBe(false);
  });

  it('已完成 / 待确认审核 不逾期（待确认审核=已交付待验收）', () => {
    expect(isOverdue('2000-01-01', '已完成')).toBe(false);
    expect(isOverdue('2000-01-01', '待确认审核')).toBe(false);
  });

  it('deadline 早于今天且未完结 → 逾期', () => {
    expect(isOverdue('2000-01-01', '进行中')).toBe(true);
    expect(isOverdue('2000-01-01', '待办事项')).toBe(true);
    expect(isOverdue('2000-01-01', '待启动')).toBe(true);
  });

  it('deadline 在未来 → 不逾期', () => {
    expect(isOverdue('2999-01-01', '进行中')).toBe(false);
  });
});

describe('weekCompletion', () => {
  const parent = (deadline: string | null, status: string) => ({
    deadline,
    status,
    parent_task_id: null,
  });

  it('精确复现：6 个本周 deadline 父任务，1 个待确认审核、0 个已完成 → 0/6', () => {
    const tasks = [
      parent('2026-07-20', '进行中'),
      parent('2026-07-21', '待启动'),
      parent('2026-07-22', '待办事项'),
      parent('2026-07-23', '进行中'),
      parent('2026-07-24', '待启动'),
      parent('2026-07-25', '待确认审核'), // 待确认审核不计入分子
    ];
    expect(weekCompletion(tasks, WED)).toEqual({ done: 0, total: 6 });
  });

  it('只认「已完成」为分子', () => {
    const tasks = [parent('2026-07-21', '已完成'), parent('2026-07-22', '待确认审核')];
    expect(weekCompletion(tasks, WED)).toEqual({ done: 1, total: 2 });
  });

  it('子任务混入时不计入分母', () => {
    const tasks = [
      parent('2026-07-21', '已完成'),
      { deadline: '2026-07-21', status: '已完成', parent_task_id: 1 }, // 子任务
      { deadline: null, status: '待办事项', parent_task_id: 1 }, // 子任务
    ];
    expect(weekCompletion(tasks, WED)).toEqual({ done: 1, total: 1 });
  });

  it('deadline 在本周之外或为空的父任务不计入', () => {
    const tasks = [
      parent('2026-07-19', '进行中'), // 上周日
      parent('2026-07-27', '进行中'), // 下周一
      parent(null, '进行中'),
    ];
    expect(weekCompletion(tasks, WED)).toEqual({ done: 0, total: 0 });
  });
});

describe('groupTodayItems', () => {
  const TODAY = '2026-07-22';
  const parent = (id: number, over: { status?: string; is_today?: number; deadline?: string | null } = {}) => ({
    id,
    status: over.status ?? '进行中',
    is_today: over.is_today ?? 0,
    deadline: over.deadline ?? null,
  });
  const sub = (parentId: number, over: { status?: string; planned_date?: string | null } = {}) => ({
    status: over.status ?? '待办事项',
    planned_date: over.planned_date ?? TODAY,
    parent_task_id: parentId,
  });

  it('父在今日 + 子在今日 → 同组', () => {
    const groups = groupTodayItems([parent(1, { is_today: 1 })], [sub(1)], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].task.id).toBe(1);
    expect(groups[0].subs).toHaveLength(1);
  });

  it('仅子在今日 → 父卡片也显示，只列该子任务', () => {
    const groups = groupTodayItems([parent(1), parent(2)], [sub(1), sub(2, { planned_date: '2026-07-23' })], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].task.id).toBe(1);
    expect(groups[0].subs).toHaveLength(1);
  });

  it('都不在今日 → 空', () => {
    const groups = groupTodayItems([parent(1)], [sub(1, { planned_date: '2026-07-23' })], TODAY);
    expect(groups).toHaveLength(0);
  });

  it('已完成的子任务不计；已完成父任务只靠子任务入组', () => {
    const groups = groupTodayItems(
      [parent(1, { status: '已完成' })],
      [sub(1, { status: '已完成' }), sub(1)],
      TODAY,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].subs).toHaveLength(1);
  });

  it('星标父任务置顶', () => {
    const groups = groupTodayItems(
      [parent(1, { deadline: TODAY }), parent(2, { is_today: 1 })],
      [],
      TODAY,
    );
    expect(groups.map((g) => g.task.id)).toEqual([2, 1]);
  });
});

describe('prefillTaskFromLog', () => {
  it('名称取日志内容摘要（去空白，截 20 字）', () => {
    const t = prefillTaskFromLog('  今天写了 三期脚本初稿，还改了海报   ');
    expect(t.name).toBe('今天写了三期脚本初稿，还改了海报');
    expect(t.status).toBe('待确认审核');
    expect(t.matched_existing).toBe(false);
    expect(t.subtasks).toEqual([]);
  });

  it('超长截断到 20 字；空内容兜底名称', () => {
    expect(prefillTaskFromLog('一'.repeat(30)).name).toHaveLength(20);
    expect(prefillTaskFromLog('   ').name).toBe('补记的工作');
  });
});
