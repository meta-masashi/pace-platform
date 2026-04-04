'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// AuthCard — ログイン画面共通カードコンポーネント
// ---------------------------------------------------------------------------

interface AuthCardProps {
  /** カードタイトル（例: "スタッフログイン"） */
  title: string;
  /** サブタイトル（例: "for Staff"） */
  subtitle?: string;
  /** テーマバリアント */
  variant?: 'staff' | 'athlete' | 'admin';
  /** カード内コンテンツ */
  children: ReactNode;
  /** フッターリンク群 */
  footer?: ReactNode;
}

export function AuthCard({
  title,
  subtitle,
  variant = 'staff',
  children,
  footer,
}: AuthCardProps) {
  const isAdmin = variant === 'admin';

  return (
    <div
      className={`flex min-h-screen items-center justify-center px-4 py-8 ${
        isAdmin
          ? 'bg-slate-950'
          : 'bg-gradient-to-br from-emerald-50 to-emerald-100'
      }`}
    >
      <div className="w-full max-w-md space-y-6">
        {/* ロゴ + タイトル */}
        <div className="text-center">
          <h1
            className={`text-3xl font-bold tracking-tight ${
              isAdmin ? 'text-white' : 'text-emerald-800'
            }`}
          >
            PACE
          </h1>
          {subtitle && (
            <p
              className={`mt-1 text-xs tracking-wider ${
                isAdmin ? 'text-slate-400' : 'text-gray-400'
              }`}
            >
              {subtitle}
            </p>
          )}
          <p
            className={`mt-2 text-lg font-semibold ${
              isAdmin ? 'text-slate-200' : 'text-gray-700'
            }`}
          >
            {title}
          </p>
        </div>

        {/* カード本体 */}
        <div
          className={`rounded-xl p-6 shadow-lg ${
            isAdmin
              ? 'border border-slate-700 bg-slate-900'
              : 'border border-gray-100 bg-white'
          }`}
        >
          {children}
        </div>

        {/* フッター */}
        {footer && (
          <div className="text-center">{footer}</div>
        )}

        {/* 共通フッター */}
        <div className="text-center space-y-1">
          <div
            className={`flex items-center justify-center gap-3 text-xs ${
              isAdmin ? 'text-slate-600' : 'text-gray-400'
            }`}
          >
            <Link href="/privacy" className="hover:underline">
              プライバシーポリシー
            </Link>
            <span>|</span>
            <Link href="/tokushoho" className="hover:underline">
              利用規約
            </Link>
          </div>
          <p
            className={`text-xs ${
              isAdmin ? 'text-slate-700' : 'text-gray-300'
            }`}
          >
            &copy; 2026 PACE Platform. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
