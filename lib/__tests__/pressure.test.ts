// 压力分标准测试：锚定"内容策划普通工作日"的直觉，防阈值漂移
import { describe, it, expect } from 'vitest';
import { pressureLevel, pressureScore } from '../pressure';

const base = { log_count: 0, hours: 0, completed: 0, due: 0, planned: 0 };

describe('pressureLevel · 天气预报式四级', () => {
  it('无数据 / 全零 → 灰（无安排）', () => {
    expect(pressureLevel(undefined)).toBe(0);
    expect(pressureLevel(base)).toBe(0);
  });

  it('只记了一条没耗时 → 蓝（轻松），不再像以前那样轻易升级', () => {
    expect(pressureLevel({ ...base, log_count: 1 })).toBe(1);
  });

  it('普通工作日：2h + 完成 1 项 + 几条记录 → 黄（适中）', () => {
    expect(pressureLevel({ ...base, hours: 2, completed: 1, log_count: 3 })).toBe(2);
  });

  it('旧算法的"假拉满"场景（3 记录 + 2 完成，无耗时无截止）→ 黄，不是红', () => {
    expect(pressureLevel({ ...base, log_count: 3, completed: 2 })).toBe(2);
  });

  it('饱和日：4h + 2 完成 → 橙（偏忙）', () => {
    expect(pressureLevel({ ...base, hours: 4, completed: 2, log_count: 2 })).toBe(3);
  });

  it('截止压顶：2 个截止 + 1 个计划未完成 → 橙', () => {
    expect(pressureLevel({ ...base, due: 2, planned: 1 })).toBe(3);
  });

  it('拉满：6h 投入 → 红（高压）', () => {
    expect(pressureLevel({ ...base, hours: 6.5, log_count: 2 })).toBe(4);
  });

  it('超载：3 截止 + 2 计划 → 红', () => {
    expect(pressureLevel({ ...base, due: 3, planned: 2 })).toBe(4);
  });

  it('压力分权重：截止(×2) > 计划(×1) > 记录(×0.3)', () => {
    expect(pressureScore({ ...base, due: 1 })).toBe(2);
    expect(pressureScore({ ...base, planned: 1 })).toBe(1);
    expect(pressureScore({ ...base, log_count: 1 })).toBeCloseTo(0.3);
  });
});
