'use client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CounterfactualExplanationProps {
  explanation: string | null;
  isReduced: boolean | null;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CounterfactualExplanation({
  explanation,
  isReduced,
  loading,
}: CounterfactualExplanationProps) {
  if (loading) {
    return (
      <div className="h-28 animate-pulse rounded-lg border border-border bg-card" />
    );
  }

  if (!explanation) {
    return null;
  }

  const borderColor =
    isReduced === true
      ? 'border-optimal-200'
      : isReduced === false
        ? 'border-critical-200'
        : 'border-border';

  const bgColor =
    isReduced === true
      ? 'bg-optimal-50'
      : isReduced === false
        ? 'bg-critical-50'
        : 'bg-card';

  const iconColor =
    isReduced === true
      ? 'text-optimal-500'
      : isReduced === false
        ? 'text-critical-500'
        : 'text-muted-foreground';

  return (
    <div
      className={`rounded-lg border ${borderColor} ${bgColor} p-4 transition-colors duration-300`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`shrink-0 ${iconColor}`}>
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path d="M11 8v6" />
            <path d="M8 11h6" />
          </svg>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <h4 className="mb-1 text-sm font-semibold text-foreground">
            シミュレーション分析
          </h4>
          <p className="text-sm leading-relaxed text-foreground/80">
            {explanation}
          </p>
        </div>
      </div>

      {/* AI disclaimer */}
      <div className="mt-3 rounded-md border border-watchlist-200 bg-watchlist-50 px-3 py-1.5">
        <p className="text-[10px] text-watchlist-700">
          ※
          シミュレーション結果は統計モデルに基づく推定値です。最終的な判断は有資格スタッフが行ってください。
        </p>
      </div>
    </div>
  );
}
