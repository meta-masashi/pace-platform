'use client';

import Link from 'next/link';

// ---------------------------------------------------------------------------
// RoleMismatchBanner — 誤アクセス誘導バナー
// ---------------------------------------------------------------------------

interface RoleMismatchBannerProps {
  /** 誘導メッセージ */
  message: string;
  /** 誘導先パス */
  href: string;
  /** リンクテキスト */
  linkText: string;
  /** テーマ */
  variant?: 'default' | 'admin';
}

export function RoleMismatchBanner({
  message,
  href,
  linkText,
  variant = 'default',
}: RoleMismatchBannerProps) {
  const isAdmin = variant === 'admin';

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        isAdmin
          ? 'border-slate-600 bg-slate-800 text-slate-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{message}</span>
        <Link
          href={href}
          className={`whitespace-nowrap font-medium underline transition-colors ${
            isAdmin
              ? 'text-blue-400 hover:text-blue-300'
              : 'text-emerald-700 hover:text-emerald-900'
          }`}
        >
          {linkText} &rarr;
        </Link>
      </div>
    </div>
  );
}
