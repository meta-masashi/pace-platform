'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { OfflineBadge } from '@/app/_components/offline-badge';
import { RoleSwitchToggle } from '@/components/layout/role-switch-toggle';

interface StaffHeaderProps {
  user: User;
  teamName?: string;
}

/** ダッシュボード（トップレベル）のパス — 戻るボタン不要 */
const TOP_LEVEL_PATHS = ['/dashboard'];

export function StaffHeader({ user, teamName }: StaffHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const showBack = !TOP_LEVEL_PATHS.includes(pathname);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName =
    user.user_metadata?.full_name ?? user.email ?? 'スタッフ';
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {teamName && (
          <span className="text-sm font-semibold text-foreground">{teamName}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <RoleSwitchToggle userId={user.id} />
        <OfflineBadge />
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </div>
          <span className="hidden text-sm font-medium lg:inline">
            {displayName}
          </span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-popover py-1 shadow-lg">
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <a
              href="/settings"
              className="block px-3 py-2 text-sm hover:bg-accent"
            >
              設定
            </a>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="w-full px-3 py-2 text-left text-sm text-critical-500 hover:bg-accent"
              >
                ログアウト
              </button>
            </form>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
