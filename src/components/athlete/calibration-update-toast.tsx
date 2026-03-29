"use client";

import { useEffect, useState } from "react";
import { TrendingUp, X, Sparkles } from "lucide-react";

export interface CalibrationUpdateEvent {
  /** 更新対象の特性ラベル（例: "ハムストリングスの回復速度"） */
  feature: string;
  /** 精度向上率（%、例: 12 → +12%） */
  improvementPct: number;
  /** 蓄積データ日数 */
  dataDays: number;
  /** ISO timestamp */
  updatedAt: string;
}

interface CalibrationUpdateToastProps {
  events: CalibrationUpdateEvent[];
  /** 最大表示件数（デフォルト: 3） */
  maxVisible?: number;
}

function ToastItem({
  event,
  onDismiss,
}: {
  event: CalibrationUpdateEvent;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Stagger-in animation
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border border-brand-200
        bg-gradient-to-r from-brand-50 to-white shadow-md
        transition-all duration-300 ease-out
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      {/* Strava-style accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500 rounded-l-xl" />

      <div className="pl-4 pr-3 py-3 flex items-start gap-3">
        {/* Icon */}
        <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
          <TrendingUp className="w-4 h-4 text-brand-600" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-bold text-brand-700">精度アップデート</span>
            <Sparkles className="w-3 h-3 text-brand-400" />
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            AI学習完了：あなたの
            <span className="font-semibold text-slate-900">
              「{event.feature}」
            </span>
            の特定精度が向上しました
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-sm font-bold font-numeric text-brand-600">
              +{event.improvementPct}%
            </span>
            <span className="text-2xs text-slate-400">
              {event.dataDays}日分のデータから学習
            </span>
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5"
          aria-label="閉じる"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function CalibrationUpdateLog({
  events,
  maxVisible = 3,
}: CalibrationUpdateToastProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = events
    .filter((e) => !dismissed.has(e.updatedAt))
    .slice(0, maxVisible);

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((event) => (
        <ToastItem
          key={event.updatedAt}
          event={event}
          onDismiss={() =>
            setDismissed((prev) => new Set([...prev, event.updatedAt]))
          }
        />
      ))}
    </div>
  );
}
