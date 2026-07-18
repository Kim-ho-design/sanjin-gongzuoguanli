'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PixelLogo } from '@/components/Pixel';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace('/');
    } else {
      setError('口令错误，再试一次');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="line-card p-8 w-full max-w-sm flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <PixelLogo size={32} />
          <div>
            <h1 className="text-lg font-bold tracking-wide">工作OS</h1>
            <p className="text-xs text-ink-faint font-mono">WORK OS · LOGIN</p>
          </div>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="输入访问口令"
          autoFocus
          className="w-full border border-line rounded-lg px-4 py-2.5 text-sm outline-none focus:border-kimi-500 transition-colors bg-white"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-kimi-500 hover:bg-kimi-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '验证中…' : '进入'}
        </button>
      </form>
    </main>
  );
}
