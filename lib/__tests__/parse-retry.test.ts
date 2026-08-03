// needsThinkingRetry 双通道判定测试（v16）：纯函数，不碰 API
import { describe, it, expect } from 'vitest';
import { needsThinkingRetry } from '../llm';
import type { ParseResult } from '../types';

function makeParsed(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    intent: 'create_task',
    project: { name: '', is_new: false, confidence: 0 },
    tasks: [],
    log: { content: '', date: null },
    needs_confirmation: false,
    clarify_question: '',
    ...overrides,
  };
}

const taskWithDeadline = {
  name: 'X',
  matched_existing: false,
  status: '待启动',
  deadline: '2026-08-04',
  parent_task_name: null,
  subtasks: [],
};

describe('needsThinkingRetry（v16 双通道）', () => {
  it('意图 unclear → 重试', () => {
    expect(needsThinkingRetry('随便一句话', makeParsed({ intent: 'unclear' }))).toBe(true);
  });

  it('原话有时间词（明天/周X/X月X号/要交）但所有日期字段全空 → 重试', () => {
    const noDate = makeParsed({
      tasks: [{ ...taskWithDeadline, deadline: null }],
    });
    expect(needsThinkingRetry('海报明天要交', noDate)).toBe(true);
    expect(needsThinkingRetry('周五上午产品培训', noDate)).toBe(true);
    expect(needsThinkingRetry('8月6号要交海报', noDate)).toBe(true);
    expect(needsThinkingRetry('今天下班前给我', noDate)).toBe(true);
  });

  it('时间词已落日期（deadline / planned_date / log.date 任一）→ 不重试', () => {
    expect(needsThinkingRetry('海报明天要交', makeParsed({ tasks: [taskWithDeadline] }))).toBe(false);
    const withSub = makeParsed({
      tasks: [{ ...taskWithDeadline, deadline: null, subtasks: [{ name: '写初稿', planned_date: '2026-08-05' }] }],
    });
    expect(needsThinkingRetry('周三写初稿', withSub)).toBe(false);
    const withLogDate = makeParsed({ log: { content: '剪完视频', date: '2026-08-02' } });
    expect(needsThinkingRetry('昨天剪完了视频', withLogDate)).toBe(false);
  });

  it('原话无时间词 → 不重试（快通道结果直接用）', () => {
    expect(needsThinkingRetry('GEO落地页文案改完了', makeParsed())).toBe(false);
  });
});
