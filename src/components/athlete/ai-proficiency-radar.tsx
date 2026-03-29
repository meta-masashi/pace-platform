"use client";

import { useMemo } from "react";
import { Brain, Sparkles } from "lucide-react";

export interface AiProficiencyMetric {
  /** 軸ラベル */
  label: string;
  /** 蓄積率 0–100 */
  value: number;
  /** 最大値（デフォルト 100） */
  max?: number;
}

interface AiProficiencyRadarProps {
  metrics: AiProficiencyMetric[];
  /** データ蓄積日数 */
  dataDays: number;
  /** コンポーネントサイズ（px、デフォルト 220） */
  size?: number;
}

const DEFAULT_METRICS: AiProficiencyMetric[] = [
  { label: "リカバリー特性", value: 0 },
  { label: "インテンシティ耐性", value: 0 },
  { label: "スプリント相関", value: 0 },
  { label: "睡眠感度", value: 0 },
  { label: "心理的負荷", value: 0 },
];

// Compute SVG polygon point for a given axis
function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleRad: number
): [number, number] {
  return [
    cx + r * Math.cos(angleRad - Math.PI / 2),
    cy + r * Math.sin(angleRad - Math.PI / 2),
  ];
}

function buildPolygonPoints(
  cx: number,
  cy: number,
  r: number,
  values: number[], // 0–1 fractions
  n: number
): string {
  return values
    .map((v, i) => {
      const angle = (2 * Math.PI * i) / n;
      const [x, y] = polarToCartesian(cx, cy, r * v, angle);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function AiProficiencyRadar({
  metrics = DEFAULT_METRICS,
  dataDays,
  size = 220,
}: AiProficiencyRadarProps) {
  const n = metrics.length;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;

  const fractions = useMemo(
    () => metrics.map((m) => Math.max(0, Math.min(1, m.value / (m.max ?? 100))),),
    [metrics]
  );

  // Background grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Axis lines & label positions
  const axes = useMemo(
    () =>
      metrics.map((m, i) => {
        const angle = (2 * Math.PI * i) / n;
        const [x1, y1] = polarToCartesian(cx, cy, maxR, angle);
        const [lx, ly] = polarToCartesian(cx, cy, maxR + 18, angle);
        return { ...m, angle, x1, y1, lx, ly };
      }),
    [metrics, n, cx, cy, maxR]
  );

  const dataPolygon = buildPolygonPoints(cx, cy, maxR, fractions, n);
  const avgPct = Math.round(
    (fractions.reduce((s, v) => s + v, 0) / n) * 100
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-slate-800">AI習熟度マップ</span>
        </div>
        <div className="flex items-center gap-1 text-2xs text-slate-400">
          <Sparkles className="w-3 h-3" />
          <span className="font-numeric">{dataDays}日分のデータ</span>
        </div>
      </div>

      {/* Radar SVG */}
      <div className="flex flex-col items-center px-4 py-4">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          {/* Grid rings */}
          {rings.map((r) => (
            <polygon
              key={r}
              points={buildPolygonPoints(cx, cy, maxR, Array(n).fill(r), n)}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          ))}

          {/* Axis lines */}
          {axes.map((ax) => (
            <line
              key={ax.label}
              x1={cx}
              y1={cy}
              x2={ax.x1.toFixed(2)}
              y2={ax.y1.toFixed(2)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          ))}

          {/* Data polygon */}
          <polygon
            points={dataPolygon}
            fill="rgba(252, 76, 2, 0.15)"
            stroke="#FC4C02"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {fractions.map((v, i) => {
            const angle = (2 * Math.PI * i) / n;
            const [px, py] = polarToCartesian(cx, cy, maxR * v, angle);
            return (
              <circle
                key={i}
                cx={px.toFixed(2)}
                cy={py.toFixed(2)}
                r="3.5"
                fill="#FC4C02"
                stroke="white"
                strokeWidth="1.5"
              />
            );
          })}

          {/* Axis labels */}
          {axes.map((ax) => (
            <text
              key={ax.label}
              x={ax.lx.toFixed(2)}
              y={ax.ly.toFixed(2)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fill="#64748b"
              fontFamily="'Noto Sans JP', sans-serif"
            >
              {ax.label}
            </text>
          ))}

          {/* Center average */}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            fontSize="14"
            fontWeight="700"
            fill="#FC4C02"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            {avgPct}%
          </text>
          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            fontSize="8"
            fill="#94a3b8"
            fontFamily="'Noto Sans JP', sans-serif"
          >
            AI習熟度
          </text>
        </svg>

        {/* Legend */}
        <div className="w-full mt-3 space-y-1.5">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
              <span className="text-2xs text-slate-600 flex-1">{m.label}</span>
              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-400 rounded-full transition-all duration-1000"
                  style={{ width: `${m.value}%` }}
                />
              </div>
              <span className="text-2xs font-bold font-numeric text-slate-700 w-8 text-right">
                {m.value}%
              </span>
            </div>
          ))}
        </div>

        <p className="text-2xs text-slate-400 mt-3 text-center leading-relaxed">
          データが蓄積されるほど各軸が外側に広がります
        </p>
      </div>
    </div>
  );
}
