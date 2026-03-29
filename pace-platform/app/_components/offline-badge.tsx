'use client';

/**
 * M16 — PWA オフライン状態バッジ
 *
 * ネットワーク接続が切断された場合にヘッダー右上にオレンジ色のバナーを表示する。
 * window.navigator.onLine の初期値を取得し、online / offline イベントを監視する。
 */

import { useEffect, useState } from 'react';

export function OfflineBadge() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // 初期状態を設定（SSR では navigator が存在しないため useEffect 内で取得）
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 rounded-full bg-watchlist-500/15 px-2.5 py-1 text-xs font-medium text-watchlist-600 ring-1 ring-watchlist-500/30"
    >
      {/* Wi-Fi オフアイコン */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
        <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0122.56 9" />
        <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
        <path d="M8.53 16.11a6 6 0 016.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      オフライン
    </div>
  );
}
