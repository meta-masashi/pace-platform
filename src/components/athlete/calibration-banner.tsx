"use client";

import { useMemo } from "react";
import { Brain, Sparkles } from "lucide-react";

interface CalibrationBannerProps {
  /** アスリートの初回データ投入日 (ISO string) */
  firstDataDate: string | null;
  /** キャリブレーション完了に必要な日数 */
  requiredDays?: number;
}

export function CalibrationBanner({
  firstDataDate,
  requiredDays = 7,
}: CalibrationBannerProps) {
  const { daysElapsed, daysRemaining, progress, isCalibrating } = useMemo(() => {
    if (!firstDataDate) {
      return { daysElapsed: 0, daysRemaining: requiredDays, progress: 0, isCalibrating: true };
    }

    const start = new Date(firstDataDate);
    const now = new Date();
    const elapsed = Math.floor(
      (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const remaining = Math.max(0, requiredDays - elapsed);
    const pct = Math.min(100, Math.round((elapsed / requiredDays) * 100));

    return {
      daysElapsed: elapsed,
      daysRemaining: remaining,
      progress: pct,
      isCalibrating: remaining > 0,
    };
  }, [firstDataDate, requiredDays]);

  if (!isCalibrating) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-brand-50 border border-indigo-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-indigo-900">
              AIがベースラインを学習中
            </p>
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          </div>
          <p className="text-xs text-indigo-700 leading-relaxed mb-3">
            あなたのコンディションパターンを個体最適化しています。
            毎朝のチェックインで精度が向上します。
          </p>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-2xs">
              <span className="text-indigo-500 font-medium">
                キャリブレーション進捗
              </span>
              <span className="text-indigo-600 font-bold font-numeric">
                {progress}%
              </span>
            </div>
            <div className="h-2 bg-indigo-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-brand-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-2xs text-indigo-400">
              {daysRemaining > 0
                ? `あと${daysRemaining}日で完了 — ${daysElapsed}/${requiredDays}日のデータ収集済み`
                : "キャリブレーション完了"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
