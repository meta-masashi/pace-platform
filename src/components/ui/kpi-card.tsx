import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "stable";
  trendLabel?: string;
  color?: "default" | "red" | "amber" | "green" | "blue";
  subtitle?: string;
  /** Critical/Watchlist カードに左ボーダー強調を適用 */
  emphasis?: boolean;
}

// カラー設定（WCAG AA 4.5:1 準拠）
const COLOR_CONFIG = {
  default: {
    value:      "text-slate-900",
    border:     "border-slate-200",
    leftBorder: "",
    bg:         "bg-white",
    icon:       "text-slate-400",
  },
  red: {
    value:      "text-red-700",
    border:     "border-red-200",
    leftBorder: "border-l-4 border-l-red-500",
    bg:         "bg-red-50",
    icon:       "text-red-500",
  },
  amber: {
    value:      "text-amber-700",
    border:     "border-amber-200",
    leftBorder: "border-l-4 border-l-amber-500",
    bg:         "bg-amber-50",
    icon:       "text-amber-500",
  },
  green: {
    value:      "text-emerald-700",
    border:     "border-emerald-200",
    leftBorder: "border-l-4 border-l-emerald-500",
    bg:         "bg-emerald-50",
    icon:       "text-emerald-500",
  },
  blue: {
    value:      "text-blue-700",
    border:     "border-blue-200",
    leftBorder: "border-l-4 border-l-blue-500",
    bg:         "bg-blue-50",
    icon:       "text-blue-500",
  },
};

export function KpiCard({
  title,
  value,
  unit,
  trend,
  trendLabel,
  color = "default",
  subtitle,
  emphasis = false,
}: KpiCardProps) {
  const cfg = COLOR_CONFIG[color];
  // emphasis フラグ: critical/watchlist はデフォルトで左ボーダー + 薄背景
  const applyEmphasis = emphasis || color === "red" || color === "amber";

  return (
    <div
      className={cn(
        "rounded-lg border shadow-sm p-4 transition-shadow hover:shadow-md",
        applyEmphasis ? cfg.leftBorder : "",
        applyEmphasis ? cfg.bg : "bg-white",
        // 左ボーダー適用時は通常ボーダーを調整
        applyEmphasis ? cfg.border : "border-slate-200"
      )}
    >
      {/* タイトル行 */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </p>
        {color === "red" && (
          <AlertCircle className={cn("w-4 h-4", cfg.icon)} aria-hidden="true" />
        )}
      </div>

      {/* 数値（Inter フォント + 等幅数字）*/}
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-numeric text-3xl font-bold leading-none tracking-tight",
            cfg.value
          )}
          style={{ fontFamily: "Inter, 'Noto Sans JP', sans-serif", fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-sm font-medium text-slate-500 ml-0.5">{unit}</span>
        )}
      </div>

      {/* サブタイトル */}
      {subtitle && (
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{subtitle}</p>
      )}

      {/* トレンドライン */}
      {(trend || trendLabel) && (
        <div className="mt-2.5 flex items-center gap-1.5">
          {trend === "up" && (
            <TrendingUp
              className={cn("w-3.5 h-3.5", color === "red" ? "text-red-500" : "text-emerald-500")}
              aria-hidden="true"
            />
          )}
          {trend === "down" && (
            <TrendingDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          )}
          {trend === "stable" && (
            <Minus className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          )}
          {trendLabel && (
            <span className="text-xs text-slate-500 font-medium">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
