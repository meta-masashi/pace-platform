'use client';

import { useState, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// TeamCodeInput — チームコード入力コンポーネント（8文字英数字）
// ---------------------------------------------------------------------------

interface TeamCodeInputProps {
  onSubmit: (code: string) => Promise<{ success: boolean; error?: string; teamName?: string }>;
}

export function TeamCodeInput({ onSubmit }: TeamCodeInputProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setCode(val);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 8) {
      setError('チームコードは8文字です。');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const result = await onSubmit(code);
      if (!result.success) {
        setError(result.error ?? 'チームコードの検証に失敗しました。');
      }
    } catch {
      setError('サーバーエラーが発生しました。しばらくしてから再度お試しください。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="team-code"
          className="block text-sm font-medium text-gray-700"
        >
          チームコード
        </label>
        <p className="mt-1 text-xs text-gray-500">
          チームの管理者から受け取ったコードを入力してください。
        </p>
        <input
          ref={inputRef}
          id="team-code"
          name="team-code"
          type="text"
          inputMode="text"
          autoComplete="off"
          required
          maxLength={8}
          value={code}
          onChange={handleChange}
          className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-lg tracking-[0.3em] text-center uppercase shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="ABCD1234"
        />
        <p className="mt-1 text-xs text-gray-400 text-center">
          {code.length}/8文字
        </p>
      </div>

      {/* 注意喚起カード */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-start gap-2">
          <svg
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-800">
              このコードはチームの管理者から直接受け取ったものですか？
            </p>
            <p className="mt-1 text-xs text-amber-700">
              不明なコードは入力しないでください。
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || code.length < 8}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            検証中...
          </span>
        ) : (
          'チームに参加する'
        )}
      </button>
    </form>
  );
}
