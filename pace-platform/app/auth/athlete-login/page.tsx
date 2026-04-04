'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { RoleMismatchBanner } from '@/components/auth/role-mismatch-banner';
import {
  signInWithMagicLink,
  signInWithGoogle,
} from '@/lib/supabase/auth-helpers';

// ---------------------------------------------------------------------------
// 選手ログインページ（モバイルPWA向け）
// ---------------------------------------------------------------------------

function AthleteLoginContent() {
  const searchParams = useSearchParams();
  const showStaffBanner = searchParams.get('from') === 'staff';
  const errorParam = searchParams.get('error');

  async function handleMagicLink(email: string) {
    return signInWithMagicLink(email, 'athlete');
  }

  async function handleGoogle() {
    await signInWithGoogle('athlete');
  }

  return (
    <AuthCard
      title="選手ログイン"
      subtitle="for Athletes"
      variant="athlete"
      footer={
        <div className="space-y-2">
          <Link
            href="/auth/login"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            スタッフの方はこちら
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ロール不一致バナー */}
        {showStaffBanner && (
          <RoleMismatchBanner
            message="スタッフの方はこちらからログインしてください"
            href="/auth/login"
            linkText="スタッフログイン"
          />
        )}

        {/* URLパラメータエラー */}
        {errorParam && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {decodeURIComponent(errorParam)}
          </div>
        )}

        {/* Magic Link フォーム（推奨） */}
        <MagicLinkForm
          variant="default"
          onSubmit={handleMagicLink}
          buttonLabel="ログインリンクを送信"
        />

        {/* 区切り線 */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-3 text-gray-400">または</span>
          </div>
        </div>

        {/* Google OAuth */}
        <OAuthButtons variant="default" onGoogleLogin={handleGoogle} />

        {/* 新規登録セクション */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-center text-sm text-gray-500 mb-3">
            はじめての方
          </p>
          <Link
            href="/auth/athlete-register"
            className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-emerald-200 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
          >
            新規登録（チームコード）
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}

export default function AthleteLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <AthleteLoginContent />
    </Suspense>
  );
}
