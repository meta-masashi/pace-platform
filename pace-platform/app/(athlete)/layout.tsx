/**
 * PACE Platform -- アスリートエリア共通レイアウト
 *
 * モバイルファースト設計（max-width: 430px 中央寄せ）。
 * 下部タブナビゲーション付き。認証チェックはミドルウェアで処理。
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "アスリートホーム",
};

// ---------------------------------------------------------------------------
// タブ定義
// ---------------------------------------------------------------------------

interface TabItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function HomeIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function CheckInIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const TABS: TabItem[] = [
  { href: "/home", label: "ホーム", icon: <HomeIcon /> },
  { href: "/checkin", label: "チェックイン", icon: <CheckInIcon /> },
  { href: "/menu", label: "メニュー", icon: <MenuIcon /> },
  { href: "/profile", label: "プロフィール", icon: <ProfileIcon /> },
];

// ---------------------------------------------------------------------------
// レイアウト
// ---------------------------------------------------------------------------

export default function AthleteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* メインコンテンツ（最大幅430pxで中央寄せ） */}
      <main className="mx-auto w-full max-w-[430px] flex-1 px-4 pb-20 pt-6">
        {children}
      </main>

      {/* 下部タブナビゲーション */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[430px] items-center justify-around py-2">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {tab.icon}
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
