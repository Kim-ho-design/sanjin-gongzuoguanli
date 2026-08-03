'use client';

import { useState } from 'react';
import type { ParseResult } from '@/lib/types';
import { PixelLoader } from './Pixel';

export default function InputBox({
  onParsed,
}: {
  onParsed: (rawText: string, parsed: ParseResult) => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const input = text.trim();
    if (!input || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      });
      // 容错：网关超时等情况返回的是 HTML 错误页，res.json() 会抛 "Unexpected token '<'" 天书
      const data = await res.json().catch(() => null);
      if (!data) throw new Error('服务开小差了，请稍后重试');
      if (!res.ok) throw new Error(data.error || '解析失败');
      setText('');
      onParsed(input, data.parsed as ParseResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel rounded-3xl px-4 py-3 transition-all focus-within:!border-kimi-400 focus-within:ring-4 focus-within:ring-kimi-500/15">
      <div className="flex gap-2 items-center">
        <span className="text-kimi-500 font-mono text-sm pl-1 select-none">&gt;</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="说人话就行：今天做了什么、接下来要做什么、卡在哪了…  Enter 发送"
          rows={1}
          className="flex-1 resize-none text-sm outline-none px-2 py-1.5 placeholder:text-ink-faint/80 bg-transparent text-ink"
        />
        <button
          onClick={submit}
          disabled={loading || !text.trim()}
          className="shrink-0 bg-kimi-500 hover:bg-kimi-400 text-white text-sm rounded-xl px-5 py-2 font-medium transition-all shadow-btn hover:-translate-y-px disabled:opacity-40 disabled:shadow-none disabled:translate-y-0 flex items-center gap-2"
        >
          {loading ? <PixelLoader /> : '发送'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1.5 px-2">{error}</p>}
    </div>
  );
}
