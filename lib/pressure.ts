// 每日压力分：天气预报式预警等级（v12 起）
// 设计原则：真实体现"闲忙压力"，而不是"有没有动作"——
//   耗时/截止是最强的压力信号；完成是产出；计划是待发压力；记录条数只是弱信号。
// 等级（对标气象预警 蓝→黄→橙→红）：
//   0 灰 · 无安排   当天什么信号都没有
//   1 蓝 · 轻松     压力分 < 2      偶有动作，没什么压在身上
//   2 黄 · 适中     2 ~ 4.5        正常工作日的量（如 2h 投入 + 1 项完成）
//   3 橙 · 偏忙     4.5 ~ 7        明显饱和（如 4h+2完成，或两个截止压顶）
//   4 红 · 高压     ≥ 7            拉满/超载（如 6h+，或截止+计划合计 4 项以上）

export interface DayPressureInput {
  log_count: number;
  hours: number;
  completed: number;
  /** 当天对外截止且未完成 */
  due: number;
  /** 当天计划要做且未完成 */
  planned: number;
}

/** 压力分 = 耗时×1 + 完成×1 + 截止×2 + 计划×1 + 记录×0.3 */
export function pressureScore(s: DayPressureInput): number {
  return s.hours + s.completed + s.due * 2 + s.planned + s.log_count * 0.3;
}

export type PressureLevel = 0 | 1 | 2 | 3 | 4;

export function pressureLevel(s: DayPressureInput | undefined): PressureLevel {
  if (!s) return 0;
  const hasSignal = s.log_count + s.completed + s.due + s.planned > 0 || s.hours > 0;
  if (!hasSignal) return 0;
  const score = pressureScore(s);
  if (score < 2) return 1;
  if (score < 4.5) return 2;
  if (score < 7) return 3;
  return 4;
}

export const PRESSURE_LABELS = ['无安排', '轻松', '适中', '偏忙', '高压'] as const;
