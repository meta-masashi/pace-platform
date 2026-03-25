'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// セキュリティ設定ページ
// ---------------------------------------------------------------------------

export default function SecuritySettingsPage() {
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePasswordReset() {
    setSendingReset(true);
    setError(null);
    setResetSuccess(false);

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) {
        setError('環境変数が設定されていません');
        return;
      }

      const supabase = createClient(url, key);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        setError('ログイン情報を取得できませんでした。再度ログインしてください。');
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        user.email,
        {
          redirectTo: `${window.location.origin}/login`,
        }
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setResetSuccess(true);
    } catch {
      setError('パスワードリセットメールの送信中にエラーが発生しました。');
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">セキュリティ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          パスワードとアカウントセキュリティの設定を管理します。
        </p>
      </div>

      {/* パスワード変更 */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-base font-semibold text-foreground">
          パスワード変更
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          登録メールアドレスにパスワードリセットリンクを送信します。
        </p>

        <div className="mt-4">
          {resetSuccess && (
            <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              パスワードリセットメールを送信しました。メールを確認してください。
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={sendingReset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendingReset ? '送信中...' : 'パスワード変更メールを送信'}
          </button>
        </div>
      </div>

      {/* アクティブセッション */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-base font-semibold text-foreground">
          アクティブセッション
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          現在ログインしているデバイスとセッション情報。
        </p>

        <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <svg
                className="h-5 w-5 text-primary"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                現在のセッション
              </p>
              <p className="text-xs text-muted-foreground">
                このブラウザ &mdash; アクティブ
              </p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              アクティブ
            </span>
          </div>
        </div>
      </div>

      {/* 2FA (プレースホルダー) */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              二要素認証 (2FA)
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              TOTP アプリ（Google Authenticator 等）を使用した二要素認証でアカウントを保護します。
            </p>
          </div>
          <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            近日公開
          </span>
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            2FA を設定
          </button>
        </div>
      </div>
    </div>
  );
}
