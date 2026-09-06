'use client';

export const priorityLabels = ['未设置', '重要且紧急', '重要不紧急', '紧急不重要', '不紧急不重要'];
export type PriorityValue = 1 | 2 | 3 | 4 | null;

export default function PrioritySelect({ value, onChange, inherit, disabled, label = '任务优先级' }: {
  value?: PriorityValue; onChange: (value: PriorityValue) => void; inherit?: PriorityValue;
  disabled?: boolean; label?: string;
}) {
  return <select aria-label={label} disabled={disabled} value={value ?? ''}
    onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => e.stopPropagation()}
    onChange={(e) => onChange(e.target.value ? Number(e.target.value) as PriorityValue : null)}
    className={`priority-select priority-${value ?? inherit ?? 0}`}>
    <option value="">{inherit !== undefined ? `跟随主任务${inherit ? ` · ${priorityLabels[inherit]}` : ' · 未设置'}` : '未设置'}</option>
    {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{priorityLabels[v]}</option>)}
  </select>;
}
