"use client";

import { Brain } from "lucide-react";

interface CalibrationStatusProps {
  /** safety モードの選手数 */
  safetyModeCount: number;
  /** チーム全体の選手数 */
  totalAthletes: number;
}

export function CalibrationStatus({
  safetyModeCount,
  totalAthletes,
}: CalibrationStatusProps) {
  if (safetyModeCount === 0) return null;

  return (
    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
      <Brain className="w-4 h-4 text-indigo-500 shrink-0" />
      <p className="text-xs text-indigo-700">
        <span className="font-semibold">{safetyModeCount}名</span>
        /{totalAthletes}名 がAIキャリブレーション期間中（保守的判定モード）
      </p>
    </div>
  );
}
