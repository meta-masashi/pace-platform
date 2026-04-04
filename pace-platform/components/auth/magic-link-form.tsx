'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// MagicLinkForm — Magic Link メール送信フォーム
// ---------------------------------------------------------------------------

interface MagicLinkFormProps {
  /** テーマ: admin はダーク系 */
  variant?: 'default' | 'admin';
  /** 送信ハンドラ */
  onSubmit: (email: string) => Promise<{ success: boolean; error?: string }>;
  /** ボタンラベル */
  buttonLabel?: string;
}

export function MagicLinkForm({
  variant = 'default',
  onSubmit,
  buttonLabel = 'ログインリンクを送信',
}: MagicLinkFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const isAdmin = variant === 'admin';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await onSubmit(email);
      if (result.success) {
        setSent(true);
        startResendCooldown();
      } else {
        setError(result.error ?? 'メールの送信に失敗しました。');
      }
    } catch {
      setError('メールの送信中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  function startResendCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onSubmit(email);
      if (result.success) {
        startResendCooldown();
      } else {
        setError(result.error ?? 'メールの再送信に失敗しました。');
      }
    } catch {
      setError('メールの再送信中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            isAdmin ? 'bg-blue-900/30' : 'bg-emerald-50'
          }`}
        >
          <svg
            className={`h-8 w-8 ${isAdmin ? 'text-blue-400' : 'text-emerald-600'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>

        <div>
          <h3
            className={`text-lg font-semibold ${
              isAdmin ? 'text-slate-100' : 'text-gray-900'
            }`}
          >
            メールを確認してください
          </h3>
          <p
            className={`mt-2 text-sm ${
              isAdmin ? 'text-slate-400' : 'text-gray-500'
            }`}
          >
            <span className="font-medium">{email}</span> に
            ログインリンクを送信しました。
            メールのリンクをクリックしてログインしてください。
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleResend}
          disabled={loading || resendCooldown > 0}
          className={`text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isAdmin
              ? 'text-blue-400 hover:text-blue-300'
              : 'text-emerald-600 hover:text-emerald-700'
          }`}
        >
          {loading
            ? '送信中...'
            : resendCooldown > 0
              ? `メールを再送信（${resendCooldown}秒後に有効）`
              : 'メールを再送信'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="magic-email"
          className={`block text-sm font-medium ${
            isAdmin ? 'text-slate-300' : 'text-gray-700'
          }`}
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
          className={`mt-1 block w-full rounded-lg border px-3 py-3 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 ${
            isAdmin
              ? 'border-slate-600 bg-slate-800 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500'
              : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:ring-emerald-500'
          }`}
          placeholder="user@example.com"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className={`flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          isAdmin
            ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
            : 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500'
        }`}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            送信中...
          </span>
        ) : (
          buttonLabel
        )}
      </button>
    </form>
  );
}
