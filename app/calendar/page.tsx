'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AvatarLogo, PixelLoader } from '@/components/Pixel';
import { pressureLevel, pressureScore, PRESSURE_LABELS } from '@/lib/pressure';

interface DayStat {
  log_count: number;
  hours: number;
  completed: number;
  due: number;
  planned: number;
}

interface DayDetail {
  date: string;
  logs: { id: number; raw_text: string; duration_hours: number | null; blocker: string | null; created_at: string; task_name: string; project_name: string; project_color: string }[];
  completed: { id: number; name: string; status: string; project_name: string; project_color: string }[];
  due: { id: number; name: string; status: string; project_name: string; project_color: string }[];
  planned: { id: number; name: string; status: string; project_name: string; project_color: string }[];
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function dateStr(d: Date): string {
  return `${monthStr(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

// 每日压力：单色蓝阶热力（v17 起，Kimi 手册「灰底 + 蓝色高亮」原则）—— 无安排 / 灰 / 浅蓝 / 亮蓝 / 深锚
// 评分规则见 lib/pressure.ts（耗时×1 + 完成×1 + 截止×2 + 计划×1 + 记录×0.3）
const HEAT = [
  'bg-transparent', // 0 · 无安排
  'bg-[#E1E3E6]/60', // 1 灰 · 轻松
  'bg-kimi-200/70', // 2 浅蓝 · 适中
  'bg-kimi-400/85', // 3 亮蓝 · 偏忙
  'bg-kimi-900', // 4 深海军蓝 · 高压
];

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [days, setDays] = useState<Record<string, DayStat>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const mStr = monthStr(cursor);
  const today = dateStr(new Date());

  const load = useCallback(async () => {
    const res = await fetch(`/api/calendar?month=${mStr}`);
    if (res.ok) {
      const data = await res.json();
      setDays(data.days);
    }
  }, [mStr]);

  useEffect(() => {
    load();
  }, [load]);

  async function selectDay(d: string) {
    setSelected(d);
    setLoadingDetail(true);
    const res = await fetch(`/api/calendar/day?date=${d}`);
    if (res.ok) setDetail(await res.json());
    setLoadingDetail(false);
  }

  function shiftMonth(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    setSelected(null);
    setDetail(null);
  }

  // 构建月历格子（周一起始）
  const firstDow = (cursor.getDay() === 0 ? 7 : cursor.getDay()) - 1; // 周一=0
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${mStr}-${String(i + 1).padStart(2, '0')}`),
  ];

  return (
    <main className="min-h-screen ascii-bg flex flex-col">
      <header className="flex items-center gap-3 px-5 max-md:px-3 py-3 border-b border-line bg-panel/80 backdrop-blur">
        <AvatarLogo size={30} />
        <h1 className="font-bold tracking-wide">月视图</h1>
        <span className="text-[10px] font-mono text-ink-faint tracking-[0.25em] hidden sm:inline">MONTHLY</span>
        <Link href="/" className="ml-auto text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors">
          ← 看板
        </Link>
      </header>

      <div className="px-5 max-md:px-3 py-4 flex flex-col md:flex-row gap-4 flex-1 items-start max-w-6xl w-full mx-auto">
        {/* 日历 */}
        <div className="panel p-4 flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shiftMonth(-1)} className="text-ink-faint hover:text-kimi-600 px-2 text-lg">‹</button>
            <p className="font-mono text-base font-bold tracking-wider">{mStr}</p>
            <button onClick={() => shiftMonth(1)} className="text-ink-faint hover:text-kimi-600 px-2 text-lg">›</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK_LABELS.map((w) => (
              <p key={w} className="text-center text-xs font-mono text-ink-faint py-1">{w}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const s = days[d];
              const heat = pressureLevel(s);
              const isToday = d === today;
              const isSelected = d === selected;
              const onDark = heat >= 3; // 亮蓝/深锚深格上文字转白
              return (
                <button
                  key={d}
                  onClick={() => selectDay(d)}
                  title={
                    s && heat > 0
                      ? `${PRESSURE_LABELS[heat]}（压力 ${pressureScore(s).toFixed(1)}）｜耗时${s.hours}h 完成${s.completed} 截止${s.due} 计划${s.planned} 记录${s.log_count}`
                      : undefined
                  }
                  className={`aspect-square rounded-lg border text-left p-1.5 flex flex-col transition-colors ${HEAT[heat]} ${
                    isSelected ? 'border-kimi-500 ring-1 ring-kimi-500/50' : 'border-line hover:border-kimi-300'
                  }`}
                >
                  <span className={`text-sm font-mono ${isToday ? 'text-white bg-kimi-500 rounded-full w-6 h-6 flex items-center justify-center' : onDark ? 'text-white' : 'text-ink-soft'}`}>
                    {Number(d.slice(8))}
                  </span>
                  {s && (s.log_count > 0 || s.completed > 0 || s.due > 0 || s.planned > 0) && (
                    <span className="mt-auto flex flex-wrap gap-x-1.5 text-[11px] font-mono leading-tight">
                      {s.hours > 0 && <span className={onDark ? 'text-white' : 'text-kimi-600'}>{s.hours}h</span>}
                      {s.log_count > 0 && <span className={onDark ? 'text-white/90' : 'text-ink-soft'}>✎{s.log_count}</span>}
                      {s.completed > 0 && <span className={onDark ? 'text-white' : 'text-bean-green'}>✓{s.completed}</span>}
                      {s.due > 0 && <span className={onDark ? 'text-white' : d < today ? 'text-bean-orange' : 'text-bean-steel'}>截{s.due}</span>}
                      {s.planned > 0 && s.due === 0 && <span className={onDark ? 'text-white/80' : 'text-ink-faint'}>计{s.planned}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 图例：天气预报式压力等级 */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-3 text-xs font-mono text-ink-faint">
            <span>压力：</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="flex items-center gap-1">
                <span className={`w-3.5 h-3.5 rounded ${HEAT[i]} border border-line`} />
                {PRESSURE_LABELS[i]}
              </span>
            ))}
            <span className="ml-1">✎记录 ✓完成 h耗时 截截止 计计划</span>
          </div>
          <p className="mt-1 text-[11px] font-mono text-ink-faint/80">
            压力分 = 耗时×1 + 完成×1 + 截止×2 + 计划×1 + 记录×0.3 ｜ 蓝&lt;2 ≤黄&lt;4.5 ≤橙&lt;7 ≤红（悬停格子看明细）
          </p>
        </div>

        {/* 当天详情（移动端置于日历下方，全宽） */}
        <div className="panel p-4 w-full md:w-80 shrink-0 md:max-h-[calc(100vh-120px)] overflow-y-auto">
          {!selected && (
            <p className="text-sm text-ink-faint text-center py-10">点一天查看当天详情</p>
          )}
          {selected && loadingDetail && (
            <p className="text-center py-10"><PixelLoader /></p>
          )}
          {selected && !loadingDetail && detail && (
            <div>
              <p className="font-mono text-sm font-bold mb-3">{detail.date}</p>

              {detail.completed.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-mono text-bean-green tracking-wider mb-1">✓ 当天完成</p>
                  {detail.completed.map((t) => (
                    <p key={t.id} className="text-sm py-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-[2px] shrink-0" style={{ backgroundColor: t.project_color }} />
                      {t.name}
                    </p>
                  ))}
                </div>
              )}

              <div className="mb-3">
                <p className="text-xs font-mono text-ink-faint tracking-wider mb-1">✎ 进展记录（{detail.logs.length}）</p>
                {detail.logs.length === 0 && <p className="text-sm text-ink-faint">当天没有记录</p>}
                {detail.logs.map((l) => (
                  <div key={l.id} className="border-l-2 border-kimi-200 pl-2 py-1 mb-1.5">
                    <p className="text-[11px] font-mono text-ink-faint">
                      {l.created_at.slice(11, 16)} · {l.project_name} · {l.task_name}
                    </p>
                    <p className="text-sm leading-snug">{l.raw_text}</p>
                    {(l.duration_hours || l.blocker) && (
                      <p className="text-[11px] font-mono">
                        {l.duration_hours ? <span className="text-ink-soft">{l.duration_hours}h </span> : null}
                        {l.blocker ? <span className="text-bean-orange">卡点：{l.blocker}</span> : null}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {detail.due.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-mono text-bean-steel tracking-wider mb-1">⚑ 对外截止</p>
                  {detail.due.map((t) => (
                    <p key={t.id} className="text-sm py-0.5">
                      {t.name} <span className="text-ink-faint">（{t.status}）</span>
                    </p>
                  ))}
                </div>
              )}

              {detail.planned.length > 0 && (
                <div>
                  <p className="text-xs font-mono text-kimi-600 tracking-wider mb-1">◷ 我的计划</p>
                  {detail.planned.map((t) => (
                    <p key={t.id} className="text-sm py-0.5">
                      {t.name} <span className="text-ink-faint">（{t.status}）</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
