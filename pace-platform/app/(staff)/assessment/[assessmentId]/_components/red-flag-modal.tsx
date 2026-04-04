'use client';

import type { RedFlagResult } from '@/lib/assessment/types';

interface RedFlagModalProps {
  redFlag: RedFlagResult;
  onApplyHardLock: () => void;
  onContinue: () => void;
}

export function RedFlagModal({
  redFlag,
  onApplyHardLock,
  onContinue,
}: RedFlagModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-xl border-2 border-critical-300 bg-white shadow-2xl">
        {/* Red header */}
        <div className="flex items-center gap-3 bg-critical-600 px-5 py-4">
          <svg
            className="h-7 w-7 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <h2 className="text-lg font-bold text-white">
              レッドフラグ検出
            </h2>
            <p className="text-xs text-critical-100">
              重症度: {redFlag.severity === 'critical' ? 'クリティカル' : '高リスク'}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 p-5">
          <div className="flex items-start gap-2 rounded-lg border border-critical-200 bg-critical-50 px-4 py-3">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-critical-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="12" cy="12" r="10" />
              <line
                x1="12"
                y1="8"
                x2="12"
                y2="12"
                stroke="white"
                strokeWidth="2"
              />
              <line
                x1="12"
                y1="16"
                x2="12.01"
                y2="16"
                stroke="white"
                strokeWidth="2"
              />
            </svg>
            <p className="text-sm font-medium text-critical-800">
              {redFlag.description}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            {redFlag.hardLock
              ? 'ハードロックを適用すると、この選手のトレーニング参加が制限されます。続行する場合は、医師の判断の下で評価を継続します。'
              : 'この警告を確認し、必要に応じて医師に相談してください。'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-border px-5 py-4">
          {redFlag.hardLock && (
            <button
              type="button"
              onClick={onApplyHardLock}
              className="flex-1 rounded-lg bg-critical-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-critical-700 focus:outline-none focus:ring-2 focus:ring-critical-500 focus:ring-offset-2"
            >
              Hard Lock を適用
            </button>
          )}
          <button
            type="button"
            onClick={onContinue}
            className={`rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${redFlag.hardLock ? 'flex-1' : 'w-full'}`}
          >
            確認して続行
          </button>
        </div>
      </div>
    </div>
  );
}
