'use client';
// 带 AI 局部改写的 textarea：选中文字浮出「✦ AI 改写」→ 输入一句改法 → 原地替换，可撤销一次
import { useRef, useState } from 'react';

interface Props {
  scriptId: number;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  inputMode?: 'input' | 'textarea';
}

export default function RewriteTextarea({
  scriptId,
  value,
  onChange,
  rows = 3,
  placeholder,
  className = '',
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [undo, setUndo] = useState<string | null>(null);

  const selectedText = sel && sel.end > sel.start ? value.slice(sel.start, sel.end) : '';

  function handleSelect() {
    const el = taRef.current;
    if (!el) return;
    if (el.selectionStart !== el.selectionEnd) {
      setSel({ start: el.selectionStart, end: el.selectionEnd });
    }
  }

  async function doRewrite() {
    if (!instruction.trim() || !sel) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/scripts/${scriptId}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value.slice(sel.start, sel.end), instruction: instruction.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || 'AI 服务开小差了，请重试');
      const rewritten = (d as { rewritten: string }).rewritten;
      setUndo(value);
      onChange(value.slice(0, sel.start) + rewritten + value.slice(sel.end));
      setOpen(false);
      setInstruction('');
      setSel(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 服务开小差了，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onSelect={handleSelect}
        onChange={(e) => {
          setUndo(null);
          setSel(null);
          onChange(e.target.value);
        }}
        className={`input-dark text-sm px-3 py-2 resize-y w-full ${className}`}
      />

      {/* 选中文字后浮出的改写入口 */}
      {selectedText && !open && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen(true);
            setErr('');
          }}
          className="absolute top-1.5 right-1.5 text-[11px] rounded-md px-2 py-1 bg-kimi-500 text-white shadow-btn hover:bg-kimi-600 transition-colors"
        >
          ✦ AI 改写
        </button>
      )}

      {/* 改写输入浮层 */}
      {open && (
        <div className="absolute top-8 right-0 z-30 w-64 panel shadow-pop p-3 flex flex-col gap-2">
          <p className="text-[11px] text-ink-faint leading-snug">改法（如「更口语一点」「压到两句话」）：</p>
          <input
            autoFocus
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doRewrite();
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="更口语一点"
            className="input-dark text-xs px-2.5 py-2"
          />
          {err && <p className="text-[11px] text-red-500">{err}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setOpen(false)}
              className="text-xs px-2.5 py-1.5 rounded-md text-ink-soft hover:bg-[#F0F1F3] transition-colors"
            >
              取消
            </button>
            <button
              onClick={doRewrite}
              disabled={loading || !instruction.trim()}
              className="text-xs px-3 py-1.5 rounded-md bg-kimi-500 text-white hover:bg-kimi-600 transition-colors disabled:opacity-50"
            >
              {loading ? '改写中…' : '改写'}
            </button>
          </div>
        </div>
      )}

      {/* 撤销上一次替换 */}
      {undo !== null && !open && (
        <button
          onClick={() => {
            onChange(undo);
            setUndo(null);
          }}
          className="absolute bottom-1.5 right-1.5 text-[11px] text-kimi-600 bg-kimi-50 border border-kimi-200 rounded-md px-2 py-0.5 hover:bg-kimi-100 transition-colors"
        >
          ↩ 撤销改写
        </button>
      )}
    </div>
  );
}
