'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { RoleMismatchBanner } from '@/components/auth/role-mismatch-banner';

// ---------------------------------------------------------------------------
// 選手ログインページ（モバイルPWA向け・メール+パスワード）
// ---------------------------------------------------------------------------

function AthleteLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showStaffBanner = searchParams.get('from') === 'staff';
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    errorParam ? decodeURIComponent(errorParam) : null,
  );
  const [loading, setLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [locked, setLocked] = useState<{ remainingMinutes?: number } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRemainingAttempts(null);
    setLocked(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? '認証エラーが発生しました。');
        if (data.locked) {
          setLocked({ remainingMinutes: data.remainingMinutes });
        } else if (data.remainingAttempts !== undefined) {
          setRemainingAttempts(data.remainingAttempts);
        }
        return;
      }

      router.push(data.redirectTo ?? '/home');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`ログインエラー: ${msg}`);
    } finally {
      setLoading(false);
    }
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

        {/* メール + パスワードフォーム */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="athlete-email"
              className="block text-sm font-medium text-gray-700"
            >
              メールアドレス
            </label>
            <input
              id="athlete-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="athlete-password"
              className="block text-sm font-medium text-gray-700"
            >
              パスワード
            </label>
            <input
              id="athlete-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="パスワードを入力"
            />
          </div>

          {/* アカウントロック警告 */}
          {locked && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              アカウントが一時的にロックされています。
              {locked.remainingMinutes && ` 約${locked.remainingMinutes}分後に再度お試しください。`}
            </div>
          )}

          {/* 通常エラー */}
          {error && !locked && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* 残り試行回数 */}
          {remainingAttempts !== null && remainingAttempts <= 3 && !locked && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              残り試行回数: <span className="font-bold">{remainingAttempts}回</span>
              {remainingAttempts <= 1 && '（次回失敗でアカウントがロックされます）'}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || locked !== null}
            className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'ログイン中...' : locked ? 'アカウントロック中' : 'ログイン'}
          </button>
        </form>

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
