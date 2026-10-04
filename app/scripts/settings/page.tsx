'use client';
// 提示词设置：账号 tab + 三区（基础提示词只读 / 自动提炼规则只读+重新提炼 / 手动补充可编辑）
import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { PixelLoader } from '@/components/Pixel';
import {
  ACCOUNT_META,
  type PromptProfileClient,
} from '@/components/scripts/shared';

type Account = 'yizhanshi' | 'laiqiao';

export default function SettingsPage() {
  const [account, setAccount] = useState<Account>('yizhanshi');
  const [profile, setProfile] = useState<PromptProfileClient | null>(null);
  const [manualNotes, setManualNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [regening, setRegening] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async (acc: Account) => {
    try {
      const res = await fetch(`/api/scripts/prompts?account=${acc}`, { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error();
      const p = (await res.json()) as { profile: PromptProfileClient };
      setProfile(p.profile);
      setManualNotes(p.profile.manual_notes);
    } catch {
      setError('提示词加载失败，请刷新重试');
    }
  }, []);

  useEffect(() => {
    setProfile(null);
    void load(account);
  }, [account, load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function saveManual() {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch('/api/scripts/prompts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, manual_notes: manualNotes }),
      });
      if (!res.ok) throw new Error();
      showToast('手动补充已保存，下次生成即生效（优先级最高）');
    } catch {
      showToast('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function regen() {
    setRegening(true);
    try {
      const res = await fetch('/api/scripts/prompts/regen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || '提炼失败，请重试');
      setProfile((d as { profile: PromptProfileClient }).profile);
      showToast('风格规则已重新提炼');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '提炼失败，请重试');
    } finally {
      setRegening(false);
    }
  }

  return (
    <AppShell>
      <main className="min-h-screen pb-24 md:pb-10">
        <div className="px-6 max-md:px-4 py-6 max-w-[900px] mx-auto flex flex-col gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">提示词设置</h1>
            <p className="text-xs text-ink-faint mt-1">基础角色 + 自动提炼区（AI 维护）+ 手动补充区（优先级最高）。</p>
          </div>

          {/* 账号 tab */}
          <div className="flex gap-1.5">
            {(Object.keys(ACCOUNT_META) as Account[]).map((acc) => (
              <button
                key={acc}
                onClick={() => setAccount(acc)}
                className={`text-xs border rounded-lg px-4 py-2 transition-colors ${
                  account === acc
                    ? 'bg-kimi-500 text-white border-kimi-500'
                    : 'border-transparent text-ink-soft hover:bg-white hover:border-line'
                }`}
              >
                {ACCOUNT_META[acc].label}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {!profile && !error && <p className="text-sm text-ink-faint py-10 text-center font-mono">LOADING…</p>}

          {profile && (
            <div className="flex flex-col gap-4">
              {/* 基础提示词（只读） */}
              <section className="panel p-4 flex flex-col gap-2">
                <h2 className="text-sm font-bold">基础提示词</h2>
                <pre className="text-xs leading-relaxed bg-[#FCFCFB] border border-line rounded-card px-3 py-2.5 max-h-72 overflow-auto whitespace-pre-wrap font-mono">
                  {profile.base_prompt || '（空）'}
                </pre>
                <p className="text-[11px] text-ink-faint">由系统维护，定义角色、输出结构与风格基线。如需调整请找管理员改种子。</p>
              </section>

              {/* 自动提炼规则（只读 + 重新提炼） */}
              <section className="panel p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-sm font-bold">自动提炼规则</h2>
                  <span className="text-[11px] text-ink-faint">
                    {profile.auto_rules_updated_at
                      ? `上次提炼：${profile.auto_rules_updated_at.slice(0, 16)}`
                      : '尚未提炼（认可样稿后自动触发）'}
                  </span>
                  <button
                    onClick={() => void regen()}
                    disabled={regening}
                    className="ml-auto text-xs rounded-lg px-3 py-1.5 border border-line text-ink-soft hover:border-kimi-400 hover:text-kimi-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {regening && <PixelLoader />}
                    {regening ? '提炼中…' : '⟳ 立即重新提炼'}
                  </button>
                </div>
                <pre className="text-xs leading-relaxed bg-[#FCFCFB] border border-line rounded-card px-3 py-2.5 max-h-56 overflow-auto whitespace-pre-wrap">
                  {profile.auto_rules || '（还没有规则。把满意的好稿收为样稿，AI 会通读样稿自动提炼。）'}
                </pre>
              </section>

              {/* 手动补充（可编辑） */}
              <section className="panel p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold">手动补充</h2>
                  <span className="text-[10px] rounded-full px-2 py-0.5 font-medium bg-kimi-50 text-kimi-600">优先级最高</span>
                </div>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={4}
                  placeholder="比如：口播再短句一点；开头别用问句；徕乔的备注里提醒带安全提示……"
                  className="input-dark text-sm px-3 py-2 resize-y"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void saveManual()}
                    disabled={saving || manualNotes === profile.manual_notes}
                    className="text-sm rounded-lg px-4 py-2 bg-kimi-500 text-white hover:bg-kimi-600 transition-colors shadow-btn font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? '保存中…' : '保存手动补充'}
                  </button>
                  {manualNotes !== profile.manual_notes && (
                    <span className="text-xs text-[#B07815]">有未保存的改动</span>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        {toast && (
          <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-kimi-50 border border-kimi-200 text-ink text-xs rounded-lg px-4 py-2.5 shadow-lg shadow-kimi-500/20 z-50 max-w-lg max-md:max-w-[calc(100vw-2rem)]">
            {toast}
          </div>
        )}
      </main>
    </AppShell>
  );
}
