'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { signInWithPassword } from '@/lib/supabase/auth-helpers';

// ---------------------------------------------------------------------------
// 管理者ログインページ（Email + Password のみ）
// ---------------------------------------------------------------------------

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signInWithPassword(email, password);
      if (!result.success) {
        setError(result.error ?? 'ログインに失敗しました。');
        setLoading(false);
        return;
      }
      // パスワード認証はセッションが即座に確立される → 直接リダイレクト
      router.push('/platform-admin');
    } catch {
      setError('ログイン中にエラーが発生しました。');
      setLoading(false);
    }
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

        {/* フォームエラー */}
        {error && (
          <div className="rounded-md border border-red-400/30 bg-red-900/20 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Email + Password フォーム */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-sm font-medium text-slate-300 mb-1">
              メールアドレス
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-slate-300 mb-1">
              パスワード
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

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
