"use client";

import { Sparkles } from "lucide-react";

interface InsightCardProps {
  greeting?: string;
  focusPoint?: string;
  advice?: string;
  readinessLabel?: string;
  isLoading?: boolean;
}

export function InsightCard({
  greeting,
  focusPoint,
  advice,
  readinessLabel,
  isLoading,
}: InsightCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded bg-slate-200" />
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full bg-slate-100 rounded" />
          <div className="h-3 w-3/4 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-brand-50 to-white rounded-xl p-4 shadow-sm border border-brand-100">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-brand-500" />
        <span className="text-xs font-semibold text-brand-700">
          今日のアドバイス
          {readinessLabel && (
            <span className="ml-2 text-brand-500">({readinessLabel})</span>
          )}
        </span>
      </div>

      {greeting && (
        <p className="text-sm text-slate-700 font-medium mb-1">{greeting}</p>
      )}

      {focusPoint && (
        <p className="text-xs text-slate-600 mb-2">
          <span className="font-medium text-brand-600">注目ポイント: </span>
          {focusPoint}
        </p>
      )}

      {advice && <p className="text-sm text-slate-600 leading-relaxed">{advice}</p>}

      <p className="text-2xs text-slate-400 mt-3">
        ※ 本システムは臨床判断の補助ツールであり、医療行為の代替ではありません
      </p>
    </div>
  );
}
