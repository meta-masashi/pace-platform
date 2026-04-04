'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import {
  signInWithMagicLink,
  signInWithGoogle,
} from '@/lib/supabase/auth-helpers';

// ---------------------------------------------------------------------------
// 管理者ログインページ（Slate/Dark テーマ）
// ---------------------------------------------------------------------------

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  async function handleMagicLink(email: string) {
    return signInWithMagicLink(email, 'admin');
  }

  async function handleGoogle() {
    await signInWithGoogle('admin');
  }

  return (
    <AuthCard
      title="管理者ログイン"
      subtitle="Platform Administration"
      variant="admin"
      footer={
        <div className="flex items-center justify-center gap-4 text-xs text-slate-600">
          <Link href="/auth/login" className="hover:text-slate-400 transition-colors">
            スタッフの方
          </Link>
          <span>|</span>
          <Link href="/auth/athlete-login" className="hover:text-slate-400 transition-colors">
            選手の方
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        {/* URLパラメータエラー */}
        {errorParam && (
          <div className="rounded-md border border-red-400/30 bg-red-900/20 p-3 text-sm text-red-300">
            {decodeURIComponent(errorParam)}
          </div>
        )}

        {/* Magic Link フォーム */}
        <MagicLinkForm
          variant="admin"
          onSubmit={handleMagicLink}
          buttonLabel="ログインリンクを送信"
        />

        {/* 区切り線 */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-slate-900 px-3 text-slate-500">または</span>
          </div>
        </div>

        {/* Google OAuth */}
        <OAuthButtons variant="admin" onGoogleLogin={handleGoogle} />

        {/* 管理者専用注記 */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-xs text-slate-500">
              この画面はプラットフォーム管理者専用です。管理者権限がない場合はアクセスできません。
            </p>
          </div>
        </div>
      </div>
    </AuthCard>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      }
    >
      <AdminLoginContent />
    </Suspense>
  );
}
