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
      const data = await res.json();
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
    <div className="line-card p-3">
      <div className="flex gap-2 items-start">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="说人话就行：做了什么、要做什么、卡在哪了…（Enter 发送）"
          rows={1}
          className="flex-1 resize-none text-sm outline-none px-2 py-1.5 placeholder:text-ink-faint bg-transparent"
        />
        <button
          onClick={submit}
          disabled={loading || !text.trim()}
          className="shrink-0 bg-kimi-500 hover:bg-kimi-600 text-white text-sm rounded-lg px-4 py-1.5 font-medium transition-colors disabled:opacity-40 flex items-center gap-2"
        >
          {loading ? <PixelLoader /> : '发送'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5 px-2">{error}</p>}
    </div>
  );
}
