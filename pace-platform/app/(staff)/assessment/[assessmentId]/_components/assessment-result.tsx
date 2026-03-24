'use client';

import Link from 'next/link';
import type { AssessmentResult as AssessmentResultType } from '@/lib/assessment/types';

interface AssessmentResultProps {
  result: AssessmentResultType;
  athleteName: string;
  assessmentId: string;
}

export function AssessmentResult({
  result,
  athleteName,
  assessmentId,
}: AssessmentResultProps) {
  const confidencePercent = Math.round(result.confidence * 100);
  const hasRedFlags = result.redFlags.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight">
          アセスメント完了
        </h1>
        {athleteName && (
          <p className="mt-1 text-sm text-muted-foreground">{athleteName}</p>
        )}
        <p className="text-xs text-muted-foreground">
          回答数: {result.responseCount} | 終了理由:{' '}
          {getTerminationLabel(result.terminationReason)}
        </p>
      </div>

      {/* Primary diagnosis card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">主診断</p>
            <h2 className="mt-1 text-2xl font-bold text-foreground">
              {result.primaryDiagnosis}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">信頼度</p>
            <p
              className={`text-3xl font-bold tabular-nums ${
                confidencePercent >= 85
                  ? 'text-emerald-600'
                  : confidencePercent >= 50
                    ? 'text-watchlist-600'
                    : 'text-muted-foreground'
              }`}
            >
              {confidencePercent}%
            </p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${
              confidencePercent >= 85
                ? 'bg-emerald-500'
                : confidencePercent >= 50
                  ? 'bg-watchlist-500'
                  : 'bg-gray-400'
            }`}
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* Red flags */}
      {hasRedFlags && (
        <div className="rounded-lg border-2 border-critical-200 bg-critical-50 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-critical-700">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            レッドフラグ ({result.redFlags.length})
          </h3>
          <ul className="space-y-1">
            {result.redFlags.map((rf) => (
              <li
                key={rf.nodeId}
                className="flex items-start gap-2 text-sm text-critical-700"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-critical-500" />
                <span>
                  {rf.description}
                  {rf.hardLock && (
                    <span className="ml-1 font-semibold">[ハードロック]</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Differential diagnoses */}
      {result.differentials.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            鑑別診断
          </h3>
          <div className="space-y-2">
            {result.differentials.map((d) => {
              const percent = Math.round(d.probability * 100);
              return (
                <div
                  key={d.diagnosisCode}
                  className="flex items-center gap-3"
                >
                  <span className="w-32 truncate text-xs text-foreground">
                    {d.diagnosisCode}
                  </span>
                  <div className="flex-1">
                    <div className="h-4 overflow-hidden rounded bg-muted/50">
                      <div
                        className="h-full rounded bg-gray-300 transition-all duration-500 dark:bg-gray-600"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {percent}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Prescription tags */}
        {result.prescriptionTags.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              推奨プログラム
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {result.prescriptionTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Contraindication tags */}
        {result.contraindicationTags.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              禁忌事項
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {result.contraindicationTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-critical-100 px-2.5 py-0.5 text-xs font-medium text-critical-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/assessment/new"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          リハビリプログラム作成
        </Link>

        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          SOAPノート作成
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          印刷
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTerminationLabel(
  reason: AssessmentResultType['terminationReason'],
): string {
  switch (reason) {
    case 'high_confidence':
      return '高確信度収束';
    case 'diminishing_returns':
      return '情報利得低下';
    case 'max_questions':
      return '最大質問数到達';
    case 'red_flag':
      return 'レッドフラグ検出';
  }
}
