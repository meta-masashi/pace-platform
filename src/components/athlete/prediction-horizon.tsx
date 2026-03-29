"use client";

import { Eye, EyeOff, Flame, Calendar } from "lucide-react";

interface PredictionHorizonProps {
  /** 連続チェックイン日数 */
  streakDays: number;
  /** 最後のチェックイン日 (ISO string) */
  lastCheckinDate: string | null;
  /** 最大予測精度に必要な連続日数 */
  fullHorizonDays?: number;
  /** 現在の予測精度 (0–100%) */
  accuracyPct?: number;
}

function getDaysSinceCheckin(lastDate: string | null): number {
  if (!lastDate) return 999;
  const last = new Date(lastDate);
  const now = new Date();
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
}

function getBlurLevel(daysMissing: number): number {
  // 0 days missing → no blur; 1 day → slight; 3+ days → heavy
  if (daysMissing <= 0) return 0;
  if (daysMissing === 1) return 2;
  if (daysMissing === 2) return 4;
  return Math.min(8, daysMissing * 2);
}

export function PredictionHorizon({
  streakDays,
  lastCheckinDate,
  fullHorizonDays = 14,
  accuracyPct,
}: PredictionHorizonProps) {
  const daysMissing = Math.max(0, getDaysSinceCheckin(lastCheckinDate) - 1);
  const blurPx = getBlurLevel(daysMissing);
  const isBlurred = blurPx > 0;

  // Horizon fill: streak / fullHorizonDays
  const horizonPct = Math.min(100, Math.round((streakDays / fullHorizonDays) * 100));

  // Derived accuracy (override if provided)
  const displayAccuracy =
    accuracyPct ?? Math.max(20, Math.round(horizonPct * 0.8 + 20));

  const daysToRecover = Math.max(0, 3 - streakDays);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBlurred ? (
            <EyeOff className="w-4 h-4 text-slate-400" />
          ) : (
            <Eye className="w-4 h-4 text-brand-500" />
          )}
          <span className="text-sm font-semibold text-slate-800">
            予測の視界
          </span>
        </div>

        {/* Streak badge */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">
          <Flame className={`w-3.5 h-3.5 ${streakDays > 0 ? "text-amber-500" : "text-slate-300"}`} />
          <span className="text-xs font-bold font-numeric text-amber-700">
            {streakDays}日
          </span>
        </div>
      </div>

      {/* Main visualization */}
      <div className="px-4 py-4">
        {/* Horizon bars */}
        <div className="flex gap-1 mb-3">
          {Array.from({ length: fullHorizonDays }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-4 rounded-sm transition-all duration-500 ${
                i < streakDays
                  ? "bg-brand-500"
                  : i < streakDays + daysMissing
                  ? "bg-red-200"
                  : "bg-slate-100"
              }`}
              style={{ opacity: i < streakDays ? 1 : 0.4 }}
            />
          ))}
        </div>

        {/* Accuracy display with optional blur */}
        <div className="relative">
          <div
            className="bg-slate-50 rounded-lg p-3 transition-all duration-700"
            style={{
              filter: isBlurred ? `blur(${blurPx}px)` : "none",
              userSelect: isBlurred ? "none" : "auto",
            }}
          >
            <p className="text-2xs text-slate-500 mb-1">現在の予測精度</p>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold font-numeric text-slate-900">
                {displayAccuracy}
              </span>
              <span className="text-sm text-slate-400 mb-0.5">%</span>
            </div>
            <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full transition-all duration-1000"
                style={{ width: `${displayAccuracy}%` }}
              />
            </div>
          </div>

          {/* Overlay message when blurred */}
          {isBlurred && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <EyeOff className="w-5 h-5 text-slate-500 mb-1" />
              {daysToRecover > 0 ? (
                <p className="text-xs text-slate-600 font-medium text-center">
                  あと{daysToRecover}日の入力で
                  <br />
                  <span className="text-brand-600">視界が回復します</span>
                </p>
              ) : (
                <p className="text-xs text-slate-600 font-medium text-center">
                  今日チェックインすると
                  <br />
                  <span className="text-brand-600">視界が回復します</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Status message */}
        <div className="mt-3 flex items-start gap-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-2xs text-slate-500 leading-relaxed">
            {streakDays >= fullHorizonDays
              ? `${fullHorizonDays}日以上の連続データ — 予測精度は最高レベルです`
              : daysMissing > 0
              ? `${daysMissing}日間のデータ空白により予測精度が低下しています`
              : `連続${streakDays}日 — 毎日のチェックインで視界が広がります`}
          </p>
        </div>
      </div>
    </div>
  );
}
