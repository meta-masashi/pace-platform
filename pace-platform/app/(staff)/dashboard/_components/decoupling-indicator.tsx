'use client';

import { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InnovationPoint {
  day: number;
  residual: number;
  tolerance: number;
}

export interface DecouplingIndicatorProps {
  decouplingScore: number; // 0-1
  innovationHistory?: InnovationPoint[];
  severity: 'none' | 'mild' | 'moderate' | 'severe';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_MAP: Record<
  DecouplingIndicatorProps['severity'],
  { label: string; color: string; textColor: string }
> = {
  none: { label: '一致', color: '#10B981', textColor: 'text-emerald-400' },
  mild: { label: '軽度乖離', color: '#FF9F29', textColor: 'text-amber-caution-500' },
  moderate: { label: '有意な乖離', color: '#F97316', textColor: 'text-orange-400' },
  severe: { label: '重大な矛盾', color: '#FF4B4B', textColor: 'text-pulse-red-500' },
};

// ---------------------------------------------------------------------------
// Gauge Component (Semicircle analog meter)
// ---------------------------------------------------------------------------

function InconsistencyGauge({
  score,
  severity,
}: {
  score: number;
  severity: DecouplingIndicatorProps['severity'];
}) {
  // Score 0.5 = center (consistent), 0 = subjective dominant, 1 = objective dominant
  // Map to angle: -90deg (left) to +90deg (right), center = 0deg
  const angle = (score - 0.5) * 180;
  const needleRotation = angle;

  const sevInfo = SEVERITY_MAP[severity];

  // Arc geometry: semicircle from -90 to +90
  const cx = 100;
  const cy = 90;
  const radius = 70;

  // Draw colored zones on the arc
  // Green zone: center 40% (-36deg to +36deg)
  // Amber zone: moderate (-72deg to -36deg and +36deg to +72deg)
  // Red zone: extreme (-90deg to -72deg and +72deg to +90deg)
  function arcPath(startAngle: number, endAngle: number): string {
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  return (
    <svg viewBox="0 0 200 110" className="h-auto w-full max-w-[240px]">
      {/* Zone arcs */}
      {/* Red left */}
      <path d={arcPath(-90, -72)} fill="none" stroke="#FF4B4B" strokeWidth="8" opacity={0.5} strokeLinecap="round" />
      {/* Amber left */}
      <path d={arcPath(-72, -36)} fill="none" stroke="#FF9F29" strokeWidth="8" opacity={0.5} strokeLinecap="round" />
      {/* Green center */}
      <path d={arcPath(-36, 36)} fill="none" stroke="#10B981" strokeWidth="8" opacity={0.5} strokeLinecap="round" />
      {/* Amber right */}
      <path d={arcPath(36, 72)} fill="none" stroke="#FF9F29" strokeWidth="8" opacity={0.5} strokeLinecap="round" />
      {/* Red right */}
      <path d={arcPath(72, 90)} fill="none" stroke="#FF4B4B" strokeWidth="8" opacity={0.5} strokeLinecap="round" />

      {/* Needle */}
      <g
        className="animate-meter-swing"
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          ['--meter-angle' as string]: `${needleRotation}deg`,
        }}
      >
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - radius + 12}
          stroke={sevInfo.color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="4" fill={sevInfo.color} />
      </g>

      {/* Labels */}
      <text x="20" y="100" fontSize="7" fill="currentColor" className="text-muted-foreground" textAnchor="middle">
        主観優位
      </text>
      <text x="180" y="100" fontSize="7" fill="currentColor" className="text-muted-foreground" textAnchor="middle">
        客観優位
      </text>

      {/* Score value */}
      <text x={cx} y={cy + 4} fontSize="11" fontWeight="bold" fill={sevInfo.color} textAnchor="middle" className="font-mono">
        {(score * 100).toFixed(0)}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Innovation Plot (scatter over 14 days)
// ---------------------------------------------------------------------------

function InnovationPlot({ history }: { history: InnovationPoint[] }) {
  const { minY, maxY, points } = useMemo(() => {
    if (history.length === 0) {
      return { minY: -3, maxY: 3, points: [] };
    }
    const allVals = history.flatMap((h) => [h.residual, h.tolerance, -h.tolerance]);
    const mn = Math.min(...allVals, -2);
    const mx = Math.max(...allVals, 2);
    const pad = (mx - mn) * 0.1;
    return { minY: mn - pad, maxY: mx + pad, points: history };
  }, [history]);

  const width = 220;
  const height = 80;
  const px = 25; // padding x
  const py = 10; // padding y
  const plotW = width - 2 * px;
  const plotH = height - 2 * py;

  function toX(day: number): number {
    const minDay = points.length > 0 ? Math.min(...points.map((p) => p.day)) : 0;
    const maxDay = points.length > 0 ? Math.max(...points.map((p) => p.day)) : 13;
    const range = maxDay - minDay || 1;
    return px + ((day - minDay) / range) * plotW;
  }

  function toY(val: number): number {
    const range = maxY - minY || 1;
    return py + plotH - ((val - minY) / range) * plotH;
  }

  // Tolerance band path (filled polygon)
  const bandPoints = useMemo(() => {
    if (points.length === 0) return '';
    const sorted = [...points].sort((a, b) => a.day - b.day);
    const topLine = sorted.map((p) => `${toX(p.day)},${toY(p.tolerance)}`).join(' ');
    const bottomLine = [...sorted].reverse().map((p) => `${toX(p.day)},${toY(-p.tolerance)}`).join(' ');
    return `${topLine} ${bottomLine}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, minY, maxY]);

  if (points.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
        イノベーションデータなし
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[240px]">
      {/* Tolerance band */}
      <polygon points={bandPoints} fill="currentColor" className="text-muted-foreground" opacity={0.1} />

      {/* Zero line */}
      <line x1={px} y1={toY(0)} x2={width - px} y2={toY(0)} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground" opacity={0.4} />

      {/* Y axis labels */}
      <text x={px - 4} y={toY(0) + 3} fontSize="6" fill="currentColor" textAnchor="end" className="text-muted-foreground">0</text>

      {/* Data points */}
      {points.map((p, i) => {
        const isOutlier = Math.abs(p.residual) > p.tolerance;
        return (
          <circle
            key={i}
            cx={toX(p.day)}
            cy={toY(p.residual)}
            r={isOutlier ? 3.5 : 2.5}
            fill={isOutlier ? '#FF4B4B' : '#00F2FF'}
            className="animate-dot-appear"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <title>
              {`Day ${p.day}: 残差 ${p.residual.toFixed(2)} (許容: ±${p.tolerance.toFixed(2)})`}
            </title>
          </circle>
        );
      })}

      {/* X axis label */}
      <text x={width / 2} y={height - 1} fontSize="6" fill="currentColor" textAnchor="middle" className="text-muted-foreground">
        過去14日間
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DecouplingIndicator({
  decouplingScore,
  innovationHistory,
  severity,
}: DecouplingIndicatorProps) {
  const sevInfo = SEVERITY_MAP[severity];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <h3 className="mb-3 text-sm font-bold text-card-foreground">
        主観・客観デカップリング
      </h3>

      {/* Gauge */}
      <div className="flex flex-col items-center">
        <InconsistencyGauge score={decouplingScore} severity={severity} />

        {/* Status badge */}
        <div className="mt-1 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: sevInfo.color }}
          />
          <span className={`text-sm font-bold ${sevInfo.textColor}`}>
            {sevInfo.label}
          </span>
        </div>
      </div>

      {/* Innovation plot */}
      {innovationHistory && innovationHistory.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-2xs font-medium text-muted-foreground">
            Kalman残差（イノベーション）
          </p>
          <div className="flex justify-center">
            <InnovationPlot history={innovationHistory} />
          </div>
          <div className="mt-1 flex justify-center gap-3 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyber-cyan-500" />
              許容範囲内
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-pulse-red-500" />
              許容範囲外
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
