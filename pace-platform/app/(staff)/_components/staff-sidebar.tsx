'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

/** 仕様書 v6.0: 4つのアクションハブ */
const NAV_HUBS = [
  {
    href: '/dashboard',
    label: 'チーム',
    sublabel: 'コンディション・トリアージ',
    icon: DashboardIcon,
    matchPaths: ['/dashboard', '/triage', '/copilot'],
  },
  {
    href: '/athletes',
    label: '選手',
    sublabel: 'データ・アセスメント',
    icon: AthletesIcon,
    matchPaths: ['/athletes', '/assessment', '/rehab', '/soap'],
  },
  {
    href: '/training',
    label: '計画',
    sublabel: 'カレンダー・AIサジェスト',
    icon: TrainingIcon,
    matchPaths: ['/training', '/what-if'],
  },
  {
    href: '/reports',
    label: 'Analytics',
    sublabel: 'データ分析・レポート',
    icon: RehabIcon,
    matchPaths: ['/reports'],
  },
] as const;

/** ユーティリティリンク */
const UTILITY_ITEMS = [
  { href: '/community', label: 'コミュニティ', icon: CommunityIcon },
  { href: '/settings', label: '設定', icon: SettingsIcon },
] as const;

/** 管理ハブ（masterのみ、独立タブ） */
const ADMIN_HUB = {
  href: '/admin',
  label: '管理',
  sublabel: 'チーム・スタッフ',
  icon: AdminIcon,
  matchPaths: ['/admin'],
} as const;

const ADMIN_SUB_ITEMS = [
  { href: '/admin', label: 'ダッシュボード', icon: AdminIcon },
  { href: '/admin/teams', label: 'チーム作成', icon: TeamManageIcon },
  { href: '/admin/staff', label: 'スタッフ', icon: StaffManageIcon },
] as const;

/** 設定内の請求リンク（masterのみ） */
const BILLING_ITEM = { href: '/admin/billing', label: '請求管理', icon: BillingIcon } as const;

export function StaffSidebar() {
  const pathname = usePathname();
  const [isMaster, setIsMaster] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    async function checkRole() {
      try {
        const { getUserRole } = await import('@/lib/supabase/auth-helpers');
        const role = await getUserRole();
        setIsMaster(role === 'master');
      } catch (err) { void err; // silently handled
        setIsMaster(false);
      }
    }
    checkRole();
  }, []);

  return (
    <aside
      className={`hidden shrink-0 border-r border-border bg-card md:flex md:flex-col transition-all duration-200 ${
        collapsed ? 'w-[68px]' : 'w-60'
      }`}
    >
      {/* Logo + Collapse Toggle */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shrink-0">
            <span className="text-sm font-bold text-primary-foreground">P</span>
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold tracking-tight">PACE</span>
          )}
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={collapsed ? '展開' : '折りたたむ'}
        >
          <CollapseIcon className="h-4 w-4" collapsed={collapsed} />
        </button>
      </div>

      {/* 4 Action Hubs */}
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {NAV_HUBS.map(({ href, label, sublabel, icon: Icon, matchPaths }) => {
            const isActive = matchPaths.some(
              (p) => pathname === p || pathname.startsWith(`${p}/`),
            );
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? `${label} — ${sublabel}` : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <div className="flex flex-col">
                    <span>{label}</span>
                    <span className="text-[10px] font-normal text-muted-foreground">{sublabel}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        {/* ユーティリティ */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="space-y-1">
            {UTILITY_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  title={collapsed ? label : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && label}
                </Link>
              );
            })}
            {/* 請求管理（設定内、masterのみ） */}
            {isMaster && (
              <Link
                href={BILLING_ITEM.href}
                title={collapsed ? BILLING_ITEM.label : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === BILLING_ITEM.href
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <BILLING_ITEM.icon className="h-4 w-4 shrink-0" />
                {!collapsed && BILLING_ITEM.label}
              </Link>
            )}
          </div>
        </div>

        {/* 管理タブ（master のみ） */}
        {isMaster && (
          <div className="mt-4 border-t border-border pt-4">
            {/* 管理ハブ */}
            <Link
              href={ADMIN_HUB.href}
              title={collapsed ? `${ADMIN_HUB.label} — ${ADMIN_HUB.sublabel}` : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                ADMIN_HUB.matchPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <ADMIN_HUB.icon className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <div className="flex flex-col">
                  <span>{ADMIN_HUB.label}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">{ADMIN_HUB.sublabel}</span>
                </div>
              )}
            </Link>
            {/* 管理サブメニュー（展開時のみ） */}
            {!collapsed && ADMIN_HUB.matchPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && (
              <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-border pl-3">
                {ADMIN_SUB_ITEMS.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}

          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        {!collapsed && (
          <p className="text-xs text-muted-foreground">PACE Platform v6.0</p>
        )}
      </div>
    </aside>
  );
}

// コラプストグルアイコン
function CollapseIcon({ className, collapsed }: { className?: string; collapsed: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {collapsed ? (
        <>
          <path d="M13 17l5-5-5-5" />
          <path d="M6 17l5-5-5-5" />
        </>
      ) : (
        <>
          <path d="M11 17l-5-5 5-5" />
          <path d="M18 17l-5-5 5-5" />
        </>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icon components (minimal, no external deps)
// ---------------------------------------------------------------------------

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function AthletesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function RehabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CommunityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function StaffManageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function TeamManageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BillingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function TrainingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5h11" />
      <path d="M6.5 17.5h11" />
      <path d="M4 6.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
      <path d="M20 6.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
      <path d="M4 12.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
      <path d="M20 12.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}
