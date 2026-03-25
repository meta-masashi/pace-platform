'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RiskComparisonPanelProps {
  baselineRisk: number | null; // 0–100
  interventionRisk: number | null; // 0–100
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Animated number
// ---------------------------------------------------------------------------

function useAnimatedNumber(target: number | null, duration = 600): number {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>(0);
  const startRef = useRef<{ value: number; time: number }>({
    value: 0,
    time: 0,
  });

  useEffect(() => {
    if (target === null) return;
    const startValue = display;
    const startTime = performance.now();
    startRef.current = { value: startValue, time: startTime };

    function tick(now: number) {
      const elapsed = now - startRef.current.time;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current =
        startRef.current.value + (target! - startRef.current.value) * eased;
      setDisplay(current);
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    }
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

// ---------------------------------------------------------------------------
// Risk gauge (semi-circular)
// ---------------------------------------------------------------------------

function RiskGauge({
  baselineRisk,
  interventionRisk,
}: {
  baselineRisk: number;
  interventionRisk: number;
}) {
  const SIZE = 220;
  const SW = 14;
  const R = (SIZE - SW) / 2 - 10;
  const CX = SIZE / 2;
  const CY = SIZE / 2 + 20;

  // Semi-circle arc (180 degrees, from left to right)
  const arcLength = Math.PI * R;

  // Convert risk percentage to angle (0% = -180deg, 100% = 0deg)
  const baselineAngle = -180 + (baselineRisk / 100) * 180;
  const interventionAngle = -180 + (interventionRisk / 100) * 180;

  // Zone colors for the background arc
  // 0-10% green, 10-20% amber, 20%+ red
  const zones = [
    { start: 0, end: 10, color: '#10b981' },
    { start: 10, end: 20, color: '#f59e0b' },
    { start: 20, end: 100, color: '#ef4444' },
  ];

  return (
    <div className="flex flex-col items-center">
      <svg
        width={SIZE}
        height={SIZE / 2 + 40}
        viewBox={`0 0 ${SIZE} ${SIZE / 2 + 40}`}
      >
        {/* Zone arcs */}
        {zones.map((zone) => {
          const startAngle = Math.PI + (zone.start / 100) * Math.PI;
          const endAngle = Math.PI + (zone.end / 100) * Math.PI;
          const x1 = CX + R * Math.cos(startAngle);
          const y1 = CY + R * Math.sin(startAngle);
          const x2 = CX + R * Math.cos(endAngle);
          const y2 = CY + R * Math.sin(endAngle);
          const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
          return (
            <path
              key={zone.start}
              d={`M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none"
              stroke={zone.color}
              strokeWidth={SW}
              strokeLinecap="round"
              opacity={0.2}
            />
          );
        })}

        {/* Baseline needle (gray) */}
        <NeedleSVG
          cx={CX}
          cy={CY}
          r={R - 20}
          angle={baselineAngle}
          color="#9ca3af"
          label="現在"
        />

        {/* Intervention needle (emerald) */}
        <NeedleSVG
          cx={CX}
          cy={CY}
          r={R - 20}
          angle={interventionAngle}
          color="#10b981"
          label="介入後"
        />

        {/* Center dot */}
        <circle cx={CX} cy={CY} r={4} fill="currentColor" className="text-foreground" />

        {/* Labels */}
        <text
          x={CX - R - 5}
          y={CY + 16}
          className="fill-muted-foreground text-[10px]"
          textAnchor="middle"
        >
          0%
        </text>
        <text
          x={CX}
          y={CY - R - 10}
          className="fill-muted-foreground text-[10px]"
          textAnchor="middle"
        >
          50%
        </text>
        <text
          x={CX + R + 5}
          y={CY + 16}
          className="fill-muted-foreground text-[10px]"
          textAnchor="middle"
        >
          100%
        </text>
      </svg>

      {/* Legend */}
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
          <span className="text-muted-foreground">現在のプラン</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-optimal-500" />
          <span className="text-muted-foreground">介入後</span>
        </div>
      </div>
    </div>
  );
}

function NeedleSVG({
  cx,
  cy,
  r,
  angle,
  color,
  label,
}: {
  cx: number;
  cy: number;
  r: number;
  angle: number;
  color: string;
  label: string;
}) {
  const rad = (angle * Math.PI) / 180;
  const x2 = cx + r * Math.cos(rad);
  const y2 = cy + r * Math.sin(rad);

  return (
    <g>
      <line
        x1={cx}
        y1={cy}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        style={{ transition: 'x2 0.6s ease-out, y2 0.6s ease-out' }}
      />
      <circle cx={x2} cy={y2} r={5} fill={color} />
      <text
        x={x2}
        y={y2 - 10}
        fill={color}
        fontSize={9}
        textAnchor="middle"
        fontWeight="bold"
      >
        {label}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RiskComparisonPanel({
  baselineRisk,
  interventionRisk,
  loading,
}: RiskComparisonPanelProps) {
  const animatedBaseline = useAnimatedNumber(baselineRisk);
  const animatedIntervention = useAnimatedNumber(interventionRisk);

  const diff =
    baselineRisk !== null && interventionRisk !== null
      ? interventionRisk - baselineRisk
      : null;

  const diffDisplay = diff !== null ? Math.abs(diff).toFixed(1) : null;
  const isReduced = diff !== null && diff < 0;
  const isIncreased = diff !== null && diff > 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
        </div>
        <div className="h-40 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Before / After cards */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {/* Baseline card */}
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-xs font-medium text-muted-foreground">
            現在のプラン
          </p>
          <p
            className={`mt-1 text-3xl font-bold tabular-nums transition-colors duration-300 ${
              baselineRisk !== null && baselineRisk > 15
                ? 'text-critical-600'
                : 'text-foreground'
            }`}
          >
            {baselineRisk !== null
              ? `${animatedBaseline.toFixed(1)}%`
              : '—'}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            リスク確率
          </p>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center gap-1">
          {diff !== null ? (
            <>
              <svg
                className={`h-6 w-6 transition-colors duration-300 ${
                  isReduced
                    ? 'text-optimal-500'
                    : isIncreased
                      ? 'text-critical-500'
                      : 'text-muted-foreground'
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                  isReduced
                    ? 'bg-optimal-100 text-optimal-700'
                    : isIncreased
                      ? 'bg-critical-100 text-critical-700'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isReduced ? '-' : isIncreased ? '+' : ''}
                {diffDisplay}%
              </span>
            </>
          ) : (
            <svg
              className="h-6 w-6 text-muted-foreground/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          )}
        </div>

        {/* Intervention card */}
        <div
          className={`rounded-lg border p-4 text-center transition-colors duration-300 ${
            isReduced
              ? 'border-optimal-200 bg-optimal-50'
              : isIncreased
                ? 'border-critical-200 bg-critical-50'
                : 'border-border bg-card'
          }`}
        >
          <p className="text-xs font-medium text-muted-foreground">介入後</p>
          <p
            className={`mt-1 text-3xl font-bold tabular-nums transition-colors duration-300 ${
              isReduced
                ? 'text-optimal-600'
                : isIncreased
                  ? 'text-critical-600'
                  : 'text-foreground'
            }`}
          >
            {interventionRisk !== null
              ? `${animatedIntervention.toFixed(1)}%`
              : '—'}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            リスク確率
          </p>
        </div>
      </div>

      {/* Gauge */}
      {baselineRisk !== null && interventionRisk !== null && (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <RiskGauge
            baselineRisk={animatedBaseline}
            interventionRisk={animatedIntervention}
          />
        </div>
      )}
    </div>
  );
}
