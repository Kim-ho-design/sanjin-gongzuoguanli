'use client';
// 应用外壳（脚本工作台起）：桌面左侧边栏 + 移动端底部 tab bar，导航 看板/脚本/样稿库/设置
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AvatarLogo } from './Pixel';

type IconProps = { className?: string };

function BoardIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1.5" y="1.5" width="5" height="13" rx="1.5" />
      <rect x="9.5" y="1.5" width="5" height="8" rx="1.5" />
    </svg>
  );
}

function ScriptIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 1.5h6L13.5 5v9a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" />
      <path d="M9.5 1.5V5h4" />
      <path d="M5.5 8.5h5M5.5 11h5" />
    </svg>
  );
}

function PolishIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 1.5 12 4 5.5 10.5 2.8 11.2 3.5 8.5 9.5 1.5Z" />
      <path d="M11.5 6.5 13 8" />
      <path d="M2 13.5h6" />
    </svg>
  );
}

function SampleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.7l-3.8 2 .7-4.4-3.1-3 4.3-.6L8 1.8Z" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
    </svg>
  );
}

const NAV = [
  { href: '/', label: '看板', icon: BoardIcon },
  { href: '/scripts', label: '脚本', icon: ScriptIcon },
  { href: '/scripts/polish', label: '润色', icon: PolishIcon },
  { href: '/scripts/samples', label: '样稿库', icon: SampleIcon },
  { href: '/scripts/settings', label: '设置', icon: SettingsIcon },
];

function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/scripts') {
    return pathname.startsWith('/scripts') &&
      !pathname.startsWith('/scripts/samples') &&
      !pathname.startsWith('/scripts/settings') &&
      !pathname.startsWith('/scripts/polish');
  }
  return pathname.startsWith(href);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen kimi-workspace">
      {/* 桌面左侧边栏 */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-[200px] bg-white border-r border-line z-40">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-line/70 shrink-0">
          <AvatarLogo size={28} />
          <div className="leading-tight">
            <p className="text-sm font-bold">三金内容工作台</p>
            <p className="text-[9px] font-mono text-ink-faint tracking-[0.12em]">CONTENT WORKBENCH</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-card px-3 py-2.5 text-[13px] transition-colors ${
                  active
                    ? 'bg-kimi-50 text-kimi-600 font-medium'
                    : 'text-ink-soft hover:bg-kimi-50/60 hover:text-kimi-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <p className="px-5 pb-4 text-[10px] font-mono text-ink-faint">v21 · work-os</p>
      </aside>

      {/* 内容区（桌面留出边栏宽度） */}
      <div className="md:pl-[200px]">{children}</div>

      {/* 移动端底部 tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line flex h-14">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-kimi-600' : 'text-ink-faint'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px]">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
