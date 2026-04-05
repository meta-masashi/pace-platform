'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { RoleMismatchBanner } from '@/components/auth/role-mismatch-banner';

// ---------------------------------------------------------------------------
// ロックアイコン SVG
// ---------------------------------------------------------------------------

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// スタッフログインページ（メール + パスワードのみ）
// ---------------------------------------------------------------------------

function StaffLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showAthleteBanner = searchParams.get('from') === 'athlete';
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

      router.push(data.redirectTo ?? '/dashboard');
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
      title="スタッフログイン"
      subtitle="for Staff"
      variant="staff"
      footer={
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
          <Link href="/auth/athlete-login" className="hover:text-gray-700 transition-colors">
            選手の方はこちら
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ロール不一致バナー */}
        {showAthleteBanner && (
          <RoleMismatchBanner
            message="選手の方はこちらからログインしてください"
            href="/auth/athlete-login"
            linkText="選手ログイン"
          />
        )}

        {/* メール + パスワードフォーム */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="staff-email" className="block text-sm font-medium text-gray-700">
              メールアドレス
            </label>
            <input
              id="staff-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              data-testid="email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label htmlFor="staff-password" className="block text-sm font-medium text-gray-700">
              パスワード
            </label>
            <input
              id="staff-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              data-testid="password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="パスワードを入力"
            />
          </div>

          {/* アカウントロック警告 */}
          {locked && (
            <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-3">
              <LockIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-800">アカウントが一時的にロックされています</p>
                <p className="mt-1 text-xs text-red-600">
                  セキュリティ保護のため、ログイン試行が一時的に制限されています。
                  {locked.remainingMinutes && ` 約${locked.remainingMinutes}分後に再度お試しください。`}
                </p>
              </div>
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
            data-testid="login-button"
            className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'ログイン中...' : locked ? 'アカウントロック中' : 'ログイン'}
          </button>
        </form>
      </div>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <StaffLoginContent />
    </Suspense>
  );
}
