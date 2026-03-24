'use client';

import type { PosteriorResult } from '@/lib/assessment/types';

interface PosteriorPanelProps {
  posteriors: PosteriorResult[];
}

export function PosteriorPanel({ posteriors }: PosteriorPanelProps) {
  if (posteriors.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          推論結果
        </h2>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            回答を開始すると推論結果が表示されます
          </p>
        </div>
      </div>
    );
  }

  const topPosteriors = posteriors.slice(0, 5);
  const maxProbability = Math.max(
    ...topPosteriors.map((p) => p.probability),
    0.01,
  );
  const topCandidate = topPosteriors[0];
  const isHighConfidence = topCandidate && topCandidate.probability > 0.85;
  const hasRedFlag = topPosteriors.some((p) => p.isRedFlag);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">推論結果</h2>
        <div className="flex items-center gap-2">
          {isHighConfidence && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              高確信度
            </span>
          )}
          {hasRedFlag && (
            <span className="rounded-full bg-critical-100 px-2.5 py-0.5 text-xs font-semibold text-critical-700">
              レッドフラグ
            </span>
          )}
        </div>
      </div>

      {/* Posterior bar chart */}
      <div className="space-y-3">
        {topPosteriors.map((p, idx) => {
          const widthPercent = Math.max(
            (p.probability / maxProbability) * 100,
            2,
          );
          const isTop = idx === 0;
          const percent = Math.round(p.probability * 100);

          return (
            <div key={p.diagnosisCode} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={`font-medium ${isTop ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {p.diagnosisCode}
                  {p.isRedFlag && (
                    <span className="ml-1 text-critical-500">!</span>
                  )}
                </span>
                <span
                  className={`tabular-nums ${isTop ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                >
                  {percent}%
                </span>
              </div>
              <div className="h-6 overflow-hidden rounded bg-muted/50">
                <div
                  className={`h-full rounded transition-all duration-700 ease-out ${
                    isTop
                      ? 'bg-emerald-500'
                      : p.isRedFlag
                        ? 'bg-critical-400'
                        : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Separator */}
      <hr className="my-4 border-border" />

      {/* Differential diagnosis list */}
      {topPosteriors.length > 1 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            鑑別診断
          </h3>
          <ul className="space-y-1">
            {topPosteriors.slice(1).map((p) => (
              <li
                key={p.diagnosisCode}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.isRedFlag ? 'bg-critical-400' : 'bg-gray-300'}`}
                />
                <span className="flex-1">{p.diagnosisCode}</span>
                <span className="tabular-nums">
                  {Math.round(p.probability * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
