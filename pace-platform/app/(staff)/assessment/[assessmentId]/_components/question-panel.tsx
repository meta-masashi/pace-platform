'use client';

import type { AnswerValue, NextQuestionResult } from '@/lib/assessment/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnswerHistoryItem {
  nodeId: string;
  questionText: string;
  answer: AnswerValue;
}

interface QuestionPanelProps {
  currentQuestion: NextQuestionResult | null;
  responseCount: number;
  estimatedTotal: number;
  progress: number;
  onAnswer: (answer: AnswerValue) => void;
  submitting: boolean;
  answerHistory: AnswerHistoryItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAnswerLabel(answer: AnswerValue): string {
  switch (answer) {
    case 'yes':
      return 'はい';
    case 'no':
      return 'いいえ';
    case 'unknown':
      return '不明';
  }
}

function getAnswerColor(answer: AnswerValue): string {
  switch (answer) {
    case 'yes':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'no':
      return 'bg-critical-100 text-critical-800 border-critical-200';
    case 'unknown':
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestionPanel({
  currentQuestion,
  responseCount,
  estimatedTotal,
  progress,
  onAnswer,
  submitting,
  answerHistory,
}: QuestionPanelProps) {
  const progressPercent = Math.min(100, Math.round(progress));

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            質問 {responseCount + 1} / 約{estimatedTotal}
          </span>
          <span>{progressPercent}% 完了</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Current question */}
      {currentQuestion ? (
        <div className="rounded-lg border border-border bg-card p-5">
          {/* Question text */}
          <p className="text-base font-medium leading-relaxed text-foreground">
            {currentQuestion.questionText}
          </p>

          {/* Information gain indicator */}
          {currentQuestion.informationGain > 0 && (
            <div className="mt-3 flex items-center gap-1.5">
              <svg
                className="h-3.5 w-3.5 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span className="text-xs text-muted-foreground">
                情報利得: {currentQuestion.informationGain.toFixed(3)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-card">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 animate-spin text-primary"
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
            <p className="text-sm text-muted-foreground">
              次の質問を準備中...
            </p>
          </div>
        </div>
      )}

      {/* Answer buttons */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onAnswer('yes')}
          disabled={submitting || !currentQuestion}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          はい
        </button>

        <button
          type="button"
          onClick={() => onAnswer('no')}
          disabled={submitting || !currentQuestion}
          className="flex items-center justify-center gap-2 rounded-lg bg-critical-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-critical-700 focus:outline-none focus:ring-2 focus:ring-critical-500 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          いいえ
        </button>

        <button
          type="button"
          onClick={() => onAnswer('unknown')}
          disabled={submitting || !currentQuestion}
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          不明
        </button>
      </div>

      {/* Submitting indicator */}
      {submitting && (
        <div className="flex items-center justify-center gap-2 py-2">
          <svg
            className="h-4 w-4 animate-spin text-primary"
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
          <span className="text-xs text-muted-foreground">ベイズ更新中...</span>
        </div>
      )}

      {/* Answer history */}
      {answerHistory.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            回答履歴 ({answerHistory.length})
          </h3>
          <div className="max-h-60 space-y-1.5 overflow-y-auto scrollbar-thin">
            {answerHistory.map((item, idx) => (
              <div
                key={`${item.nodeId}-${idx}`}
                className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2"
              >
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  Q{idx + 1}
                </span>
                <p className="flex-1 text-xs text-foreground/80 line-clamp-2">
                  {item.questionText || item.nodeId}
                </p>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${getAnswerColor(item.answer)}`}
                >
                  {getAnswerLabel(item.answer)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
