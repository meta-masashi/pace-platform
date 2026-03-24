"use client";

/**
 * データブレークダウンカード
 *
 * フィットネス蓄積・疲労負荷の表示に使用。
 * ミニスパークラインまたは ACWR ゲージを内包。
 */

import { AcwrGauge } from "./acwr-gauge";

interface BreakdownCardProps {
  label: string;
  value: number;
  unit?: string;
  trend?: number[];
  status?: "good" | "caution" | "warning";
  type?: "sparkline" | "gauge";
  /** ゲージ表示時にACWR値として渡す */
  gaugeValue?: number;
  /** アニメーション遅延（stagger用） */
  delay?: number;
}

// ---------------------------------------------------------------------------
// ミニスパークライン
// ---------------------------------------------------------------------------

function MiniSparkline({
  data,
  status,
}: {
  data: number[];
  status: "good" | "caution" | "warning";
}) {
  if (data.length < 2) return null;

  const width = 100;
  const height = 36;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const strokeClass =
    status === "good"
      ? "stroke-optimal-400"
      : status === "caution"
        ? "stroke-watchlist-400"
        : "stroke-critical-400";

  const fillClass =
    status === "good"
      ? "fill-optimal-400/10"
      : status === "caution"
        ? "fill-watchlist-400/10"
        : "fill-critical-400/10";

  // Area fill path
  const areaPath = `M${points[0]} ${points.join(" L")} L${width - padding},${height} L${padding},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={areaPath} className={fillClass} />
      <polyline
        points={points.join(" ")}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClass}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ブレークダウンカード
// ---------------------------------------------------------------------------

export function BreakdownCard({
  label,
  value,
  unit,
  trend,
  status = "good",
  type = "sparkline",
  gaugeValue,
  delay = 0,
}: BreakdownCardProps) {
  const statusAccent =
    status === "good"
      ? "border-l-optimal-400"
      : status === "caution"
        ? "border-l-watchlist-400"
        : "border-l-critical-400";

  const valueColor =
    status === "good"
      ? "text-optimal-600"
      : status === "caution"
        ? "text-watchlist-600"
        : "text-critical-600";

  return (
    <div
      className={`animate-fade-in-up rounded-xl border border-border ${statusAccent} border-l-[3px] bg-card p-3 shadow-sm`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      {/* ラベル */}
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
        {label}
      </h4>

      <div className="flex items-end justify-between gap-2">
        {/* 値 */}
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold tabular-nums ${valueColor}`}>
            {typeof value === "number" && !Number.isNaN(value)
              ? value.toFixed(1)
              : "--"}
          </span>
          {unit && (
            <span className="text-xs text-muted-foreground">{unit}</span>
          )}
        </div>

        {/* スパークラインまたはゲージ */}
        <div className="shrink-0">
          {type === "gauge" && gaugeValue !== undefined ? (
            <AcwrGauge value={gaugeValue} />
          ) : trend && trend.length >= 2 ? (
            <MiniSparkline data={trend} status={status} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
