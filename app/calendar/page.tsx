'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AvatarLogo, PixelLoader } from '@/components/Pixel';

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

/** 工作量强度 0-4，决定格子底色深浅 */
function intensity(s: DayStat | undefined): number {
  if (!s) return 0;
  const score = s.log_count + s.completed * 2 + (s.hours >= 4 ? 1 : 0);
  if (score === 0) return 0;
  if (score <= 1) return 1;
  if (score <= 3) return 2;
  if (score <= 5) return 3;
  return 4;
}

// 预警式热力：蓝(轻) → 黄 → 橙 → 红(最重)
const HEAT = ['bg-transparent', 'bg-kimi-100', 'bg-amber-200', 'bg-orange-300', 'bg-red-400'];

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
      <header className="flex items-center gap-3 px-5 py-3 border-b border-line bg-panel/80 backdrop-blur">
        <AvatarLogo size={30} />
        <h1 className="font-bold tracking-wide">月视图</h1>
        <span className="text-[10px] font-mono text-ink-faint tracking-[0.25em] hidden sm:inline">MONTHLY</span>
        <Link href="/" className="ml-auto text-xs border border-line rounded-full px-3 py-1.5 hover:border-kimi-400 hover:text-kimi-600 transition-colors">
          ← 看板
        </Link>
      </header>

      <div className="px-5 py-4 flex gap-4 flex-1 items-start max-w-6xl w-full mx-auto">
        {/* 日历 */}
        <div className="panel p-4 flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shiftMonth(-1)} className="text-ink-faint hover:text-kimi-600 px-2 text-lg">‹</button>
            <p className="font-mono text-sm font-bold tracking-wider">{mStr}</p>
            <button onClick={() => shiftMonth(1)} className="text-ink-faint hover:text-kimi-600 px-2 text-lg">›</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK_LABELS.map((w) => (
              <p key={w} className="text-center text-[10px] font-mono text-ink-faint py-1">{w}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const s = days[d];
              const heat = intensity(s);
              const isToday = d === today;
              const isSelected = d === selected;
              return (
                <button
                  key={d}
                  onClick={() => selectDay(d)}
                  className={`aspect-square rounded-lg border text-left p-1.5 flex flex-col transition-colors ${HEAT[heat]} ${
                    isSelected ? 'border-kimi-500 ring-1 ring-kimi-500/50' : 'border-line hover:border-kimi-300'
                  }`}
                >
                  <span className={`text-[11px] font-mono ${isToday ? 'text-white bg-kimi-500 rounded-full w-5 h-5 flex items-center justify-center' : 'text-ink-soft'}`}>
                    {Number(d.slice(8))}
                  </span>
                  {s && (s.log_count > 0 || s.completed > 0 || s.due > 0 || s.planned > 0) && (
                    <span className="mt-auto flex flex-wrap gap-x-1.5 text-[9px] font-mono leading-tight">
                      {s.hours > 0 && <span className="text-kimi-600">{s.hours}h</span>}
                      {s.log_count > 0 && <span className="text-ink-soft">✎{s.log_count}</span>}
                      {s.completed > 0 && <span className="text-emerald-600">✓{s.completed}</span>}
                      {s.due > 0 && <span className={d < today ? 'text-red-500' : 'text-amber-600'}>截{s.due}</span>}
                      {s.planned > 0 && s.due === 0 && <span className="text-ink-faint">计{s.planned}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 图例 */}
          <div className="flex items-center gap-3 mt-3 text-[10px] font-mono text-ink-faint">
            <span>工作量：</span>
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`w-3 h-3 rounded ${HEAT[i]} border border-line`} />
            ))}
            <span className="ml-2">✎记录 ✓完成 h耗时 截截止 计计划</span>
          </div>
        </div>

        {/* 当天详情 */}
        <div className="panel p-4 w-80 shrink-0 max-h-[calc(100vh-120px)] overflow-y-auto">
          {!selected && (
            <p className="text-xs text-ink-faint text-center py-10">点一天查看当天详情</p>
          )}
          {selected && loadingDetail && (
            <p className="text-center py-10"><PixelLoader /></p>
          )}
          {selected && !loadingDetail && detail && (
            <div>
              <p className="font-mono text-sm font-bold mb-3">{detail.date}</p>

              {detail.completed.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-mono text-emerald-600 tracking-wider mb-1">✓ 当天完成</p>
                  {detail.completed.map((t) => (
                    <p key={t.id} className="text-xs py-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-[2px] shrink-0" style={{ backgroundColor: t.project_color }} />
                      {t.name}
                    </p>
                  ))}
                </div>
              )}

              <div className="mb-3">
                <p className="text-[10px] font-mono text-ink-faint tracking-wider mb-1">✎ 进展记录（{detail.logs.length}）</p>
                {detail.logs.length === 0 && <p className="text-xs text-ink-faint">当天没有记录</p>}
                {detail.logs.map((l) => (
                  <div key={l.id} className="border-l-2 border-kimi-200 pl-2 py-1 mb-1.5">
                    <p className="text-[10px] font-mono text-ink-faint">
                      {l.created_at.slice(11, 16)} · {l.project_name} · {l.task_name}
                    </p>
                    <p className="text-xs leading-snug">{l.raw_text}</p>
                    {(l.duration_hours || l.blocker) && (
                      <p className="text-[10px] font-mono">
                        {l.duration_hours ? <span className="text-ink-soft">{l.duration_hours}h </span> : null}
                        {l.blocker ? <span className="text-red-500">卡点：{l.blocker}</span> : null}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {detail.due.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-mono text-amber-600 tracking-wider mb-1">⚑ 对外截止</p>
                  {detail.due.map((t) => (
                    <p key={t.id} className="text-xs py-0.5">
                      {t.name} <span className="text-ink-faint">（{t.status}）</span>
                    </p>
                  ))}
                </div>
              )}

              {detail.planned.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono text-kimi-600 tracking-wider mb-1">◷ 我的计划</p>
                  {detail.planned.map((t) => (
                    <p key={t.id} className="text-xs py-0.5">
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
