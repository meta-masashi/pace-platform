'use client';

// ---------------------------------------------------------------------------
// AdminErrorState — エラー状態（リトライボタン付き）
// ---------------------------------------------------------------------------

interface AdminErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function AdminErrorState({
  message = 'データの読み込みに失敗しました。',
  onRetry,
}: AdminErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-100 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <svg className="h-8 w-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-700">エラーが発生しました</h3>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          再試行
        </button>
      )}
    </div>
  );
}
