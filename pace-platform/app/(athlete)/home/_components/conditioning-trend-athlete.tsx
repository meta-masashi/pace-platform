'use client';

/**
 * ConditioningTrendAthlete — アスリート向け14日間コンディショニングトレンドチャート
 *
 * カスタム SVG で描画（アスリート側は Recharts を使わない既存パターンに準拠）。
 * Fitness (緑) / Fatigue (赤) の EWMA ラインと
 * ACWR 安全ゾーン（0.8-1.3）のバンド表示。
 */

import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface TrendDataPoint {
  date: string;
  conditioningScore: number | null;
  fitnessEwma: number | null;
  fatigueEwma: number | null;
  acwr: number | null;
}

interface ConditioningTrendAthleteProps {
  data: TrendDataPoint[];
  onDateSelect?: (date: string) => void;
}

// ---------------------------------------------------------------------------
// SVG チャート定数
// ---------------------------------------------------------------------------

const CHART_WIDTH = 340;
const CHART_HEIGHT = 160;
const PADDING = { top: 10, right: 12, bottom: 24, left: 32 };
const PLOT_W = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_H = CHART_HEIGHT - PADDING.top - PADDING.bottom;

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function scaleX(index: number, total: number): number {
  if (total <= 1) return PADDING.left + PLOT_W / 2;
  return PADDING.left + (index / (total - 1)) * PLOT_W;
}

function scaleY(value: number, min: number, max: number): number {
  if (max === min) return PADDING.top + PLOT_H / 2;
  return PADDING.top + PLOT_H - ((value - min) / (max - min)) * PLOT_H;
}

function buildPolyline(
  data: (number | null)[],
  min: number,
  max: number,
): string {
  const points: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v != null) {
      points.push(`${scaleX(i, data.length)},${scaleY(v, min, max)}`);
    }
  }
  return points.join(' ');
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function ConditioningTrendAthlete({
  data,
  onDateSelect,
}: ConditioningTrendAthleteProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Y軸の範囲（スコアベース）
  const scores = data
    .flatMap((d) => [d.conditioningScore, d.fitnessEwma, d.fatigueEwma])
    .filter((v): v is number => v !== null);
  const yMin = scores.length > 0 ? Math.max(0, Math.min(...scores) - 10) : 0;
  const yMax = scores.length > 0 ? Math.min(100, Math.max(...scores) + 10) : 100;

  // ポリラインデータ
  const scorePoints = buildPolyline(
    data.map((d) => d.conditioningScore),
    yMin,
    yMax,
  );
  const fitnessPoints = buildPolyline(
    data.map((d) => d.fitnessEwma),
    yMin,
    yMax,
  );
  const fatiguePoints = buildPolyline(
    data.map((d) => d.fatigueEwma),
    yMin,
    yMax,
  );

  // タッチ/マウスハンドラ
  const handleInteraction = useCallback(
    (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      if (!svgRef.current || data.length === 0) return;
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
      const x = clientX - rect.left;
      const ratio = (x - PADDING.left) / PLOT_W;
      const idx = Math.round(ratio * (data.length - 1));
      const clamped = Math.max(0, Math.min(data.length - 1, idx));
      setHoveredIdx(clamped);
    },
    [data.length],
  );

  const handleClick = useCallback(() => {
    if (hoveredIdx !== null && data[hoveredIdx]) {
      onDateSelect?.(data[hoveredIdx]!.date);
    }
  }, [hoveredIdx, data, onDateSelect]);

  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-xs text-muted-foreground">トレンドデータがありません</p>
      </div>
    );
  }

  // X軸ラベル（最初、中間、最後）
  const xLabels = [
    { idx: 0, label: formatShortDate(data[0]!.date) },
    ...(data.length > 2
      ? [{ idx: Math.floor(data.length / 2), label: formatShortDate(data[Math.floor(data.length / 2)]!.date) }]
      : []),
    ...(data.length > 1
      ? [{ idx: data.length - 1, label: formatShortDate(data[data.length - 1]!.date) }]
      : []),
  ];

  const hoveredData = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          14日間トレンド
        </h4>
        <div className="flex gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-3 rounded-full bg-primary" />
            Score
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-3 rounded-full bg-emerald-400" />
            Fitness
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-3 rounded-full bg-red-400" />
            Fatigue
          </span>
        </div>
      </div>

      {/* ホバー時のデータ表示 */}
      {hoveredData && (
        <div className="mb-1 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="font-medium">{formatShortDate(hoveredData.date)}</span>
          <span>Score: <strong className="text-foreground">{hoveredData.conditioningScore ?? '--'}</strong></span>
          <span>F: <strong className="text-emerald-500">{hoveredData.fitnessEwma?.toFixed(1) ?? '--'}</strong></span>
          <span>f: <strong className="text-red-400">{hoveredData.fatigueEwma?.toFixed(1) ?? '--'}</strong></span>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        onMouseMove={handleInteraction}
        onTouchMove={handleInteraction}
        onMouseLeave={() => setHoveredIdx(null)}
        onClick={handleClick}
      >
        {/* Y軸グリッドライン */}
        {[yMin, (yMin + yMax) / 2, yMax].map((v) => (
          <g key={v}>
            <line
              x1={PADDING.left}
              y1={scaleY(v, yMin, yMax)}
              x2={PADDING.left + PLOT_W}
              y2={scaleY(v, yMin, yMax)}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeDasharray="2 2"
            />
            <text
              x={PADDING.left - 4}
              y={scaleY(v, yMin, yMax) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={9}
            >
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* Score エリアフィル */}
        {scorePoints && (
          <polygon
            points={`${scaleX(0, data.length)},${scaleY(yMin, yMin, yMax)} ${scorePoints} ${scaleX(data.length - 1, data.length)},${scaleY(yMin, yMin, yMax)}`}
            className="fill-primary/10"
          />
        )}

        {/* Score ライン */}
        <polyline
          points={scorePoints}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Fitness ライン */}
        <polyline
          points={fitnessPoints}
          fill="none"
          stroke="#34d399"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 2"
        />

        {/* Fatigue ライン */}
        <polyline
          points={fatiguePoints}
          fill="none"
          stroke="#f87171"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 2"
        />

        {/* ホバーインジケーター */}
        {hoveredIdx !== null && (
          <>
            <line
              x1={scaleX(hoveredIdx, data.length)}
              y1={PADDING.top}
              x2={scaleX(hoveredIdx, data.length)}
              y2={PADDING.top + PLOT_H}
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeDasharray="3 3"
            />
            {hoveredData?.conditioningScore !== null && hoveredData?.conditioningScore !== undefined && (
              <circle
                cx={scaleX(hoveredIdx, data.length)}
                cy={scaleY(hoveredData.conditioningScore, yMin, yMax)}
                r={4}
                className="fill-primary stroke-card"
                strokeWidth={2}
              />
            )}
          </>
        )}

        {/* X軸ラベル */}
        {xLabels.map(({ idx, label }) => (
          <text
            key={idx}
            x={scaleX(idx, data.length)}
            y={CHART_HEIGHT - 2}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={9}
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
