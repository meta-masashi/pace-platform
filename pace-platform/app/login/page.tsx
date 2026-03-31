'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithMagicLink,
  signInWithGoogle,
} from '@/lib/supabase/auth-helpers';
import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// 認証タブ定義
// ---------------------------------------------------------------------------

type AuthTab = 'magic-link' | 'google' | 'email-password';

const AUTH_TABS: { id: AuthTab; label: string }[] = [
  { id: 'magic-link', label: 'マジックリンク' },
  { id: 'google', label: 'Google' },
  { id: 'email-password', label: 'メール / パスワード' },
];

// ---------------------------------------------------------------------------
// Google アイコン SVG
// ---------------------------------------------------------------------------

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ログインページ
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AuthTab>('magic-link');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // URL パラメータからエラーメッセージを取得
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError && !error) {
      setError(decodeURIComponent(urlError));
    }
  }

  // --- Magic Link ---
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const result = await signInWithMagicLink(email);
      if (result.success) {
        setSuccess('メールを確認してください。リンクをクリックしてログインできます。');
      } else {
        setError(result.error ?? 'マジックリンクの送信に失敗しました。');
      }
    } catch {
      setError('マジックリンクの送信中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  // --- Google OAuth ---
  async function handleGoogleLogin() {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await signInWithGoogle();
    } catch {
      setError('Googleログイン中にエラーが発生しました。');
      setLoading(false);
    }
  }

  // --- Email/Password ---
  async function handleEmailPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(`認証エラー: ${authError.message}`);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`ログインエラー: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  // --- タブ切り替え ---
  function switchTab(tab: AuthTab) {
    setActiveTab(tab);
    setError(null);
    setSuccess(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100 px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-white p-8 shadow-lg">
        {/* ヘッダー */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-emerald-800">
            PACE
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            競走馬コンディション予測・評価プラットフォーム
          </p>
        </div>

        {/* タブナビゲーション */}
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          {AUTH_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={`flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Magic Link タブ */}
        {activeTab === 'magic-link' && (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">
                メールアドレスにログインリンクを送信します。パスワード不要で安全にログインできます。
              </p>
            </div>

            <div>
              <label
                htmlFor="magic-email"
                className="block text-sm font-medium text-gray-700"
              >
                メールアドレス
              </label>
              <input
                id="magic-email"
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

            {success && (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                {success}
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '送信中...' : 'マジックリンクを送信'}
            </button>

            <p className="text-center text-xs text-gray-400">
              推奨
            </p>
          </form>
        )}

        {/* Google OAuth タブ */}
        {activeTab === 'google' && (
          <div className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GoogleIcon className="h-5 w-5" />
              {loading ? 'リダイレクト中...' : 'Googleアカウントでログイン'}
            </button>

            <p className="text-center text-xs text-gray-400">
              Googleアカウントの認証情報を使用してログインします。
            </p>
          </div>
        )}

        {/* Email/Password タブ */}
        {activeTab === 'email-password' && (
          <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
            <div>
              <label
                htmlFor="ep-email"
                className="block text-sm font-medium text-gray-700"
              >
                メールアドレス
              </label>
              <input
                id="ep-email"
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
                htmlFor="ep-password"
                className="block text-sm font-medium text-gray-700"
              >
                パスワード
              </label>
              <input
                id="ep-password"
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

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'ログイン中...' : 'メールアドレスとパスワードでログイン'}
            </button>
          </form>
        )}

        {/* フッター */}
        <p className="text-center text-xs text-gray-400">
          &copy; 2024 PACE Platform. All rights reserved.
        </p>
      </div>
    </div>
  );
}
