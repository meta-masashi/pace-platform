'use client';

/**
 * PACE Platform — AI生成ボタンコンポーネント
 *
 * SOAPノートの各フィールドに対して
 * AI生成を実行する再利用可能なボタン。
 */

interface AiGenerateButtonProps {
  /** クリック時のコールバック */
  onClick: () => void;
  /** ロード中かどうか */
  loading: boolean;
  /** ボタンラベル */
  label: string;
  /** 無効状態 */
  disabled?: boolean;
}

export function AiGenerateButton({
  onClick,
  loading,
  label,
  disabled = false,
}: AiGenerateButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <>
          {/* ローディングスピナー */}
          <svg
            className="h-3.5 w-3.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          生成中...
        </>
      ) : (
        <>
          {/* スパークルアイコン */}
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
